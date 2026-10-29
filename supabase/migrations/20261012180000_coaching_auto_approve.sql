-- Coachings are approved as soon as they apply.
--
-- No more waiting for an admin: a new coaching's portal opens straight
-- away. Admins can still pause one from Admin > Coachings (status
-- 'suspended'), which hides its mocks from students as before. Owners still
-- can't set the status themselves (it isn't in their insert/update grants),
-- so it always comes from the column default.

alter table public.coachings alter column status set default 'approved';

drop policy if exists "coaching apply" on public.coachings;
create policy "coaching apply" on public.coachings for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'approved');

-- Applications that were waiting go live too.
update public.coachings set status = 'approved', reviewed_at = now() where status = 'pending';
