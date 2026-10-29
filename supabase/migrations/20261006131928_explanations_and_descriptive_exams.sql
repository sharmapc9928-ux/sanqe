-- 1. Worked solutions for every practice question (English + Hinglish).
alter table public.simplification       add column if not exists explanation text, add column if not exists explanation_hi text;
alter table public.approximation        add column if not exists explanation text, add column if not exists explanation_hi text;
alter table public.number_series        add column if not exists explanation text, add column if not exists explanation_hi text;
alter table public.wrong_number_series  add column if not exists explanation text, add column if not exists explanation_hi text;
alter table public.quadratic_equations  add column if not exists explanation text, add column if not exists explanation_hi text;

-- 2. Descriptive tests for more than one exam.
--    ibps_po = Essay + Comprehension (existing)
--    sbi_po  = Letter + Essay
alter table public.descriptive_prompts
  add column if not exists exam text not null default 'ibps_po',
  add column if not exists letter_topic text,
  add column if not exists letter_instructions text,
  add column if not exists letter_word_min integer,
  add column if not exists letter_word_max integer;
alter table public.descriptive_prompts drop constraint if exists descriptive_prompts_exam_check;
alter table public.descriptive_prompts add constraint descriptive_prompts_exam_check check (exam in ('ibps_po', 'sbi_po'));
alter table public.descriptive_prompts alter column passage drop not null;
alter table public.descriptive_prompts alter column sub_questions set default '[]'::jsonb;
alter table public.descriptive_prompts drop constraint if exists descriptive_prompts_mock_number_key;
alter table public.descriptive_prompts drop constraint if exists descriptive_prompts_exam_mock_key;
alter table public.descriptive_prompts add constraint descriptive_prompts_exam_mock_key unique (exam, mock_number);

alter table public.descriptive_submissions
  add column if not exists exam text not null default 'ibps_po',
  add column if not exists letter_answer text not null default '';
alter table public.descriptive_submissions drop constraint if exists descriptive_submissions_exam_check;
alter table public.descriptive_submissions add constraint descriptive_submissions_exam_check check (exam in ('ibps_po', 'sbi_po'));

alter table public.descriptive_drafts
  add column if not exists exam text not null default 'ibps_po',
  add column if not exists letter_answer text not null default '';
alter table public.descriptive_drafts drop constraint if exists descriptive_drafts_user_mock_key;
alter table public.descriptive_drafts drop constraint if exists descriptive_drafts_user_exam_mock_key;
alter table public.descriptive_drafts add constraint descriptive_drafts_user_exam_mock_key unique (user_id, exam, mock_number);

-- 3. Richer evaluation output: letter score (SBI) and an improved rewrite of
--    the candidate's own essay so they can compare line by line.
alter table public.descriptive_evaluations
  add column if not exists letter_score numeric,
  add column if not exists letter_feedback text,
  add column if not exists improved_essay text,
  add column if not exists improved_letter text;
