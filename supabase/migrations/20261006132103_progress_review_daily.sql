-- Practice progress, Mistake Notebook (spaced repetition), dashboard stats
-- and the Daily Challenge with a leaderboard.
--
-- Design rules:
--  * Every row belongs to auth.uid(); RLS lets a user see only their own rows.
--  * Correctness is decided in the database (trigger / RPC), never trusted
--    from the client, so stats and the leaderboard can't be faked by editing
--    a request.
--  * "Today" is India time (Asia/Kolkata), matching the app's audience.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Question attempts
-- ---------------------------------------------------------------------------
-- topic is either one of the five original quant tables or a topic key of
-- public.practice_questions (see 20261006132058_practice_questions.sql).
create table if not exists public.question_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  topic text not null check (topic ~ '^[a-z][a-z0-9_]{1,39}$'),
  question_id bigint not null,
  selected_option text check (selected_option in ('a', 'b', 'c', 'd', 'e')), -- null = timed out
  is_correct boolean not null default false, -- overwritten by the trigger below
  time_ms integer not null check (time_ms between 0 and 3600000),
  mode text not null default 'practice' check (mode in ('practice', 'intense', 'review', 'daily')),
  created_at timestamptz not null default now()
);
create index if not exists question_attempts_user_created_idx on public.question_attempts (user_id, created_at desc);
create index if not exists question_attempts_user_topic_idx on public.question_attempts (user_id, topic, created_at desc);

alter table public.question_attempts enable row level security;
drop policy if exists "own read" on public.question_attempts;
drop policy if exists "own insert" on public.question_attempts;
create policy "own read" on public.question_attempts
  for select to authenticated using (user_id = auth.uid());
create policy "own insert" on public.question_attempts
  for insert to authenticated with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Mistake Notebook: every wrong answer lands here and comes back for review
-- after 1 day; three correct reviews (1d -> 3d -> 7d) clear it.
-- ---------------------------------------------------------------------------
create table if not exists public.review_queue (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  topic text not null check (topic ~ '^[a-z][a-z0-9_]{1,39}$'),
  question_id bigint not null,
  box smallint not null default 0 check (box between 0 and 3),
  due_at timestamptz not null default now() + interval '1 day',
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, topic, question_id)
);
create index if not exists review_queue_user_due_idx on public.review_queue (user_id, due_at);

alter table public.review_queue enable row level security;
drop policy if exists "own read" on public.review_queue;
drop policy if exists "own insert" on public.review_queue;
drop policy if exists "own update" on public.review_queue;
drop policy if exists "own delete" on public.review_queue;
create policy "own read" on public.review_queue for select to authenticated using (user_id = auth.uid());
create policy "own insert" on public.review_queue for insert to authenticated with check (user_id = auth.uid());
create policy "own update" on public.review_queue for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own delete" on public.review_queue for delete to authenticated using (user_id = auth.uid());

-- Grades the attempt against the real answer key and updates the review queue.
create or replace function public.handle_question_attempt()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_correct text;
begin
  v_correct := case new.topic
    when 'simplification'      then (select correct_option from public.simplification      where id = new.question_id)
    when 'approximation'       then (select correct_option from public.approximation       where id = new.question_id)
    when 'number_series'       then (select correct_option from public.number_series       where id = new.question_id)
    when 'wrong_number_series' then (select correct_option from public.wrong_number_series where id = new.question_id)
    when 'quadratic_equations' then (select correct_option from public.quadratic_equations where id = new.question_id)
    else (select correct_option from public.practice_questions where id = new.question_id and topic = new.topic)
  end;
  if v_correct is null then
    raise exception 'Unknown question % in %', new.question_id, new.topic using errcode = '23503';
  end if;

  new.is_correct := new.selected_option is not null and new.selected_option = v_correct;

  if not new.is_correct then
    insert into public.review_queue (user_id, topic, question_id, box, due_at, updated_at)
    values (new.user_id, new.topic, new.question_id, 0, now() + interval '1 day', now())
    on conflict (user_id, topic, question_id)
    do update set box = 0, due_at = excluded.due_at, updated_at = now();
  elsif new.mode = 'review' then
    update public.review_queue
       set box = box + 1,
           due_at = now() + case box when 0 then interval '3 days' else interval '7 days' end,
           updated_at = now()
     where user_id = new.user_id and topic = new.topic and question_id = new.question_id;
    delete from public.review_queue
     where user_id = new.user_id and topic = new.topic and question_id = new.question_id and box >= 3;
  end if;

  return new;
