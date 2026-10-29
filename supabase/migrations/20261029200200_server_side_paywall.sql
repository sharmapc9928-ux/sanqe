-- Server-side paywall for Practice and Learn.
--
-- Until now the lock was only in the app: practice_questions and learn_notes
-- were readable by anyone with the public key, and "has a course" meant "is
-- enrolled in any series" - which join_free_series() hands out to anybody for
-- Fedge's own open series. The database now decides.
--
-- Who may read what in practice_questions:
--   free topics (practice_topics.free)  everyone, logged in or not
--   admins, and anyone with course access, or a Prelims + Mains plan   every topic
--   a Prelims plan                      Prelims topics only
-- learn_notes: admins and people with course access.
-- (The five speed-maths drills live in their own tables and stay free for all.)

-- 1. Topic metadata the policies need. New topics default to the STRICT side:
--    stage 'mains' and not free, until a migration says otherwise.
alter table public.practice_topics
  add column if not exists stage text not null default 'mains',
  add column if not exists free  boolean not null default false;

alter table public.practice_topics
  drop constraint if exists practice_topics_stage_check;
alter table public.practice_topics
  add constraint practice_topics_stage_check check (stage in ('prelims', 'mains'));

-- Mirrors src/lib/syllabus.js: Mains subjects are the m_ ones plus Computer.
update public.practice_topics
   set stage = case when subject = 'computer' or subject like 'mains\_%' then 'mains' else 'prelims' end;
-- Keep in step with FREE_PRACTICE_KEYS in src/lib/syllabus.js.
update public.practice_topics set free = (key in ('average', 'syllogism'));

comment on column public.practice_topics.stage is 'prelims | mains. A Prelims plan reads only prelims topics. Default is the strict one.';
comment on column public.practice_topics.free  is 'Readable by everyone without a plan. Keep in step with FREE_PRACTICE_KEYS in src/lib/syllabus.js.';

-- 2. Course access: enrolled in a series of an approved coaching whose portal
--    plan is running (or Fedge's own). A free join of one of Fedge's OPEN
--    series is not a course: those mocks are for everyone, and counting them
--    handed out the perk to anybody.
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

-- 3. Practice level for the signed-in user: 'full' | 'prelims' | null.
create or replace function public.my_practice_level()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select public.is_admin()) or (select public.my_course_access()) then 'full'
    else (
      select p.tier
        from public.practice_payments p
       where p.user_id = (select auth.uid()) and p.status = 'paid' and p.period_end > now()
       order by (p.tier = 'full') desc
       limit 1
    )
  end
$$;

revoke execute on function public.my_course_access()  from public, anon;
revoke execute on function public.my_practice_level() from public, anon;
grant  execute on function public.my_course_access()  to authenticated;
grant  execute on function public.my_practice_level() to authenticated;

-- 4. practice_questions
drop policy if exists "public read" on public.practice_questions;

create policy "free topics read" on public.practice_questions
  for select to anon, authenticated
  using (exists (select 1 from public.practice_topics t where t.key = practice_questions.topic and t.free));

create policy "paid topics read" on public.practice_questions
  for select to authenticated
  using (
    (select public.my_practice_level()) = 'full'
    or (
      (select public.my_practice_level()) = 'prelims'
      and exists (select 1 from public.practice_topics t where t.key = practice_questions.topic and t.stage = 'prelims')
    )
  );

-- 5. learn_notes
drop policy if exists "public read" on public.learn_notes;

create policy "course read" on public.learn_notes
  for select to authenticated
  using ((select public.is_admin()) or (select public.my_course_access()));

-- 6. The hub shows how many questions every topic has, locked ones included.
--    Counts are not secret, so the function counts as its owner.
create or replace function public.practice_topic_counts()
returns table(topic text, questions bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select q.topic, count(*) from public.practice_questions q group by q.topic
  union all select 'simplification', count(*) from public.simplification
  union all select 'approximation', count(*) from public.approximation
  union all select 'number_series', count(*) from public.number_series
  union all select 'wrong_number_series', count(*) from public.wrong_number_series
  union all select 'quadratic_equations', count(*) from public.quadratic_equations
$$;

-- 7. Joining a free series: not Fedge's open series (they need no enrolment),
--    and only while the coaching's portal plan is running.
create or replace function public.join_free_series(p_series uuid)
returns uuid
language plpgsql
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
     where s.id = p_series and s.on_sale and not s.is_open and s.price_inr = 0
       and c.status = 'approved' and (c.is_fedge or c.paid_until > now())
  ) then
    raise exception 'This test series isn''t free to join.' using errcode = '42501';
  end if;
  insert into public.series_enrollments (series_id, user_id, source)
  values (p_series, v_uid, 'free')
  on conflict (series_id, user_id) do nothing;
  return p_series;
end;
$$;
