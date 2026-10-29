-- Coaching test series.
--
-- A coaching institute applies from the app (/coach), an admin approves it,
-- and it can then build full-length objective mocks (sections, sectional
-- timers, negative marking) grouped into test series. Its students unlock a
-- series with an access code the coaching hands out (the coaching collects
-- its fees itself). Mocks are private: only students enrolled in the series
-- see them.
--
-- Students never read mock_questions directly — the answer key would leak.
-- They get questions through start_mock() (no answers) and the answer key
-- through get_mock_result() after submitting. Scoring, timing and ranks are
-- all worked out here, not in the app.
--
-- test_series.price_inr is unused for now; it is there for in-app purchase
-- (series_enrollments.source = 'purchase') later.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.coachings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 80),
  city text check (city is null or length(city) <= 60),
  phone text check (phone is null or length(phone) <= 20),
  about text check (about is null or length(about) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'suspended')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.test_series (
  id uuid primary key default gen_random_uuid(),
  coaching_id uuid not null references public.coachings(id) on delete cascade,
  title text not null check (length(btrim(title)) between 2 and 100),
  exam text check (exam is null or length(exam) <= 60),
  description text check (description is null or length(description) <= 1000),
  price_inr integer check (price_inr is null or price_inr between 0 and 100000),
  created_at timestamptz not null default now()
);
create index if not exists test_series_coaching_idx on public.test_series (coaching_id);

create table if not exists public.coaching_mocks (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.test_series(id) on delete cascade,
  title text not null check (length(btrim(title)) between 2 and 100),
  instructions text check (instructions is null or length(instructions) <= 3000),
  -- true: each section has its own clock and closes when it runs out (IBPS /
  -- SBI style). false: one clock (duration_sec) for the whole test.
  sectional_timing boolean not null default true,
  duration_sec integer check (duration_sec is null or duration_sec between 60 and 18000),
  -- Fraction of a question's marks lost for a wrong answer (0.25 = 1/4).
  negative_mark numeric(4,2) not null default 0.25 check (negative_mark between 0 and 1),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  check (sectional_timing or duration_sec is not null)
);
create index if not exists coaching_mocks_series_idx on public.coaching_mocks (series_id);

create table if not exists public.mock_sections (
  id bigint generated always as identity primary key,
  mock_id uuid not null references public.coaching_mocks(id) on delete cascade,
  position integer not null default 0,
  name text not null check (length(btrim(name)) between 1 and 60),
  duration_sec integer not null default 1200 check (duration_sec between 60 and 10800),
  marks_per_question numeric(4,2) not null default 1 check (marks_per_question > 0 and marks_per_question <= 10)
);
create index if not exists mock_sections_mock_idx on public.mock_sections (mock_id, position);

create table if not exists public.mock_questions (
  id bigint generated always as identity primary key,
  section_id bigint not null references public.mock_sections(id) on delete cascade,
  position integer not null default 0,
  passage text,
  image_url text check (image_url is null or image_url ~ '^https://'),
  question text not null check (length(btrim(question)) > 0),
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  option_e text,
  correct_option text not null check (correct_option in ('a', 'b', 'c', 'd', 'e')),
  explanation text,
  explanation_hi text,
  created_at timestamptz not null default now(),
  check (correct_option <> 'e' or option_e is not null)
);
create index if not exists mock_questions_section_idx on public.mock_questions (section_id, position);

