-- ROLLBACK for the 29 Oct 2026 security hardening (migrations 20261029200000 .. 20261029200200)
-- Captured from the live database BEFORE the changes. The migrations only change
-- grants, policies, functions, constraints and add columns - no row data is touched,
-- so rolling back restores exactly the old behaviour.
--
-- Run in this order if something breaks: PART 1 (undo new objects), PART 2 (functions),
-- PART 3 (grants). Each part can be run on its own.

---------------------------------------------------------------------------------------
-- PART 1: undo migration 3 (paywall), 2 (limits)
---------------------------------------------------------------------------------------
drop policy if exists "free topics read" on public.practice_questions;
drop policy if exists "paid topics read" on public.practice_questions;
create policy "public read" on public.practice_questions as permissive for SELECT to anon, authenticated using (true);

drop policy if exists "course read" on public.learn_notes;
create policy "public read" on public.learn_notes as permissive for SELECT to anon, authenticated using (true);

drop function if exists public.my_practice_level();
drop function if exists public.my_course_access();
alter table public.practice_topics drop column if exists stage, drop column if exists free;

drop trigger if exists contact_rate_limit on public.contact_messages;
drop function if exists private.contact_rate_limit();

alter table public.descriptive_submissions
  drop constraint if exists descriptive_essay_len,
  drop constraint if exists descriptive_letter_len,
  drop constraint if exists descriptive_comp_len;
alter table public.descriptive_drafts
  drop constraint if exists descriptive_draft_essay_len,
  drop constraint if exists descriptive_draft_letter_len,
  drop constraint if exists descriptive_draft_comp_len;

---------------------------------------------------------------------------------------
-- PART 2: functions as they were
---------------------------------------------------------------------------------------
alter function public.get_daily_challenge() set search_path = 'public';
alter function public.submit_daily_challenge(date, jsonb, jsonb, integer) set search_path = 'public';
alter function public.daily_leaderboard(date) set search_path = 'public';

CREATE OR REPLACE FUNCTION public.join_free_series(p_series uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.practice_topic_counts()
 RETURNS TABLE(topic text, questions bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select topic, count(*) from public.practice_questions group by topic
  union all select 'simplification', count(*) from public.simplification
  union all select 'approximation', count(*) from public.approximation
  union all select 'number_series', count(*) from public.number_series
  union all select 'wrong_number_series', count(*) from public.wrong_number_series
  union all select 'quadratic_equations', count(*) from public.quadratic_equations
$function$;

grant execute on function public.learn_notes_touch() to public;

---------------------------------------------------------------------------------------
-- PART 3: grants as they were (table-level, then column-level)
---------------------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public
  grant truncate, trigger, references on tables to anon, authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.app_admins to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.app_admins to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.approximation to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.approximation to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.coaching_mocks to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.coaching_mocks to authenticated;
grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.coaching_payments to anon;
grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.coaching_payments to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.coaching_payout_due to authenticated;
grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.coaching_plans to anon;
grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.coaching_plans to authenticated;
grant DELETE, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.coaching_students to anon;
grant DELETE, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.coaching_students to authenticated;
grant DELETE, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.coachings to anon;
grant DELETE, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.coachings to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.contact_messages to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.contact_messages to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.daily_challenge_results to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.daily_challenge_results to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.descriptive_drafts to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.descriptive_drafts to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.descriptive_evaluations to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.descriptive_evaluations to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.descriptive_prompts to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.descriptive_prompts to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.descriptive_submissions to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.descriptive_submissions to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.dream_jobs to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.dream_jobs to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.learn_notes to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.learn_notes to authenticated;
grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.mock_attempts to anon;
grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.mock_attempts to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.mock_questions to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.mock_questions to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.mock_sections to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.mock_sections to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.number_series to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.number_series to authenticated;
grant INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.partner_applications to authenticated;
grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.practice_payments to authenticated;
grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.practice_plans to anon;
grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.practice_plans to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.practice_questions to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.practice_questions to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.practice_sessions to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.practice_sessions to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.practice_topics to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.practice_topics to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.quadratic_equations to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.quadratic_equations to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.question_attempts to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.question_attempts to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.question_reports to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.question_reports to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.review_queue to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.review_queue to authenticated;
grant DELETE, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.series_access_codes to anon;
grant DELETE, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.series_access_codes to authenticated;
grant DELETE, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.series_enrollments to anon;
grant DELETE, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.series_enrollments to authenticated;
grant REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.series_payments to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.simplification to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.simplification to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.test_series to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.test_series to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.wrong_number_series to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.wrong_number_series to authenticated;

-- column-level grants (these are what stop a coaching owner changing status / commission / paid_until)
grant INSERT (name, city, phone, about, slug, state) on table public.coachings to authenticated;
grant UPDATE (name, city, phone, about, slug, state) on table public.coachings to authenticated;
grant UPDATE (revoked) on table public.series_access_codes to authenticated;