end;
$$;

drop trigger if exists question_attempts_grade on public.question_attempts;
create trigger question_attempts_grade
  before insert on public.question_attempts
  for each row execute function public.handle_question_attempt();

-- ---------------------------------------------------------------------------
-- Practice session summaries (one row per finished timed test)
-- ---------------------------------------------------------------------------
create table if not exists public.practice_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  topic text not null,
  mode text not null check (mode in ('practice', 'intense', 'review')),
  duration_sec integer not null check (duration_sec between 0 and 86400),
  attempted integer not null check (attempted >= 0),
  correct integer not null check (correct >= 0),
  wrong integer not null check (wrong >= 0),
  avg_time_ms integer check (avg_time_ms >= 0),
  created_at timestamptz not null default now()
);
create index if not exists practice_sessions_user_created_idx on public.practice_sessions (user_id, created_at desc);

alter table public.practice_sessions enable row level security;
drop policy if exists "own read" on public.practice_sessions;
drop policy if exists "own insert" on public.practice_sessions;
create policy "own read" on public.practice_sessions for select to authenticated using (user_id = auth.uid());
create policy "own insert" on public.practice_sessions for insert to authenticated with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Daily Challenge: the same 15 questions (3 per topic) for everyone each day.
-- ---------------------------------------------------------------------------
create table if not exists public.daily_challenge_results (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  challenge_date date not null,
  score smallint not null,
  total smallint not null,
  time_ms integer not null check (time_ms between 0 and 3600000),
  display_name text not null,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, challenge_date)
);
create index if not exists daily_challenge_results_board_idx on public.daily_challenge_results (challenge_date, score desc, time_ms asc);

-- Own rows only; the leaderboard is served by a function that exposes just
-- first name + score + time. Inserts only through submit_daily_challenge().
alter table public.daily_challenge_results enable row level security;
drop policy if exists "own read" on public.daily_challenge_results;
create policy "own read" on public.daily_challenge_results for select to authenticated using (user_id = auth.uid());

create or replace function private.today_ist()
returns date
language sql
stable
as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- Deterministic daily set: 3 questions per topic, picked by hashing the date
-- with each question id. Same date => same questions for everyone.
create or replace function private.daily_set(p_date date)
returns table (
  pos integer, topic text, id bigint, question text,
  option_a text, option_b text, option_c text, option_d text, option_e text,
  correct_option text, explanation text, explanation_hi text
)
language sql
stable
set search_path = public
as $$
  select (row_number() over (order by s.ord, s.k))::integer,
         s.topic, s.id, s.question, s.option_a, s.option_b, s.option_c, s.option_d, s.option_e,
         s.correct_option, s.explanation, s.explanation_hi
  from (
    (select 1 as ord, md5(p_date::text || ':simplification:' || id) as k, 'simplification'::text as topic,
            id, question, option_a, option_b, option_c, option_d, option_e, correct_option, explanation, explanation_hi
       from public.simplification order by 2 limit 3)
    union all
    (select 2, md5(p_date::text || ':approximation:' || id), 'approximation',
            id, question, option_a, option_b, option_c, option_d, option_e, correct_option, explanation, explanation_hi
       from public.approximation order by 2 limit 3)
    union all
    (select 3, md5(p_date::text || ':number_series:' || id), 'number_series',
            id, question, option_a, option_b, option_c, option_d, option_e, correct_option, explanation, explanation_hi
       from public.number_series order by 2 limit 3)
    union all
    (select 4, md5(p_date::text || ':wrong_number_series:' || id), 'wrong_number_series',
            id, question, option_a, option_b, option_c, option_d, option_e, correct_option, explanation, explanation_hi
       from public.wrong_number_series order by 2 limit 3)
    union all
    (select 5, md5(p_date::text || ':quadratic_equations:' || id), 'quadratic_equations',
            id, question, option_a, option_b, option_c, option_d, option_e, correct_option, explanation, explanation_hi
       from public.quadratic_equations order by 2 limit 3)
  ) s
