-- Practice plans: students pay for the Practice section.
--
-- Practice is open to look at for everyone. Average and the speed maths drills
-- stay free; every other topic needs a plan:
--   timed    Rs 179 / 3 months  every topic, 15 and 30 min timed sessions, no explanations
--   complete Rs 299 / 3 months  every topic, every mode, explanations, mistake notebook, focus timer
--   yearly   Rs 1,099 / 12 months  the same as complete, for a year
-- (A student who joined a coaching course already has everything; the app
-- treats that as a complete plan, it is not stored here.)
--
-- Prices live in practice_plans, never in the app: the practice-order edge
-- function reads the amount from here when it creates the Razorpay order, and
-- practice-verify / razorpay-webhook (service role) call
-- activate_practice_payment() once Razorpay confirms the money.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.practice_plans (
  key text primary key check (key ~ '^[a-z_]{2,20}$'),
  label text not null,
  tier text not null check (tier in ('timed', 'full')),
  amount_inr integer not null check (amount_inr between 1 and 1000000),
  months integer not null check (months between 1 and 36),
  position integer not null default 0,
  active boolean not null default true
);

insert into public.practice_plans (key, label, tier, amount_inr, months, position) values
  ('timed', 'Timed', 'timed', 179, 3, 1),
  ('complete', 'Complete', 'full', 299, 3, 2),
  ('yearly', 'Yearly', 'full', 1099, 12, 3)
on conflict (key) do update
  set label = excluded.label, tier = excluded.tier, amount_inr = excluded.amount_inr,
      months = excluded.months, position = excluded.position;

-- One row per order. A paid row is a pass that runs from period_start to
-- period_end. user_id is set null on delete so the payment record outlives
-- the account.
create table if not exists public.practice_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  plan text not null references public.practice_plans(key),
  tier text not null check (tier in ('timed', 'full')),
  amount_inr integer not null check (amount_inr > 0),
  months integer not null,
  razorpay_order_id text not null unique,
  razorpay_payment_id text unique,
  status text not null default 'created' check (status in ('created', 'paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  period_start timestamptz,
  period_end timestamptz
);
create index if not exists practice_payments_user_idx on public.practice_payments (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Plans (prices) are public, so the plans page works logged out. A student
-- reads their own payments, admins everything. Only the edge functions
-- (service role) write.
alter table public.practice_plans enable row level security;
alter table public.practice_payments enable row level security;
revoke insert, update, delete on public.practice_plans from anon, authenticated;
revoke all on public.practice_payments from anon;
revoke insert, update, delete on public.practice_payments from authenticated;

drop policy if exists "practice plans read" on public.practice_plans;
create policy "practice plans read" on public.practice_plans for select to anon, authenticated using (active);

drop policy if exists "practice payments read" on public.practice_payments;
create policy "practice payments read" on public.practice_payments for select to authenticated using (
  (select public.is_admin()) or user_id = (select auth.uid())
);

-- ---------------------------------------------------------------------------
-- The caller's pass
-- ---------------------------------------------------------------------------
-- { "tier": "full" | "timed" | null, "until": <end of that pass> | null }.
-- A full pass wins over a timed one when the student holds both.
create or replace function public.my_practice_pass()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('tier', p.tier, 'until', max(p.period_end))
       from public.practice_payments p
      where p.user_id = (select auth.uid()) and p.status = 'paid' and p.period_end > now()
      group by p.tier
      order by (p.tier = 'full') desc
      limit 1),
    jsonb_build_object('tier', null, 'until', null)
  )
$$;
revoke all on function public.my_practice_pass() from public, anon;
grant execute on function public.my_practice_pass() to authenticated;

-- ---------------------------------------------------------------------------
-- Activation (service role only)
-- ---------------------------------------------------------------------------
-- Marks an order paid and starts the pass. A pass of the same tier the
-- student already holds starts when that one ends; a different tier starts
-- now (so buying Complete while on Timed upgrades straight away). Safe to
-- call twice for the same order (the verify call and the webhook both do):
-- the second call changes nothing. Returns { tier, until }.
create or replace function public.activate_practice_payment(p_order_id text, p_payment_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pay public.practice_payments;
  v_start timestamptz;
  v_end timestamptz;
begin
  select * into v_pay from public.practice_payments where razorpay_order_id = p_order_id for update;
  if not found then
    raise exception 'Unknown order %', p_order_id using errcode = 'P0002';
  end if;
  if v_pay.status = 'paid' then
    return jsonb_build_object('tier', v_pay.tier, 'until', v_pay.period_end);
  end if;

  v_start := now();
  if v_pay.user_id is not null then
    -- Two orders of one student finishing together must not start at the same time.
    perform pg_advisory_xact_lock(hashtextextended(v_pay.user_id::text, 0));
    select greatest(now(), coalesce(max(period_end), now())) into v_start
      from public.practice_payments
     where user_id = v_pay.user_id and tier = v_pay.tier and status = 'paid';
  end if;
  v_end := v_start + make_interval(months => v_pay.months);

  update public.practice_payments
     set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now(), period_start = v_start, period_end = v_end
   where id = v_pay.id;
  return jsonb_build_object('tier', v_pay.tier, 'until', v_end);
end;
$$;

revoke all on function public.activate_practice_payment(text, text) from public, anon, authenticated;
grant execute on function public.activate_practice_payment(text, text) to service_role;
