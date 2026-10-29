-- Mains Reasoning: Blood Relations (family-tree puzzles and coded relations),
-- next to the Prelims 'blood_relations' topic. See src/lib/syllabus.js.

insert into public.practice_topics (key, subject, name) values
  ('m_blood_relations', 'mains_reasoning', 'Blood Relations')
on conflict (key) do update set subject = excluded.subject, name = excluded.name;
