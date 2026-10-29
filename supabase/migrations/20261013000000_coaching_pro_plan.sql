-- Fedge mocks in every plan, and the Pro plan (Rs 4,999 a year).
--
-- Fedge builds its own mocks in its own coaching (marked is_fedge, built
-- with the normal coaching tools and never asked to pay). Each Fedge mock
-- has a pack_level: the cheapest plan that gets it.
--   1 = Monthly and up: for each exam 1 full mock, and 1 sectional each of
--       English, Maths and Reasoning
--   2 = Yearly and up: a 2nd full mock for each exam
--   3 = Pro only (the default): the rest of the pack
-- A paying coaching gets a copy of every published Fedge mock at or below
-- its plan's level, series by series. Mocks Fedge publishes later are copied
-- the next time the coaching opens its portal. Copies are the coaching's
-- own: later edits on either side don't carry over.
--
-- Class tests (mocks the coaching uploads itself) are free and unlimited on
-- Monthly and Yearly; Pro allows 1 a week (class_tests_per_week).
--
-- Plans also get a feature list, and inactive plans are now readable so the
-- app can show them as "Coming soon" (the order function only sells active
-- ones). Pro starts inactive until the pack is ready:
--   update public.coaching_plans set active = true where key = 'pro';
-- Mark Fedge's own coaching (the pack source) with:
--   update public.coachings set is_fedge = true where owner_id = (select id from auth.users where email = '...');

-- ---------------------------------------------------------------------------
-- Columns and the Pro plan
-- ---------------------------------------------------------------------------
alter table public.coaching_plans add column if not exists pack_level integer not null default 0 check (pack_level between 0 and 3);
alter table public.coaching_plans add column if not exists features text[] not null default '{}';
-- Class tests: mocks the coaching uploads itself. Null = no limit.
alter table public.coaching_plans add column if not exists class_tests_per_week integer check (class_tests_per_week >= 1);

insert into public.coaching_plans (key, label, amount_inr, days, position, pack_level, class_tests_per_week, features, active) values
  ('monthly', 'Monthly', 399, 30, 1, 1, null,
   '{"Your coaching portal","Class tests you upload: unlimited, free","By Fedge, for each exam: 1 full mock","1 sectional each: English, Maths, Reasoning"}',
   true),
  ('yearly', 'Yearly', 3999, 365, 2, 2, null,
   '{"Your coaching portal","Class tests you upload: unlimited, free","By Fedge, for each exam: 2 full mocks","1 sectional each: English, Maths, Reasoning"}',
   true),
  ('pro', 'Pro', 4999, 365, 3, 3, 1,
   '{"Class tests you upload: 1 a week","8 Prelims full mocks by Fedge","4 Mains full mocks by Fedge","5 sectional mocks for each subject: English, Quant, Reasoning, General Awareness, Computer"}',
   false)
on conflict (key) do update
  set label = excluded.label, amount_inr = excluded.amount_inr, days = excluded.days, position = excluded.position,
      pack_level = excluded.pack_level, class_tests_per_week = excluded.class_tests_per_week, features = excluded.features;

-- The Fedge mocks a coaching gets: its current plan's pack_level, while
-- paid_until is in the future. Owners can't change it (not in their grants).
alter table public.coachings add column if not exists pack_level integer not null default 0 check (pack_level between 0 and 3);
-- The plan whose rules apply now (set on payment; null before the first).
alter table public.coachings add column if not exists plan text references public.coaching_plans(key);
-- Fedge's own coaching: the source of the mock pack. Set by an admin in SQL;
-- owners can't change it (it isn't in their column grants).
alter table public.coachings add column if not exists is_fedge boolean not null default false;

-- Where a copied series / mock came from, so the pack is copied only once.
alter table public.test_series add column if not exists source_series_id uuid references public.test_series(id) on delete set null;
alter table public.coaching_mocks add column if not exists source_mock_id uuid references public.coaching_mocks(id) on delete set null;
create index if not exists coaching_mocks_source_idx on public.coaching_mocks (source_mock_id) where source_mock_id is not null;
-- On Fedge's own mocks: the cheapest plan that gets it (see the top).
alter table public.coaching_mocks add column if not exists pack_level integer not null default 3 check (pack_level between 1 and 3);

