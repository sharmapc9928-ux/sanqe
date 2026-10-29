-- Partner registration: the details Fedge needs before onboarding a coaching
-- as a partner (invoices, payouts, their branded site, the agreement).
--
-- One application per account. The applicant reads and edits their own while
-- it is still 'new'; admins read every application and move its status on
-- (new -> contacted -> approved / rejected) from the SQL editor or the table
-- editor. Bank details live here, so nobody else can read a row.
--
-- Only what the invoice and payouts need: no Aadhaar, no personal bank
-- details.
--
-- Files (logo, faculty photos, cancelled cheque / bank statement) go to the private
-- 'partner-files' bucket under <user id>/...; admins read them through the
-- dashboard.

create table if not exists public.partner_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  status text not null default 'new' check (status in ('new', 'contacted', 'approved', 'rejected')),

  -- 1. Business and GST (for the invoice)
  legal_name text not null check (char_length(legal_name) between 2 and 120),
  brand_name text not null check (char_length(brand_name) between 2 and 80),
  business_type text not null check (business_type in ('proprietorship', 'partnership', 'llp', 'pvt_ltd', 'other')),
  gstin text check (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  pan text check (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  billing_address text not null check (char_length(billing_address) between 5 and 400),
  billing_state text not null check (char_length(billing_state) between 2 and 60),
  billing_pincode text check (billing_pincode ~ '^[1-9][0-9]{5}$'),

  -- 2. Contact
  owner_name text not null check (char_length(owner_name) between 2 and 80),
  owner_phone text not null check (owner_phone ~ '^[6-9][0-9]{9}$'),
  owner_email text not null check (owner_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  admin_name text check (char_length(admin_name) <= 80),
  admin_whatsapp text check (admin_whatsapp ~ '^[6-9][0-9]{9}$'),
  accounts_email text check (accounts_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),

  -- 3. Branding (their site)
  logo_path text,
  brand_colors text check (char_length(brand_colors) <= 100),
  subdomain text check (subdomain ~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$'),
  tagline text check (char_length(tagline) <= 120),
  about text check (char_length(about) <= 1500),
  faculty text check (char_length(faculty) <= 1500),
  faculty_photo_paths text[] not null default '{}' check (coalesce(array_length(faculty_photo_paths, 1), 0) <= 10),
  student_address text check (char_length(student_address) <= 400),
  student_phone text check (char_length(student_phone) <= 20),
  maps_url text check (char_length(maps_url) <= 500),
  instagram_url text check (char_length(instagram_url) <= 300),
  youtube_url text check (char_length(youtube_url) <= 300),
  telegram_url text check (char_length(telegram_url) <= 300),

  -- 4. Plan and money
  plan text not null check (plan in ('prelims', 'prelims_mains')),
  start_date date,
  billing_day integer check (billing_day between 1 and 28),
  student_price_inr integer check (student_price_inr between 0 and 100000),
  student_billing text check (student_billing in ('monthly', 'one_time')),
  bank_account_name text not null check (char_length(bank_account_name) between 2 and 120),
  bank_account_number text not null check (bank_account_number ~ '^[0-9]{9,18}$'),
  bank_ifsc text not null check (bank_ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  bank_proof_path text,

  -- 5. Operations
  exams text[] not null default '{}',
  student_count integer check (student_count between 0 and 1000000),
  batches text check (char_length(batches) <= 500),
  own_content boolean not null default false,
  admin_logins integer check (admin_logins between 1 and 50),
  zoom_needed boolean not null default false,

  agreed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- No GST registration: the PAN is needed instead.
  constraint partner_gstin_or_pan check (gstin is not null or pan is not null)
);

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists partner_applications_touch on public.partner_applications;
create trigger partner_applications_touch before update on public.partner_applications
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.partner_applications enable row level security;
revoke all on public.partner_applications from anon;
revoke delete on public.partner_applications from authenticated;

drop policy if exists "partner read" on public.partner_applications;
drop policy if exists "partner insert" on public.partner_applications;
drop policy if exists "partner update" on public.partner_applications;
drop policy if exists "partner admin update" on public.partner_applications;

create policy "partner read" on public.partner_applications for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
-- Applicants can only send and edit a 'new' application; admins set the rest.
create policy "partner insert" on public.partner_applications for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'new');
create policy "partner update" on public.partner_applications for update to authenticated
  using (user_id = (select auth.uid()) and status = 'new')
  with check (user_id = (select auth.uid()) and status = 'new');
create policy "partner admin update" on public.partner_applications for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Files: private bucket, each applicant writes only in their own folder
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partner-files', 'partner-files', false, 5242880,
        array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "partner files read" on storage.objects;
drop policy if exists "partner files insert" on storage.objects;
drop policy if exists "partner files update" on storage.objects;
drop policy if exists "partner files delete" on storage.objects;
create policy "partner files read" on storage.objects for select to authenticated
  using (bucket_id = 'partner-files'
         and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));
create policy "partner files insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'partner-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "partner files update" on storage.objects for update to authenticated
  using (bucket_id = 'partner-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "partner files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'partner-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

revoke all on function private.touch_updated_at() from public, anon, authenticated;
