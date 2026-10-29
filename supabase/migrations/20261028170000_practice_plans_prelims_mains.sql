-- Practice plans, second version: four plans split by what they cover.
--
--   prelims_quarter  Rs 199 / 3 months    every Prelims topic
--   both_quarter     Rs 399 / 3 months    Prelims + Mains topics, Mistake Notebook
--   prelims_year     Rs 699 / 12 months   the same as prelims_quarter, longer
--   both_year        Rs 1,199 / 12 months the same as both_quarter, longer
--
-- The old Timed (179) / Complete (299) / Yearly (1,099) plans go. The tier of
-- a plan or payment is now 'prelims' (Prelims topics) or 'full' (Prelims +
-- Mains + Mistake Notebook); 'timed' no longer exists. Nobody had paid for an
-- old plan when this was written; if a row still points at one, the old plan
-- is switched off instead of deleted so the payment record keeps its plan.

alter table public.practice_plans drop constraint if exists practice_plans_tier_check;
alter table public.practice_payments drop constraint if exists practice_payments_tier_check;

-- Old plans off the shelf, then gone where nothing points at them.
update public.practice_plans set active = false where key in ('timed', 'complete', 'yearly');
delete from public.practice_plans p
 where p.key in ('timed', 'complete', 'yearly')
   and not exists (select 1 from public.practice_payments y where y.plan = p.key);

-- Anything left over moves to the new tier names so the new check holds.
update public.practice_payments set tier = 'prelims' where tier = 'timed';
update public.practice_plans set tier = 'prelims' where tier = 'timed';

alter table public.practice_plans add constraint practice_plans_tier_check check (tier in ('prelims', 'full'));
alter table public.practice_payments add constraint practice_payments_tier_check check (tier in ('prelims', 'full'));

insert into public.practice_plans (key, label, tier, amount_inr, months, position) values
  ('prelims_quarter', 'Prelims', 'prelims', 199, 3, 1),
  ('both_quarter', 'Prelims + Mains', 'full', 399, 3, 2),
  ('prelims_year', 'Prelims', 'prelims', 699, 12, 3),
  ('both_year', 'Prelims + Mains', 'full', 1199, 12, 4)
on conflict (key) do update
  set label = excluded.label, tier = excluded.tier, amount_inr = excluded.amount_inr,
      months = excluded.months, position = excluded.position, active = true;
