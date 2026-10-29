-- Fedge passes: how a student gets Fedge's own mocks.
--
-- Until now Fedge's open mocks (test_series.is_open) were free for every
-- logged-in student. Now they are sold two ways, and both give a "pass" that
-- runs for 9 months from the day it is paid:
--
--   kind 'mocks'  through a coaching. The student adds the coaching with its
--                 referral code and pays the price that coaching set
--                 (coachings.fedge_price_inr, never below the floor in
--                 fedge_plans 'mocks', Rs 299). The usual split applies:
--                 coachings.commission_pct (35%) to Fedge, the rest owed to the
--                 coaching. Opens Fedge's mocks only.
--   kind 'all'    FEDGE All-Access, Rs 2,999, bought from Fedge directly (no
--                 coaching, no split). Opens every Fedge mock AND counts as a
--                 course: Practice (Prelims + Mains), Learn, Daily.
--
-- One mock per exam stays free as a sample (coaching_mocks.free_sample, set by
-- Fedge in SQL). Students enrolled in a series (their coaching's own, or the
-- 7T/Fedge series) keep the mocks of that series as before.
--
-- Prices live in the database: fedge-order (edge function) reads them from
-- fedge_plans / coachings, and fedge-verify + razorpay-webhook (service role)
-- call activate_fedge_pass() once Razorpay confirms the money.
--
-- Undo: supabase/rollbacks/20261029210000_fedge_passes_ROLLBACK.sql

-- ---------------------------------------------------------------------------
-- 1. Plans (prices): readable by everyone so the unlock page works logged out
-- ---------------------------------------------------------------------------
create table if not exists public.fedge_plans (
  key text primary key check (key in ('mocks', 'all')),
  label text not null,
  -- 'mocks': the lowest price a coaching may charge. 'all': the price.
  amount_inr integer not null check (amount_inr between 1 and 1000000),
  months integer not null check (months between 1 and 36),
  active boolean not null default true,
  features text[] not null default '{}'
);
alter table public.fedge_plans enable row level security;
revoke all on public.fedge_plans from anon, authenticated;
grant select on public.fedge_plans to anon, authenticated;
drop policy if exists "fedge plans read" on public.fedge_plans;
create policy "fedge plans read" on public.fedge_plans for select to anon, authenticated using (active);

insert into public.fedge_plans (key, label, amount_inr, months, features) values
  ('mocks', 'Fedge mocks', 299, 9,
   '{"Every Fedge full-length and sectional mock","New mocks Fedge adds during your 9 months"}'),
  ('all', 'FEDGE All-Access', 2999, 9,
   '{"Every Fedge full-length and sectional mock","All of Practice: Prelims and Mains, with explanations","Learn notes and the Daily Challenge","Mistake Notebook and focus timer"}')
on conflict (key) do update
  set label = excluded.label, amount_inr = excluded.amount_inr, months = excluded.months, features = excluded.features;

-- ---------------------------------------------------------------------------
-- 2. A coaching's price for Fedge mocks (floor enforced by a trigger)
-- ---------------------------------------------------------------------------
alter table public.coachings add column if not exists fedge_price_inr integer not null default 299;
alter table public.coachings drop constraint if exists coachings_fedge_price_range;
alter table public.coachings add constraint coachings_fedge_price_range check (fedge_price_inr between 1 and 100000);

-- Owners may raise the price, never go under the floor. Admins and the SQL
-- editor are not held to it.
create or replace function private.fedge_price_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_min integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    select amount_inr into v_min from public.fedge_plans where key = 'mocks';
    v_min := coalesce(v_min, 299);
    if new.fedge_price_inr < v_min then
      raise exception 'The lowest price for Fedge mocks is Rs %.', v_min using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists fedge_price_guard on public.coachings;
create trigger fedge_price_guard before insert or update of fedge_price_inr on public.coachings
  for each row execute function private.fedge_price_guard();

grant update (fedge_price_inr) on public.coachings to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The free sample mock of each exam
-- ---------------------------------------------------------------------------
-- Only counts inside an open series. Set by Fedge in SQL (see
-- sanqe_sql/fedge_free_samples.sql).
alter table public.coaching_mocks add column if not exists free_sample boolean not null default false;

