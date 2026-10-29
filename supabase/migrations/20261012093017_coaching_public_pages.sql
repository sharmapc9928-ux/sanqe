-- Coaching public pages.
--
-- Every coaching gets its own page at /c/<slug> that it shares with its
-- students. The page lists the series the coaching has put on sale, with
-- prices, and opens without logging in. There is no common marketplace: a
-- student only ever sees the coaching whose link they opened.
--
-- A series priced 0 can be joined straight from the page. Paid series are
-- bought online in the next step (payments); until then students unlock them
-- with access codes as before.
--
-- Each coaching also has a referral code. Students type it under Courses in
-- the app to add the coaching, then join or buy its series from its page.
--
-- commission_pct is Sanqe's share of each online sale. Only admins change it.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.coachings
  add column if not exists slug text,
  add column if not exists commission_pct numeric(5,2) not null default 35;

alter table public.coachings drop constraint if exists coachings_slug_format;
alter table public.coachings add constraint coachings_slug_format
  check (slug is null or (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 40));
alter table public.coachings drop constraint if exists coachings_commission_range;
alter table public.coachings add constraint coachings_commission_range
  check (commission_pct between 0 and 100);
create unique index if not exists coachings_slug_key on public.coachings (slug);

alter table public.test_series
  add column if not exists on_sale boolean not null default false;
alter table public.test_series drop constraint if exists test_series_sale_needs_price;
alter table public.test_series add constraint test_series_sale_needs_price
  check (not on_sale or price_inr is not null);

-- 'free': joined from the coaching's page at price 0.
alter table public.series_enrollments drop constraint if exists series_enrollments_source_check;
alter table public.series_enrollments add constraint series_enrollments_source_check
  check (source in ('code', 'purchase', 'manual', 'free'));

-- Owners pick their own link; commission and status stay admin-only.
grant insert (slug) on public.coachings to authenticated;
grant update (slug) on public.coachings to authenticated;

-- ---------------------------------------------------------------------------
-- The public page
-- ---------------------------------------------------------------------------
-- A coaching and the series it has on sale, or null. Anyone can call it
-- (anon included); it never returns phone, owner or mock contents. The owner
-- also gets their page before approval, to preview it ('status' says so).
-- 'enrolled' is per series for the caller (false when logged out).
create or replace function public.get_coaching_page(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'city', c.city, 'about', c.about, 'slug', c.slug, 'status', c.status,
    'series', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'title', s.title, 'exam', s.exam, 'description', s.description, 'price_inr', s.price_inr,
               'mocks', (select count(*) from public.coaching_mocks m where m.series_id = s.id and m.status = 'published'),
               'enrolled', exists (select 1 from public.series_enrollments e where e.series_id = s.id and e.user_id = (select auth.uid())))
             order by s.created_at desc)
        from public.test_series s
       where s.coaching_id = c.id and s.on_sale), '[]'::jsonb))
    from public.coachings c
   where c.slug = lower(btrim(p_slug))
     and (c.status = 'approved' or c.owner_id = (select auth.uid()))
$$;

-- Join a free series from the coaching's page. Returns the series id.
create or replace function public.join_free_series(p_series uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Please log in.' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.test_series s join public.coachings c on c.id = s.coaching_id
     where s.id = p_series and s.on_sale and s.price_inr = 0 and c.status = 'approved'
  ) then
    raise exception 'This test series isn''t free to join.' using errcode = '42501';
  end if;
  insert into public.series_enrollments (series_id, user_id, source)
  values (p_series, v_uid, 'free')
  on conflict (series_id, user_id) do nothing;
  return p_series;
end;
$$;

-- ---------------------------------------------------------------------------
-- Referral codes: a student joins a coaching
-- ---------------------------------------------------------------------------
-- Each coaching has one short code (e.g. K7M2QX) it gives its students. A
-- student types it under Courses and the coaching shows up there with the
-- series it sells. Codes are made here; owners can't pick or change them.
create or replace function private.set_referral_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alpha constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
begin
  if new.referral_code is not null then
    return new;
  end if;
  loop
    v_bytes := uuid_send(gen_random_uuid());
    v_code := substr(v_alpha, get_byte(v_bytes, 0) % 31 + 1, 1) || substr(v_alpha, get_byte(v_bytes, 1) % 31 + 1, 1)
           || substr(v_alpha, get_byte(v_bytes, 2) % 31 + 1, 1) || substr(v_alpha, get_byte(v_bytes, 3) % 31 + 1, 1)
           || substr(v_alpha, get_byte(v_bytes, 4) % 31 + 1, 1) || substr(v_alpha, get_byte(v_bytes, 5) % 31 + 1, 1);
    exit when not exists (select 1 from public.coachings where referral_code = v_code);
  end loop;
  new.referral_code := v_code;
  return new;
end;
$$;

alter table public.coachings add column if not exists referral_code text;
drop trigger if exists set_referral_code on public.coachings;
create trigger set_referral_code before insert or update of referral_code on public.coachings
  for each row execute function private.set_referral_code();
