-- Images on practice questions (DI charts, puzzle diagrams, figure series)
-- and an admin role that can add / edit / delete questions from the app's
-- /admin screen instead of the Supabase Table Editor.

-- ---------------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------------
-- One row per admin account. There is no insert/update policy, so rows can
-- only be added from the dashboard / SQL editor:
--   insert into public.app_admins (user_id)
--   select id from auth.users where email = 'someone@example.com';
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;
drop policy if exists "own read" on public.app_admins;
create policy "own read" on public.app_admins
  for select to authenticated using (user_id = auth.uid());

-- Invoker rights: the caller can only see their own row, which is all this
-- needs. Used by the policies below and by the app to show the admin screen.
create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.app_admins where user_id = (select auth.uid()))
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

insert into public.app_admins (user_id)
select id from auth.users where lower(email) = 'admin@example.com'
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Question images
-- ---------------------------------------------------------------------------
-- Public URL of a picture shown between the passage and the question.
alter table public.practice_questions add column if not exists image_url text;

-- Admins write questions; everyone keeps read access through "public read".
drop policy if exists "admin insert" on public.practice_questions;
drop policy if exists "admin update" on public.practice_questions;
drop policy if exists "admin delete" on public.practice_questions;
create policy "admin insert" on public.practice_questions
  for insert to authenticated with check ((select public.is_admin()));
create policy "admin update" on public.practice_questions
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin delete" on public.practice_questions
  for delete to authenticated using ((select public.is_admin()));

-- Public bucket: anyone can view an image by its URL; only admins can
-- upload, replace or delete. 2 MB cap (the admin screen shrinks photos
-- before uploading). No SVG, since it can carry scripts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-images', 'question-images', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "question images admin read" on storage.objects;
drop policy if exists "question images admin insert" on storage.objects;
drop policy if exists "question images admin update" on storage.objects;
drop policy if exists "question images admin delete" on storage.objects;
create policy "question images admin read" on storage.objects
  for select to authenticated using (bucket_id = 'question-images' and (select public.is_admin()));
create policy "question images admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'question-images' and (select public.is_admin()));
create policy "question images admin update" on storage.objects
  for update to authenticated using (bucket_id = 'question-images' and (select public.is_admin()));
create policy "question images admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'question-images' and (select public.is_admin()));
