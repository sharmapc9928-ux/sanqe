-- Abuse limits: contact form spam, oversized AI-evaluator inputs, function search paths.

-- 1. Contact form: anyone (even logged out) can insert, so cap it. Per email
--    3 an hour; and a global ceiling so a flood can't fill the table.
create or replace function private.contact_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.contact_messages
       where lower(email) = lower(new.email) and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'You have sent a few messages already. Please try again in an hour.' using errcode = '22023';
  end if;
  if (select count(*) from public.contact_messages
       where created_at > now() - interval '1 hour') >= 200 then
    raise exception 'We are getting a lot of messages right now. Please try again later.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke execute on function private.contact_rate_limit() from public, anon, authenticated;

drop trigger if exists contact_rate_limit on public.contact_messages;
create trigger contact_rate_limit
  before insert on public.contact_messages
  for each row execute function private.contact_rate_limit();

-- 2. Descriptive tests: the evaluator sends this text to a paid model, so bound
--    it. Real answers are ~300 words (about 2,000 characters); these are generous.
alter table public.descriptive_submissions
  add constraint descriptive_essay_len  check (essay_answer  is null or char_length(essay_answer)  <= 8000),
  add constraint descriptive_letter_len check (letter_answer is null or char_length(letter_answer) <= 6000),
  add constraint descriptive_comp_len   check (comprehension_answers is null or length(comprehension_answers::text) <= 12000);

alter table public.descriptive_drafts
  add constraint descriptive_draft_essay_len  check (essay_answer  is null or char_length(essay_answer)  <= 8000),
  add constraint descriptive_draft_letter_len check (letter_answer is null or char_length(letter_answer) <= 6000),
  add constraint descriptive_draft_comp_len   check (comprehension_answers is null or length(comprehension_answers::text) <= 12000);

-- 3. SECURITY DEFINER functions with a pinned, empty search_path (the other
--    definer functions already have one). Every name inside is schema-qualified.
alter function public.get_daily_challenge()          set search_path = '';
alter function public.submit_daily_challenge(date, jsonb, jsonb, integer) set search_path = '';
alter function public.daily_leaderboard(date)        set search_path = '';