-- ---------------------------------------------------------------------------
-- 4. Passes
-- ---------------------------------------------------------------------------
-- One row per order. A paid row is a pass from period_start to period_end.
-- The ids are set null on delete so a payment record outlives the account or
-- the coaching it was for.
create table if not exists public.fedge_passes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('mocks', 'all')),
  coaching_id uuid references public.coachings(id) on delete set null,
  amount_inr integer not null check (amount_inr > 0),
  months integer not null check (months between 1 and 36),
  commission_pct numeric(5,2) not null default 0 check (commission_pct between 0 and 100),
  fedge_share_inr integer not null check (fedge_share_inr >= 0),
  coaching_share_inr integer not null default 0 check (coaching_share_inr >= 0),
  razorpay_order_id text not null unique,
  razorpay_payment_id text unique,
  status text not null default 'created' check (status in ('created', 'paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  payout_status text not null default 'pending' check (payout_status in ('pending', 'paid')),
  payout_at timestamptz,
  payout_ref text,
  check (fedge_share_inr + coaching_share_inr = amount_inr)
);
create index if not exists fedge_passes_user_idx on public.fedge_passes (user_id, status, period_end);
create index if not exists fedge_passes_coaching_idx on public.fedge_passes (coaching_id, created_at desc);

-- A student reads their own passes, a coaching owner the sales of their own
-- coaching, admins everything. Only the edge functions (service role) write;
-- payouts are marked from the SQL editor.
alter table public.fedge_passes enable row level security;
revoke all on public.fedge_passes from anon;
revoke insert, update, delete on public.fedge_passes from authenticated;

drop policy if exists "fedge passes read" on public.fedge_passes;
create policy "fedge passes read" on public.fedge_passes for select to authenticated using (
  (select public.is_admin())
  or user_id = (select auth.uid())
  or coaching_id in (select c.id from public.coachings c where c.owner_id = (select auth.uid()))
);

-- What Fedge owes each coaching right now: series sales and Fedge-mock sales
-- not yet paid out. Runs with the caller's rights, so an owner sees only their
-- own row.
create or replace view public.coaching_payout_due
with (security_invoker = true) as
select t.coaching_id,
       c.name as coaching_name,
       count(*) as sales,
       sum(t.amount_inr) as gross_inr,
       sum(t.fedge_share_inr) as fedge_inr,
       sum(t.coaching_share_inr) as owed_inr
  from (
    select p.coaching_id, p.amount_inr, p.fedge_share_inr, p.coaching_share_inr
      from public.series_payments p
     where p.status = 'paid' and p.payout_status = 'pending'
    union all
    select f.coaching_id, f.amount_inr, f.fedge_share_inr, f.coaching_share_inr
      from public.fedge_passes f
     where f.status = 'paid' and f.payout_status = 'pending' and f.kind = 'mocks'
  ) t
  left join public.coachings c on c.id = t.coaching_id
 group by t.coaching_id, c.name;
revoke all on public.coaching_payout_due from anon;

-- ---------------------------------------------------------------------------
-- 5. Who has what
-- ---------------------------------------------------------------------------
-- { "until": end of the longest running pass of either kind | null,
--   "all_until": end of the longest running All-Access pass | null }.
create or replace function public.my_fedge_access()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'until', (select max(p.period_end) from public.fedge_passes p
               where p.user_id = (select auth.uid()) and p.status = 'paid' and p.period_end > now()),
    'all_until', (select max(p.period_end) from public.fedge_passes p
                   where p.user_id = (select auth.uid()) and p.status = 'paid' and p.period_end > now() and p.kind = 'all'))
$$;

-- May this student start Fedge's open mocks? Admins, and anyone whose pass of
-- either kind is running.
create or replace function public.my_mock_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.is_admin())
      or exists (select 1 from public.fedge_passes p
                  where p.user_id = (select auth.uid()) and p.status = 'paid' and p.period_end > now())
$$;

