-- Undo of migrations/20261029210000_fedge_passes.sql.
-- Puts back the previous functions and the previous payout view, then drops the
-- new objects. DESTROYS every row in fedge_passes (the Fedge passes sold), so
-- export them first if any were paid:
--   select * from public.fedge_passes where status = 'paid';
begin;

-- 1. Previous functions, exactly as they were before (open_mocks, open_series_not_sold, server_side_paywall)
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

create or replace function public.get_coaching_page(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'city', c.city, 'state', c.state, 'about', c.about, 'slug', c.slug, 'status', c.status,
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
  )
$$;

-- 2. Previous payout view (series sales only)
create or replace view public.coaching_payout_due
with (security_invoker = true) as
select p.coaching_id,
       c.name as coaching_name,
       count(*) as sales,
       sum(p.amount_inr) as gross_inr,
       sum(p.fedge_share_inr) as fedge_inr,
       sum(p.coaching_share_inr) as owed_inr
  from public.series_payments p
  left join public.coachings c on c.id = p.coaching_id
 where p.status = 'paid' and p.payout_status = 'pending'
 group by p.coaching_id, c.name;

-- 3. Drop what the migration added
drop trigger if exists fedge_price_guard on public.coachings;
drop function if exists private.fedge_price_guard();
drop function if exists private.enrolled_in_open(uuid);
drop function if exists public.activate_fedge_pass(text, text);
drop function if exists public.my_fedge_access();
drop function if exists public.my_mock_access();
drop table if exists public.fedge_passes;
drop table if exists public.fedge_plans;
alter table public.coachings drop constraint if exists coachings_fedge_price_range;
alter table public.coachings drop column if exists fedge_price_inr;
alter table public.coaching_mocks drop column if exists free_sample;

commit;
