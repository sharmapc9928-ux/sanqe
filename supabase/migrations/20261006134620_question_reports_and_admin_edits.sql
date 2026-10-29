-- "Report this question" from students, admin edits on the five original
-- quant tables, a question-text fix and a security-advisor fix.

-- ---------------------------------------------------------------------------
-- Question reports
-- ---------------------------------------------------------------------------
-- One report per student per question (a second tap says "already reported").
-- topic is one of the five original tables or a practice_questions topic key,
-- the same convention as question_attempts.
create table if not exists public.question_reports (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  topic text not null check (topic ~ '^[a-z][a-z0-9_]{1,39}$'),
  question_id bigint not null,
  reason text not null check (reason in ('wrong_answer', 'typo', 'unclear', 'picture', 'other')),
  note text check (char_length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  unique (user_id, topic, question_id)
);
create index if not exists question_reports_status_idx on public.question_reports (status, created_at desc);

-- Students can only file reports; admins read and resolve them.
alter table public.question_reports enable row level security;
drop policy if exists "own insert" on public.question_reports;
drop policy if exists "admin read" on public.question_reports;
drop policy if exists "admin update" on public.question_reports;
drop policy if exists "admin delete" on public.question_reports;
create policy "own insert" on public.question_reports
  for insert to authenticated with check (user_id = (select auth.uid()) and status = 'open');
create policy "admin read" on public.question_reports
  for select to authenticated using ((select public.is_admin()));
create policy "admin update" on public.question_reports
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin delete" on public.question_reports
  for delete to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Admins can add / fix questions in the five original quant tables too.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['simplification', 'approximation', 'number_series', 'wrong_number_series', 'quadratic_equations'] loop
    execute format('drop policy if exists "admin insert" on public.%I', t);
    execute format('drop policy if exists "admin update" on public.%I', t);
    execute format('drop policy if exists "admin delete" on public.%I', t);
    execute format('create policy "admin insert" on public.%I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format('create policy "admin update" on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('create policy "admin delete" on public.%I for delete to authenticated using ((select public.is_admin()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Data fix: simplification #79 lost its brackets. With them the answer is
-- x = 379 (option c): (36 + 3x)/23 + 1 = 52 → 3x = 1137.
-- ---------------------------------------------------------------------------
update public.simplification
   set question = '(36 + 3x)/23 + 2⁸ ÷ 16² = 13 × 4'
 where id = 79 and question = '36 + 3x/23 + 2⁸ ÷ 16² = 13 × 4';

-- Security advisor 0011: pin the search_path.
alter function private.today_ist() set search_path = '';
