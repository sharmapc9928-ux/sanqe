-- Coaching plans: a coaching pays Fedge to use the portal.
--
-- After applying (approved straight away) a coaching picks a plan — monthly
-- or yearly — and pays with Razorpay. Each payment adds the plan's days to
-- coachings.paid_until; when that date passes the portal asks for payment
-- again. The 35% commission on student sales is separate and stays.
--
-- Prices live in coaching_plans, never in the app: the coaching-plan-order
-- edge function reads the amount from here when it creates the Razorpay
-- order, and coaching-plan-verify / razorpay-webhook (service role) call
-- activate_coaching_payment() once Razorpay confirms the money.
--
-- Unpaid coachings can't build or change anything: the who-am-I helpers the
-- coaching policies use now also require paid_until in the future. Their
-- students keep access to what they already joined.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.coaching_plans (
  key text primary key check (key ~ '^[a-z_]{2,20}$'),
  label text not null,
  amount_inr integer not null check (amount_inr between 1 and 1000000),
  days integer not null check (days between 1 and 3660),
  position integer not null default 0,
  active boolean not null default true
);

insert into public.coaching_plans (key, label, amount_inr, days, position) values
  ('monthly', 'Monthly', 399, 30, 1),
  ('yearly', 'Yearly', 3999, 365, 2)
on conflict (key) do update
  set label = excluded.label, amount_inr = excluded.amount_inr, days = excluded.days, position = excluded.position;

alter table public.coachings add column if not exists paid_until timestamptz;

create table if not exists public.coaching_payments (
  id uuid primary key default gen_random_uuid(),
  coaching_id uuid not null references public.coachings(id) on delete cascade,
  plan text not null references public.coaching_plans(key),
  amount_inr integer not null,
  days integer not null,
  razorpay_order_id text not null unique,
  razorpay_payment_id text unique,
  status text not null default 'created' check (status in ('created', 'paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  period_start timestamptz,
  period_end timestamptz
);
create index if not exists coaching_payments_coaching_idx on public.coaching_payments (coaching_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Plans: anyone signed in can read the active ones. Payments: the owner and
-- admins read; only the edge functions (service role) write.
alter table public.coaching_plans enable row level security;
alter table public.coaching_payments enable row level security;
revoke insert, update, delete on public.coaching_plans from anon, authenticated;
revoke insert, update, delete on public.coaching_payments from anon, authenticated;

drop policy if exists "plans read" on public.coaching_plans;
create policy "plans read" on public.coaching_plans for select to authenticated using (active);

drop policy if exists "payments read" on public.coaching_payments;
create policy "payments read" on public.coaching_payments for select to authenticated using (
  (select public.is_admin())
  or coaching_id in (select c.id from public.coachings c where c.owner_id = (select auth.uid()))
);

-- ---------------------------------------------------------------------------
-- Who-am-I helpers: an approved coaching must also be paid up
-- ---------------------------------------------------------------------------
create or replace function public.my_coaching_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.coachings
   where owner_id = (select auth.uid()) and status = 'approved' and paid_until > now()
$$;

create or replace function public.my_owned_series()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.test_series s
    join public.coachings c on c.id = s.coaching_id
   where c.owner_id = (select auth.uid()) and c.status = 'approved' and c.paid_until > now()
$$;

create or replace function public.my_owned_mocks(p_draft_only boolean)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from public.coaching_mocks m
    join public.test_series s on s.id = m.series_id
    join public.coachings c on c.id = s.coaching_id
   where c.owner_id = (select auth.uid()) and c.status = 'approved' and c.paid_until > now()
     and (not p_draft_only or m.status = 'draft')
$$;

-- ---------------------------------------------------------------------------
-- Activation (service role only)
-- ---------------------------------------------------------------------------
-- Marks an order paid and extends the coaching's paid_until by the plan's
-- days, counting from today or from the current end date if it's later.
-- Safe to call twice for the same order (the verify call and the webhook
-- both do): the second call changes nothing. Returns the new paid_until.
create or replace function public.activate_coaching_payment(p_order_id text, p_payment_id text)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pay public.coaching_payments;
  v_start timestamptz;
  v_end timestamptz;
begin
  select * into v_pay from public.coaching_payments where razorpay_order_id = p_order_id for update;
  if not found then
    raise exception 'Unknown order %', p_order_id using errcode = 'P0002';
  end if;
  if v_pay.status = 'paid' then
    return (select paid_until from public.coachings where id = v_pay.coaching_id);
  end if;

  select greatest(now(), coalesce(paid_until, now())) into v_start
    from public.coachings where id = v_pay.coaching_id for update;
  v_end := v_start + make_interval(days => v_pay.days);

  update public.coaching_payments
     set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now(), period_start = v_start, period_end = v_end
   where id = v_pay.id;
  update public.coachings set paid_until = v_end where id = v_pay.coaching_id;
  return v_end;
end;
$$;

revoke all on function public.activate_coaching_payment(text, text) from public, anon, authenticated;
grant execute on function public.activate_coaching_payment(text, text) to service_role;
