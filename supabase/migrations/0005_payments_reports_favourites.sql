-- =============================================================================
-- Shree Classified — Phase 6: payments, reports and favourites
--
-- The payment provider itself is Phase 5 of the plan and is not built. What is
-- built is the record a provider would settle against, because the shape of
-- that record decides whether the integration can be got wrong later:
--
--   * the AMOUNT is copied from the advertisement's stamped package price, not
--     from whoever creates the row. A client that could name an amount could
--     name one rupee.
--   * only staff or a trusted server connection may mark a payment paid. The
--     advertiser can read their own receipts and nothing else.
--
-- Reports are the other direction: anyone reading the site, signed in or not,
-- may flag an advertisement, but only staff may read the queue — a report says
-- something about the reporter as well as the advertisement.
-- =============================================================================

do $$ begin create type public.payment_status as enum ('created', 'pending', 'paid', 'failed', 'refunded'); exception when duplicate_object then null; end $$;
do $$ begin create type public.report_reason as enum ('spam', 'fraud', 'incorrect', 'offensive', 'unavailable', 'other'); exception when duplicate_object then null; end $$;
do $$ begin create type public.report_status as enum ('open', 'reviewing', 'actioned', 'dismissed'); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------- payments ------
create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  ad_id               uuid not null references public.ads (id) on delete cascade,
  user_id             uuid not null references public.profiles (id) on delete cascade,
  package_id          text not null references public.packages (id) on delete restrict,
  amount_paise        integer not null check (amount_paise >= 0),
  currency            text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  status              public.payment_status not null default 'created',
  provider            text check (provider is null or char_length(btrim(provider)) between 2 and 40),
  provider_order_id   text,
  provider_payment_id text,
  failure_reason      text,
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint payments_paid_has_timestamp check (status <> 'paid' or paid_at is not null),
  constraint payments_failed_has_reason check (
    status <> 'failed' or btrim(coalesce(failure_reason, '')) <> ''
  )
);

comment on table public.payments is
  'One row per attempt to pay for an advertisement. The amount is stamped from the advertisement, never accepted from the caller.';

create index if not exists payments_ad_idx   on public.payments (ad_id, created_at desc);
create index if not exists payments_user_idx on public.payments (user_id, created_at desc);
create unique index if not exists payments_provider_order_idx
  on public.payments (provider, provider_order_id)
  where provider_order_id is not null;

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

/*
 * A payment belongs to the advertisement's owner and costs what the
 * advertisement's package cost. Both are read from the advertisement rather
 * than from the row being inserted.
 *
 * While pricing is unconfigured every package costs NULL, which stamps zero —
 * a placed order with nothing to collect. That is the honest reading: the
 * office quotes the rate, and until they have, no amount is due.
 */
create or replace function public.stamp_payment_amount()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ad_owner   uuid;
  ad_package text;
  ad_price   integer;
begin
  select a.user_id, a.package_id, a.package_price_paise
    into ad_owner, ad_package, ad_price
    from public.ads a where a.id = new.ad_id;

  if not found then
    raise exception 'Unknown advertisement %', new.ad_id using errcode = 'foreign_key_violation';
  end if;
  if ad_package is null then
    raise exception 'That advertisement carries no package to pay for'
      using errcode = 'check_violation';
  end if;

  new.user_id      := ad_owner;
  new.package_id   := ad_package;
  new.amount_paise := coalesce(ad_price, 0);
  return new;
end;
$$;

drop trigger if exists payments_stamp_amount on public.payments;
create trigger payments_stamp_amount
  before insert on public.payments
  for each row execute function public.stamp_payment_amount();

/*
 * Settlement is staff business.
 *
 * An advertiser may not move a payment to `paid` — that is what a payment
 * provider's verified webhook does, through the service-role key, which is a
 * trusted connection. Nor may anyone edit an amount after the fact, or
 * reassign a payment to another advertisement.
 */
create or replace function public.guard_payment_settlement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_staff() or public.is_trusted_connection() then
    return new;
  end if;

  if new.amount_paise is distinct from old.amount_paise
     or new.ad_id is distinct from old.ad_id
     or new.user_id is distinct from old.user_id
     or new.package_id is distinct from old.package_id then
    raise exception 'A payment cannot be re-priced or reassigned'
      using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status then
    raise exception 'Only Shree Classified can change the status of a payment'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists payments_guard_settlement on public.payments;
create trigger payments_guard_settlement
  before update on public.payments
  for each row execute function public.guard_payment_settlement();

