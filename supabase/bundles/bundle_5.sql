-- ============================================================
-- Bundle 5 of 5 — pricing, notifications, analytics, rate limiting
--
-- Paste this WHOLE file into the Supabase SQL editor and press Run.
-- Run the bundles in order. Wait for each to finish before the next.
-- Built from: 0013_payments_and_pricing.sql 0014_notifications.sql 0015_analytics.sql 0016_rate_limits.sql
-- Generated from supabase/migrations/ — do not edit by hand.
-- ============================================================

-- ----- begin 0013_payments_and_pricing.sql -----
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
    -- Said separately from the lookup below, which would otherwise report a
    -- missing renewal as somebody else's renewal. `payments_renewal_has_id`
    -- enforces the same thing, but a BEFORE trigger runs first and would get
    -- there with the wrong message.
    if new.renewal_id is null then
      raise exception 'A renewal payment must name the renewal it is for'
        using errcode = 'check_violation';
    end if;

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

-- ----- end 0013_payments_and_pricing.sql -----

-- ----- begin 0014_notifications.sql -----
-- =============================================================================
-- Shree Classified — Phase 10: telling people what happened
--
-- Three tables and one rule: the notification is written in the same
-- transaction as the thing it describes, and the DELIVERY of it is not.
--
-- That split is the whole design. An advertiser's advertisement is approved by
-- `moderate_advertisement()`, inside one transaction, and the row that says so
-- is written by a trigger on the same statement — so there is no approval that
-- failed to produce a notification, whichever of the several paths to approval
-- was taken. But the email about it is a row in `notification_deliveries` with
-- `status = 'queued'`, drained afterwards by a worker. A provider that is down,
-- slow, or misconfigured therefore cannot roll back an approval, fail a
-- payment, or abort the expiry sweep. The outbox is the seam.
--
-- What is NOT here: any provider, any API key, any HTML. The database knows
-- that an email is owed to a user about an advertisement; it does not know
-- what Resend is. That lives in `src/lib/notifications/`.
--
-- On idempotency, which is the other thing that goes wrong with notifications:
-- every notification carries a `dedupe_key`, unique per user and type. The
-- expiry reminder keys on the advertisement's expiry date, so the daily sweep
-- can run every day for a week and send one reminder — and a renewal that
-- moves the date earns a new one, which is correct rather than a bug.
-- =============================================================================

-- ------------------------------------------------------- the vocabulary ----
/*
 * A controlled list, as an enum, so that a notification type is checked by
 * the database rather than by whoever last copied a string. Adding one is a
 * migration, which is the right amount of friction: every type needs a
 * template and a preference group to go with it.
 */
do $$ begin
  create type public.notification_type as enum (
    'advertisement_submitted',
    'advertisement_approved',
    'advertisement_rejected',
    'advertisement_changes_requested',
    'advertisement_expiring',
    'advertisement_expired',
    'renewal_submitted',
    'renewal_approved',
    'renewal_rejected',
    'payment_successful',
    'payment_failed',
    'payment_cancelled',
    -- Staff only, from here down.
    'staff_advertisement_submitted',
    'staff_renewal_submitted',
    'staff_payment_received',
    'staff_report_received'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_channel as enum ('in_app', 'email', 'whatsapp');
exception when duplicate_object then null; end $$;

/*
 * `skipped` is a real outcome and not a failure: it is what a delivery gets
 * when the recipient has no email address, or has turned that channel off
 * between the notification being raised and the queue being drained. Recording
 * it as `failed` would have somebody investigating a provider that was never
 * asked to do anything.
 */
do $$ begin
  create type public.notification_delivery_status as enum (
    'queued', 'sent', 'failed', 'skipped'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------- what people are told --
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        public.notification_type not null,
  title       text not null check (char_length(btrim(title)) between 3 and 120),
  body        text not null check (char_length(btrim(body)) between 3 and 500),
  -- What it is about, so a notification can be found again from the thing.
  entity_type text check (entity_type is null or entity_type in ('advertisement', 'payment', 'renewal', 'report')),
  entity_id   uuid,
  /*
   * Where it points. Stored rather than derived, because the page an
   * advertiser should land on depends on what happened, and a reader of this
   * table should not have to re-derive that. Constrained to a path on this
   * site: a notification is never a way to send somebody somewhere else.
   */
  href        text check (href is null or href ~ '^/[A-Za-z0-9/_-]*$'),
  is_read     boolean not null default false,
  read_at     timestamptz,
  /*
   * What makes this notification the same as one already sent. See the note
   * at the top: the expiry reminder keys on the expiry date, so a sweep that
   * runs daily sends one reminder, and a renewal that moves the date earns a
   * new one.
   */
  dedupe_key  text not null,
  created_at  timestamptz not null default now(),
  constraint notifications_read_together check ((is_read = false) = (read_at is null))
);

comment on table public.notifications is
  'One row per thing an advertiser or staff member is told. Written in the same transaction as the event; delivery is separate.';

create unique index if not exists notifications_dedupe_idx
  on public.notifications (user_id, type, dedupe_key);

create index if not exists notifications_inbox_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id) where not is_read;

-- ------------------------------------------------------------ the outbox ----
/*
 * One row per notification per channel that is not `in_app`.
 *
 * `in_app` needs no row: the notification IS the in-app delivery, and a queue
 * entry for it would be a job that copies a row to itself.
 */