drop policy if exists "plans read" on public.coaching_plans;
create policy "plans read" on public.coaching_plans for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Who-am-I helpers: paid up, or Fedge's own coaching
-- ---------------------------------------------------------------------------
create or replace function public.my_coaching_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.coachings
   where owner_id = (select auth.uid()) and status = 'approved' and (paid_until > now() or is_fedge)
$$;

create or replace function public.my_owned_series()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.test_series s
    join public.coachings c on c.id = s.coaching_id
   where c.owner_id = (select auth.uid()) and c.status = 'approved' and (c.paid_until > now() or c.is_fedge)
$$;

create or replace function public.my_owned_mocks(p_draft_only boolean)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from public.coaching_mocks m
    join public.test_series s on s.id = m.series_id
    join public.coachings c on c.id = s.coaching_id
   where c.owner_id = (select auth.uid()) and c.status = 'approved' and (c.paid_until > now() or c.is_fedge)
     and (not p_draft_only or m.status = 'draft')
$$;

-- ---------------------------------------------------------------------------
-- The Fedge mock pack
-- ---------------------------------------------------------------------------
-- Copies every published Fedge mock at or below the coaching's pack_level
-- that it doesn't have yet: one series per Fedge series (made the first
-- time), the mock published straight away, with its sections and questions.
-- Does nothing unless the coaching is paid up. Returns how many mocks it
-- copied.
create or replace function private.sync_fedge_pack(p_coaching uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_series public.test_series;
  v_mock public.coaching_mocks;
  v_section public.mock_sections;
  v_target uuid;
  v_new_mock uuid;
  v_new_section bigint;
  v_copied integer := 0;
  v_level integer;
begin
  select pack_level into v_level from public.coachings
   where id = p_coaching and status = 'approved' and paid_until > now() and not is_fedge;
  if coalesce(v_level, 0) = 0 then
    return 0;
  end if;

  for v_series in
    select s.* from public.test_series s join public.coachings f on f.id = s.coaching_id
     where f.is_fedge and f.status = 'approved'
     order by s.created_at
  loop
    for v_mock in
      select m.* from public.coaching_mocks m
       where m.series_id = v_series.id and m.status = 'published' and m.pack_level <= v_level
         and not exists (select 1 from public.coaching_mocks c join public.test_series t on t.id = c.series_id
                          where t.coaching_id = p_coaching and c.source_mock_id = m.id)
       order by m.published_at, m.created_at
    loop
      select id into v_target from public.test_series where coaching_id = p_coaching and source_series_id = v_series.id;
      if v_target is null then
        insert into public.test_series (coaching_id, title, exam, description, source_series_id)
        values (p_coaching, v_series.title, v_series.exam, v_series.description, v_series.id)
        returning id into v_target;
      end if;

      insert into public.coaching_mocks (series_id, title, instructions, sectional_timing, duration_sec, negative_mark, status, published_at, source_mock_id)
      values (v_target, v_mock.title, v_mock.instructions, v_mock.sectional_timing, v_mock.duration_sec, v_mock.negative_mark, 'published', now(), v_mock.id)
      returning id into v_new_mock;

      for v_section in select * from public.mock_sections where mock_id = v_mock.id order by position, id loop
        insert into public.mock_sections (mock_id, position, name, duration_sec, marks_per_question)
        values (v_new_mock, v_section.position, v_section.name, v_section.duration_sec, v_section.marks_per_question)
        returning id into v_new_section;

        insert into public.mock_questions (section_id, position, passage, image_url, question, option_a, option_b, option_c, option_d, option_e,
                                           correct_option, explanation, explanation_hi)
        select v_new_section, q.position, q.passage, q.image_url, q.question, q.option_a, q.option_b, q.option_c, q.option_d, q.option_e,
               q.correct_option, q.explanation, q.explanation_hi
          from public.mock_questions q where q.section_id = v_section.id
         order by q.position, q.id;
      end loop;

      v_copied := v_copied + 1;
    end loop;
  end loop;
  return v_copied;
end;
$$;

-- The portal calls this on load to pick up mocks Fedge published since.
create or replace function public.sync_my_fedge_pack()
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  select coalesce(private.sync_fedge_pack(c.id), 0)
    from public.coachings c
   where c.owner_id = (select auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- Activation: the payment also sets the coaching's pack level and copies
-- the Fedge mocks it now gets
-- ---------------------------------------------------------------------------
create or replace function public.activate_coaching_payment(p_order_id text, p_payment_id text)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pay public.coaching_payments;
  v_start timestamptz;
  v_end timestamptz;
  v_level integer;
  v_active boolean;
begin
  select * into v_pay from public.coaching_payments where razorpay_order_id = p_order_id for update;
  if not found then
    raise exception 'Unknown order %', p_order_id using errcode = 'P0002';
  end if;
  if v_pay.status = 'paid' then
    return (select paid_until from public.coachings where id = v_pay.coaching_id);
  end if;

  select greatest(now(), coalesce(paid_until, now())), coalesce(paid_until > now(), false) into v_start, v_active
    from public.coachings where id = v_pay.coaching_id for update;
  v_end := v_start + make_interval(days => v_pay.days);
  select pack_level into v_level from public.coaching_plans where key = v_pay.plan;

  update public.coaching_payments
     set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now(), period_start = v_start, period_end = v_end
   where id = v_pay.id;
  -- Renewing early never lowers what the coaching already has; after a
  -- lapse it gets the new plan's level.
  update public.coachings
     set paid_until = v_end,
         plan = case when v_active and pack_level > coalesce(v_level, 0) then plan else v_pay.plan end,
         pack_level = case when v_active then greatest(pack_level, coalesce(v_level, 0)) else coalesce(v_level, 0) end
   where id = v_pay.coaching_id;

  perform private.sync_fedge_pack(v_pay.coaching_id);
  return v_end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Class test limit: on a plan with class_tests_per_week (Pro: 1), the
-- coaching can publish only that many of its own mocks in any 7 days.
-- Fedge's copies don't count, and Fedge's own coaching has no plan.
-- ---------------------------------------------------------------------------
create or replace function private.class_test_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coaching uuid;
  v_limit integer;
  v_next timestamptz;
begin
  if not (new.status = 'published' and old.status = 'draft' and new.source_mock_id is null) then
    return new;
  end if;

  select c.id, p.class_tests_per_week into v_coaching, v_limit
    from public.test_series s
    join public.coachings c on c.id = s.coaching_id
    left join public.coaching_plans p on p.key = c.plan
   where s.id = new.series_id;
  if v_limit is null then
    return new;
  end if;

  -- The limit-th most recent publish in the last 7 days; the next class
  -- test can go live 7 days after it.
  select m.published_at + interval '7 days' into v_next
    from public.coaching_mocks m
    join public.test_series s on s.id = m.series_id
   where s.coaching_id = v_coaching and m.id <> new.id and m.source_mock_id is null
     and m.status = 'published' and m.published_at > now() - interval '7 days'
   order by m.published_at desc
  offset v_limit - 1 limit 1;
  if v_next is not null then
    raise exception 'Your plan allows % class test% a week. You can publish the next one on %.',
      v_limit, case when v_limit = 1 then '' else 's' end, to_char(v_next at time zone 'Asia/Kolkata', 'DD Mon, HH12:MI AM')
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists class_test_limit on public.coaching_mocks;
create trigger class_test_limit before update of status on public.coaching_mocks
  for each row execute function private.class_test_limit();

-- ---------------------------------------------------------------------------
-- Function access
-- ---------------------------------------------------------------------------
revoke all on function private.sync_fedge_pack(uuid) from public, anon, authenticated;
revoke all on function private.class_test_limit() from public, anon, authenticated;
revoke all on function public.sync_my_fedge_pack() from public, anon;
revoke all on function public.activate_coaching_payment(text, text) from public, anon, authenticated;
grant execute on function public.sync_my_fedge_pack() to authenticated;
grant execute on function public.activate_coaching_payment(text, text) to service_role;
