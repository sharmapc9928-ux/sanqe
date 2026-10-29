-- Student purchases of a coaching's test series (Razorpay).
--
-- All the money lands in Fedge's own Razorpay account. Each paid order records
-- how it splits: Fedge keeps coachings.commission_pct (35% by default) and the
-- rest is owed to the coaching, which Fedge pays out by hand. payout_status
-- tracks that: 'pending' until the transfer is made, then mark it 'paid'
-- (see coaching_payout_due for what is owed right now).
--
-- The price is read from test_series by the series-order edge function, never
-- from the app. series-verify and razorpay-webhook (service role) call
-- activate_series_payment() once Razorpay confirms the money; it enrols the
-- student with source 'purchase'.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
-- The ids are set null on delete so a payment record outlives the series,
-- coaching or account it was for; series_title keeps it readable.
create table if not exists public.series_payments (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references public.test_series(id) on delete set null,
  series_title text not null,
  coaching_id uuid references public.coachings(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  amount_inr integer not null check (amount_inr > 0),
  commission_pct numeric(5,2) not null check (commission_pct between 0 and 100),
  fedge_share_inr integer not null check (fedge_share_inr >= 0),
  coaching_share_inr integer not null check (coaching_share_inr >= 0),
  razorpay_order_id text not null unique,
  razorpay_payment_id text unique,
  status text not null default 'created' check (status in ('created', 'paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  payout_status text not null default 'pending' check (payout_status in ('pending', 'paid')),
  payout_at timestamptz,
  payout_ref text,
  check (fedge_share_inr + coaching_share_inr = amount_inr)
);
create index if not exists series_payments_coaching_idx on public.series_payments (coaching_id, created_at desc);
create index if not exists series_payments_user_idx on public.series_payments (user_id, created_at desc);
create index if not exists series_payments_series_idx on public.series_payments (series_id);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- A student reads their own payments, a coaching owner the sales of their own
-- coaching, admins everything. Only the edge functions (service role) write;
-- payouts are marked from the SQL editor.
alter table public.series_payments enable row level security;
revoke all on public.series_payments from anon;
revoke insert, update, delete on public.series_payments from authenticated;

drop policy if exists "series payments read" on public.series_payments;
create policy "series payments read" on public.series_payments for select to authenticated using (
  (select public.is_admin())
  or user_id = (select auth.uid())
  or coaching_id in (select c.id from public.coachings c where c.owner_id = (select auth.uid()))
);

-- What Fedge owes each coaching right now (paid orders not yet paid out).
-- Runs with the caller's rights, so an owner sees only their own row.
create or replace view public.coaching_payout_due
with (security_invoker = true) as
select p.coaching_id,
       c.name as coaching_name,
       count(*) as sales,
       sum(p.amount_inr) as gross_inr,
       sum(p.fedge_share_inr) as fedge_inr,
       sum(p.coaching_share_inr) as owed_inr
  from public.series_payments p
  left join public.coachings c on c.id = p.coaching_id
 where p.status = 'paid' and p.payout_status = 'pending'
 group by p.coaching_id, c.name;
revoke all on public.coaching_payout_due from anon;

-- ---------------------------------------------------------------------------
-- Activation (service role only)
-- ---------------------------------------------------------------------------
-- Marks an order paid and enrols the student in the series. Safe to call
-- twice for the same order (the verify call and the webhook both do): the
-- second call changes nothing. Returns the series id, or null if the series
-- or the student's account has been deleted since the order was made.
create or replace function public.activate_series_payment(p_order_id text, p_payment_id text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pay public.series_payments;
begin
  select * into v_pay from public.series_payments where razorpay_order_id = p_order_id for update;
  if not found then
    raise exception 'Unknown order %', p_order_id using errcode = 'P0002';
  end if;
  if v_pay.status = 'paid' then
    return v_pay.series_id;
  end if;

  update public.series_payments
     set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now()
   where id = v_pay.id;

  if v_pay.series_id is not null and v_pay.user_id is not null then
    insert into public.series_enrollments (series_id, user_id, source)
    values (v_pay.series_id, v_pay.user_id, 'purchase')
    on conflict (series_id, user_id) do nothing;
  end if;
  return v_pay.series_id;
end;
$$;

revoke all on function public.activate_series_payment(text, text) from public, anon, authenticated;
grant execute on function public.activate_series_payment(text, text) to service_role;