-- One code can be for one student (max_uses 1) or a whole batch (max_uses 200).
create table if not exists public.series_access_codes (
  id bigint generated always as identity primary key,
  series_id uuid not null references public.test_series(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{6,16}$'),
  max_uses integer not null default 1 check (max_uses between 1 and 10000),
  used_count integer not null default 0,
  expires_at timestamptz,
  note text check (note is null or length(note) <= 80),
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists series_access_codes_series_idx on public.series_access_codes (series_id);

create table if not exists public.series_enrollments (
  series_id uuid not null references public.test_series(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'code' check (source in ('code', 'purchase', 'manual')),
  code_id bigint references public.series_access_codes(id) on delete set null,
  enrolled_at timestamptz not null default now(),
  primary key (series_id, user_id)
);
create index if not exists series_enrollments_user_idx on public.series_enrollments (user_id);

-- One attempt per student per mock, so ranks compare first attempts only.
create table if not exists public.mock_attempts (
  id uuid primary key default gen_random_uuid(),
  mock_id uuid not null references public.coaching_mocks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  answers jsonb not null default '{}'::jsonb,   -- { "<question id>": "a".."e" }
  progress jsonb,                               -- the app's resume state (current section, marked questions)
  saved_at timestamptz,
  submitted_at timestamptz,
  score numeric(8,2),
  max_score numeric(8,2),
  correct integer,
  wrong integer,
  unattempted integer,
  section_scores jsonb,
  unique (mock_id, user_id)
);

-- Failed code redemptions, to slow down guessing.
create table if not exists private.code_redeem_failures (
  user_id uuid not null,
  failed_at timestamptz not null default now()
);
create index if not exists code_redeem_failures_idx on private.code_redeem_failures (user_id, failed_at);

-- ---------------------------------------------------------------------------
-- Who-am-I helpers for the policies. Security definer so the policies don't
-- recurse into each other; each one only ever answers about the caller.
-- ---------------------------------------------------------------------------
create or replace function public.my_coaching_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.coachings where owner_id = (select auth.uid()) and status = 'approved'
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
   where c.owner_id = (select auth.uid()) and c.status = 'approved'
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
   where c.owner_id = (select auth.uid()) and c.status = 'approved'
     and (not p_draft_only or m.status = 'draft')
$$;

create or replace function public.my_enrolled_series()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.series_id from public.series_enrollments e
    join public.test_series s on s.id = e.series_id
    join public.coachings c on c.id = s.coaching_id
   where e.user_id = (select auth.uid()) and c.status = 'approved'
$$;

revoke all on function public.my_coaching_id() from public, anon;
revoke all on function public.my_owned_series() from public, anon;
revoke all on function public.my_owned_mocks(boolean) from public, anon;
revoke all on function public.my_enrolled_series() from public, anon;
grant execute on function public.my_coaching_id() to authenticated;
grant execute on function public.my_owned_series() to authenticated;
grant execute on function public.my_owned_mocks(boolean) to authenticated;
grant execute on function public.my_enrolled_series() to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.coachings enable row level security;
alter table public.test_series enable row level security;
alter table public.coaching_mocks enable row level security;
alter table public.mock_sections enable row level security;
alter table public.mock_questions enable row level security;
alter table public.series_access_codes enable row level security;
alter table public.series_enrollments enable row level security;
alter table public.mock_attempts enable row level security;
alter table private.code_redeem_failures enable row level security;

-- Coachings: owner and admins see the row; students see the coaching of a
-- series they're enrolled in. Anyone signed in can apply (one per account,
-- always starts 'pending'). Owners edit their profile but never the status —
-- that goes through admin_set_coaching_status().
revoke insert, update on public.coachings from anon, authenticated;
grant insert (name, city, phone, about) on public.coachings to authenticated;
grant update (name, city, phone, about) on public.coachings to authenticated;

drop policy if exists "coaching read" on public.coachings;
drop policy if exists "coaching apply" on public.coachings;
drop policy if exists "coaching owner update" on public.coachings;
create policy "coaching read" on public.coachings for select to authenticated using (
  owner_id = (select auth.uid())
  or (select public.is_admin())
  or (status = 'approved' and exists (
    select 1 from public.test_series s
     where s.coaching_id = coachings.id and s.id in (select public.my_enrolled_series())))
);
create policy "coaching apply" on public.coachings for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'pending');
create policy "coaching owner update" on public.coachings for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Test series
drop policy if exists "series read" on public.test_series;
drop policy if exists "series owner insert" on public.test_series;
drop policy if exists "series owner update" on public.test_series;
drop policy if exists "series owner delete" on public.test_series;
create policy "series read" on public.test_series for select to authenticated using (
  coaching_id = (select public.my_coaching_id()) or id in (select public.my_enrolled_series())
);
create policy "series owner insert" on public.test_series for insert to authenticated
  with check (coaching_id = (select public.my_coaching_id()));
create policy "series owner update" on public.test_series for update to authenticated
  using (coaching_id = (select public.my_coaching_id())) with check (coaching_id = (select public.my_coaching_id()));
create policy "series owner delete" on public.test_series for delete to authenticated
  using (coaching_id = (select public.my_coaching_id()));

-- Mocks: students see published mocks of their series (title and settings
-- only — questions are a separate table they can't read).
drop policy if exists "mock read" on public.coaching_mocks;
drop policy if exists "mock owner insert" on public.coaching_mocks;
drop policy if exists "mock owner update" on public.coaching_mocks;
drop policy if exists "mock owner delete" on public.coaching_mocks;
create policy "mock read" on public.coaching_mocks for select to authenticated using (
  series_id in (select public.my_owned_series())
  or (status = 'published' and series_id in (select public.my_enrolled_series()))
);
create policy "mock owner insert" on public.coaching_mocks for insert to authenticated
  with check (series_id in (select public.my_owned_series()) and status = 'draft');
create policy "mock owner update" on public.coaching_mocks for update to authenticated
  using (series_id in (select public.my_owned_series())) with check (series_id in (select public.my_owned_series()));
create policy "mock owner delete" on public.coaching_mocks for delete to authenticated
  using (series_id in (select public.my_owned_series()));

-- Sections and questions: owner only. Adding or removing them is allowed
-- while the mock is a draft; edits (typos, a wrong answer key) are allowed
-- after publishing too, and re-score every submitted attempt.
drop policy if exists "section owner read" on public.mock_sections;
drop policy if exists "section owner insert" on public.mock_sections;
drop policy if exists "section owner update" on public.mock_sections;
drop policy if exists "section owner delete" on public.mock_sections;
create policy "section owner read" on public.mock_sections for select to authenticated
  using (mock_id in (select public.my_owned_mocks(false)));
create policy "section owner insert" on public.mock_sections for insert to authenticated
  with check (mock_id in (select public.my_owned_mocks(true)));
create policy "section owner update" on public.mock_sections for update to authenticated
  using (mock_id in (select public.my_owned_mocks(false))) with check (mock_id in (select public.my_owned_mocks(false)));
create policy "section owner delete" on public.mock_sections for delete to authenticated
  using (mock_id in (select public.my_owned_mocks(true)));

drop policy if exists "question owner read" on public.mock_questions;
drop policy if exists "question owner insert" on public.mock_questions;
drop policy if exists "question owner update" on public.mock_questions;
drop policy if exists "question owner delete" on public.mock_questions;
create policy "question owner read" on public.mock_questions for select to authenticated using (
  section_id in (select s.id from public.mock_sections s where s.mock_id in (select public.my_owned_mocks(false)))
);
create policy "question owner insert" on public.mock_questions for insert to authenticated with check (
  section_id in (select s.id from public.mock_sections s where s.mock_id in (select public.my_owned_mocks(true)))
);
create policy "question owner update" on public.mock_questions for update to authenticated using (
  section_id in (select s.id from public.mock_sections s where s.mock_id in (select public.my_owned_mocks(false)))
) with check (
  section_id in (select s.id from public.mock_sections s where s.mock_id in (select public.my_owned_mocks(false)))
);
create policy "question owner delete" on public.mock_questions for delete to authenticated using (
  section_id in (select s.id from public.mock_sections s where s.mock_id in (select public.my_owned_mocks(true)))
);

-- Access codes: created only by generate_access_codes(); the owner can list,
-- revoke or delete them.
revoke insert, update on public.series_access_codes from anon, authenticated;
grant update (revoked) on public.series_access_codes to authenticated;
drop policy if exists "code owner read" on public.series_access_codes;
drop policy if exists "code owner update" on public.series_access_codes;
drop policy if exists "code owner delete" on public.series_access_codes;
create policy "code owner read" on public.series_access_codes for select to authenticated
  using (series_id in (select public.my_owned_series()));
create policy "code owner update" on public.series_access_codes for update to authenticated
  using (series_id in (select public.my_owned_series())) with check (series_id in (select public.my_owned_series()));
create policy "code owner delete" on public.series_access_codes for delete to authenticated
  using (series_id in (select public.my_owned_series()));

-- Enrollments: created only by redeem_access_code(). A student sees their
-- own; the coaching sees and can remove its students.
revoke insert, update on public.series_enrollments from anon, authenticated;
drop policy if exists "enrollment read" on public.series_enrollments;
drop policy if exists "enrollment owner delete" on public.series_enrollments;
create policy "enrollment read" on public.series_enrollments for select to authenticated
  using (user_id = (select auth.uid()) or series_id in (select public.my_owned_series()));
create policy "enrollment owner delete" on public.series_enrollments for delete to authenticated
  using (series_id in (select public.my_owned_series()));

-- Attempts: written only by the functions below.
revoke insert, update, delete on public.mock_attempts from anon, authenticated;
drop policy if exists "attempt read" on public.mock_attempts;
create policy "attempt read" on public.mock_attempts for select to authenticated
  using (user_id = (select auth.uid()) or mock_id in (select public.my_owned_mocks(false)));

-- ---------------------------------------------------------------------------
-- Timing and scoring (private: only called by the functions below)
-- ---------------------------------------------------------------------------
-- Seconds of slack after a clock runs out, for network lag on the last save.
create or replace function private.mock_grace_sec()
returns integer
language sql
immutable
set search_path = ''
as $$ select 120 $$;

-- Total test length in seconds.
create or replace function private.mock_total_sec(p_mock uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select case when m.sectional_timing
              then (select coalesce(sum(s.duration_sec), 0) from public.mock_sections s where s.mock_id = m.id)::integer
              else m.duration_sec end
    from public.coaching_mocks m where m.id = p_mock
$$;

-- The stored answers with p_posted applied, except for questions whose
-- section clock (or the whole-test clock) has already run out: those keep
-- what was saved before. p_posted = null keeps everything as saved.
create or replace function private.merge_answers(p_attempt uuid, p_posted jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  a public.mock_attempts;
  m public.coaching_mocks;
  v_out jsonb := '{}'::jsonb;
  v_val text;
  v_key text;
  r record;
begin
  select * into a from public.mock_attempts where id = p_attempt;
  select * into m from public.coaching_mocks where id = a.mock_id;
  if p_posted is not null and jsonb_typeof(p_posted) <> 'object' then
    p_posted := null;
  end if;

  for r in
    with sec as (
      select s.id, sum(s.duration_sec) over (order by s.position, s.id) as cum
        from public.mock_sections s where s.mock_id = a.mock_id
    )
    select q.id, q.option_e,
           a.started_at + make_interval(secs => (case when m.sectional_timing then sec.cum else m.duration_sec end) + private.mock_grace_sec()) as closes_at
      from sec join public.mock_questions q on q.section_id = sec.id
  loop
    v_key := r.id::text;
    if p_posted is not null and now() <= r.closes_at then
      v_val := lower(p_posted ->> v_key);
    else
      v_val := a.answers ->> v_key;
    end if;
    if v_val in ('a', 'b', 'c', 'd') or (v_val = 'e' and r.option_e is not null) then
      v_out := v_out || jsonb_build_object(v_key, v_val);
    end if;
  end loop;
  return v_out;
end;
$$;

-- Recomputes an attempt's score from its answers and the current answer key.
create or replace function private.score_attempt(p_attempt uuid)
returns void
language sql
volatile
set search_path = ''
as $$
  with qs as (
    select s.id as section_id, s.name, s.position, s.marks_per_question as marks, m.negative_mark,
           q.correct_option, a.answers ->> q.id::text as sel
      from public.mock_attempts a
      join public.coaching_mocks m on m.id = a.mock_id
      join public.mock_sections s on s.mock_id = a.mock_id
      join public.mock_questions q on q.section_id = s.id
     where a.id = p_attempt
  ), per as (
    select section_id, name, position,
           count(*)::integer as total,
           (count(*) filter (where sel = correct_option))::integer as correct,
           (count(*) filter (where sel is not null and sel <> correct_option))::integer as wrong,
           sum(marks) as max_score,
           sum(case when sel = correct_option then marks when sel is not null then -marks * negative_mark else 0 end) as score
      from qs group by section_id, name, position
  )
  update public.mock_attempts t set
    score = round(coalesce((select sum(score) from per), 0), 2),
    max_score = coalesce((select sum(max_score) from per), 0),
    correct = coalesce((select sum(correct) from per), 0),
    wrong = coalesce((select sum(wrong) from per), 0),
    unattempted = coalesce((select sum(total - correct - wrong) from per), 0),
    section_scores = coalesce((
      select jsonb_agg(jsonb_build_object(
               'section_id', section_id, 'name', name, 'total', total, 'correct', correct, 'wrong', wrong,
               'score', round(score, 2), 'max_score', max_score) order by position, section_id)
        from per), '[]'::jsonb)
  where t.id = p_attempt
$$;

create or replace function private.finalize_attempt(p_attempt uuid, p_posted jsonb)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  update public.mock_attempts
     set answers = private.merge_answers(p_attempt, p_posted),
         submitted_at = now()
   where id = p_attempt and submitted_at is null;
  perform private.score_attempt(p_attempt);
end;
$$;

create or replace function private.rescore_mock(p_mock uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare r record;
begin
  for r in select id from public.mock_attempts where mock_id = p_mock and submitted_at is not null loop
    perform private.score_attempt(r.id);
  end loop;
end;
$$;

-- An attempt's deadline has passed (whole test + grace).
create or replace function private.attempt_expired(p_attempt uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select now() > a.started_at + make_interval(secs => private.mock_total_sec(a.mock_id) + private.mock_grace_sec())
    from public.mock_attempts a where a.id = p_attempt
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
-- Publishing checks the mock is complete; a mock students have attempted
-- can't go back to draft.
create or replace function private.coaching_mock_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and old.status = 'draft' then
    if not exists (select 1 from public.mock_sections where mock_id = new.id) then
      raise exception 'Add at least one section before publishing.' using errcode = '23514';
    end if;
    if exists (select 1 from public.mock_sections s where s.mock_id = new.id
                and not exists (select 1 from public.mock_questions q where q.section_id = s.id)) then
      raise exception 'Every section needs at least one question before publishing.' using errcode = '23514';
    end if;
    new.published_at := now();
  elsif new.status = 'draft' and old.status = 'published' then
    if exists (select 1 from public.mock_attempts where mock_id = new.id) then
      raise exception 'Students have already attempted this mock, so it can''t go back to draft.' using errcode = '23514';
    end if;
    new.published_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists coaching_mock_guard on public.coaching_mocks;
create trigger coaching_mock_guard before update of status on public.coaching_mocks
  for each row execute function private.coaching_mock_guard();

-- A corrected answer key, marks or negative marking re-scores everyone.
create or replace function private.rescore_after_key_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'coaching_mocks' then
    perform private.rescore_mock(new.id);
  elsif tg_table_name = 'mock_sections' then
    perform private.rescore_mock(new.mock_id);
  else
    perform private.rescore_mock((select mock_id from public.mock_sections where id = new.section_id));
    if old.section_id <> new.section_id then
      perform private.rescore_mock((select mock_id from public.mock_sections where id = old.section_id));
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists rescore_after_key_change on public.coaching_mocks;
drop trigger if exists rescore_after_key_change on public.mock_sections;
drop trigger if exists rescore_after_key_change on public.mock_questions;
create trigger rescore_after_key_change after update of negative_mark on public.coaching_mocks
  for each row when (old.negative_mark is distinct from new.negative_mark)
  execute function private.rescore_after_key_change();
create trigger rescore_after_key_change after update of marks_per_question on public.mock_sections
  for each row when (old.marks_per_question is distinct from new.marks_per_question)
  execute function private.rescore_after_key_change();
create trigger rescore_after_key_change after update of correct_option, section_id on public.mock_questions
  for each row when (old.correct_option is distinct from new.correct_option or old.section_id is distinct from new.section_id)
  execute function private.rescore_after_key_change();

-- ---------------------------------------------------------------------------
-- Coaching: access codes, students, results
-- ---------------------------------------------------------------------------
-- 8-character codes without look-alike characters (no 0/O, 1/I/L).
create or replace function public.generate_access_codes(
  p_series uuid, p_count integer, p_max_uses integer default 1, p_expires_at timestamptz default null, p_note text default null
)
returns setof public.series_access_codes
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_alpha constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
  v_made integer := 0;
  v_tries integer := 0;
  v_row public.series_access_codes;
begin
  if p_series is null or p_series not in (select public.my_owned_series()) then
    raise exception 'This test series isn''t yours.' using errcode = '42501';
  end if;
  if p_count is null or p_count not between 1 and 500 then
    raise exception 'Make between 1 and 500 codes at a time.' using errcode = '22023';
  end if;
  if p_max_uses is null or p_max_uses not between 1 and 10000 then
    raise exception 'Uses per code must be between 1 and 10000.' using errcode = '22023';
  end if;

  while v_made < p_count and v_tries < p_count * 5 loop
    v_tries := v_tries + 1;
    v_bytes := uuid_send(gen_random_uuid());
    -- Bytes 6 and 8 carry the UUID version / variant bits, so skip them.
    v_code := substr(v_alpha, get_byte(v_bytes, 0) % 31 + 1, 1) || substr(v_alpha, get_byte(v_bytes, 1) % 31 + 1, 1)
           || substr(v_alpha, get_byte(v_bytes, 2) % 31 + 1, 1) || substr(v_alpha, get_byte(v_bytes, 3) % 31 + 1, 1)
           || substr(v_alpha, get_byte(v_bytes, 4) % 31 + 1, 1) || substr(v_alpha, get_byte(v_bytes, 5) % 31 + 1, 1)
           || substr(v_alpha, get_byte(v_bytes, 7) % 31 + 1, 1) || substr(v_alpha, get_byte(v_bytes, 9) % 31 + 1, 1);
    begin
      insert into public.series_access_codes (series_id, code, max_uses, expires_at, note)
      values (p_series, v_code, p_max_uses, p_expires_at, nullif(btrim(left(p_note, 80)), ''))
      returning * into v_row;
      v_made := v_made + 1;
      return next v_row;
    exception when unique_violation then
      null; -- astronomically rare; try another
    end;
  end loop;
end;
$$;

create or replace function public.coach_series_students(p_series uuid)
returns table (user_id uuid, name text, email text, enrolled_at timestamptz, source text, code text, code_note text, mocks_done bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select e.user_id,
         coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), split_part(u.email, '@', 1)),
         u.email::text, e.enrolled_at, e.source, c.code, c.note,
         (select count(*) from public.mock_attempts a join public.coaching_mocks m on m.id = a.mock_id
           where a.user_id = e.user_id and m.series_id = e.series_id and a.submitted_at is not null)
    from public.series_enrollments e
    join auth.users u on u.id = e.user_id
    left join public.series_access_codes c on c.id = e.code_id
   where e.series_id = p_series and p_series in (select public.my_owned_series())
   order by e.enrolled_at desc
$$;

create or replace function public.coach_mock_results(p_mock uuid)
returns table (rank bigint, user_id uuid, name text, email text, score numeric, max_score numeric, correct integer, wrong integer,
               unattempted integer, section_scores jsonb, time_taken_sec integer, submitted_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select rank() over (order by a.score desc),
         a.user_id,
         coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), split_part(u.email, '@', 1)),
         u.email::text, a.score, a.max_score, a.correct, a.wrong, a.unattempted, a.section_scores,
         least(extract(epoch from a.submitted_at - a.started_at), private.mock_total_sec(a.mock_id))::integer,
         a.submitted_at
    from public.mock_attempts a
    join auth.users u on u.id = a.user_id
   where a.mock_id = p_mock and a.submitted_at is not null and p_mock in (select public.my_owned_mocks(false))
   order by a.score desc, a.submitted_at - a.started_at
$$;

-- ---------------------------------------------------------------------------
-- Admin: review coaching applications
-- ---------------------------------------------------------------------------
create or replace function public.admin_coachings()
returns table (id uuid, name text, city text, phone text, about text, status text, created_at timestamptz,
               reviewed_at timestamptz, owner_email text, series bigint, students bigint)
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
           (select count(distinct e.user_id) from public.series_enrollments e join public.test_series s on s.id = e.series_id where s.coaching_id = c.id)
      from public.coachings c
      join auth.users u on u.id = c.owner_id
     order by (c.status = 'pending') desc, c.created_at desc;
end;
$$;

create or replace function public.admin_set_coaching_status(p_coaching uuid, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'approved', 'suspended') then
    raise exception 'Unknown status.' using errcode = '22023';
  end if;
  update public.coachings set status = p_status, reviewed_at = now() where id = p_coaching;
end;
$$;

-- ---------------------------------------------------------------------------
-- Students
-- ---------------------------------------------------------------------------
-- Returns { ok, series_id, title, already } or { ok: false, error }.
-- Errors are returned, not raised, so the failure log below is kept.
create or replace function public.redeem_access_code(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_norm text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_code public.series_access_codes;
  v_title text;
  v_error text;
begin
  if v_uid is null then
    raise exception 'Please log in.' using errcode = '28000';
  end if;
  if (select count(*) from private.code_redeem_failures where user_id = v_uid and failed_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'Too many wrong codes. Try again in an hour.');
  end if;

  select c.* into v_code
    from public.series_access_codes c
    join public.test_series s on s.id = c.series_id
    join public.coachings k on k.id = s.coaching_id and k.status = 'approved'
   where c.code = v_norm
   for update of c;

  if not found or v_code.revoked then
    v_error := 'This code isn''t valid. Check it with your coaching.';
  else
    select title into v_title from public.test_series where id = v_code.series_id;
    if exists (select 1 from public.series_enrollments where series_id = v_code.series_id and user_id = v_uid) then
      return jsonb_build_object('ok', true, 'series_id', v_code.series_id, 'title', v_title, 'already', true);
    elsif v_code.expires_at is not null and v_code.expires_at < now() then
      v_error := 'This code has expired. Ask your coaching for a new one.';
    elsif v_code.used_count >= v_code.max_uses then
      v_error := 'This code has already been used. Ask your coaching for a new one.';
    end if;
  end if;

  if v_error is not null then
    insert into private.code_redeem_failures (user_id) values (v_uid);
    delete from private.code_redeem_failures where failed_at < now() - interval '1 day';
    return jsonb_build_object('ok', false, 'error', v_error);
  end if;

  insert into public.series_enrollments (series_id, user_id, source, code_id)
  values (v_code.series_id, v_uid, 'code', v_code.id);
  update public.series_access_codes set used_count = used_count + 1 where id = v_code.id;
  return jsonb_build_object('ok', true, 'series_id', v_code.series_id, 'title', v_title, 'already', false);
end;
$$;

-- A series with its coaching and published mocks, plus the caller's attempt
-- on each. For enrolled students (and the coaching itself).
create or replace function public.get_series(p_series uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if p_series is null or not (p_series in (select public.my_enrolled_series()) or p_series in (select public.my_owned_series())) then
    raise exception 'You don''t have access to this test series.' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'id', s.id, 'title', s.title, 'exam', s.exam, 'description', s.description,
      'coaching', jsonb_build_object('name', c.name, 'city', c.city),
      'mocks', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', m.id, 'title', m.title, 'instructions', m.instructions,
                 'sectional_timing', m.sectional_timing, 'negative_mark', m.negative_mark,
                 'published_at', m.published_at,
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

-- Starts (or resumes) the caller's attempt and returns the questions without
-- their answers. An attempt whose time ran out is submitted with what was
-- saved, and { submitted: true } is returned instead.
create or replace function public.start_mock(p_mock uuid)
returns jsonb
language plpgsql
volatile
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
   where id = p_mock and status = 'published' and series_id in (select public.my_enrolled_series());
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
    -- Two taps on Start at once: the second insert waits, does nothing and
    -- picks up the first one's row.
    insert into public.mock_attempts (mock_id, user_id) values (p_mock, v_uid) on conflict (mock_id, user_id) do nothing;
    select * into a from public.mock_attempts where mock_id = p_mock and user_id = v_uid;
  end if;

  return jsonb_build_object(
    'submitted', false,
    'server_now', now(),
    'attempt', jsonb_build_object('id', a.id, 'started_at', a.started_at, 'answers', a.answers, 'progress', a.progress),
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

-- Autosave. Returns { submitted: true } if the time had already run out
-- (the attempt is then submitted with what was saved before).
create or replace function public.save_mock_progress(p_attempt uuid, p_answers jsonb, p_progress jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.mock_attempts;
begin
  select * into a from public.mock_attempts where id = p_attempt and user_id = auth.uid() for update;
  if not found then
    raise exception 'Attempt not found.' using errcode = 'P0002';
  end if;
  if a.submitted_at is not null then
    return jsonb_build_object('submitted', true);
  end if;
  if private.attempt_expired(a.id) then
    perform private.finalize_attempt(a.id, null);
    return jsonb_build_object('submitted', true);
  end if;
  update public.mock_attempts
     set answers = private.merge_answers(a.id, p_answers),
         progress = case when p_progress is not null and length(p_progress::text) <= 4000 then p_progress else progress end,
         saved_at = now()
   where id = a.id;
  return jsonb_build_object('submitted', false, 'server_now', now());
end;
$$;

create or replace function public.submit_mock(p_attempt uuid, p_answers jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.mock_attempts where id = p_attempt and user_id = auth.uid()) then
    raise exception 'Attempt not found.' using errcode = 'P0002';
  end if;
  perform private.finalize_attempt(p_attempt, p_answers);
end;
$$;

-- The caller's result on a mock: score, rank among everyone who has
-- submitted it, and every question with its answer key and solution.
create or replace function public.get_mock_result(p_mock uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  a public.mock_attempts;
  m public.coaching_mocks;
  v_takers bigint;
  v_rank bigint;
begin
  select * into a from public.mock_attempts where mock_id = p_mock and user_id = v_uid;
  if not found then
    raise exception 'You haven''t attempted this mock.' using errcode = 'P0002';
  end if;
  if a.submitted_at is null then
    if not private.attempt_expired(a.id) then
      raise exception 'This mock isn''t submitted yet.' using errcode = '22023';
    end if;
    perform private.finalize_attempt(a.id, null);
    select * into a from public.mock_attempts where id = a.id;
  end if;
  select * into m from public.coaching_mocks where id = p_mock;

  select count(*) into v_takers from public.mock_attempts where mock_id = p_mock and submitted_at is not null;
  select count(*) + 1 into v_rank from public.mock_attempts where mock_id = p_mock and submitted_at is not null and score > a.score;

  return jsonb_build_object(
    'mock', jsonb_build_object('id', m.id, 'title', m.title, 'series_id', m.series_id, 'negative_mark', m.negative_mark),
    'score', a.score, 'max_score', a.max_score, 'correct', a.correct, 'wrong', a.wrong, 'unattempted', a.unattempted,
    'section_scores', a.section_scores,
    'time_taken_sec', least(extract(epoch from a.submitted_at - a.started_at), private.mock_total_sec(p_mock))::integer,
    'submitted_at', a.submitted_at,
    'rank', v_rank,
    'takers', v_takers,
    'percentile', case when v_takers <= 1 then 100 else round(100.0 * (v_takers - v_rank) / (v_takers - 1), 1) end,
    'topper_score', (select max(score) from public.mock_attempts where mock_id = p_mock and submitted_at is not null),
    'average_score', (select round(avg(score), 2) from public.mock_attempts where mock_id = p_mock and submitted_at is not null),
    'sections', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id, 'name', s.name, 'marks', s.marks_per_question,
               'questions', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'id', q.id, 'passage', q.passage, 'image_url', q.image_url, 'question', q.question,
                          'option_a', q.option_a, 'option_b', q.option_b, 'option_c', q.option_c,
                          'option_d', q.option_d, 'option_e', q.option_e, 'correct_option', q.correct_option,
                          'explanation', q.explanation, 'explanation_hi', q.explanation_hi,
                          'selected', a.answers ->> q.id::text)
                        order by q.position, q.id), '[]'::jsonb)
                   from public.mock_questions q where q.section_id = s.id))
             order by s.position, s.id), '[]'::jsonb)
        from public.mock_sections s where s.mock_id = p_mock)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Pictures for coaching questions: public bucket, each coaching writes only
-- inside its own folder (<coaching id>/...).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('coaching-images', 'coaching-images', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "coaching images owner read" on storage.objects;
drop policy if exists "coaching images owner insert" on storage.objects;
drop policy if exists "coaching images owner update" on storage.objects;
drop policy if exists "coaching images owner delete" on storage.objects;
create policy "coaching images owner read" on storage.objects for select to authenticated
  using (bucket_id = 'coaching-images' and (storage.foldername(name))[1] = (select public.my_coaching_id())::text);
create policy "coaching images owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'coaching-images' and (storage.foldername(name))[1] = (select public.my_coaching_id())::text);
create policy "coaching images owner update" on storage.objects for update to authenticated
  using (bucket_id = 'coaching-images' and (storage.foldername(name))[1] = (select public.my_coaching_id())::text);
create policy "coaching images owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'coaching-images' and (storage.foldername(name))[1] = (select public.my_coaching_id())::text);

-- ---------------------------------------------------------------------------
-- Function access
-- ---------------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;

revoke all on function public.generate_access_codes(uuid, integer, integer, timestamptz, text) from public, anon;
revoke all on function public.coach_series_students(uuid) from public, anon;
revoke all on function public.coach_mock_results(uuid) from public, anon;
revoke all on function public.admin_coachings() from public, anon;
revoke all on function public.admin_set_coaching_status(uuid, text) from public, anon;
revoke all on function public.redeem_access_code(text) from public, anon;
revoke all on function public.get_series(uuid) from public, anon;
revoke all on function public.start_mock(uuid) from public, anon;
revoke all on function public.save_mock_progress(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.submit_mock(uuid, jsonb) from public, anon;
revoke all on function public.get_mock_result(uuid) from public, anon;

grant execute on function public.generate_access_codes(uuid, integer, integer, timestamptz, text) to authenticated;
grant execute on function public.coach_series_students(uuid) to authenticated;
grant execute on function public.coach_mock_results(uuid) to authenticated;
grant execute on function public.admin_coachings() to authenticated;
grant execute on function public.admin_set_coaching_status(uuid, text) to authenticated;
grant execute on function public.redeem_access_code(text) to authenticated;
grant execute on function public.get_series(uuid) to authenticated;
grant execute on function public.start_mock(uuid) to authenticated;
grant execute on function public.save_mock_progress(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.submit_mock(uuid, jsonb) to authenticated;
grant execute on function public.get_mock_result(uuid) to authenticated;
