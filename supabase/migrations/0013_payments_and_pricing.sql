-- =============================================================================
-- Shree Classified — Phase 9: taking the money
--
-- Phase 6 built the record a payment provider would settle against, and said
-- what it was waiting for: "the shape of that record decides whether the
-- integration can be got wrong later". This migration connects a provider to
-- it. The provider is Razorpay; nothing in this file names it, because the
-- columns are `provider`, `provider_order_id` and `provider_payment_id` and a
-- second provider must not need a migration.
--
-- Four things are added, and each of them exists because of a specific way
-- payment integrations go wrong:
--
--  1. A PURPOSE. A payment is for a new advertisement or for a renewal, and a
--     renewal's package is chosen at renewal time, not at submission. Pricing
--     a renewal from the advertisement's original package would charge last
--     season's rate.
--
--  2. A SNAPSHOT. `amount_paise` already recorded what was charged. The
--     package's name and run length are copied alongside it, so that an
--     office that re-prices "Standard" next year does not rewrite what a
--     receipt from this year says it bought.
--
--  3. A TRANSITION TABLE, in the same spirit as `is_permitted_ad_transition()`.
--     `paid -> failed` is absent. That single absence is what makes a repeated
--     callback, a duplicated webhook, a second tab and a refresh after payment
--     all harmless: once a payment is paid, nothing but a refund moves it, so
--     the question "did this arrive twice?" stops being a question anybody has
--     to answer in application code.
--
--  4. A REFUSAL TO APPROVE AN UNPAID RENEWAL. Extending a run is the thing of
--     value; if only the interface checked that it had been paid for, then the
--     day somebody adds a second way to approve a renewal, the check is not
--     there.
--
-- What is deliberately NOT here: prices. Every package still carries a NULL
-- `price_paise`, for the reason `src/config/packages.ts` gives at length — the
-- office quotes its rates and has not given them to me. An unpriced package
-- costs nothing and skips the checkout entirely, so the site keeps working
-- exactly as it does today until real rates are entered. Development rates
-- for trying the integration out live in `supabase/seed/dev_package_prices.sql`,
-- which is not a migration and is never applied to production.
-- =============================================================================

-- ------------------------------------------------- what a payment is for ----
do $$ begin
  create type public.payment_purpose as enum ('new_advertisement', 'renewal');
exception when duplicate_object then null; end $$;

comment on type public.payment_purpose is
  'Why an advertiser is being charged. A renewal is priced from the renewal''s own package, not the advertisement''s.';

-- ------------------------------------------------------ payment columns ----
alter table public.payments
  add column if not exists purpose public.payment_purpose not null default 'new_advertisement',
  add column if not exists renewal_id uuid references public.ad_renewals (id) on delete restrict,
  -- The provider's proof that the callback came from them. Kept because it is
  -- the evidence the payment was verified, not because it is re-checked later.
  add column if not exists provider_signature text,
  -- The snapshot. See (2) above.
  add column if not exists package_name text,
  add column if not exists package_duration_days integer
    check (package_duration_days is null or package_duration_days between 1 and 365);

comment on column public.payments.renewal_id is
  'The renewal this payment is for. Required when purpose is renewal, and the reason a renewal cannot be approved unpaid.';
comment on column public.payments.package_name is
  'The package''s name as it stood when this was paid. Re-pricing a package must not rewrite an old receipt.';

do $$ begin
  alter table public.payments
    add constraint payments_renewal_has_id
    check (purpose <> 'renewal' or renewal_id is not null);
exception when duplicate_object then null; end $$;

-- A settled payment made through a provider names the provider's payment. A
-- payment settled at the counter by staff has no provider and needs none.
do $$ begin
  alter table public.payments
    add constraint payments_paid_names_provider_payment
    check (status <> 'paid' or provider is null or provider_payment_id is not null);
exception when duplicate_object then null; end $$;

-- The provider's payment id is the natural key of a settlement. Unique, so a
-- webhook and a browser callback racing each other cannot both insert.
create unique index if not exists payments_provider_payment_idx
  on public.payments (provider, provider_payment_id)
  where provider_payment_id is not null;

/*
 * At most one payment attempt open per thing being paid for.
 *
 * "Try again" after a failure, and a second tab, must not leave two live
 * orders against one advertisement — the office would see two, and a late
 * webhook for the abandoned one would settle something nobody is waiting on.
 * `failed` and `cancelled` are absent from the predicate on purpose: those are
 * finished attempts, and a retry is a new row.
 *
 * `renewal_id` is in the key, and NULLS NOT DISTINCT is what makes that work.
 * A new advertisement's payments carry no renewal, so without it two open
 * rows would be permitted (NULLs being distinct by default) and the guarantee
 * above would quietly not hold. With it, a new advertisement gets one open
 * attempt, and each renewal gets its own — which matters, because an
 * advertisement can be renewed more than once and an attempt abandoned on the
 * first renewal must not be picked up and settled against the second.
 */