update public.coachings set referral_code = null where referral_code is null; -- fires the trigger for existing rows
alter table public.coachings alter column referral_code set not null;
alter table public.coachings drop constraint if exists coachings_referral_code_format;
alter table public.coachings add constraint coachings_referral_code_format check (referral_code ~ '^[A-Z0-9]{4,12}$');
create unique index if not exists coachings_referral_code_key on public.coachings (referral_code);

create table if not exists public.coaching_students (
  coaching_id uuid not null references public.coachings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (coaching_id, user_id)
);
create index if not exists coaching_students_user_idx on public.coaching_students (user_id);

-- Rows are created only by join_coaching(). A student sees and can leave
-- their own; the coaching sees and can remove its students.
alter table public.coaching_students enable row level security;
revoke insert, update on public.coaching_students from anon, authenticated;
drop policy if exists "coaching student read" on public.coaching_students;
drop policy if exists "coaching student delete" on public.coaching_students;
create policy "coaching student read" on public.coaching_students for select to authenticated
  using (user_id = (select auth.uid()) or coaching_id = (select public.my_coaching_id()));
create policy "coaching student delete" on public.coaching_students for delete to authenticated
  using (user_id = (select auth.uid()) or coaching_id = (select public.my_coaching_id()));

-- Returns { ok, id, name, slug, already } or { ok: false, error }. Wrong
-- codes count toward the same hourly limit as series access codes.
create or replace function public.join_coaching(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_norm text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_coaching public.coachings;
  v_already boolean;
begin
  if v_uid is null then
    raise exception 'Please log in.' using errcode = '28000';
  end if;
  if (select count(*) from private.code_redeem_failures where user_id = v_uid and failed_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'Too many wrong codes. Try again in an hour.');
  end if;

  select * into v_coaching from public.coachings where referral_code = v_norm and status = 'approved';
  if not found then
    insert into private.code_redeem_failures (user_id) values (v_uid);
    delete from private.code_redeem_failures where failed_at < now() - interval '1 day';
    return jsonb_build_object('ok', false, 'error', 'This referral code isn''t valid. Check it with your coaching.');
  end if;

  v_already := exists (select 1 from public.coaching_students where coaching_id = v_coaching.id and user_id = v_uid);
  insert into public.coaching_students (coaching_id, user_id) values (v_coaching.id, v_uid)
  on conflict (coaching_id, user_id) do nothing;
  return jsonb_build_object('ok', true, 'id', v_coaching.id, 'name', v_coaching.name, 'slug', v_coaching.slug, 'already', v_already);
end;
$$;

-- The caller's coachings: joined with a referral code, or through a series
-- they unlocked or joined. Newest first.
create or replace function public.my_coachings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(t.row order by t.joined_at desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'id', c.id, 'name', c.name, 'city', c.city, 'slug', c.slug,
               'series', (select count(*) from public.test_series s where s.coaching_id = c.id and s.on_sale)) as row,
             min(j.joined_at) as joined_at
        from public.coachings c
        join (
          select cs.coaching_id, cs.joined_at from public.coaching_students cs where cs.user_id = (select auth.uid())
          union all
          select s.coaching_id, e.enrolled_at from public.series_enrollments e
            join public.test_series s on s.id = e.series_id
           where e.user_id = (select auth.uid())
        ) j on j.coaching_id = c.id
       where c.status = 'approved'
       group by c.id
    ) t
$$;

-- ---------------------------------------------------------------------------
-- Admin list: now with the page link and commission
-- ---------------------------------------------------------------------------
drop function if exists public.admin_coachings();
create function public.admin_coachings()
returns table (id uuid, name text, city text, phone text, about text, status text, created_at timestamptz,
               reviewed_at timestamptz, owner_email text, series bigint, students bigint, slug text, commission_pct numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query
    select c.id, c.name, c.city, c.phone, c.about, c.status, c.created_at, c.reviewed_at, u.email::text,
           (select count(*) from public.test_series s where s.coaching_id = c.id),
           (select count(distinct e.user_id) from public.series_enrollments e join public.test_series s on s.id = e.series_id where s.coaching_id = c.id),
           c.slug, c.commission_pct
      from public.coachings c
      join auth.users u on u.id = c.owner_id
     order by (c.status = 'pending') desc, c.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function access
-- ---------------------------------------------------------------------------
revoke all on function public.get_coaching_page(text) from public;
revoke all on function public.join_free_series(uuid) from public, anon;
revoke all on function public.join_coaching(text) from public, anon;
revoke all on function public.my_coachings() from public, anon;
revoke all on function public.admin_coachings() from public, anon;
revoke all on function private.set_referral_code() from public, anon, authenticated;

grant execute on function public.get_coaching_page(text) to anon, authenticated;
grant execute on function public.join_free_series(uuid) to authenticated;
grant execute on function public.join_coaching(text) to authenticated;
grant execute on function public.my_coachings() to authenticated;
grant execute on function public.admin_coachings() to authenticated;
