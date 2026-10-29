-- Tie descriptive attempts to the logged-in user and lock every read/write
-- down to the owner. Before this, submissions, drafts and evaluations were
-- readable (and drafts writable) by anyone holding the public anon key.

-- user_id defaults to the caller, so the client never has to send it (and
-- can't spoof someone else's). Deleting an account deletes its attempts.
alter table public.descriptive_submissions
  add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete cascade;
alter table public.descriptive_drafts
  add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete cascade;

create index if not exists descriptive_submissions_user_id_idx on public.descriptive_submissions(user_id);

-- Drafts were keyed by a per-device session id, so two accounts on one phone
-- collided on the same row. Key them by user instead. (Table is empty: the
-- old autosave never succeeded, because upsert needs a SELECT policy.)
delete from public.descriptive_drafts where user_id is null;
alter table public.descriptive_drafts alter column user_id set not null;
alter table public.descriptive_drafts alter column session_id drop not null;
alter table public.descriptive_drafts drop constraint if exists descriptive_drafts_session_id_mock_number_key;
alter table public.descriptive_drafts add constraint descriptive_drafts_user_mock_key unique (user_id, mock_number);

-- submissions
drop policy if exists "anon insert" on public.descriptive_submissions;
drop policy if exists "public read" on public.descriptive_submissions;
drop policy if exists "own read" on public.descriptive_submissions;
drop policy if exists "own insert" on public.descriptive_submissions;
create policy "own read" on public.descriptive_submissions
  for select to authenticated using (user_id = auth.uid());
create policy "own insert" on public.descriptive_submissions
  for insert to authenticated with check (user_id = auth.uid());

-- evaluations: written only by the edge function (service role); readable
-- only through a submission the caller owns
drop policy if exists "public read" on public.descriptive_evaluations;
drop policy if exists "own read" on public.descriptive_evaluations;
create policy "own read" on public.descriptive_evaluations
  for select to authenticated using (
    exists (
      select 1 from public.descriptive_submissions s
      where s.id = descriptive_evaluations.submission_id and s.user_id = auth.uid()
    )
  );

-- drafts (autosave upsert needs select + insert + update on own rows)
drop policy if exists "anon insert" on public.descriptive_drafts;
drop policy if exists "anon update" on public.descriptive_drafts;
drop policy if exists "own read" on public.descriptive_drafts;
drop policy if exists "own insert" on public.descriptive_drafts;
drop policy if exists "own update" on public.descriptive_drafts;
drop policy if exists "own delete" on public.descriptive_drafts;
create policy "own read" on public.descriptive_drafts
  for select to authenticated using (user_id = auth.uid());
create policy "own insert" on public.descriptive_drafts
  for insert to authenticated with check (user_id = auth.uid());
create policy "own update" on public.descriptive_drafts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own delete" on public.descriptive_drafts
  for delete to authenticated using (user_id = auth.uid());

-- Let a user correct their dream job from the profile panel.
drop policy if exists "Users can update their own dream job" on public.dream_jobs;
create policy "Users can update their own dream job" on public.dream_jobs
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
