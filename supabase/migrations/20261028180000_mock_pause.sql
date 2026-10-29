-- Pause / resume for coaching mocks.
--
-- The clock of a mock is the server's (started_at + the sections' lengths),
-- so a pause has to be the server's too. Pausing freezes the clock: on resume
-- started_at is moved forward by the time spent paused, which moves every
-- section deadline with it, so scoring and the "late answer" checks keep
-- working off started_at as before.
--
-- A student gets a limited pause budget per attempt (private.mock_pause_cap_sec,
-- 10 minutes in total, split over as many pauses as they like) so ranks stay
-- fair. A pause that outlasts the budget stops freezing the clock: the server
-- treats the budget as used up and the clock runs again.

alter table public.mock_attempts
  add column if not exists paused_at timestamptz,
  add column if not exists pause_used_sec integer not null default 0 check (pause_used_sec >= 0);

create or replace function private.mock_pause_cap_sec()
returns integer
language sql
immutable
set search_path = ''
as $$ select 600 $$;

-- When the attempt's clock effectively started: started_at, pushed later by
-- a pause that is still open (up to what is left of the pause budget).
create or replace function private.attempt_started(a public.mock_attempts)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select a.started_at + case
    when a.paused_at is null then interval '0'
    else make_interval(secs => least(
           extract(epoch from now() - a.paused_at),
           greatest(0, private.mock_pause_cap_sec() - a.pause_used_sec)))
  end
$$;

-- Seconds of pause budget left, counting an open pause.
create or replace function private.attempt_pause_left(a public.mock_attempts)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(0, floor(private.mock_pause_cap_sec() - a.pause_used_sec
           - case when a.paused_at is null then 0 else extract(epoch from now() - a.paused_at) end))::integer
$$;

-- Ends an open pause: books the time against the budget and moves started_at.
create or replace function private.resume_attempt(p_attempt uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  a public.mock_attempts;
  v_used integer;
begin
  select * into a from public.mock_attempts where id = p_attempt for update;
  if not found or a.paused_at is null or a.submitted_at is not null then
    return;
  end if;
  v_used := greatest(0, least(floor(extract(epoch from now() - a.paused_at))::integer,
                              private.mock_pause_cap_sec() - a.pause_used_sec));
  update public.mock_attempts
     set started_at = started_at + make_interval(secs => v_used),
         pause_used_sec = pause_used_sec + v_used,
         paused_at = null
   where id = a.id;
end;
$$;

-- The deadline checks now use the effective start, so a paused attempt
-- doesn't expire while the clock is frozen.
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
  v_start timestamptz;
  r record;
begin
  select * into a from public.mock_attempts where id = p_attempt;
  select * into m from public.coaching_mocks where id = a.mock_id;
  v_start := private.attempt_started(a);
  if p_posted is not null and jsonb_typeof(p_posted) <> 'object' then
    p_posted := null;
  end if;

  for r in
    with sec as (
      select s.id, sum(s.duration_sec) over (order by s.position, s.id) as cum
        from public.mock_sections s where s.mock_id = a.mock_id
    )
    select q.id, q.option_e,
           v_start + make_interval(secs => (case when m.sectional_timing then sec.cum else m.duration_sec end) + private.mock_grace_sec()) as closes_at
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

create or replace function private.attempt_expired(p_attempt uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select now() > private.attempt_started(a) + make_interval(secs => private.mock_total_sec(a.mock_id) + private.mock_grace_sec())
    from public.mock_attempts a where a.id = p_attempt
$$;

-- start_mock now also tells the app whether the attempt is paused. A pause
-- whose budget has run out is closed here, so the app gets a running clock.
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

-- Freezes the clock. { submitted: true } if the test had already ended.
-- Raises when the pause budget is used up.
create or replace function public.pause_mock(p_attempt uuid)
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
  if a.paused_at is null then
    if a.pause_used_sec >= private.mock_pause_cap_sec() then
      raise exception 'You have used all of the pause time for this test.' using errcode = '22023';
    end if;
    update public.mock_attempts set paused_at = now() where id = a.id returning * into a;
  end if;
  return jsonb_build_object('submitted', false, 'server_now', now(), 'started_at', a.started_at,
                            'paused_at', a.paused_at, 'pause_left_sec', private.attempt_pause_left(a));
end;
$$;

-- Starts the clock again. Returns the moved started_at for the app's timers.
create or replace function public.resume_mock(p_attempt uuid)
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
  perform private.resume_attempt(a.id);
  select * into a from public.mock_attempts where id = a.id;
  return jsonb_build_object('submitted', false, 'server_now', now(), 'started_at', a.started_at,
                            'paused_at', null, 'pause_left_sec', private.attempt_pause_left(a));
end;
$$;

revoke all on function public.pause_mock(uuid) from public, anon;
revoke all on function public.resume_mock(uuid) from public, anon;
grant execute on function public.pause_mock(uuid) to authenticated;
grant execute on function public.resume_mock(uuid) to authenticated;
revoke all on function private.mock_pause_cap_sec() from public, anon, authenticated;
revoke all on function private.attempt_started(public.mock_attempts) from public, anon, authenticated;
revoke all on function private.attempt_pause_left(public.mock_attempts) from public, anon, authenticated;
revoke all on function private.resume_attempt(uuid) from public, anon, authenticated;
