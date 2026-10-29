-- Mains practice: a second set of subjects and topics next to the Prelims ones
-- (src/lib/syllabus.js, MAINS_SUBJECT_LIST). Everything uploaded before this
-- migration is Prelims, so existing rows are untouched. Mains questions go into
-- the same practice_questions table under the 'm_' topic keys below.

alter table public.practice_topics drop constraint if exists practice_topics_subject_check;
alter table public.practice_topics add constraint practice_topics_subject_check
  check (subject in (
    'quant', 'reasoning', 'english', 'ga', 'computer',
    'mains_quant', 'mains_reasoning', 'mains_english', 'mains_ga'
  ));

insert into public.practice_topics (key, subject, name) values
  ('m_di_table', 'mains_quant', 'Table DI'),
  ('m_di_graph', 'mains_quant', 'Bar & Line Graph DI'),
  ('m_di_pie', 'mains_quant', 'Pie & Radar Chart DI'),
  ('m_di_caselet', 'mains_quant', 'Caselet DI'),
  ('m_quant_ds', 'mains_quant', 'Data Sufficiency'),
  ('m_quantity_comparison', 'mains_quant', 'Quantity Comparison'),
  ('m_arithmetic', 'mains_quant', 'Arithmetic Word Problems'),
  ('m_number_series', 'mains_quant', 'Number Series'),
  ('m_seating', 'mains_reasoning', 'Seating Arrangement'),
  ('m_puzzles', 'mains_reasoning', 'Floor, Box & Scheduling Puzzles'),
  ('m_syllogism', 'mains_reasoning', 'Syllogism'),
  ('m_inequality', 'mains_reasoning', 'Inequality'),
  ('m_reasoning_ds', 'mains_reasoning', 'Data Sufficiency'),
  ('m_critical', 'mains_reasoning', 'Critical Reasoning'),
  ('m_input_output', 'mains_reasoning', 'Input–Output'),
  ('m_coding_decoding', 'mains_reasoning', 'Coding–Decoding'),
  ('m_computer', 'mains_reasoning', 'Computer Aptitude'),
  ('m_rc', 'mains_english', 'Reading Comprehension'),
  ('m_cloze', 'mains_english', 'Cloze Test'),
  ('m_para_jumbles', 'mains_english', 'Para Jumbles'),
  ('m_error_spotting', 'mains_english', 'Error Spotting'),
  ('m_fillers', 'mains_english', 'Fillers'),
  ('m_phrase_replacement', 'mains_english', 'Phrase Replacement'),
  ('m_banking', 'mains_ga', 'Banking Awareness'),
  ('m_financial', 'mains_ga', 'Financial Awareness'),
  ('m_economy', 'mains_ga', 'Economy & Budget'),
  ('m_current_affairs', 'mains_ga', 'Current Affairs'),
  ('m_schemes', 'mains_ga', 'Government Schemes & Policies')
on conflict (key) do update set subject = excluded.subject, name = excluded.name;