-- ----------------------------------------------------------- reports ------
create table if not exists public.ad_reports (
  id          uuid primary key default gen_random_uuid(),
  ad_id       uuid not null references public.ads (id) on delete cascade,
  -- Null for a reader who is not signed in. Reporting must not require an
  -- account, or the advertisements most worth reporting never get reported.
  reporter_id uuid references public.profiles (id) on delete set null,
  reason      public.report_reason not null,
  details     text check (details is null or char_length(details) <= 1000),
  status      public.report_status not null default 'open',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint ad_reports_reviewed_together check (
    (reviewed_by is null) = (reviewed_at is null)
  ),
  constraint ad_reports_closed_is_reviewed check (
    status in ('open', 'reviewing') or reviewed_at is not null
  )
);

comment on table public.ad_reports is
  'Reader reports awaiting moderation. Readable by staff only: a report identifies its reporter as much as the advertisement.';

create index if not exists ad_reports_queue_idx on public.ad_reports (status, created_at) where status in ('open', 'reviewing');
create index if not exists ad_reports_ad_idx on public.ad_reports (ad_id, created_at desc);

-- One report per signed-in reader per advertisement. Anonymous reports are not
-- constrained this way because there is nothing honest to key them on.
create unique index if not exists ad_reports_one_per_reporter_idx
  on public.ad_reports (ad_id, reporter_id)
  where reporter_id is not null;

/*
 * A reporter may only report as themselves, and may not open a report that is
 * already resolved or assign it to a moderator.
 */
create or replace function public.guard_ad_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_staff() or public.is_trusted_connection() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.reporter_id is distinct from auth.uid() then
      raise exception 'A report cannot be filed on behalf of someone else'
        using errcode = 'insufficient_privilege';
    end if;
    if new.status <> 'open' or new.reviewed_by is not null or new.reviewed_at is not null then
      raise exception 'A new report is opened, not resolved'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  raise exception 'Only Shree Classified staff can act on a report'
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists ad_reports_guard on public.ad_reports;
create trigger ad_reports_guard
  before insert or update on public.ad_reports
  for each row execute function public.guard_ad_report();

-- -------------------------------------------------------- favourites ------
create table if not exists public.favourites (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  ad_id      uuid not null references public.ads (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, ad_id)
);

comment on table public.favourites is
  'A reader''s saved advertisements. Private to that reader — who saved what is not an advertiser statistic.';

create index if not exists favourites_ad_idx on public.favourites (ad_id);

-- =========================================================================
-- Row level security
-- =========================================================================
alter table public.payments    enable row level security;
alter table public.ad_reports  enable row level security;
alter table public.favourites  enable row level security;

-- Payments: an advertiser reads their own receipts. Nothing else.
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select using (user_id = auth.uid() or public.is_staff());

-- An advertiser may start a payment against their own advertisement; the
-- amount is stamped by trigger, so starting one decides nothing.
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments
  for insert with check (
    public.is_staff()
    or exists (select 1 from public.ads a where a.id = payments.ad_id and a.user_id = auth.uid())
  );

-- The owner may touch their own payment row — attaching the provider's order
-- id when a checkout is opened, for instance — but guard_payment_settlement()
-- is what decides what they may actually change, and it is neither the amount
-- nor the status. Shutting the owner out here instead would put the whole
-- guarantee in one policy line, and the day someone loosened that line to let
-- a checkout write its order id, re-pricing would come back with it.
drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments
  for update using (user_id = auth.uid() or public.is_staff())
  with check (user_id = auth.uid() or public.is_staff());

drop policy if exists payments_delete on public.payments;
create policy payments_delete on public.payments
  for delete using (public.is_admin());

-- Reports: write-only for the public, readable by staff.
drop policy if exists ad_reports_insert on public.ad_reports;
create policy ad_reports_insert on public.ad_reports
  for insert with check (
    (reporter_id is null or reporter_id = auth.uid())
    and exists (
      select 1 from public.ads a
      where a.id = ad_reports.ad_id and a.status = 'approved' and a.expires_at > now()
    )
  );

drop policy if exists ad_reports_select on public.ad_reports;
create policy ad_reports_select on public.ad_reports
  for select using (public.is_staff() or (reporter_id is not null and reporter_id = auth.uid()));

drop policy if exists ad_reports_update on public.ad_reports;
create policy ad_reports_update on public.ad_reports
  for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists ad_reports_delete on public.ad_reports;
create policy ad_reports_delete on public.ad_reports
  for delete using (public.is_admin());

-- Favourites: the owner, and nobody else — not even staff.
drop policy if exists favourites_select on public.favourites;
create policy favourites_select on public.favourites
  for select using (user_id = auth.uid());

drop policy if exists favourites_write on public.favourites;
create policy favourites_write on public.favourites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- UPDATE is granted at the table so that a moderator can work the queue; the
-- policies above are what actually decide who may use it.
grant select, insert, update on public.payments to authenticated;
grant insert on public.ad_reports to anon, authenticated;
grant select, update on public.ad_reports to authenticated;
grant select, insert, update, delete on public.favourites to authenticated;