drop index if exists public.payments_one_open_attempt_idx;
create unique index if not exists payments_one_open_attempt_idx
  on public.payments (ad_id, purpose, renewal_id) nulls not distinct
  where status in ('created', 'pending');

create index if not exists payments_renewal_idx
  on public.payments (renewal_id) where renewal_id is not null;
create index if not exists payments_status_idx
  on public.payments (status, created_at desc);

-- ------------------------------------------------------ pricing a payment --
/*
 * What this payment is for, and what that costs — both read from the database,
 * neither accepted from the caller.
 *
 * This replaces the Phase 6 version, which priced every payment from the
 * advertisement's stamped package. That was right while the only thing being
 * paid for was a new advertisement. A renewal names its own package, and the
 * price comes from the `packages` table at the moment the order is raised,
 * which is the moment of sale.
 */
create or replace function public.stamp_payment_amount()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ad_owner uuid;
  chosen   text;
  pkg      public.packages%rowtype;
begin
  select a.user_id into ad_owner from public.ads a where a.id = new.ad_id;
  if not found then
    raise exception 'Unknown advertisement %', new.ad_id using errcode = 'foreign_key_violation';
  end if;

  if new.purpose = 'renewal' then
    select r.package_id into chosen
      from public.ad_renewals r
     where r.id = new.renewal_id and r.ad_id = new.ad_id and r.user_id = ad_owner;
    if not found then
      raise exception 'That renewal does not belong to this advertisement'
        using errcode = 'foreign_key_violation';
    end if;
  else
    select a.package_id into chosen from public.ads a where a.id = new.ad_id;
  end if;

  if chosen is null then
    raise exception 'That advertisement carries no package to pay for'
      using errcode = 'check_violation';
  end if;

  select * into pkg from public.packages p where p.id = chosen and p.is_active;
  if not found then
    raise exception 'That package is not available' using errcode = 'check_violation';
  end if;

  new.user_id               := ad_owner;
  new.package_id            := chosen;
  -- NULL price means the office has not quoted a rate. Zero is the honest
  -- reading: an order with nothing to collect, which the site never sends to
  -- a checkout at all.
  new.amount_paise          := coalesce(pkg.price_paise, 0);
  new.package_name          := pkg.name;
  new.package_duration_days := public.package_duration_days(chosen);
  return new;
end;
$$;

-- ------------------------------------------------- the transition table ----
/*
 * Which states a payment may move between, written down once.
 *
 * The absences are the content:
 *
 *   paid -> failed        a late `payment.failed` webhook for an attempt that
 *                         was captured must not un-pay it
 *   paid -> cancelled     nor may the advertiser closing a stale checkout tab
 *   refunded -> anything  a refund is the end of the story
 *   * -> created          `created` is where a payment starts, not somewhere
 *                         it returns to
 *
 * `cancelled -> paid` and `failed -> paid` ARE permitted, because Razorpay may
 * capture a payment after the browser gave up on it, and the money having
 * arrived is the fact that matters.
 */