-- Course access (Practice full, Learn, Daily, descriptive mocks): as before,
-- plus a running FEDGE All-Access pass.
create or replace function public.my_course_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.series_enrollments e
      join public.test_series s on s.id = e.series_id
      join public.coachings c   on c.id = s.coaching_id
     where e.user_id = (select auth.uid())
       and c.status = 'approved'
       and (c.is_fedge or c.paid_until > now())
       and not (s.is_open and e.source = 'free')
  ) or exists (
    select 1 from public.fedge_passes p
     where p.user_id = (select auth.uid()) and p.kind = 'all' and p.status = 'paid' and p.period_end > now()
  )
$$;

-- ---------------------------------------------------------------------------
-- 6. Open mocks are now locked behind a pass (or the free sample)
-- ---------------------------------------------------------------------------
-- Is the caller enrolled in this open series for real (a code, a purchase or
-- added by hand)? Enrolments with source 'free' came from the time these mocks
-- were free for everyone (join_free_series) and no longer open them.
create or replace function private.enrolled_in_open(p_series uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.series_enrollments e
      join public.test_series s on s.id = e.series_id
      join public.coachings c on c.id = s.coaching_id
     where e.series_id = p_series and e.user_id = (select auth.uid())
       and e.source <> 'free' and c.status = 'approved')
$$;

-- A series' mocks and where the student is on each. Open series need no
-- enrollment and leave the coaching out; each mock says whether it is locked
-- for the caller.
create or replace function public.get_series(p_series uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_paid_enrolled boolean;
  v_access boolean;
begin
  if p_series is null or not (
       p_series in (select public.my_enrolled_series())
    or p_series in (select public.my_owned_series())
    or (v_uid is not null and exists (select 1 from public.test_series o where o.id = p_series and o.is_open))
  ) then
    raise exception 'You don''t have access to this test series.' using errcode = '42501';
  end if;
  v_access := public.my_mock_access();
  v_paid_enrolled := private.enrolled_in_open(p_series);
  return (
    select jsonb_build_object(
      'id', s.id, 'title', s.title, 'exam', s.exam, 'description', s.description,
      'is_open', s.is_open,
      'coaching', case when s.is_open then null else jsonb_build_object('name', c.name, 'city', c.city) end,
      'mocks', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', m.id, 'title', m.title, 'instructions', m.instructions,
                 'sectional_timing', m.sectional_timing, 'negative_mark', m.negative_mark,
                 'published_at', m.published_at,
                 'free_sample', m.free_sample,
                 'locked', (s.is_open and not (m.free_sample or v_access or v_paid_enrolled)),
                 'total_sec', private.mock_total_sec(m.id),
                 'sections', (
                   select coalesce(jsonb_agg(jsonb_build_object(
                            'name', ms.name, 'duration_sec', ms.duration_sec, 'marks', ms.marks_per_question,
                            'questions', (select count(*) from public.mock_questions q where q.section_id = ms.id))
                          order by ms.position, ms.id), '[]'::jsonb)
                     from public.mock_sections ms where ms.mock_id = m.id),
                 'attempt', (
                   select jsonb_build_object(
                            'id', a.id, 'started_at', a.started_at, 'submitted', a.submitted_at is not null,
                            'expired', a.submitted_at is null and private.attempt_expired(a.id),
                            'score', a.score, 'max_score', a.max_score)
                     from public.mock_attempts a where a.mock_id = m.id and a.user_id = v_uid))
               order by m.published_at, m.created_at)
          from public.coaching_mocks m where m.series_id = s.id and m.status = 'published'), '[]'::jsonb))
      from public.test_series s join public.coachings c on c.id = s.coaching_id
     where s.id = p_series
  );
end;
$$;

