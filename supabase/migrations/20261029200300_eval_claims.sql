-- AI evaluator quota that parallel requests cannot race.
--
-- evaluate-descriptive used to count SAVED evaluations to enforce "10 a day", so
-- several requests fired at once all passed the check before the first one saved.
-- Now each request first claims a slot here; claiming is serialised per user with
-- an advisory lock, and a claim counts the moment it is made.
--
-- Only the edge function (service role) can call these; the table has RLS on and
-- no policy for anyone else.

create table if not exists public.eval_claims (
  submission_id bigint primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now()
);
create index if not exists eval_claims_user_time on public.eval_claims (user_id, created_at desc);

alter table public.eval_claims enable row level security;
revoke all on public.eval_claims from anon, authenticated;

-- Returns 'ok' (go ahead), 'busy' (this submission is being evaluated right now)
-- or 'limit' (the user has used p_limit slots in the last 24 hours).
create or replace function public.claim_eval_slot(p_user uuid, p_submission bigint, p_limit integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 7));

  delete from public.eval_claims where created_at < now() - interval '2 days';
  -- A claim more than 3 minutes old whose evaluation never got saved belongs to a
  -- run that died: take it over instead of blocking the student for two days.
  delete from public.eval_claims
   where submission_id = p_submission and created_at < now() - interval '3 minutes';

  if exists (select 1 from public.eval_claims where submission_id = p_submission) then
    return 'busy';
  end if;
  if (select count(*) from public.eval_claims
       where user_id = p_user and created_at > now() - interval '24 hours') >= p_limit then
    return 'limit';
  end if;

  insert into public.eval_claims (submission_id, user_id) values (p_submission, p_user);
  return 'ok';
end;
$$;

-- Gives a slot back when the model could not be reached, so a Gemini outage does
-- not use up the student's day.
create or replace function public.release_eval_slot(p_submission bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.eval_claims where submission_id = p_submission
$$;

revoke execute on function public.claim_eval_slot(uuid, bigint, integer) from public, anon, authenticated;
revoke execute on function public.release_eval_slot(bigint)              from public, anon, authenticated;
grant  execute on function public.claim_eval_slot(uuid, bigint, integer) to service_role;
grant  execute on function public.release_eval_slot(bigint)              to service_role;
