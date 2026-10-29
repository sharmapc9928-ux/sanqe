-- Contact form (/contact).
--
-- Anyone, logged in or not, can send a message; only the app admins can read
-- them (Admin → Messages) and mark them handled. A logged-in sender's account
-- is attached so the admin can see who wrote. Nothing is emailed: the admin
-- replies to the address the sender gave.

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 80),
  email text not null check (length(email) <= 200 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or length(phone) <= 20),
  topic text not null default 'general' check (topic in ('general', 'student', 'coaching', 'bug')),
  message text not null check (length(btrim(message)) between 10 and 4000),
  handled boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists contact_messages_created_idx on public.contact_messages (created_at desc);

alter table public.contact_messages enable row level security;

drop policy if exists "anyone sends" on public.contact_messages;
create policy "anyone sends" on public.contact_messages
  for insert to anon, authenticated
  with check (handled = false and (user_id is null or user_id = (select auth.uid())));

drop policy if exists "admin read" on public.contact_messages;
create policy "admin read" on public.contact_messages
  for select to authenticated using ((select public.is_admin()));

drop policy if exists "admin update" on public.contact_messages;
create policy "admin update" on public.contact_messages
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "admin delete" on public.contact_messages;
create policy "admin delete" on public.contact_messages
  for delete to authenticated using ((select public.is_admin()));

grant insert on public.contact_messages to anon, authenticated;
grant select, update, delete on public.contact_messages to authenticated;
