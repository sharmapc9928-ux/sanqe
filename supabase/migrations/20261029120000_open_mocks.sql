-- Open mocks: Fedge's own full-length mocks are normal mocks, not a coaching's
-- private pack. A test series marked is_open is visible and startable by every
-- logged-in student, with no enrollment and no coaching name shown. Mock Tests
-- lists them by exam (list_open_mocks).
--
-- Only Fedge turns a series open: from the SQL editor / service role, or an
-- admin account. A coaching owner can't flip it on their own series.

alter table public.test_series add column if not exists is_open boolean not null default false;

create or replace function private.series_open_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' and new.is_open then
      raise exception 'Only Fedge can make a test series open to everyone.' using errcode = '42501';
    elsif tg_op = 'UPDATE' and new.is_open is distinct from old.is_open then
      raise exception 'Only Fedge can make a test series open to everyone.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists series_open_guard on public.test_series;
create trigger series_open_guard before insert or update of is_open on public.test_series
  for each row execute function private.series_open_guard();

-- A series' mocks and where the student is on each. Open series need no
-- enrollment, and leave the coaching out.
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
  if p_series is null or not (
       p_series in (select public.my_enrolled_series())
    or p_series in (select public.my_owned_series())
    or (v_uid is not null and exists (select 1 from public.test_series o where o.id = p_series and o.is_open))
  ) then
    raise exception 'You don''t have access to this test series.' using errcode = '42501';
  end if;
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

-- Starting a mock: enrolled students as before, plus any logged-in student for
-- a mock in an open series.
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
     and (series_id in (select public.my_enrolled_series())
          or series_id in (select o.id from public.test_series o where o.is_open));
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
-- coaching is not part of the answer. Grouped by exam on the client.
create or replace function public.list_open_mocks()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Please log in.' using errcode = '28000';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', m.id, 'series_id', m.series_id, 'title', m.title, 'exam', s.exam,
             'sectional_timing', m.sectional_timing, 'negative_mark', m.negative_mark,
             'total_sec', private.mock_total_sec(m.id),
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

revoke all on function public.list_open_mocks() from public, anon;
grant execute on function public.list_open_mocks() to authenticated;