create or replace function public.is_permitted_payment_transition(
  p_from public.payment_status,
  p_to   public.payment_status
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select (p_from, p_to) in (
    ('created',   'pending'),
    ('created',   'paid'),
    ('created',   'failed'),
    ('created',   'cancelled'),
    ('pending',   'paid'),
    ('pending',   'failed'),
    ('pending',   'cancelled'),
    ('cancelled', 'pending'),
    ('cancelled', 'paid'),
    ('failed',    'pending'),
    ('failed',    'paid'),
    ('paid',      'refunded')
  );
$$;

comment on function public.is_permitted_payment_transition(public.payment_status, public.payment_status) is
  'The payment state machine. `paid` is terminal but for a refund, which is what makes a repeated callback harmless.';

/*
 * Enforced for everybody, staff and the service role included.
 *
 * The same argument as the moderation guard: a rule that the trusted
 * connection may step around is a rule that holds until the first webhook
 * handler with a bug in it.
 */
create or replace function public.guard_payment_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if not public.is_permitted_payment_transition(old.status, new.status) then
    raise exception 'A payment cannot go from % to %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Ordered before the settlement guard by name, so a refused transition is
-- reported as such rather than as a privilege error.
drop trigger if exists payments_guard_transition on public.payments;
create trigger payments_guard_transition
  before update on public.payments
  for each row execute function public.guard_payment_transition();

-- ------------------------------------------------------- settling, once ----
/*
 * Settlement, as one idempotent call.
 *
 * Everything that decides whether a payment is paid happens here, in one
 * transaction, under one row lock. The signature has already been checked by
 * the caller — that is the one thing this cannot do, since the secret is the
 * application's — but everything the database can check, it checks: that the
 * order exists, that the amount the provider settled matches the amount we
 * raised, and that the payment is not already paid.
 *
 * Returning the row's status rather than raising on an already-paid payment is
 * what makes the refresh, the second tab and the duplicated webhook all land
 * in the same place: "this one is paid", said calmly, to whoever asked.
 */
create or replace function public.settle_payment(
  p_provider          text,
  p_provider_order_id text,
  p_payment_id        text,
  p_signature         text,
  p_amount_paise      integer default null
)
returns public.payment_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pay public.payments%rowtype;
begin
  if not public.is_trusted_connection() then
    raise exception 'Only Shree Classified can settle a payment'
      using errcode = 'insufficient_privilege';
  end if;

  select * into pay from public.payments
   where provider = p_provider and provider_order_id = p_provider_order_id
   for update;
  if not found then
    raise exception 'No payment is waiting on that order' using errcode = 'no_data_found';
  end if;

  if pay.status = 'paid' then
    -- Already settled. If it was settled by a different provider payment, say
    -- so: two captures against one order is the office's problem, not a
    -- silently discarded fact.
    if pay.provider_payment_id is distinct from p_payment_id then
      raise exception 'That order was already settled by payment %', pay.provider_payment_id
        using errcode = 'unique_violation';
    end if;
    return pay.status;
  end if;

  if pay.status = 'refunded' then
    raise exception 'That payment has been refunded' using errcode = 'check_violation';
  end if;

  -- What the provider says was collected must be what we asked for. A
  -- mismatch means the order was not the one we raised.
  if p_amount_paise is not null and p_amount_paise is distinct from pay.amount_paise then
    raise exception 'That payment settled % paise against an order for %',
      p_amount_paise, pay.amount_paise using errcode = 'check_violation';
  end if;

  update public.payments
     set status              = 'paid',
         provider_payment_id = p_payment_id,
         provider_signature  = p_signature,
         paid_at             = now(),
         failure_reason      = null
   where id = pay.id;

  return 'paid';
end;
$$;

comment on function public.settle_payment(text, text, text, text, integer) is
  'Marks a verified payment paid, once. Returns the resulting status; settling an already-settled payment is not an error.';

/*
 * The other two endings. Both are no-ops against a payment that is already
 * paid, for the same reason: money that arrived is not undone by a late
 * message saying it did not.
 */
create or replace function public.close_payment(
  p_provider          text,
  p_provider_order_id text,
  p_status            public.payment_status,
  p_reason            text default null
)
returns public.payment_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pay    public.payments%rowtype;
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_trusted_connection() then
    raise exception 'Only Shree Classified can close a payment'
      using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('failed', 'cancelled') then
    raise exception 'A payment is closed as failed or cancelled, not %', p_status
      using errcode = 'check_violation';
  end if;

  select * into pay from public.payments
   where provider = p_provider and provider_order_id = p_provider_order_id
   for update;
  if not found then
    raise exception 'No payment is waiting on that order' using errcode = 'no_data_found';
  end if;

  -- Terminal states stand.
  if pay.status in ('paid', 'refunded') then
    return pay.status;
  end if;
  if pay.status = p_status then
    return pay.status;
  end if;

  update public.payments
     set status         = p_status,
         failure_reason = case
           when p_status = 'failed' then coalesce(reason, 'The payment did not complete.')
           else reason
         end
   where id = pay.id;

  return p_status;
end;
$$;

comment on function public.close_payment(text, text, public.payment_status, text) is
  'Records a failed or cancelled attempt. A paid payment is left alone, whatever arrives afterwards.';

-- ---------------------------------------------------- webhook idempotency --
/*
 * Every webhook Razorpay has delivered, by their event id.
 *
 * Razorpay retries a webhook it did not get a 2xx for, and a retry after a
 * timeout is indistinguishable from a first delivery. The primary key is the
 * whole mechanism: a second delivery of the same event conflicts, does
 * nothing, and is answered 200 so the retries stop.
 *
 * No payload is stored. A Razorpay payment entity carries the payer's email,
 * telephone number and card metadata, and none of that is ours to keep in a
 * table the office can read.
 */
create table if not exists public.payment_webhook_events (
  event_id            text primary key,
  event               text not null,
  provider            text not null default 'razorpay',
  provider_order_id   text,
  provider_payment_id text,
  payment_id          uuid references public.payments (id) on delete set null,
  outcome             text,
  received_at         timestamptz not null default now()
);

comment on table public.payment_webhook_events is
  'One row per webhook delivery, keyed by the provider''s event id. Existence is the duplicate check; no payload is kept.';

create index if not exists payment_webhook_events_order_idx
  on public.payment_webhook_events (provider, provider_order_id, received_at desc);

-- ------------------------------------- a renewal is approved once it is paid
/*
 * A renewal whose package costs something may not be approved until that
 * payment is settled.
 *
 * As a trigger rather than a line in `approve_renewal()`, because extending a
 * run is the thing of value and there is more than one way to reach it: the
 * moderation call, a future bulk action, an administrator's own hand on the
 * table. This holds for all of them.
 *
 * An unpriced package — every package, until the office supplies rates — costs
 * nothing, so nothing is required and the renewal flow behaves exactly as it
 * did in Phase 8.
 */
create or replace function public.guard_renewal_payment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  price integer;
begin
  if new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;

  select p.price_paise into price from public.packages p where p.id = new.package_id;
  if coalesce(price, 0) <= 0 then
    return new;
  end if;

  if not exists (
    select 1 from public.payments
     where renewal_id = new.id and purpose = 'renewal' and status = 'paid'
  ) then
    raise exception 'This renewal has not been paid for'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists ad_renewals_guard_payment on public.ad_renewals;
create trigger ad_renewals_guard_payment
  before update on public.ad_renewals
  for each row execute function public.guard_renewal_payment();

-- ==========================================================================
-- What each side reads
-- ==========================================================================
/*
 * The advertiser's receipts, and the office's ledger — the same separation the
 * advertisement views make. `my_payments` filters on `auth.uid()` inside the
 * database, so no page has an ownership check to forget; `admin_payments`
 * returns nothing at all unless the caller is staff.
 *
 * Neither view carries `provider_signature`. It is the evidence a settlement
 * was verified, it is derived from the account's secret, and nobody reading a
 * receipt needs it.
 */
create or replace view public.my_payments
with (security_invoker = true)
as
select
  p.id,
  p.ad_id,
  p.renewal_id,
  p.purpose,
  p.status,
  p.amount_paise,
  p.currency,
  p.package_id,
  p.package_name,
  p.package_duration_days,
  p.provider,
  p.provider_payment_id,
  p.failure_reason,
  p.paid_at,
  p.created_at,
  a.reference   as ad_reference,
  a.title       as ad_title,
  a.slug        as ad_slug,
  a.status      as ad_status
from public.payments p
join public.ads a on a.id = p.ad_id
where p.user_id = auth.uid();

comment on view public.my_payments is
  'An advertiser''s own payments, with the advertisement each one bought. Ownership is the WHERE clause.';

create or replace view public.admin_payments
with (security_invoker = true)
as
select
  p.id,
  p.ad_id,
  p.renewal_id,
  p.user_id,
  p.purpose,
  p.status,
  p.amount_paise,
  p.currency,
  p.package_id,
  p.package_name,
  p.package_duration_days,
  p.provider,
  p.provider_order_id,
  p.provider_payment_id,
  p.failure_reason,
  p.paid_at,
  p.created_at,
  p.updated_at,
  a.reference as ad_reference,
  a.title     as ad_title,
  a.slug      as ad_slug,
  a.status    as ad_status,
  a.kind      as ad_kind,
  pr.email    as user_email,
  pr.full_name as user_name
from public.payments p
join public.ads a on a.id = p.ad_id
left join public.profiles pr on pr.id = p.user_id
where public.is_staff();

comment on view public.admin_payments is
  'The office''s ledger. Returns nothing unless is_staff(); the signature is not in it.';

-- ==========================================================================
-- Row level security and grants
-- ==========================================================================
alter table public.payment_webhook_events enable row level security;
-- No policies, and no grants below: the webhook log is reachable only by the
-- service role, which is what writes it.

revoke all on table public.payment_webhook_events from anon, authenticated;

grant select on public.my_payments    to authenticated;
grant select on public.admin_payments to authenticated;

/*
 * Settlement is not something a signed-in caller may attempt.
 *
 * Both functions already refuse anyone who is not a trusted connection, and
 * that refusal is the guarantee. Revoking EXECUTE as well means a signed-in
 * caller cannot so much as reach the check — two independent answers to the
 * same question, in the spirit of the three that guard the admin area.
 */
revoke all on function public.settle_payment(text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.close_payment(text, text, public.payment_status, text) from public, anon, authenticated;

-- The webhook and the verification endpoint reach the database as
-- `service_role`, which is the trusted connection the two functions above test
-- for. It is the only role that may call them.
grant execute on function public.settle_payment(text, text, text, text, integer) to service_role;
grant execute on function public.close_payment(text, text, public.payment_status, text) to service_role;

grant select, insert, update on public.payment_webhook_events to service_role;