$$;

-- Today's challenge. Answer keys are only included once the caller has
-- played, so the review screen can show solutions.
create or replace function public.get_daily_challenge()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_date date := private.today_ist();
  v_result public.daily_challenge_results;
begin
  if v_uid is null then
    raise exception 'Please log in.' using errcode = '28000';
  end if;

  select * into v_result from public.daily_challenge_results
   where user_id = v_uid and challenge_date = v_date;

  return jsonb_build_object(
    'date', v_date,
    'time_limit_sec', 600,
    'already_done', v_result.user_id is not null,
    'result', case when v_result.user_id is null then null else jsonb_build_object(
      'score', v_result.score, 'total', v_result.total, 'time_ms', v_result.time_ms, 'answers', v_result.answers) end,
    'questions', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'pos', d.pos, 'topic', d.topic, 'id', d.id, 'question', d.question,
          'option_a', d.option_a, 'option_b', d.option_b, 'option_c', d.option_c,
          'option_d', d.option_d, 'option_e', d.option_e
        ) || case when v_result.user_id is null then '{}'::jsonb else jsonb_build_object(
          'correct_option', d.correct_option, 'explanation', d.explanation, 'explanation_hi', d.explanation_hi) end
        order by d.pos), '[]'::jsonb)
      from private.daily_set(v_date) d
    )
  );
end;
$$;

-- Grades a Daily Challenge attempt on the server. p_answers / p_times are
-- objects keyed "topic:id" -> 'a'..'e' / milliseconds. p_date must be the
-- date returned by get_daily_challenge(); yesterday is accepted too so an
-- attempt that crosses midnight is still graded against the set it showed.
create or replace function public.submit_daily_challenge(p_date date, p_answers jsonb, p_times jsonb, p_time_ms integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := private.today_ist();
  v_score integer := 0;
  v_total integer := 0;
  v_name text;
  v_sel text;
  v_raw_time text;
  v_time integer;
  v_clean jsonb := '{}'::jsonb;
  r record;
begin
  if v_uid is null then
    raise exception 'Please log in.' using errcode = '28000';
  end if;
  if p_date is null or p_date not in (v_today, v_today - 1) then
    raise exception 'This challenge has expired.' using errcode = '22023';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Invalid answers.' using errcode = '22023';
  end if;
  if exists (select 1 from public.daily_challenge_results where user_id = v_uid and challenge_date = p_date) then
    raise exception 'You have already played this challenge.' using errcode = '23505';
  end if;

  for r in select * from private.daily_set(p_date) loop
    v_total := v_total + 1;
    v_sel := lower(p_answers ->> (r.topic || ':' || r.id));
    if v_sel is not null and v_sel not in ('a', 'b', 'c', 'd', 'e') then
      v_sel := null;
    end if;
    if v_sel is not null then
      v_clean := v_clean || jsonb_build_object(r.topic || ':' || r.id, v_sel);
      if v_sel = r.correct_option then
        v_score := v_score + 1;
      end if;
      v_raw_time := case when jsonb_typeof(p_times) = 'object' then p_times ->> (r.topic || ':' || r.id) end;
      v_time := case when v_raw_time ~ '^\d{1,7}$' then least(v_raw_time::integer, 3600000) else 0 end;
      insert into public.question_attempts (user_id, topic, question_id, selected_option, time_ms, mode)
      values (v_uid, r.topic, r.id, v_sel, v_time, 'daily');
    end if;
  end loop;

  -- Leaderboard shows first name only; never the email.
  select coalesce(
           nullif(split_part(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), ' ', 1), ''),
           'Aspirant')
    into v_name
    from auth.users u where u.id = v_uid;

  insert into public.daily_challenge_results (user_id, challenge_date, score, total, time_ms, display_name, answers)
  values (v_uid, p_date, v_score, v_total, least(greatest(coalesce(p_time_ms, 0), 0), 3600000), left(coalesce(v_name, 'Aspirant'), 24), v_clean);

  return jsonb_build_object('score', v_score, 'total', v_total);
end;
$$;