-- Starting a mock: enrolled students as before; for a mock in an open series,
-- the free sample, a real enrolment, or a student with a running pass (or an admin).
create or replace function public.start_mock(p_mock uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  m public.coaching_mocks;
  a public.mock_attempts;
begin
  if v_uid is null then
    raise exception 'Please log in.' using errcode = '28000';
  end if;
  select * into m from public.coaching_mocks
   where id = p_mock and status = 'published'
     and ((series_id in (select public.my_enrolled_series())
           and not exists (select 1 from public.test_series o where o.id = series_id and o.is_open))
          or (series_id in (select o.id from public.test_series o where o.is_open)
              and (free_sample or public.my_mock_access() or private.enrolled_in_open(series_id))));
  if not found then
    raise exception 'You don''t have access to this mock.' using errcode = '42501';
  end if;

  select * into a from public.mock_attempts where mock_id = p_mock and user_id = v_uid for update;
  if found and a.submitted_at is not null then
    return jsonb_build_object('submitted', true);
  end if;
  if found and private.attempt_expired(a.id) then
    perform private.finalize_attempt(a.id, null);
    return jsonb_build_object('submitted', true);
  end if;
  if not found then
    insert into public.mock_attempts (mock_id, user_id) values (p_mock, v_uid) on conflict (mock_id, user_id) do nothing;
    select * into a from public.mock_attempts where mock_id = p_mock and user_id = v_uid;
  end if;
  if a.paused_at is not null and private.attempt_pause_left(a) <= 0 then
    perform private.resume_attempt(a.id);
    select * into a from public.mock_attempts where id = a.id;
  end if;

  return jsonb_build_object(
    'submitted', false,
    'server_now', now(),
    'attempt', jsonb_build_object(
      'id', a.id, 'started_at', a.started_at, 'answers', a.answers, 'progress', a.progress,
      'paused_at', a.paused_at, 'pause_left_sec', private.attempt_pause_left(a)),
    'mock', jsonb_build_object(
      'id', m.id, 'title', m.title, 'sectional_timing', m.sectional_timing, 'duration_sec', m.duration_sec,
      'negative_mark', m.negative_mark, 'total_sec', private.mock_total_sec(m.id), 'grace_sec', private.mock_grace_sec()),
    'sections', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id, 'name', s.name, 'duration_sec', s.duration_sec, 'marks', s.marks_per_question,
               'questions', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'id', q.id, 'passage', q.passage, 'image_url', q.image_url, 'question', q.question,
                          'option_a', q.option_a, 'option_b', q.option_b, 'option_c', q.option_c,
                          'option_d', q.option_d, 'option_e', q.option_e)
                        order by q.position, q.id), '[]'::jsonb)
                   from public.mock_questions q where q.section_id = s.id))
             order by s.position, s.id), '[]'::jsonb)
        from public.mock_sections s where s.mock_id = m.id)
  );
end;
$$;

-- Every published mock of every open series, for the Mock Tests screen. The
-- coaching is not part of the answer; each mock says whether it is locked.
create or replace function public.list_open_mocks()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_access boolean;
begin
  if v_uid is null then
    raise exception 'Please log in.' using errcode = '28000';
  end if;
  v_access := public.my_mock_access();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', m.id, 'series_id', m.series_id, 'title', m.title, 'exam', s.exam,
             'sectional_timing', m.sectional_timing, 'negative_mark', m.negative_mark,
             'total_sec', private.mock_total_sec(m.id),
             'free_sample', m.free_sample,
             'locked', not (m.free_sample or v_access or private.enrolled_in_open(m.series_id)),
             'sections', (
               select coalesce(jsonb_agg(jsonb_build_object(
                        'name', ms.name, 'marks', ms.marks_per_question,
                        'questions', (select count(*) from public.mock_questions q where q.section_id = ms.id))
                      order by ms.position, ms.id), '[]'::jsonb)
                 from public.mock_sections ms where ms.mock_id = m.id),
             'attempt', (
               select jsonb_build_object(
                        'id', a.id, 'submitted', a.submitted_at is not null,
                        'expired', a.submitted_at is null and private.attempt_expired(a.id),
                        'score', a.score, 'max_score', a.max_score)
                 from public.mock_attempts a where a.mock_id = m.id and a.user_id = v_uid))
           order by lower(btrim(coalesce(s.exam, ''))), m.published_at, m.created_at)
      from public.coaching_mocks m
      join public.test_series s on s.id = m.series_id
     where s.is_open and m.status = 'published'), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. A coaching's page (Courses screen): now also its Fedge-mocks offer
