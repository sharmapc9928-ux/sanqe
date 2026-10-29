-- GA is hidden from Sanqe for now, so the Pro plan's sectional pack no longer
-- lists General Awareness. Keep in step with the Pro card in
-- sanqe-app/src/screens/ForCoaching.jsx. Put GA back in both when it returns.
update public.coaching_plans
   set features = '{"Class tests you upload: 1 a week","8 Prelims full mocks by Fedge","4 Mains full mocks by Fedge","5 sectional mocks for each subject: English, Quant, Reasoning, Computer"}'
 where key = 'pro';
