-- Shared question table for every practice topic except the five original
-- quant tables. Add questions from the Supabase Table Editor (or import a CSV
-- shaped like supabase/practice_questions_template.csv): pick the topic from
-- the dropdown, fill the question, options, the correct option and,
-- optionally, a passage and an explanation.

-- One row per topic key used by the app (src/lib/syllabus.js). The foreign
-- key below turns 'topic' into a dropdown in the Table Editor and rejects
-- typos. To add a new topic, insert a row here and add it to syllabus.js.
create table if not exists public.practice_topics (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  subject text not null check (subject in ('quant', 'reasoning', 'english', 'ga', 'computer')),
  name text not null
);

insert into public.practice_topics (key, subject, name) values
  ('speed_calc', 'quant', 'Tables, Squares & Cubes'),
  ('ratio_proportion', 'quant', 'Ratio & Proportion'),
  ('percentage', 'quant', 'Percentage'),
  ('average', 'quant', 'Average'),
  ('ages', 'quant', 'Problems on Ages'),
  ('profit_loss', 'quant', 'Profit, Loss & Discount'),
  ('simple_interest', 'quant', 'Simple Interest'),
  ('compound_interest', 'quant', 'Compound Interest'),
  ('partnership', 'quant', 'Partnership'),
  ('mixture_alligation', 'quant', 'Mixture & Alligation'),
  ('time_work', 'quant', 'Time & Work'),
  ('pipes_cisterns', 'quant', 'Pipes & Cisterns'),
  ('speed_distance', 'quant', 'Time, Speed & Distance'),
  ('trains', 'quant', 'Problems on Trains'),
  ('boats_streams', 'quant', 'Boats & Streams'),
  ('mensuration', 'quant', 'Mensuration'),
  ('probability', 'quant', 'Probability'),
  ('permutation_combination', 'quant', 'Permutation & Combination'),
  ('quantity_comparison', 'quant', 'Quantity Comparison'),
  ('di_table', 'quant', 'Table DI'),
  ('di_charts', 'quant', 'Pie & Bar Chart DI'),
  ('caselet_ds', 'quant', 'Caselet & Data Sufficiency'),
  ('seating_linear', 'reasoning', 'Linear Seating'),
  ('seating_circular', 'reasoning', 'Circular Seating'),
  ('floor_puzzle', 'reasoning', 'Floor Puzzles'),
  ('box_scheduling', 'reasoning', 'Box, Month & Day Puzzles'),
  ('inequality', 'reasoning', 'Inequality'),
  ('syllogism', 'reasoning', 'Syllogism'),
  ('reasoning_ds', 'reasoning', 'Data Sufficiency'),
  ('coding_decoding', 'reasoning', 'Coding–Decoding'),
  ('blood_relations', 'reasoning', 'Blood Relations'),
  ('direction_sense', 'reasoning', 'Direction Sense'),
  ('order_ranking', 'reasoning', 'Order & Ranking'),
  ('alphanumeric_series', 'reasoning', 'Alphabet & Alphanumeric Series'),
  ('input_output', 'reasoning', 'Input–Output'),
  ('logical_reasoning', 'reasoning', 'Statements & Conclusions'),
  ('error_spotting', 'english', 'Error Spotting'),
  ('sentence_improvement', 'english', 'Phrase Replacement'),
  ('fillers', 'english', 'Fillers'),
  ('vocabulary', 'english', 'Synonyms & Antonyms'),
  ('idioms', 'english', 'Idioms & Phrases'),
  ('reading_comprehension', 'english', 'Reading Comprehension'),
  ('cloze_test', 'english', 'Cloze Test'),
  ('para_jumbles', 'english', 'Para Jumbles'),
  ('rbi_monetary', 'ga', 'RBI & Monetary Policy'),
  ('banking_history', 'ga', 'Indian Banking: History & Structure'),
  ('banking_terms', 'ga', 'Banking Terms & Products'),
  ('financial_institutions', 'ga', 'Regulators & Financial Institutions'),
  ('economy_basics', 'ga', 'Indian Economy Basics'),
  ('govt_schemes', 'ga', 'Government Schemes'),
  ('static_gk', 'ga', 'Static GK'),
  ('current_affairs', 'ga', 'Current Affairs Strategy'),
  ('computer_fundamentals', 'computer', 'Computer Fundamentals'),
  ('hardware_memory', 'computer', 'Hardware & Memory'),
  ('number_system', 'computer', 'Number System'),
  ('software_os', 'computer', 'Software & Operating Systems'),
  ('ms_office', 'computer', 'MS Office & Shortcuts'),
  ('networking_internet', 'computer', 'Networking & Internet'),
  ('dbms', 'computer', 'Database (DBMS)'),
  ('cyber_security', 'computer', 'Cyber Security')
on conflict (key) do update set subject = excluded.subject, name = excluded.name;

alter table public.practice_topics enable row level security;
drop policy if exists "public read" on public.practice_topics;
create policy "public read" on public.practice_topics for select to anon, authenticated using (true);

create table if not exists public.practice_questions (
  id bigint generated always as identity primary key,
  topic text not null references public.practice_topics(key) on update cascade,
  passage text,            -- optional: shared text shown above the question (puzzle clues, DI data, RC passage)
  question text not null check (length(btrim(question)) > 0),
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  option_e text,           -- leave empty for 4-option questions
  correct_option text not null check (correct_option in ('a', 'b', 'c', 'd', 'e')),
  explanation text,
  explanation_hi text,
  source text,             -- e.g. book name and page, for your own reference
  created_at timestamptz not null default now(),
  check (correct_option <> 'e' or option_e is not null)
);
create index if not exists practice_questions_topic_idx on public.practice_questions (topic, id);

-- Same access as the original question tables: anyone can read, only the
-- dashboard (service role) can write.
alter table public.practice_questions enable row level security;
drop policy if exists "public read" on public.practice_questions;
create policy "public read" on public.practice_questions for select to anon, authenticated using (true);

-- Question counts per topic (all topics, including the five original tables)
-- for the practice screens.
create or replace function public.practice_topic_counts()
returns table (topic text, questions bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select topic, count(*) from public.practice_questions group by topic
  union all select 'simplification', count(*) from public.simplification
  union all select 'approximation', count(*) from public.approximation
  union all select 'number_series', count(*) from public.number_series
  union all select 'wrong_number_series', count(*) from public.wrong_number_series
  union all select 'quadratic_equations', count(*) from public.quadratic_equations
$$;
grant execute on function public.practice_topic_counts() to anon, authenticated;