-- ---------------------------------------------------------------------------
-- 'fedge': { on_sale, price_inr, months, mocks, until }. 'until' is the end of
-- the caller's running pass (any kind), or null.
create or replace function public.get_coaching_page(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'city', c.city, 'state', c.state, 'about', c.about, 'slug', c.slug, 'status', c.status,
    'fedge', jsonb_build_object(
      'on_sale', coalesce((select f.active from public.fedge_plans f where f.key = 'mocks'), false),
      'price_inr', c.fedge_price_inr,
      'months', (select f.months from public.fedge_plans f where f.key = 'mocks'),
      'mocks', (select count(*) from public.coaching_mocks m join public.test_series o on o.id = m.series_id
                 where o.is_open and m.status = 'published'),
      'until', (select max(p.period_end) from public.fedge_passes p
                 where p.user_id = (select auth.uid()) and p.status = 'paid' and p.period_end > now())),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'title', s.title, 'exam', s.exam, 'description', s.description, 'price_inr', s.price_inr,
               'mocks', (select count(*) from public.coaching_mocks m where m.series_id = s.id and m.status = 'published'),
               'enrolled', exists (select 1 from public.series_enrollments e where e.series_id = s.id and e.user_id = (select auth.uid())))
             order by s.created_at desc)
        from public.test_series s
       where s.coaching_id = c.id and s.on_sale and not s.is_open), '[]'::jsonb))
    from public.coachings c
   where c.slug = lower(btrim(p_slug))
     and (c.status = 'approved' or c.owner_id = (select auth.uid()))
$$;

-- ---------------------------------------------------------------------------
-- 8. Activation (service role only)
-- ---------------------------------------------------------------------------
-- Marks an order paid and starts the pass. A pass of the kind the student
-- already holds starts when that one ends; the other kind starts now. Safe to
-- call twice for the same order (fedge-verify and the webhook both do): the
-- second call changes nothing. Returns { kind, until }.
create or replace function public.activate_fedge_pass(p_order_id text, p_payment_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pay public.fedge_passes;
  v_start timestamptz;
  v_end timestamptz;
begin
  select * into v_pay from public.fedge_passes where razorpay_order_id = p_order_id for update;
  if not found then
    raise exception 'Unknown order %', p_order_id using errcode = 'P0002';
  end if;
  if v_pay.status = 'paid' then
    return jsonb_build_object('kind', v_pay.kind, 'until', v_pay.period_end);
  end if;

  v_start := now();
  if v_pay.user_id is not null then
    -- Two orders of one student finishing together must not start at the same time.
    perform pg_advisory_xact_lock(hashtextextended(v_pay.user_id::text, 1));
    select greatest(now(), coalesce(max(period_end), now())) into v_start
      from public.fedge_passes
     where user_id = v_pay.user_id and kind = v_pay.kind and status = 'paid';
  end if;
  v_end := v_start + make_interval(months => v_pay.months);

  update public.fedge_passes
     set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now(), period_start = v_start, period_end = v_end
   where id = v_pay.id;
  return jsonb_build_object('kind', v_pay.kind, 'until', v_end);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Function access
-- ---------------------------------------------------------------------------
revoke all on function private.fedge_price_guard() from public, anon, authenticated;
revoke all on function private.enrolled_in_open(uuid) from public, anon, authenticated;
revoke all on function public.my_fedge_access() from public, anon;
revoke all on function public.my_mock_access() from public, anon;
revoke all on function public.my_course_access() from public, anon;
revoke all on function public.get_series(uuid) from public, anon;
revoke all on function public.start_mock(uuid) from public, anon;
revoke all on function public.list_open_mocks() from public, anon;
revoke all on function public.get_coaching_page(text) from public;
revoke all on function public.activate_fedge_pass(text, text) from public, anon, authenticated;

grant execute on function public.my_fedge_access() to authenticated;
grant execute on function public.my_mock_access() to authenticated;
grant execute on function public.my_course_access() to authenticated;
grant execute on function public.get_series(uuid) to authenticated;
grant execute on function public.start_mock(uuid) to authenticated;
grant execute on function public.list_open_mocks() to authenticated;
grant execute on function public.get_coaching_page(text) to anon, authenticated;
grant execute on function public.activate_fedge_pass(text, text) to service_role;