create table if not exists public.notification_deliveries (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  channel         public.notification_channel not null check (channel <> 'in_app'),
  status          public.notification_delivery_status not null default 'queued',
  attempts        integer not null default 0 check (attempts >= 0),
  -- Set forward by the worker on a retry, so backoff is a query rather than a
  -- sleep held open in a request.
  scheduled_at    timestamptz not null default now(),
  sent_at         timestamptz,
  failed_at       timestamptz,
  -- The provider's complaint, for the office. Never a credential: the worker
  -- passes a short reason, not a raw response.
  error           text check (error is null or char_length(error) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint notification_deliveries_one_per_channel unique (notification_id, channel)
);

comment on table public.notification_deliveries is
  'The outbox. A provider being down delays a row here; it never rolls back the approval, payment or sweep that raised it.';

create index if not exists notification_deliveries_due_idx
  on public.notification_deliveries (scheduled_at)
  where status = 'queued';

drop trigger if exists notification_deliveries_set_updated_at on public.notification_deliveries;
create trigger notification_deliveries_set_updated_at
  before update on public.notification_deliveries
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------- what people want --
/*
 * Preferences, by group rather than by type.
 *
 * Sixteen switches would be a settings page nobody finishes reading. Three
 * groups — what happened to my advertisement, what happened to my money, and
 * remind me before it ends — is what somebody actually has an opinion about.
 *
 * `in_app` has no switch. It is the record of what the office did to your
 * advertisement, it costs nothing to receive, and a customer who has turned
 * off every channel must still be able to find out why their advertisement
 * was refused.
 */
create table if not exists public.notification_preferences (
  user_id                     uuid primary key references public.profiles (id) on delete cascade,
  email_advertisement_updates boolean not null default true,
  email_payment_updates       boolean not null default true,
  email_expiry_reminders      boolean not null default true,
  whatsapp_advertisement_updates boolean not null default false,
  whatsapp_payment_updates       boolean not null default false,
  whatsapp_expiry_reminders      boolean not null default false,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

comment on table public.notification_preferences is
  'Per-advertiser channel choices. WhatsApp defaults to off: a message to somebody''s telephone is not something to opt them into.';

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

/** Which preference group a type belongs to. One place, so a new type cannot quietly become unswitchable. */
create or replace function public.notification_group(p_type public.notification_type)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_type in ('payment_successful', 'payment_failed', 'payment_cancelled') then 'payment'
    when p_type in ('advertisement_expiring', 'advertisement_expired') then 'expiry'
    else 'advertisement'
  end;
$$;

-- =========================================================================
-- Raising a notification
-- =========================================================================
/*
 * The one way a notification is created.
 *
 * Called from triggers, so it runs inside the transaction that caused it. It
 * writes the in-app row and queues whatever channels the recipient has asked
 * for — reading their preferences here, once, rather than leaving the worker
 * to decide later whether a message was wanted.
 *
 * `on conflict do nothing` on the dedupe key is what makes the whole thing
 * safe to call twice: a repeated webhook, a sweep run twice in a day, a
 * moderator pressing Approve on a stale page. The second call writes nothing
 * and raises nothing.
 */
create or replace function public.raise_notification(
  p_user_id     uuid,
  p_type        public.notification_type,
  p_title       text,
  p_body        text,
  p_entity_type text default null,
  p_entity_id   uuid default null,
  p_href        text default null,
  p_dedupe_key  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created uuid;
  grp     text := public.notification_group(p_type);
  prefs   public.notification_preferences%rowtype;
  contact public.profiles%rowtype;
  wants_email    boolean;
  wants_whatsapp boolean;
begin
  if p_user_id is null then return null; end if;

  insert into public.notifications (user_id, type, title, body, entity_type, entity_id, href, dedupe_key)
  values (p_user_id, p_type, p_title, p_body, p_entity_type, p_entity_id, p_href,
          coalesce(p_dedupe_key, coalesce(p_entity_id::text, gen_random_uuid()::text)))
  on conflict (user_id, type, dedupe_key) do nothing
  returning id into created;

  -- Already told them. Nothing more to do, and not an error.
  if created is null then return null; end if;

  select * into contact from public.profiles where id = p_user_id;
  select * into prefs from public.notification_preferences where user_id = p_user_id;

  -- No row means the defaults, which is what a new account has.
  wants_email := case grp
    when 'payment'   then coalesce(prefs.email_payment_updates, true)
    when 'expiry'    then coalesce(prefs.email_expiry_reminders, true)
    else                  coalesce(prefs.email_advertisement_updates, true)
  end;
  wants_whatsapp := case grp
    when 'payment'   then coalesce(prefs.whatsapp_payment_updates, false)
    when 'expiry'    then coalesce(prefs.whatsapp_expiry_reminders, false)
    else                  coalesce(prefs.whatsapp_advertisement_updates, false)
  end;

  -- A channel with nowhere to send is not queued at all, rather than queued
  -- and failed: there is nothing for a worker to retry.
  if wants_email and coalesce(btrim(contact.email), '') <> '' then
    insert into public.notification_deliveries (notification_id, channel) values (created, 'email')
    on conflict do nothing;
  end if;
  if wants_whatsapp and coalesce(btrim(contact.phone), '') <> '' then
    insert into public.notification_deliveries (notification_id, channel) values (created, 'whatsapp')
    on conflict do nothing;
  end if;

  return created;
end;
$$;

comment on function public.raise_notification is
  'Creates a notification and queues the channels the recipient wants. Idempotent on (user, type, dedupe_key).';

/** The same, to every member of staff. Used for the office's own queue notices. */
create or replace function public.raise_staff_notification(
  p_type        public.notification_type,
  p_title       text,
  p_body        text,
  p_entity_type text default null,
  p_entity_id   uuid default null,
  p_href        text default null,
  p_dedupe_key  text default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  member record;
  n int := 0;
begin
  for member in
    select id from public.profiles
     where role in ('admin', 'moderator') and not is_blocked
  loop
    perform public.raise_notification(
      member.id, p_type, p_title, p_body, p_entity_type, p_entity_id, p_href, p_dedupe_key);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- =========================================================================
-- The events
-- =========================================================================
/*
 * Advertisements.
 *
 * As a trigger on `ads`, for the same reason the renewal payment guard is a
 * trigger: approval is reachable from `moderate_advertisement()`, from a bulk
 * action, from the renewal path and from an administrator's own hand, and a
 * notification written in only one of those is a notification most people will
 * not get.
 *
 * The advertiser's own reference is used throughout rather than the title,
 * because it is what they are asked to quote when they telephone.
 */
create or replace function public.notify_ad_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  href text := '/my-ads/' || new.id::text;
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      perform public.raise_notification(
        new.user_id, 'advertisement_submitted',
        'We have your advertisement',
        format('%s has been received and is waiting to be read by our office.', new.reference),
        'advertisement', new.id, href, new.id::text || ':submitted');

      perform public.raise_staff_notification(
        'staff_advertisement_submitted',
        'New advertisement to review',
        format('%s is waiting in the queue.', new.reference),
        'advertisement', new.id, '/admin/advertisements/' || new.id::text,
        new.id::text || ':submitted');
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Keyed on the status change itself, so a status reached twice — approved,
  -- unpublished, approved again — is told twice, which is right, while one
  -- approval processed twice is told once.
  if new.status = 'approved' then
    perform public.raise_notification(
      new.user_id, 'advertisement_approved',
      'Your advertisement is published',
      format('%s is now on the site and runs until %s.',
             new.reference, to_char(new.expires_at at time zone 'Asia/Kolkata', 'DD Mon YYYY')),
      'advertisement', new.id, href,
      new.id::text || ':approved:' || coalesce(new.published_at::text, now()::text));

  elsif new.status = 'rejected' then
    perform public.raise_notification(
      new.user_id, 'advertisement_rejected',
      'Your advertisement was not accepted',
      format('%s was not accepted. %s', new.reference,
             coalesce(nullif(btrim(new.rejection_reason), ''), 'Please contact our office.')),
      'advertisement', new.id, href,
      new.id::text || ':rejected:' || now()::text);

  elsif new.status = 'changes_requested' then
    perform public.raise_notification(
      new.user_id, 'advertisement_changes_requested',
      'Your advertisement needs a change',
      format('%s needs a small change before it can be published. %s', new.reference,
             coalesce(nullif(btrim(new.rejection_reason), ''), '')),
      'advertisement', new.id, href || '/edit',
      new.id::text || ':changes:' || now()::text);

  elsif new.status = 'expired' then
    perform public.raise_notification(
      new.user_id, 'advertisement_expired',
      'Your advertisement has finished its run',
      format('%s has expired and is no longer shown to readers. You can renew it.', new.reference),
      'advertisement', new.id, href || '/renew',
      new.id::text || ':expired:' || coalesce(new.expires_at::text, now()::text));
  end if;

  return new;
end;
$$;

drop trigger if exists ads_notify on public.ads;
create trigger ads_notify
  after insert or update on public.ads
  for each row execute function public.notify_ad_change();

/* Renewals: asked for, and decided. */
create or replace function public.notify_renewal_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ref  text := (select reference from public.ads where id = new.ad_id);
  href text := '/my-ads/' || new.ad_id::text;
begin
  if tg_op = 'INSERT' then
    perform public.raise_notification(
      new.user_id, 'renewal_submitted',
      'We have your renewal request',
      format('Your renewal of %s is with our office. The new run starts once it is approved.', ref),
      'renewal', new.id, href, new.id::text || ':requested');

    perform public.raise_staff_notification(
      'staff_renewal_submitted',
      'Renewal waiting for a decision',
      format('%s has been sent for renewal.', ref),
      'renewal', new.id, '/admin/advertisements/renewals', new.id::text || ':requested');
    return new;
  end if;

  if new.status is not distinct from old.status then return new; end if;

  if new.status = 'approved' then
    perform public.raise_notification(
      new.user_id, 'renewal_approved',
      'Your renewal is approved',
      format('%s has been renewed and now runs until %s.', ref,
             to_char(new.new_expires_at at time zone 'Asia/Kolkata', 'DD Mon YYYY')),
      'renewal', new.id, href, new.id::text || ':approved');

  elsif new.status = 'rejected' then
    perform public.raise_notification(
      new.user_id, 'renewal_rejected',
      'Your renewal was not approved',
      format('The renewal of %s was not approved. %s', ref,
             coalesce(nullif(btrim(new.decision_note), ''), 'Please contact our office.')),
      'renewal', new.id, href, new.id::text || ':rejected');
  end if;

  return new;
end;
$$;

drop trigger if exists ad_renewals_notify on public.ad_renewals;
create trigger ad_renewals_notify
  after insert or update on public.ad_renewals
  for each row execute function public.notify_renewal_change();

/*
 * Payments.
 *
 * The wording here is the thing Phase 9 was most insistent about and Phase 10
 * repeats: a successful payment is not a published advertisement. The message
 * says what was paid and that the advertisement is still to be read.
 */
create or replace function public.notify_payment_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ref    text := (select reference from public.ads where id = new.ad_id);
  amount text := to_char(new.amount_paise / 100.0, 'FM999G999G990D00');
  href   text := '/my-ads/payments/' || new.id::text;
begin
  if new.status is not distinct from old.status then return new; end if;

  if new.status = 'paid' then
    perform public.raise_notification(
      new.user_id, 'payment_successful',
      'Payment received',
      format('We have received ₹%s for %s. Your advertisement is now awaiting review.', amount, ref),
      'payment', new.id, href, new.id::text || ':paid');

    perform public.raise_staff_notification(
      'staff_payment_received',
      'Payment received',
      format('₹%s settled against %s.', amount, ref),
      'payment', new.id, '/admin/payments', new.id::text || ':paid');

  elsif new.status = 'failed' then
    perform public.raise_notification(
      new.user_id, 'payment_failed',
      'Your payment did not complete',
      format('The payment of ₹%s for %s was not completed. Nothing has been charged.', amount, ref),
      'payment', new.id, href, new.id::text || ':failed');

  elsif new.status = 'cancelled' then
    perform public.raise_notification(
      new.user_id, 'payment_cancelled',
      'Payment cancelled',
      format('The payment of ₹%s for %s was cancelled. Your advertisement is saved.', amount, ref),
      'payment', new.id, href, new.id::text || ':cancelled');
  end if;

  return new;
end;
$$;

drop trigger if exists payments_notify on public.payments;
create trigger payments_notify
  after update on public.payments
  for each row execute function public.notify_payment_change();

/* Reader reports, to the office only. A report says something about its reporter too. */
create or replace function public.notify_report_received()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.raise_staff_notification(
    'staff_report_received',
    'An advertisement has been reported',
    format('A reader reported an advertisement as %s.', new.reason),
    'report', new.id, '/admin/reports', new.id::text);
  return new;
end;
$$;

drop trigger if exists ad_reports_notify on public.ad_reports;
create trigger ad_reports_notify
  after insert on public.ad_reports
  for each row execute function public.notify_report_received();

-- ------------------------------------------------------ expiring soon ------
/*
 * The one notification that no state change produces.
 *
 * Nothing happens to an advertisement when it enters the expiring-soon
 * window; it simply becomes true. So this is a sweep, run beside the expiry
 * sweep, and its idempotency is the dedupe key: the advertisement's own expiry
 * date. Run it hourly for a week and one reminder is sent. Renew, and the new
 * date earns a new reminder — which is right, because it is a different run
 * ending.
 */
create or replace function public.notify_expiring_advertisements()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  soon int := public.setting_int('ads.expiring_soon_days', 7);
  ad   record;
  sent int := 0;
begin
  if not (public.is_trusted_connection() or public.is_staff()) then
    raise exception 'Only Shree Classified staff can run the expiry reminders'
      using errcode = 'insufficient_privilege';
  end if;

  for ad in
    select a.id, a.user_id, a.reference, a.expires_at
      from public.ads a
     where a.status = 'approved'
       and a.expires_at > now()
       and a.expires_at <= now() + make_interval(days => soon)
  loop
    if public.raise_notification(
         ad.user_id, 'advertisement_expiring',
         'Your advertisement is ending soon',
         format('%s runs until %s. Renew it to keep it on the site.',
                ad.reference,
                to_char(ad.expires_at at time zone 'Asia/Kolkata', 'DD Mon YYYY')),
         'advertisement', ad.id, '/my-ads/' || ad.id::text || '/renew',
         ad.id::text || ':expiring:' || ad.expires_at::text
       ) is not null then
      sent := sent + 1;
    end if;
  end loop;

  return sent;
end;
$$;

revoke all on function public.notify_expiring_advertisements() from public, anon, authenticated;
grant execute on function public.notify_expiring_advertisements() to authenticated, service_role;

-- =========================================================================
-- Reading and marking
-- =========================================================================
/*
 * Marking read is a function rather than an UPDATE policy, so that "only your
 * own" is stated once. The WHERE clause is the authorisation: another
 * advertiser's notification is not matched, so nothing is updated and nothing
 * is leaked about whether it exists.
 */
create or replace function public.mark_notification_read(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  n   int;
begin
  if uid is null then
    raise exception 'Please sign in' using errcode = 'insufficient_privilege';
  end if;

  update public.notifications
     set is_read = true, read_at = now()
   where id = p_id and user_id = uid and not is_read;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  n   int;
begin
  if uid is null then
    raise exception 'Please sign in' using errcode = 'insufficient_privilege';
  end if;

  update public.notifications
     set is_read = true, read_at = now()
   where user_id = uid and not is_read;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- =========================================================================
-- The worker's half
-- =========================================================================
/*
 * Claiming work.
 *
 * `for update skip locked` is what lets two workers — a cron firing while a
 * previous run is still going, say — drain the same queue without either
 * waiting on the other or both sending the same email. Claimed rows are moved
 * out of the due window immediately by incrementing `attempts` and pushing
 * `scheduled_at` forward, so a worker that dies mid-send leaves its rows to be
 * retried later rather than locked for ever.
 */
create or replace function public.claim_notification_deliveries(p_limit integer default 25)
returns table (
  delivery_id     uuid,
  channel         public.notification_channel,
  attempts        integer,
  notification_id uuid,
  user_id         uuid,
  type            public.notification_type,
  title           text,
  body            text,
  href            text,
  full_name       text,
  email           text,
  phone           text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_trusted_connection() then
    raise exception 'Only Shree Classified can send notifications'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  with claimed as (
    update public.notification_deliveries d
       set attempts = d.attempts + 1,
           -- Held for five minutes. If the worker finishes, it says so and
           -- this never matters; if it dies, the row comes back by itself.
           scheduled_at = now() + interval '5 minutes'
     where d.id in (
       select c.id from public.notification_deliveries c
        where c.status = 'queued' and c.scheduled_at <= now()
        order by c.scheduled_at
        limit greatest(1, least(coalesce(p_limit, 25), 100))
        for update skip locked
     )
    returning d.id, d.channel, d.attempts, d.notification_id
  )
  select c.id, c.channel, c.attempts, n.id, n.user_id, n.type, n.title, n.body, n.href,
         p.full_name, p.email, p.phone
    from claimed c
    join public.notifications n on n.id = c.notification_id
    join public.profiles p on p.id = n.user_id;
end;
$$;

/*
 * Reporting the outcome.
 *
 * Failure is bounded: after `notifications.max_attempts` tries the row is
 * marked `failed` and left alone. A queue that retries for ever is a queue
 * that eventually sends a week-old "your advertisement expires in 3 days".
 * Backoff is exponential in minutes, computed here so the worker holds no
 * timing logic of its own.
 */
create or replace function public.complete_notification_delivery(
  p_id      uuid,
  p_status  public.notification_delivery_status,
  p_error   text default null
)
returns public.notification_delivery_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d        public.notification_deliveries%rowtype;
  max_try  int := public.setting_int('notifications.max_attempts', 4);
  reason   text := left(nullif(btrim(coalesce(p_error, '')), ''), 500);
begin
  if not public.is_trusted_connection() then
    raise exception 'Only Shree Classified can send notifications'
      using errcode = 'insufficient_privilege';
  end if;

  select * into d from public.notification_deliveries where id = p_id for update;
  if not found then
    raise exception 'No such delivery' using errcode = 'no_data_found';
  end if;
  if d.status <> 'queued' then
    return d.status;  -- Already settled. A second report changes nothing.
  end if;

  if p_status = 'sent' then
    update public.notification_deliveries
       set status = 'sent', sent_at = now(), error = null
     where id = p_id;
    return 'sent';
  end if;

  if p_status = 'skipped' then
    update public.notification_deliveries
       set status = 'skipped', error = reason
     where id = p_id;
    return 'skipped';
  end if;

  -- Failed. Retry with backoff until the attempts run out.
  if d.attempts >= max_try then
    update public.notification_deliveries
       set status = 'failed', failed_at = now(), error = reason
     where id = p_id;
    return 'failed';
  end if;

  update public.notification_deliveries
     set status = 'queued',
         scheduled_at = now() + make_interval(mins => power(3, d.attempts)::int),
         error = reason
   where id = p_id;
  return 'queued';
end;
$$;

insert into public.app_settings (key, value, description) values
  ('notifications.max_attempts', '4'::jsonb,
   'How many times a queued email or WhatsApp message is tried before it is left as failed.')
on conflict (key) do nothing;

-- =========================================================================
-- What each side reads
-- =========================================================================
create or replace view public.my_notifications
with (security_invoker = true)
as
select id, type, title, body, entity_type, entity_id, href, is_read, read_at, created_at
  from public.notifications
 where user_id = auth.uid();

comment on view public.my_notifications is
  'An advertiser''s own notifications. Ownership is the WHERE clause; the dedupe key is not in it.';

-- =========================================================================
-- Row level security
-- =========================================================================
alter table public.notifications            enable row level security;
alter table public.notification_deliveries  enable row level security;
alter table public.notification_preferences enable row level security;

-- Yours, and nobody else's — staff included. A notification is addressed to a
-- person; the office reads the audit trail, which is the record of what was
-- done, not the record of who was told.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (user_id = auth.uid());

-- Marking read goes through the functions above. No INSERT policy at all: a
-- notification is raised by a trigger, never by a request.
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The outbox is the worker's. Nobody reads it through the anon key.
revoke all on table public.notification_deliveries from anon, authenticated;

drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own on public.notification_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, update on public.notifications to authenticated;
grant select on public.my_notifications to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant select, insert, update on public.notification_deliveries to service_role;

revoke all on function public.raise_notification(uuid, public.notification_type, text, text, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.raise_staff_notification(public.notification_type, text, text, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.claim_notification_deliveries(integer) from public, anon, authenticated;
revoke all on function public.complete_notification_delivery(uuid, public.notification_delivery_status, text) from public, anon, authenticated;

grant execute on function public.claim_notification_deliveries(integer) to service_role;
grant execute on function public.complete_notification_delivery(uuid, public.notification_delivery_status, text) to service_role;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- ----- end 0014_notifications.sql -----

-- ----- begin 0015_analytics.sql -----
-- =============================================================================
-- Shree Classified — Phase 11: what the business actually did
--
-- Every figure the analytics pages show is computed here, in SQL, and every
-- function refuses anyone who is not staff. Two reasons, and the second is the
-- one that matters:
--
--   * Aggregation belongs where the rows are. A dashboard that fetches a
--     year of advertisements into a browser to count them works until the
--     year it does not.
--   * Authorisation belongs where the data is. `/admin/analytics` is behind
--     the proxy and the admin layout, but those are a better experience
--     rather than the security — an ordinary account calling these functions
--     directly is refused by the function itself.
--
-- WHAT IS DELIBERATELY ABSENT, because the events are not recorded:
--
--   * Contact clicks. Nothing counts a tap on "Call" or "WhatsApp", so there
--     is no "most contacted advertisement" here. The interface says the
--     figure is not recorded rather than showing a plausible number.
--   * Page response times and API error rates. Those are the hosting
--     platform's to report, not this database's, and inventing them from
--     nothing would be worse than their absence.
--
-- Views ARE recorded — `record_ad_view()` has incremented `ads.view_count`
-- since Phase 6 — and favourites are a table, so both appear.
--
-- Every boundary is a timestamptz computed by the caller. Grouping by day
-- converts with `at time zone 'Asia/Kolkata'` rather than by adding hours to
-- a number, which is the arithmetic that breaks twice a year in countries
-- that observe daylight saving and reads as "roughly right" in ours.
-- =============================================================================

-- =========================================================================
-- Search, which was not recorded at all
-- =========================================================================
/*
 * What people looked for, and whether they found anything.
 *
 * Deliberately anonymous: no user id, no address, no session. Knowing that
 * eleven people searched for "scooty" last week is a fact about the market.
 * Knowing WHO searched for it is a fact about a person, and it is not needed
 * to decide whether the paper wants a scooters section.
 *
 * `result_count` is what makes the zero-result report possible, which is the
 * genuinely useful half: it says what readers came for and did not find.
 */
create table if not exists public.search_events (
  id           bigint generated always as identity primary key,
  -- Normalised by `record_search()`: trimmed, folded to lower case, and cut
  -- to 80 characters. Long enough for a real search, short enough that a
  -- pasted paragraph cannot become a row nobody can read.
  term         text not null check (char_length(term) between 1 and 80),
  result_count integer not null check (result_count >= 0),
  category_id  uuid references public.categories (id) on delete set null,
  created_at   timestamptz not null default now()
);

comment on table public.search_events is
  'What was searched for and how many results it found. No user, no address, no session — a fact about the market, not about a person.';

create index if not exists search_events_recent_idx on public.search_events (created_at desc);
create index if not exists search_events_term_idx on public.search_events (term, created_at desc);
create index if not exists search_events_empty_idx
  on public.search_events (term, created_at desc) where result_count = 0;

/*
 * Recording one.
 *
 * Callable by anyone, including a signed-out reader, because searching is
 * something signed-out readers do and a search log that only covers
 * registered users describes the wrong population. There is nothing to abuse:
 * the row holds a string and a number, and the retention sweep removes it.
 */
create or replace function public.record_search(
  p_term         text,
  p_result_count integer,
  p_category_id  uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cleaned text := lower(btrim(coalesce(p_term, '')));
begin
  -- A blank search is a page view, not a search. A single character is a
  -- keystroke on the way to one.
  if char_length(cleaned) < 2 then return; end if;

  insert into public.search_events (term, result_count, category_id)
  values (left(cleaned, 80), greatest(coalesce(p_result_count, 0), 0), p_category_id);
end;
$$;

grant execute on function public.record_search(text, integer, uuid) to anon, authenticated;

/*
 * Retention.
 *
 * A search log kept for ever is a growing table nobody reads the old end of.
 * Ninety days is long enough to see a season and short enough that the table
 * stays small; it is a setting rather than a constant so the office can
 * change its mind without a deployment.
 */
insert into public.app_settings (key, value, description) values
  ('analytics.search_retention_days', '90'::jsonb,
   'How long an anonymous search record is kept before the sweep removes it.')
on conflict (key) do nothing;

create or replace function public.prune_search_events()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  keep int := public.setting_int('analytics.search_retention_days', 90);
  gone int;
begin
  if not (public.is_trusted_connection() or public.is_staff()) then
    raise exception 'Only Shree Classified can prune the search log'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.search_events where created_at < now() - make_interval(days => keep);
  get diagnostics gone = row_count;
  return gone;
end;
$$;

revoke all on function public.prune_search_events() from public, anon, authenticated;
grant execute on function public.prune_search_events() to authenticated, service_role;

alter table public.search_events enable row level security;
-- Insert goes through `record_search()`, which is SECURITY DEFINER. Reading is
-- staff business and goes through the analytics functions below. So: no
-- policies, and no grants.
revoke all on table public.search_events from anon, authenticated;

-- =========================================================================
-- Two gates
-- =========================================================================
/*
 * The first gate, called by every function below that does not touch money.
 *
 * Staff, or a trusted connection — the same pair `expire_advertisements()`
 * admits, and for the same reason: the service role already bypasses row-level
 * security entirely, so refusing it here would protect nothing while stopping
 * a scheduled report from ever being written. An ordinary signed-in account
 * always carries a uid and is never a trusted connection, so this is exactly
 * the refusal Phase 11 asks for.
 */
create or replace function public.require_analytics_reader()
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if not (public.is_staff() or public.is_trusted_connection()) then
    raise exception 'Analytics are for Shree Classified staff'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

/*
 * The money, and who counts as a person, are an administrator's.
 *
 * A moderator's job is the queue: what is waiting, how long it waited, who
 * decided it. Turnover, average order value and how many accounts were opened
 * are not needed to review an advertisement, and the difference between
 * "staff" and "the person who runs the business" is exactly the difference
 * between those two lists.
 *
 * This is the boundary that actually holds. The dashboard also declines to
 * render those panels to a moderator, but that is politeness — a moderator who
 * calls `analytics_overview` directly, with their own token, from anywhere at
 * all, gets this exception instead of a revenue figure.
 */
create or replace function public.require_revenue_reader()
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if not (public.is_admin() or public.is_trusted_connection()) then
    raise exception 'Revenue and user figures are for an administrator'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- =========================================================================
-- The figures
-- =========================================================================
/*
 * The headline numbers, with their definitions written down.
 *
 * These definitions are the substance of the whole phase — a dashboard whose
 * approval rate is "approved divided by everything ever submitted" is a
 * dashboard that reports a falling approval rate every time somebody posts an
 * advertisement nobody has read yet.
 *
 *   revenue_paise      sum of PAID payments settled in the period. Failed,
 *                      cancelled and still-open attempts are excluded; a
 *                      refund is excluded from revenue and counted separately.
 *   payments_paid      how many of those there were.
 *   average_value      revenue / payments_paid. Null rather than zero when
 *                      there were none, so the interface can say "no payments"
 *                      instead of "₹0.00 average".
 *   ads_created        advertisements submitted in the period, drafts excluded
 *                      — a draft is not a submission.
 *   ads_live           advertisements approved and not past their date RIGHT
 *                      NOW. Deliberately not period-bounded: "how many are
 *                      live" is a question about today.
 *   users_new          accounts created in the period.
 *   approval_rate      approved / (approved + rejected + changes_requested),
 *                      over decisions MADE in the period. Advertisements still
 *                      waiting are not in either half.
 */
create or replace function public.analytics_overview(p_from timestamptz, p_to timestamptz)
returns table (
  ads_created          bigint,
  ads_live             bigint,
  ads_pending          bigint,
  ads_expired          bigint,
  users_total          bigint,
  users_new            bigint,
  revenue_paise        bigint,
  payments_paid        bigint,
  payments_attempted   bigint,
  average_value_paise  bigint,
  refunded_paise       bigint,
  decisions_made       bigint,
  decisions_approved   bigint,
  renewals_requested   bigint,
  renewals_approved    bigint,
  ads_became_eligible  bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_revenue_reader();

  return query
  with decisions as (
    select a.entity_id, a.after ->> 'status' as status
      from public.audit_log a
     where a.action = 'ad.status_changed'
       and a.entity = 'advertisement'
       and a.occurred_at >= p_from and a.occurred_at < p_to
       and a.after ->> 'status' in ('approved', 'rejected', 'changes_requested')
  ),
  paid as (
    select p.amount_paise from public.payments p
     where p.status = 'paid' and p.paid_at >= p_from and p.paid_at < p_to
  )
  select
    (select count(*) from public.ads
      where status <> 'draft' and created_at >= p_from and created_at < p_to),
    (select count(*) from public.ads
      where status = 'approved' and expires_at > now()),
    (select count(*) from public.ads where status = 'pending'),
    (select count(*) from public.ads where status = 'expired'),
    (select count(*) from public.profiles),
    (select count(*) from public.profiles where created_at >= p_from and created_at < p_to),
    (select coalesce(sum(amount_paise), 0)::bigint from paid),
    (select count(*) from paid),
    (select count(*) from public.payments
      where created_at >= p_from and created_at < p_to),
    (select case when count(*) = 0 then null
                 else (sum(amount_paise) / count(*))::bigint end from paid),
    (select coalesce(sum(amount_paise), 0)::bigint from public.payments
      where status = 'refunded' and updated_at >= p_from and updated_at < p_to),
    (select count(*) from decisions),
    (select count(*) from decisions where status = 'approved'),
    (select count(*) from public.ad_renewals
      where requested_at >= p_from and requested_at < p_to),
    (select count(*) from public.ad_renewals
      where status = 'approved' and decided_at >= p_from and decided_at < p_to),
    -- The denominator for the renewal rate: advertisements whose run ENDED in
    -- the period, which is what makes one eligible to be renewed. Dividing by
    -- every advertisement instead would report a renewal rate that falls as
    -- the business grows.
    --
    -- Deliberately NOT filtered by current status. An advertisement that
    -- expired and was then renewed is back at `pending` — filtering on status
    -- would drop precisely the advertisements that took the renewal up, which
    -- removes them from the denominator and reports a renewal rate higher
    -- than the truth. `published_at` is the filter instead: a run can only
    -- end if it started.
    (select count(*) from public.ads
      where expires_at >= p_from and expires_at < p_to
        and published_at is not null);
end;
$$;

/*
 * Everything that moves over time, in one pass.
 *
 * One function rather than four, because the four charts share an x-axis and
 * four separate queries would each rebuild the same series of dates — and
 * could disagree about which days exist when one of them has no rows.
 *
 * `p_grain` is 'day' or 'month'. The caller picks it from the length of the
 * range: ninety days of daily points is a readable chart, three years of them
 * is a smear.
 */
create or replace function public.analytics_timeseries(
  p_from  timestamptz,
  p_to    timestamptz,
  p_grain text default 'day'
)
returns table (
  bucket        date,
  ads_created   bigint,
  ads_published bigint,
  payments_paid bigint,
  revenue_paise bigint,
  users_new     bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  step interval := case when p_grain = 'month' then interval '1 month' else interval '1 day' end;
  unit text     := case when p_grain = 'month' then 'month' else 'day' end;
begin
  perform public.require_revenue_reader();

  return query
  with series as (
    select date_trunc(unit, g at time zone 'Asia/Kolkata')::date as bucket
      from generate_series(p_from, p_to - interval '1 microsecond', step) as g
  ),
  created as (
    select date_trunc(unit, created_at at time zone 'Asia/Kolkata')::date as bucket, count(*) as n
      from public.ads
     where status <> 'draft' and created_at >= p_from and created_at < p_to
     group by 1
  ),
  published as (
    select date_trunc(unit, published_at at time zone 'Asia/Kolkata')::date as bucket, count(*) as n
      from public.ads
     where published_at >= p_from and published_at < p_to
     group by 1
  ),
  settled as (
    select date_trunc(unit, paid_at at time zone 'Asia/Kolkata')::date as bucket,
           count(*) as n, sum(amount_paise) as paise
      from public.payments
     where status = 'paid' and paid_at >= p_from and paid_at < p_to
     group by 1
  ),
  joined as (
    select date_trunc(unit, created_at at time zone 'Asia/Kolkata')::date as bucket, count(*) as n
      from public.profiles
     where created_at >= p_from and created_at < p_to
     group by 1
  )
  select s.bucket,
         coalesce(c.n, 0)::bigint,
         coalesce(p.n, 0)::bigint,
         coalesce(t.n, 0)::bigint,
         coalesce(t.paise, 0)::bigint,
         coalesce(j.n, 0)::bigint
    from series s
    left join created   c on c.bucket = s.bucket
    left join published p on p.bucket = s.bucket
    left join settled   t on t.bucket = s.bucket
    left join joined    j on j.bucket = s.bucket
   order by s.bucket;
end;
$$;

/*
 * By package.
 *
 * Joined to `packages` for the name, but falling back to the snapshot the
 * payment carries — so a package renamed or taken off sale still appears
 * under the name it was sold as, and a deleted one does not vanish from last
 * year's revenue.
 */
create or replace function public.analytics_by_package(p_from timestamptz, p_to timestamptz)
returns table (
  package_id    text,
  package_name  text,
  purchases     bigint,
  revenue_paise bigint,
  average_paise bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_revenue_reader();

  return query
  select p.package_id,
         coalesce(pk.name, p.package_name, p.package_id),
         count(*)::bigint,
         sum(p.amount_paise)::bigint,
         (sum(p.amount_paise) / count(*))::bigint
    from public.payments p
    left join public.packages pk on pk.id = p.package_id
   where p.status = 'paid' and p.paid_at >= p_from and p.paid_at < p_to
   group by p.package_id, coalesce(pk.name, p.package_name, p.package_id)
   order by sum(p.amount_paise) desc, count(*) desc;
end;
$$;

/*
 * By category, and by place.
 *
 * Revenue is attributed to the category of the advertisement the payment was
 * raised against. That is a real number and it is labelled "revenue by
 * category" rather than "most profitable category" — profit would need costs,
 * and this database has never seen one.
 */
create or replace function public.analytics_by_category(p_from timestamptz, p_to timestamptz)
returns table (
  category_id   uuid,
  category_name text,
  ads_created   bigint,
  ads_live      bigint,
  revenue_paise bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_revenue_reader();

  return query
  select c.id, c.name,
         count(a.id) filter (
           where a.status <> 'draft' and a.created_at >= p_from and a.created_at < p_to
         )::bigint,
         count(a.id) filter (where a.status = 'approved' and a.expires_at > now())::bigint,
         coalesce(sum(pay.amount_paise), 0)::bigint
    from public.categories c
    left join public.ads a on a.category_id = c.id
    left join public.payments pay
           on pay.ad_id = a.id and pay.status = 'paid'
          and pay.paid_at >= p_from and pay.paid_at < p_to
   group by c.id, c.name
  having count(a.id) filter (
           where a.status <> 'draft' and a.created_at >= p_from and a.created_at < p_to
         ) > 0
      or count(a.id) filter (where a.status = 'approved' and a.expires_at > now()) > 0
   order by 3 desc, 4 desc;
end;
$$;

create or replace function public.analytics_by_location(p_from timestamptz, p_to timestamptz)
returns table (
  location_id   uuid,
  location_name text,
  location_kind public.location_kind,
  ads_created   bigint,
  ads_live      bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_analytics_reader();

  return query
  select l.id, l.name, l.kind,
         count(a.id) filter (
           where a.status <> 'draft' and a.created_at >= p_from and a.created_at < p_to
         )::bigint,
         count(a.id) filter (where a.status = 'approved' and a.expires_at > now())::bigint
    from public.locations l
    join public.ads a on a.location_id = l.id
   group by l.id, l.name, l.kind
  having count(a.id) > 0
   order by 4 desc, 5 desc;
end;
$$;

/*
 * The office's own performance.
 *
 * Turnaround is measured from when an advertisement was submitted to when it
 * was first decided, using the audit trail rather than the advertisement's
 * current state — an advertisement approved, unpublished and approved again
 * has one submission and several decisions, and only the first one measures
 * how long somebody waited.
 *
 * Moderator names are included because a queue is worked by people and the
 * office knows who they are. Nothing else about them is: no email, no
 * telephone number, no account detail.
 */
create or replace function public.analytics_moderation(p_from timestamptz, p_to timestamptz)
returns table (
  decided_total      bigint,
  approved           bigint,
  rejected           bigint,
  changes_requested  bigint,
  awaiting_review    bigint,
  median_hours       numeric,
  average_hours      numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_analytics_reader();

  return query
  with first_decision as (
    select distinct on (l.entity_id)
           l.entity_id, l.occurred_at, l.after ->> 'status' as status
      from public.audit_log l
     where l.action = 'ad.status_changed' and l.entity = 'advertisement'
       and l.after ->> 'status' in ('approved', 'rejected', 'changes_requested')
       and l.occurred_at >= p_from and l.occurred_at < p_to
     order by l.entity_id, l.occurred_at
  ),
  waited as (
    select d.status,
           extract(epoch from (d.occurred_at - a.created_at)) / 3600.0 as hours
      from first_decision d
      join public.ads a on a.id = d.entity_id
     where d.occurred_at >= a.created_at
  )
  select (select count(*) from waited),
         (select count(*) from waited where status = 'approved'),
         (select count(*) from waited where status = 'rejected'),
         (select count(*) from waited where status = 'changes_requested'),
         (select count(*) from public.ads where status = 'pending'),
         (select round(percentile_cont(0.5) within group (order by hours)::numeric, 1) from waited),
         (select round(avg(hours)::numeric, 1) from waited);
end;
$$;

create or replace function public.analytics_moderators(p_from timestamptz, p_to timestamptz)
returns table (
  moderator_id   uuid,
  moderator_name text,
  decisions      bigint,
  approved       bigint,
  rejected       bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_analytics_reader();

  return query
  select l.actor_id,
         coalesce(p.full_name, 'Removed account'),
         count(*)::bigint,
         count(*) filter (where l.after ->> 'status' = 'approved')::bigint,
         count(*) filter (where l.after ->> 'status' = 'rejected')::bigint
    from public.audit_log l
    left join public.profiles p on p.id = l.actor_id
   where l.action = 'ad.status_changed' and l.entity = 'advertisement'
     and l.actor_id is not null
     and l.after ->> 'status' in ('approved', 'rejected', 'changes_requested')
     and l.occurred_at >= p_from and l.occurred_at < p_to
   group by l.actor_id, coalesce(p.full_name, 'Removed account')
   order by 3 desc;
end;
$$;

/*
 * Renewals, and the rate.
 *
 * `timing` is already recorded by Phase 8 as 'early' or 'after_expiry', so
 * "renewed before expiry" and "renewed after it lapsed" are read rather than
 * inferred from dates.
 */
create or replace function public.analytics_renewals(p_from timestamptz, p_to timestamptz)
returns table (
  requested      bigint,
  approved       bigint,
  rejected       bigint,
  still_pending  bigint,
  renewed_early  bigint,
  renewed_late   bigint,
  paid_renewals  bigint,
  expiring_soon  bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  soon int := public.setting_int('ads.expiring_soon_days', 7);
begin
  perform public.require_analytics_reader();

  return query
  select (select count(*) from public.ad_renewals
           where requested_at >= p_from and requested_at < p_to),
         (select count(*) from public.ad_renewals
           where status = 'approved' and decided_at >= p_from and decided_at < p_to),
         (select count(*) from public.ad_renewals
           where status = 'rejected' and decided_at >= p_from and decided_at < p_to),
         (select count(*) from public.ad_renewals where status = 'pending'),
         (select count(*) from public.ad_renewals
           where timing = 'early' and requested_at >= p_from and requested_at < p_to),
         (select count(*) from public.ad_renewals
           where timing = 'after_expiry' and requested_at >= p_from and requested_at < p_to),
         (select count(*) from public.payments
           where purpose = 'renewal' and status = 'paid'
             and paid_at >= p_from and paid_at < p_to),
         -- Not period-bounded: "how many end soon" is a question about now.
         (select count(*) from public.ads
           where status = 'approved' and expires_at > now()
             and expires_at <= now() + make_interval(days => soon));
end;
$$;

/*
 * What readers looked for.
 *
 * Two halves, and the second is the useful one: the terms that found nothing
 * are what the office does not sell yet.
 */
create or replace function public.analytics_search(
  p_from  timestamptz,
  p_to    timestamptz,
  p_limit integer default 20
)
returns table (
  term        text,
  searches    bigint,
  zero_result bigint,
  last_seen   timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_analytics_reader();

  return query
  select s.term,
         count(*)::bigint,
         count(*) filter (where s.result_count = 0)::bigint,
         max(s.created_at)
    from public.search_events s
   where s.created_at >= p_from and s.created_at < p_to
   group by s.term
   order by count(*) desc, max(s.created_at) desc
   limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

/*
 * The advertisements readers actually looked at.
 *
 * `view_count` has been incremented by `record_ad_view()` since Phase 6, so
 * this is a recorded number rather than an estimate. Favourites are a table.
 * There is no "most contacted" column, because nothing counts a tap on the
 * telephone number — and a column of plausible figures would be worse than
 * its absence.
 */
create or replace function public.analytics_top_ads(
  p_from  timestamptz,
  p_to    timestamptz,
  p_limit integer default 10
)
returns table (
  ad_id       uuid,
  reference   text,
  title       text,
  category    text,
  views       integer,
  favourites  bigint,
  status      public.ad_status,
  published_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_analytics_reader();

  return query
  select a.id, a.reference, a.title, c.name, a.view_count,
         (select count(*) from public.favourites f where f.ad_id = a.id)::bigint,
         a.status, a.published_at
    from public.ads a
    left join public.categories c on c.id = a.category_id
   where a.published_at >= p_from and a.published_at < p_to
   order by a.view_count desc, a.published_at desc
   limit greatest(1, least(coalesce(p_limit, 10), 50));
end;
$$;

/*
 * The funnel.
 *
 * Each step counts DISTINCT accounts that reached it, so somebody with four
 * advertisements is one person who posted, not four. The steps are nested —
 * everybody who paid also posted — which is what makes the drop between them
 * mean anything.
 */
create or replace function public.analytics_funnel(p_from timestamptz, p_to timestamptz)
returns table (
  registered     bigint,
  posted         bigint,
  paid           bigint,
  published      bigint,
  renewed        bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_revenue_reader();

  return query
  select (select count(*) from public.profiles
           where created_at >= p_from and created_at < p_to),
         (select count(distinct user_id) from public.ads
           where status <> 'draft' and created_at >= p_from and created_at < p_to),
         (select count(distinct user_id) from public.payments
           where status = 'paid' and paid_at >= p_from and paid_at < p_to),
         (select count(distinct user_id) from public.ads
           where published_at >= p_from and published_at < p_to),
         (select count(distinct user_id) from public.ad_renewals
           where requested_at >= p_from and requested_at < p_to);
end;
$$;

-- =========================================================================
-- Indexes the above actually need
-- =========================================================================
/*
 * Only what is missing. `ads (status, created_at)`, `ads (category_id)`,
 * `ads (location_id)`, `ads (expires_at)` and `audit_log (entity, entity_id,
 * occurred_at)` already exist from earlier phases and cover most of this.
 */

-- Revenue by day groups on `paid_at` filtered to settled payments. The Phase 9
-- index is on (status, created_at), which does not serve it.
create index if not exists payments_settled_idx
  on public.payments (paid_at) where status = 'paid';

-- The moderation turnaround reads status changes by time across all
-- advertisements; the existing index leads with entity_id, so it cannot.
create index if not exists audit_log_status_changes_idx
  on public.audit_log (occurred_at)
  where action = 'ad.status_changed';

-- Registration trend and the funnel's first step.
create index if not exists profiles_joined_idx on public.profiles (created_at);

-- Publication trend, and the top-advertisements list.
create index if not exists ads_published_idx on public.ads (published_at)
  where published_at is not null;

-- =========================================================================
-- Grants
-- =========================================================================
/*
 * Every analytics function refuses a non-staff caller in its own body. EXECUTE
 * is granted to `authenticated` rather than revoked because staff ARE
 * authenticated users — the refusal is the role check inside, which is the one
 * that cannot be got around by finding another route to the function.
 */
grant execute on function public.analytics_overview(timestamptz, timestamptz) to authenticated;
grant execute on function public.analytics_timeseries(timestamptz, timestamptz, text) to authenticated;
grant execute on function public.analytics_by_package(timestamptz, timestamptz) to authenticated;
grant execute on function public.analytics_by_category(timestamptz, timestamptz) to authenticated;
grant execute on function public.analytics_by_location(timestamptz, timestamptz) to authenticated;
grant execute on function public.analytics_moderation(timestamptz, timestamptz) to authenticated;
grant execute on function public.analytics_moderators(timestamptz, timestamptz) to authenticated;
grant execute on function public.analytics_renewals(timestamptz, timestamptz) to authenticated;
grant execute on function public.analytics_search(timestamptz, timestamptz, integer) to authenticated;
grant execute on function public.analytics_top_ads(timestamptz, timestamptz, integer) to authenticated;
grant execute on function public.analytics_funnel(timestamptz, timestamptz) to authenticated;

-- =========================================================================
-- Taking figures out of the building
-- =========================================================================
/*
 * A download is a thing that happened, so it is written down.
 *
 * The office's figures leaving on a laptop is exactly the event an audit trail
 * exists for, and "who exported the revenue report, and for what dates" is the
 * question somebody will eventually need answered. It is recorded whether or
 * not anything was wrong.
 *
 * This is a named function rather than a direct call to `write_audit()` for
 * the reason immediately below.
 */
create or replace function public.log_report_export(
  p_report text,
  p_from   timestamptz,
  p_to     timestamptz,
  p_rows   integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not (public.is_staff() or public.is_trusted_connection()) then
    raise exception 'Only Shree Classified staff export reports'
      using errcode = 'insufficient_privilege';
  end if;

  perform public.write_audit(
    'report.exported', 'analytics', null,
    format('exported the %s report for %s to %s (%s rows)',
           left(coalesce(p_report, 'unknown'), 40),
           to_char(p_from at time zone 'Asia/Kolkata', 'DD Mon YYYY'),
           to_char(p_to   at time zone 'Asia/Kolkata', 'DD Mon YYYY'),
           greatest(coalesce(p_rows, 0), 0)),
    null,
    jsonb_build_object(
      'report', left(coalesce(p_report, 'unknown'), 40),
      'from', p_from,
      'to', p_to,
      'rows', greatest(coalesce(p_rows, 0), 0)));
end $$;

grant execute on function public.log_report_export(text, timestamptz, timestamptz, integer) to authenticated;

/*
 * And the hole that made the function above necessary.
 *
 * `write_audit()` is SECURITY DEFINER and was created in migration 0006
 * without a grant, which in Postgres means EXECUTE to PUBLIC — so any signed-in
 * account could have written whatever it liked into the audit trail: an
 * approval that never happened, attributed to a moderator who never made it.
 * The trail is the thing that is supposed to be true when everything else is
 * in dispute.
 *
 * Almost every caller is a trigger function that is itself SECURITY DEFINER,
 * and those are unaffected by a grant to PUBLIC being withdrawn. There is
 * exactly one that is not: `extend_advertisement_expiry()`, which runs as the
 * caller on purpose — it reads `ads` under the caller's own privileges so the
 * contact columns stay ungranted — and therefore loses its ability to write
 * the entry. It gets a named, guarded door instead.
 */
create or replace function public.write_staff_audit(
  p_action    text,
  p_entity    text,
  p_entity_id uuid,
  p_summary   text,
  p_before    jsonb,
  p_after     jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- The guard is the whole point of the shim. `write_audit()` has none,
  -- because its callers are triggers that fire for ordinary advertisers.
  if not (public.is_staff() or public.is_trusted_connection()) then
    raise exception 'Only Shree Classified staff write to the audit trail'
      using errcode = 'insufficient_privilege';
  end if;

  perform public.write_audit(p_action, p_entity, p_entity_id, p_summary, p_before, p_after);
end $$;

grant execute on function
  public.write_staff_audit(text, text, uuid, text, jsonb, jsonb) to authenticated;

-- The one invoker-rights caller, pointed at the guarded door. Unchanged in
-- every other respect; reproduced from migration 0011.
create or replace function public.extend_advertisement_expiry(
  p_ad_id          uuid,
  p_new_expires_at timestamptz,
  p_reason         text
)
returns timestamptz
language plpgsql
set search_path = public, pg_temp
as $$
declare
  -- Named columns, not `*`: this runs as the caller, and the contact columns
  -- are not granted to anybody at the table.
  ad      record;
  reason  text := nullif(btrim(coalesce(p_reason, '')), '');
  ceiling int  := public.setting_int('ads.max_extension_days', 365);
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can extend an advertisement' using errcode = 'insufficient_privilege';
  end if;
  if reason is null then
    raise exception 'A reason is required to extend an advertisement' using errcode = 'check_violation';
  end if;

  select id, status, expires_at, reference into ad
    from public.ads where id = p_ad_id for update;
  if not found then
    raise exception 'No such advertisement' using errcode = 'no_data_found';
  end if;
  if ad.status <> 'approved' or ad.expires_at <= now() then
    raise exception 'Only a live advertisement can be extended; a finished one is renewed'
      using errcode = 'check_violation';
  end if;
  if p_new_expires_at is null or p_new_expires_at <= ad.expires_at then
    raise exception 'The new expiry date must be later than the current one'
      using errcode = 'check_violation';
  end if;
  if p_new_expires_at > now() + make_interval(days => ceiling) then
    raise exception 'The new expiry date must be within % days of today', ceiling
      using errcode = 'check_violation';
  end if;

  update public.ads set expires_at = p_new_expires_at where id = p_ad_id;

  -- `write_staff_audit()` rather than `write_audit()`: this function runs as
  -- the caller by design, and the caller no longer has EXECUTE on the raw
  -- writer. See the revoke below.
  perform public.write_staff_audit(
    'ad.expiry_extended', 'advertisement', p_ad_id, reason,
    jsonb_build_object('expires_at', ad.expires_at, 'status', ad.status),
    jsonb_build_object('expires_at', p_new_expires_at, 'status', ad.status,
                       'reference', ad.reference, 'note', reason, 'event', 'expiry_extended'));

  return p_new_expires_at;
end;
$$;

revoke execute on function
  public.write_audit(text, text, uuid, text, jsonb, jsonb)
  from public, anon, authenticated;

-- ----- end 0015_analytics.sql -----

-- ----- begin 0016_rate_limits.sql -----
-- =========================================================================
-- Shree Classified — Phase 13: rate limiting that survives a cold start
-- =========================================================================
/*
 * Why this is a table and not a Map in Node.
 *
 * The obvious rate limiter is an in-memory counter. On a serverless host it
 * is close to useless: every instance keeps its own, instances come and go
 * between requests, and an attacker sending requests in parallel is spread
 * across instances that each see a handful. It looks like protection in a
 * code review and stops nobody.
 *
 * The database is the one thing every instance shares, so the counter lives
 * here. One row per bucket, one statement to consume, and the statement is
 * atomic — two simultaneous requests cannot both read "4 of 5".
 *
 * WHAT IS NOT STORED: an address. The application hashes the caller's IP with
 * a server-side secret before it ever builds a bucket key, so this table holds
 * opaque strings. A dump of it cannot be turned back into "who tried to sign
 * in on Tuesday", and it is therefore not a log of people's behaviour that
 * somebody has to remember to prune for privacy — though it is pruned anyway,
 * because it is rubbish after its window closes.
 */

create table if not exists public.rate_limits (
  -- Opaque: "<action>:<hash>". Never an address, never an email.
  bucket            text primary key,
  window_started_at timestamptz not null default now(),
  count             integer not null default 0 check (count >= 0)
);

comment on table public.rate_limits is
  'Shared counters for rate limiting. Keys are hashed by the application; no address or identity is stored here.';

create index if not exists rate_limits_window_idx
  on public.rate_limits (window_started_at);

alter table public.rate_limits enable row level security;

/*
 * No policies, and the grants are withdrawn. Every access goes through
 * `consume_rate_limit()` below, which is SECURITY DEFINER. A caller cannot
 * read the table to learn how close they are to a limit, and cannot write to
 * it to reset their own counter.
 */
revoke all on table public.rate_limits from anon, authenticated;

-- =========================================================================
-- Consuming one unit
-- =========================================================================
/*
 * Returns true when the request is within the limit, false when it is not.
 *
 * The whole decision is one statement, so it is atomic: the upsert either
 * starts a fresh window or increments the existing one, and returns the count
 * it settled on. Two requests arriving together get 1 and 2, never 1 and 1.
 *
 * A window is a fixed span from its first request rather than a sliding one.
 * That is a deliberate simplification — a sliding window needs a row per
 * request — and the cost is that a caller may send `limit` requests at the end
 * of one window and `limit` more at the start of the next. For the limits
 * here, which exist to stop scripted abuse rather than to meter an API, that
 * is an acceptable trade and a documented one.
 *
 * Granted to `anon` because the endpoints most worth limiting — signing in,
 * asking for a password reset — are the ones reached without a session.
 */
create or replace function public.consume_rate_limit(
  p_bucket         text,
  p_limit          integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count  integer;
  v_limit  integer := greatest(coalesce(p_limit, 1), 1);
  v_window integer := greatest(coalesce(p_window_seconds, 60), 1);
begin
  if p_bucket is null or btrim(p_bucket) = '' then
    -- No key means no decision to make. Allowing is the safe direction: a
    -- limiter that cannot identify a caller must not lock everybody out.
    return true;
  end if;

  insert into public.rate_limits as r (bucket, window_started_at, count)
  values (left(p_bucket, 200), now(), 1)
  on conflict (bucket) do update
    set count =
          case
            when r.window_started_at < now() - make_interval(secs => v_window) then 1
            else r.count + 1
          end,
        window_started_at =
          case
            when r.window_started_at < now() - make_interval(secs => v_window) then now()
            else r.window_started_at
          end
  returning r.count into v_count;

  return v_count <= v_limit;
end;
$$;

grant execute on function public.consume_rate_limit(text, integer, integer)
  to anon, authenticated, service_role;

-- =========================================================================
-- Housekeeping
-- =========================================================================
/*
 * A bucket is rubbish once its window has closed. An hour is comfortably
 * longer than the longest window the application uses, so nothing in use is
 * ever removed. Called from the daily sweep.
 */
create or replace function public.prune_rate_limits()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  gone integer;
begin
  if not (public.is_trusted_connection() or public.is_staff()) then
    raise exception 'Only Shree Classified can prune the rate limiters'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.rate_limits where window_started_at < now() - interval '1 hour';
  get diagnostics gone = row_count;
  return gone;
end;
$$;

grant execute on function public.prune_rate_limits() to authenticated, service_role;

-- ----- end 0016_rate_limits.sql -----