-- Top 50 for a date, plus the caller's own row if they're outside it.
create or replace function public.daily_leaderboard(p_date date default null)
returns table (rank bigint, display_name text, score smallint, total smallint, time_ms integer, is_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select rank() over (order by r.score desc, r.time_ms asc) as rank,
           r.display_name, r.score, r.total, r.time_ms, r.user_id = auth.uid() as is_me
      from public.daily_challenge_results r
     where auth.uid() is not null
       and r.challenge_date = coalesce(p_date, private.today_ist())
  )
  select * from ranked where rank <= 50 or is_me order by rank, time_ms
$$;

-- ---------------------------------------------------------------------------
-- Dashboard stats for the signed-in user (RLS applies: invoker rights).
-- ---------------------------------------------------------------------------
create or replace function public.get_my_stats()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with mine as (
    select topic, is_correct, time_ms, created_at,
           row_number() over (partition by topic order by created_at desc) as rn
      from public.question_attempts
     where user_id = auth.uid()
  ),
  topics as (
    select topic,
           count(*) as attempted,
           count(*) filter (where is_correct) as correct,
           count(*) filter (where rn <= 50) as recent_attempted,
           count(*) filter (where rn <= 50 and is_correct) as recent_correct,
           round(avg(time_ms) filter (where rn <= 50))::integer as recent_avg_ms
      from mine
     group by topic
  ),
  days as (
    select distinct (created_at at time zone 'Asia/Kolkata')::date as d
      from public.question_attempts where user_id = auth.uid()
    union
    select challenge_date from public.daily_challenge_results where user_id = auth.uid()
  ),
  grouped as (
    select d, d + (row_number() over (order by d desc))::integer as grp from days
  ),
  week as (
    select g.d::date as d,
           count(a.id) as attempted,
           count(a.id) filter (where a.is_correct) as correct
      from generate_series((now() at time zone 'Asia/Kolkata')::date - 6, (now() at time zone 'Asia/Kolkata')::date, interval '1 day') as g(d)
      left join public.question_attempts a
        on a.user_id = auth.uid()
       and (a.created_at at time zone 'Asia/Kolkata')::date = g.d::date
     group by g.d
  )
  select jsonb_build_object(
    'topics', coalesce((select jsonb_object_agg(topic, jsonb_build_object(
        'attempted', attempted, 'correct', correct,
        'recent_attempted', recent_attempted, 'recent_correct', recent_correct,
        'recent_avg_ms', recent_avg_ms)) from topics), '{}'::jsonb),
    'streak', case
        when (select max(d) from days) >= (now() at time zone 'Asia/Kolkata')::date - 1
        then (select count(*) from grouped where grp = (select grp from grouped order by d desc limit 1))
        else 0 end,
    'active_today', exists (select 1 from days where d = (now() at time zone 'Asia/Kolkata')::date),
    'today_attempted', (select attempted from week where d = (now() at time zone 'Asia/Kolkata')::date),
    'week', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'attempted', attempted, 'correct', correct) order by d) from week), '[]'::jsonb),
    'review_due', (select count(*) from public.review_queue where user_id = auth.uid() and due_at <= now()),
    'review_total', (select count(*) from public.review_queue where user_id = auth.uid()),
    'daily_done_today', exists (select 1 from public.daily_challenge_results where user_id = auth.uid() and challenge_date = (now() at time zone 'Asia/Kolkata')::date),
    'last_session', (select jsonb_build_object('topic', topic, 'mode', mode, 'attempted', attempted, 'correct', correct, 'created_at', created_at)
                       from public.practice_sessions where user_id = auth.uid() order by created_at desc limit 1)
  )
$$;

-- Functions are executable by PUBLIC by default; only signed-in users may call these.
revoke all on function public.get_daily_challenge() from public, anon;
revoke all on function public.submit_daily_challenge(date, jsonb, jsonb, integer) from public, anon;
revoke all on function public.daily_leaderboard(date) from public, anon;
revoke all on function public.get_my_stats() from public, anon;
revoke all on function public.handle_question_attempt() from public, anon, authenticated;
grant execute on function public.get_daily_challenge() to authenticated;
grant execute on function public.submit_daily_challenge(date, jsonb, jsonb, integer) to authenticated;
grant execute on function public.daily_leaderboard(date) to authenticated;
grant execute on function public.get_my_stats() to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
