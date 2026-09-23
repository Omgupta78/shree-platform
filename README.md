# Shree Classified — classified advertising platform

Digital classifieds for **Shree Advertising & Marketing**, Roorkee.

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 · Supabase (Postgres, Auth, Storage) · deployed on Vercel.

---

## Build status

**Phases 1 to 10 are complete.** The site reads and writes real data, the
office has somewhere to work, every advertisement has a lifecycle — a run
calculated on approval, automatic expiry, renewal through review, and
administrator overrides with an audit trail — and there is a payment provider
behind the packages.

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 1 | Foundation — schema, RLS, design system, shell | **Done** |
| 2 | Home page | **Done** |
| 3 | Browse & search — categories, filters, sorting, pagination, SEO | **Done** |
| 4 | The advertisement page — gallery, contact, similar, structured data | **Done** |
| 5 | The submission form — eight steps, zod validation, drafts, preview | **Done** |
| 6 | The backend — accounts, submission, storage, payments and reports schema, audit trail | **Done** |
| 7 | The office — admin area, moderation workflow, reports, categories, activity log | **Done** |
| 8 | Lifecycle — expiry, the expiry sweep, renewal and its history, expiry controls | **Done** |
| 9 | Payments — packages and pricing, Razorpay, verification, the webhook, receipts, the ledger | **Done** |
| 10 | Notifications — in-app, email and WhatsApp, with preferences and a send queue | **Done** |
| 11 | Analytics | Not started |

### Pages the navigation promises but does not have yet

`/edition`, `/privacy`, `/terms`, `/disclaimer` and `/report`. Each is an entry
in `config/navigation.ts` carrying
`built: false`, which is what keeps it out of the header, the mobile menu and
the footer — the same treatment the admin sidebar has always given an unbuilt
section, for the reason written there: a navigation item that 404s teaches
people to distrust the whole menu.

Writing the page and setting `built: true` is the whole of the work.
`e2e/navigation.spec.ts` asserts the flag tells the truth in both directions,
so a page that gets written cannot stay hidden and a link that gets shown
cannot 404.

The legal pages are deliberately not drafted here: privacy, terms and the
disclaimer are the business's own words and should be read by somebody
qualified before they are published.

### Routes

| Route | What it is |
| ----- | ---------- |
| `/` | Home |
| `/categories` | Category index |
| `/about` | Who publishes this, and how an advertisement reaches the page |
| `/advertise` | What can be booked, the packages, and what happens next |
| `/contact` | The office: address, telephone, WhatsApp, email |
| `/classifieds` | All advertisements, filtered and sorted from the URL |
| `/classifieds/[slug]` | A category page, or one advertisement |
| `/post-ad` | The submission form |
| `/sign-in`, `/sign-up`, `/forgot-password`, `/update-password` | Accounts |
| `/my-ads` | The advertiser's dashboard: figures, expiring soon, every advertisement |
| `/my-ads/expired` | Their expired advertisements, with View and Renew |
| `/my-ads/[id]` | One advertisement: status, run dates, renewal history, timeline |
| `/my-ads/[id]/renew` | Ask for a renewal — back through review, no charge in this phase |
| `/my-ads/[id]/edit` | Correct one, and send it back for review |
| `/dashboard/…` | Aliases: `/dashboard`, `/dashboard/expired`, `/dashboard/advertisements/[id]` and `…/renew` redirect to the `/my-ads` pages |
| `/auth/callback`, `/auth/sign-out` | Session handling |
| `/search`, `/robots.txt`, `/sitemap.xml` | Search redirect and crawler files |
| `/admin` | Dashboard — what is waiting, what has arrived |
| `/admin/advertisements` | Every advertisement, with search and filters |
| `/admin/advertisements/pending` | The review queue, with bulk actions |
| `/admin/advertisements/changes-requested`, `/approved`, `/rejected`, `/expired` | The other queues |
| `/admin/advertisements/expiring` | Live advertisements ending soon — filter by category, type and range |
| `/admin/advertisements/renewals` | Renewals waiting for a decision |
| `/my-ads/payments` | The advertiser's payments, and what is still owing |
| `/my-ads/payments/[id]` | One payment, as a receipt. Safe to refresh or bookmark |
| `/my-ads/notifications` | Everything the advertiser has been told |
| `/my-ads/settings/notifications` | Which channels they hear on |
| `/api/cron/expire-advertisements` | The expiry sweep, for a scheduler; needs `CRON_SECRET` |
| `/api/cron/send-notifications` | Raises expiry reminders and drains the send queue; needs `CRON_SECRET` |
| `/api/payments/create-order` | Raises a Razorpay order, priced from the database |
| `/api/payments/verify` | Checks the checkout's signature server-side, and settles |
| `/api/payments/webhook` | Razorpay's own account of what happened; needs `RAZORPAY_WEBHOOK_SECRET` |
| `/admin/advertisements/[id]` | One advertisement, and the decisions available on it |
| `/admin/payments` | The office ledger, filtered by status, type, package and date |
| `/admin/notifications` | What has arrived for you |
| `/admin/notifications/templates` | Every message the site sends, and when |
| `/admin/reports` | Reader reports |
| `/admin/activity` | The moderation history |
| `/admin/categories`, `/admin/packages`, `/admin/users` | Administrators only |

### Not built yet, by instruction

Analytics.

**No provider is connected, and that is the shipping state.** Without
`RESEND_API_KEY` or the WhatsApp settings, notifications are still raised and
the in-app centre still fills; the queued email and WhatsApp rows are recorded
as `skipped` with a reason saying no provider is configured, rather than piling
up as failures. Connect a provider and the same queue starts sending.

Promotional messaging is deliberately absent. Everything here is
transactional — a message about an advertisement somebody booked — and the
email footer says so. If marketing is ever wanted it needs its own consent and
unsubscribe system, not a flag on these.

**Prices are still unset, and that is deliberate.** Every package ships with
`price_paise` as NULL, because Shree Advertising quote their rates from the
office and have not supplied them; a number invented here would put a figure in
front of a customer that nobody at the business agreed to. An unpriced package
costs nothing, opens no checkout, and the site behaves exactly as it did in
Phase 8. The integration is complete and waiting: enter the rates at
`/admin/packages` and the checkout appears. `supabase/seed/dev_package_prices.sql`
puts development figures in for trying it out, and is not a migration.

Refunds are prepared for but not built: `refunded` is a state a payment may
reach and the transition table permits `paid → refunded`, but there is no
refund button, because an unsafe one is worse than none. GST, tax invoices and
billing addresses are absent for the same reason as the prices — nobody has
said what they should be.

The round trip is complete: the office can ask for a change, and the advertiser
can make it at `/my-ads/[id]/edit` and send the advertisement back. Display
artwork is the one thing that page cannot yet replace — a new file still goes
through the advertising team.

---

## Getting started

### 1. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com). Choose the Mumbai (`ap-south-1`) region for the lowest latency to Roorkee.
2. Open **SQL Editor** and run each file in `supabase/migrations/` **in filename order**:
   - `0001_core_schema.sql` — tables, constraints, triggers, row-level security
   - `0002_seed_reference_data.sql` — categories, locations, site settings
   - `0003_browse_views.sql` — aggregate views for browse pages
   - `0004_advertisement_kinds_and_packages.sql` — display advertisements, packages, artwork, database-issued slugs
   - `0005_payments_reports_favourites.sql` — payments, reader reports, saved advertisements
   - `0006_storage_and_audit_trail.sql` — storage buckets and policies, the append-only audit trail
   - `0007_moderation_guard_and_public_views.sql` — the hardened moderation guard, view counting, and the three read views
   - `0008_ad_status_changes_requested.sql` — one statement, on its own: see the note inside it
   - `0009_moderation_workflow.sql` — the transition table, the moderation call, the admin views and the dashboard counts
   - `0010_taxonomy_alignment_and_queue_detail.sql` — the "Others" category, "Nearby areas", staff corrections
   - `0011_lifecycle_and_renewals.sql` — run lengths by package, the expiry sweep, renewals, expiry overrides
   - `0012_payment_status_cancelled.sql` — one statement, on its own: see the note inside it
   - `0013_payments_and_pricing.sql` — payment purpose and price snapshot, the payment state machine, settlement, the webhook log, and the refusal to approve an unpaid renewal
3. Storage buckets are created by migration `0006`, so there is nothing to do by
   hand: `ad-images` (public) and `ad-artwork` (private). If your project predates
   that migration, check under **Storage** that both exist.

### 2. Configure the app

```bash
cp .env.example .env.local
```

Fill in from **Project Settings → API** in Supabase:

| Variable | Where it is used | Secret? |
| -------- | ---------------- | ------- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server | No — row-level security governs access |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Bypasses all security | **Yes** |
| `NEXT_PUBLIC_SITE_URL` | Canonical URLs, sitemap, share links | No |
| `CRON_SECRET` | Authorises the expiry sweep endpoint (16+ characters) | **Yes** |
| `RAZORPAY_KEY_ID` | Identifies the account to the checkout | No |
| `RAZORPAY_KEY_SECRET` | Signs and verifies the checkout callback. Server only | **Yes** |
| `RAZORPAY_WEBHOOK_SECRET` | Verifies webhook deliveries. A *different* secret | **Yes** |
| `RESEND_API_KEY`, `EMAIL_FROM` | Transactional email. Optional | **Key: yes** |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME` | WhatsApp. Optional | **Token: yes** |

The three Razorpay values are optional. Without them the site runs exactly as
it does with no prices set: packages show no rate, no checkout opens, and
advertisements reach the office with nothing to collect.

`SUPABASE_SERVICE_ROLE_KEY` must never be given a `NEXT_PUBLIC_` prefix. The module
that reads it imports `server-only`, so importing it from client code is a build error.

### 3. Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

Without Supabase credentials the site still builds and runs — it shows an explicit
"database not connected" notice rather than inventing placeholder listings.

### 4. Make yourself an administrator

Sign up at `/sign-up`, then in the Supabase **SQL Editor**:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

The SQL Editor connects without a JWT, which the schema treats as a trusted
connection — this is the only way the first administrator can be created, since
promoting a user normally requires an existing administrator.

---

## Commands

| Command | Purpose |
| ------- | ------- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:test` | Apply the migrations to a scratch Postgres and assert the security policies |
| `npm run e2e` | Playwright, against a production build on port 3400 |
| `npm run e2e:db` | The admin and moderation flows, against a real local database |
| `npm run verify` | Typecheck, lint, build and end-to-end, in that order |

`db:test` needs a local Postgres 16 and `psql`; it never touches Supabase. It
applies every migration to a scratch database and runs **386 assertions**: 22 in
`rls_checks.sql` from Phase 1, 103 in `backend_checks.sql` covering the ten
escalation attacks, consent, payments, reports, favourites, the audit trail,
storage paths, slug issuance and reference format, and 60 in
`moderation_checks.sql` covering the transition table, the moderation call, the
audit note, what each role may read, what an advertiser may correct, staff
corrections, that every category and location the site offers exists, and what
the public can see at every step; and 44 in `lifecycle_checks.sql` covering run
lengths, the sweep's idempotency, renewal timing and ownership, both renewal
paths, the administrator overrides and every refusal between two advertisers;
and 41 in `payment_checks.sql`, which is the payment security review written as
assertions rather than performed once by hand — the price the client tried to
name, the advertisement that was not theirs, the forged settlement call, the
callback that arrived twice, the late failure notice for a payment already
captured, the re-priced package that must not rewrite an old receipt, and the
renewal approved without paying; and 50 in `notification_checks.sql`, which
covers the two things notification systems actually get wrong — telling
somebody twice, and letting one person read another's post — along with the
sweep that must not remind daily, a payment message that must never claim
publication, and a channel with nowhere to send; and 48 in
`analytics_checks.sql`, which builds a known set of advertisements, payments
and decisions and checks the counting against hand-worked answers, because an
analytics bug does not crash anything — it quietly reports a number somebody
then plans against. It also asserts the two refusals that matter: an advertiser
sees no figure at all, and a moderator sees the queue but not the money. It
ends by proving the audit revoke described below is real: an advertiser can
write neither through `write_audit()` nor through the guarded shim, and an
export by an administrator does reach the trail; and 14 in
`security_checks.sql`, which asserts the rate limiter at its boundary — the
request that is still allowed and the very next one that is not — that one
caller's limit does not affect another's, that a closed window starts the count
again from one, and that nobody can read or reset their own counter.

`e2e` runs 194 checks against a production build. Beyond the pure-function
suites, `navigation.spec.ts` walks every link in the header and footer, and
`seo.spec.ts` reads the served HTML: that each public page carries its own
title, description, canonical, Open Graph and Twitter card; that the JSON-LD
parses and invents no rating, opening hours or coordinates; that a filtered
view is `noindex` while page two is not; that a missing advertisement answers a
real 404; that every URL in the sitemap resolves; and that no share card
carries an advertiser's telephone number. `security.spec.ts` checks the
headers and that the content policy does not break any page;
`accessibility.spec.ts` runs axe-core at WCAG 2.1 AA over nine pages and an
advertisement page, with keyboard and heading-structure checks beside it; and
`mobile.spec.ts` asserts no horizontal overflow at 360, 414, 768 and 1280 px.

`e2e` needs a browser once: `npx playwright install chromium`.

`e2e:db` needs the same local Postgres plus a [PostgREST](https://postgrest.org)
binary on `PATH` (or `POSTGREST_BIN`). `e2e/db/harness` rebuilds a database
from the migrations and a fictional seed, puts a real PostgREST in front of it
— so every request goes through the same roles, grants, RLS and functions as on
Supabase — and adds a small gateway for password sign-in. The app is built
separately into `.next-db`. Thirty-five tests sign in as an administrator, a
moderator and an ordinary advertiser and walk the office and the lifecycle end
to end: refusal of non-staff, direct API attempts to approve or extend, the
queues, approve / reject / request changes, reports, public visibility before
and after each decision, the expired-advertisement page, expiring soon, early
and late renewal, the expiry sweep run twice, extension and manual expiry, and
every page at phone width.

`e2e` also runs two suites of pure functions with no browser:
`e2e/unit/expiry.spec.ts`, the expiry wording — run it with
`TZ=America/Los_Angeles` to see that the answers are Indian dates whatever the
machine's clock says — and `e2e/unit/payments.spec.ts`, the payment
signatures, which checks a genuine callback, one signed with another secret,
one for another order, one for another payment, a webhook body that has been
through `JSON.parse` and back, and a body altered by a single character.

`e2e/navigation.spec.ts` walks the site's own menus and asks the server for
every link in them. It exists because eight header and footer links — on every
page — answered 404 for several phases without a typecheck, a build or a test
noticing: the pages they point at do not exist, and nothing but a request finds
that out.

---

## Deploying to Vercel

1. Push this repository to GitHub.
2. In Vercel: **Add New → Project → import the repository**.
3. Add the four environment variables above under **Settings → Environment Variables**.
   Leave `NEXT_PUBLIC_SITE_URL` blank to derive it from the deployment URL, or set it
   to your custom domain once connected.
4. Deploy, then add your domain under **Settings → Domains** and follow the DNS
   instructions at your registrar.

### Scheduling the notification worker

`vercel.json` calls `/api/cron/send-notifications` hourly, with the same
`CRON_SECRET` as the expiry sweep. One call does two jobs: it raises the
expiry reminders that are due, then drains the send queue — including the ones
just raised. Both are idempotent, so a scheduler that fires twice, overlaps
itself or retries after a timeout does no harm.

Without the secret the endpoint refuses everything. An endpoint that sends
email to whoever asks is a spam relay with extra steps.

### Scheduling the expiry sweep

Public pages stop showing an advertisement the moment its date passes — that is
`public_ads`, not a job. The sweep is the bookkeeping: it moves the row to
`expired` and writes "expired automatically" in its history. It is idempotent,
so any of these, or more than one, is safe:

- **Vercel Cron** — `vercel.json` calls `/api/cron/expire-advertisements` daily
  at 00:00 IST. Set `CRON_SECRET` on the project; Vercel sends it.
- **pg_cron** — `supabase/scheduling/pg_cron_expiry.sql` schedules it inside the
  database, hourly. Not a migration; run it once if you want it.
- **Anything else** — `curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/expire-advertisements`.
- **By hand** — "Run expiry check now" on `/admin/advertisements/expired`.

### The Razorpay webhook

Create it in the Razorpay dashboard under **Settings → Webhooks**, pointing at
`https://your-domain/api/payments/webhook`, subscribed to `payment.captured`,
`payment.failed` and `order.paid`. Put the secret it gives you in
`RAZORPAY_WEBHOOK_SECRET` — it is a *different* secret from the API key secret.

Without it configured the endpoint answers 503 rather than 200, so Razorpay
keeps the event and retries once the secret is set, instead of deliveries being
lost quietly while nobody notices.

The route reads `request.text()` and never `request.json()`. The signature is an
HMAC over the bytes exactly as they arrived, and a body that has been parsed and
re-serialised is a different sequence of bytes. Parsing before verifying is the
most common way this check is got wrong, and it fails in the worst direction —
because the obvious "fix" is to stop checking.

Vercel's free Hobby plan is intended for non-commercial use — a business site
normally needs the Pro plan. Please confirm current terms on Vercel's pricing page.

---

## Architecture

### Authorisation lives in the database

Every table has row-level security enabled. The application always connects with
the anon key, never the service role, so a bug in a page cannot expose an
unapproved advertisement or another user's data. `supabase/test/rls_checks.sql`
and `supabase/test/backend_checks.sql` assert these guarantees.

Database-enforced rules include: an advertiser cannot approve their own
advertisement, cannot grant themselves featured placement, cannot promote
themselves to administrator, cannot extend their own advertisement's expiry or
rewrite its view count, cannot change its package or the price stamped on it, and
cannot choose its URL or its reference; editing a live advertisement returns it to
the review queue; a rejected advertisement must carry a reason.

### The server never trusts the client

`user_id` comes from a verified token. `status` is always `pending` on submission,
and a trigger refuses anything else. `slug` and `reference` are issued by the
database — and migration 0007 revokes the privilege to insert them at all, so a
statement naming one is refused before a row is built. The price is read from the
package record by a trigger. Submission re-validates with the same zod schema the
browser used, so the two cannot disagree about what a valid advertisement is.

### The public read path honours consent in SQL

Public pages read `public_ads`, a view that applies "approved and not expired" in
SQL and returns NULL for a telephone number the advertiser chose not to publish.
Contact email is not in the view at all. The contact columns are revoked from
`anon` and `authenticated` at the table, so the interface is never handed a number
it would have to remember to hide. Two companion views say the rest in SQL:
`owner_ads` (your own, any state) and `moderation_ads` (everything, staff only).

### Storage ownership is the path

Every object is stored at `<user id>/<advertisement id>/<file>`, and the storage
policies compare the first segment against `auth.uid()`. Uploads are sniffed for
their actual content before they are stored, and the extension comes from that
rather than from the file name the client sent — `ad-images` is a public bucket,
and a file served from the site's own origin under a name the client chose is how
an "image" upload becomes stored HTML. Display artwork goes to a separate private
bucket: it is commercially sensitive before publication, and frequently a PDF.

### Moderation is a transition table, not a status column

Which states an advertisement may move between is written down once, in
`is_permitted_ad_transition()`, and enforced by a trigger for everybody the
guard applies to — staff included. `rejected → approved` is absent, so a
refusal cannot be quietly undone in one step; the way back is through the
queue. `expired → approved` is absent, because bringing a finished
advertisement back is a renewal, and a renewal goes through review.

A decision is one call: `moderate_advertisement(id, action, note)`. It re-checks
the role, re-checks the transition, refuses a rejection with no reason, and
writes the audit entry in the same transaction as the change. That is not
tidiness — PostgREST gives every request its own transaction, so a decision sent
as one call and its explanation sent as another can come apart, leaving either
a status change nobody can account for or a note about a change that never
happened.

### The lifecycle is the existing states, plus dates

There is no `published` status: published is `approved` with a `published_at`,
and it is public while `expires_at` is in the future. Approval sets both, in the
database — `published_at` is the approval time and `expires_at` adds the
package's `duration_days`, or `ads.default_duration_days` when the package has
none. The browser never sends a date; the guard discards one if it tries.

Renewal is a request, never a republish. `request_renewal()` checks ownership,
the package and whether the advertisement is due (expired, or live within
`ads.expiring_soon_days` of its end). An expired advertisement goes back to
`pending` and is published afresh on approval; a live one stays up and its run
is extended from its current end. Each request is a row in `ad_renewals`, so the
history survives every later change. Extending a run and marking one expired are
administrator actions that need a reason and are written to the audit trail with
both dates or both statuses. Every status change carries a lifecycle event name
(`expired_automatically`, `expired_manually`, `republished`, …) so the history
reads as what happened.

### A notification is written with the event; sending it is not

The row that says an advertisement was approved is written by a trigger on the
same statement that approved it, inside the same transaction — so there is no
approval that failed to produce a notification, whichever of the several paths
to approval was taken. The email about it is a queued row in
`notification_deliveries`, drained afterwards by a worker. A provider that is
down, slow or misconfigured therefore cannot roll back an approval, fail a
payment or abort the expiry sweep.

Idempotency is a `dedupe_key` on every notification, unique per user and type,
with `on conflict do nothing` inside `raise_notification()`. A repeated
Razorpay webhook, a sweep run twice in a day and a moderator pressing Approve
on a stale page all write once. The expiring-soon reminder keys on the
advertisement's expiry *date*, so the hourly job sends one reminder per run —
and a renewal that moves the date earns a new one, which is a different run
ending rather than a bug.

Retries are bounded by `notifications.max_attempts` with exponential backoff
computed in the database, so the worker holds no timing logic. Claiming uses
`for update skip locked` and pushes `scheduled_at` forward, so two workers
cannot send the same email and a worker that dies mid-send leaves its rows to
be retried rather than locked for ever.

### Channels are a choice; the notification centre is not

Preferences are three groups — your advertisements, payments, expiry reminders
— rather than one switch per type, because three is what somebody actually has
an opinion about. WhatsApp defaults to off for all of them: a message to
somebody's telephone is not something to opt them into.

In-app has no switch at all. It is the record of what the office did to your
advertisement, and a customer who has turned every channel off must still be
able to find out why theirs was refused.

A channel with nowhere to send — no email address on the account, no telephone
number — is not queued at all, rather than queued and failed. There is nothing
for a worker to retry.

### A WhatsApp notification must be an approved template

Meta permits free text only within 24 hours of a customer writing to you, which
is never the case when an advertisement is approved at ten in the morning.
`WHATSAPP_TEMPLATE_NAME` is therefore not optional in practice, and a
configuration without it reports that plainly instead of collecting refusals
from the provider one message at a time. The template takes three body
parameters: the advertiser's name, the message, and a link back to this site.

### Payment is verified on the server, twice over

A payment's status moves only through `settle_payment()` and `close_payment()`,
and both refuse anyone who is not the trusted connection — EXECUTE is revoked
from `anon` and `authenticated` as a second answer to the same question. What
the browser is told by Razorpay's script is a claim by a script; what is
written down is that claim after an HMAC check against the account secret,
which the browser does not hold.

There are two independent paths to settlement and they end in the same
function. The checkout callback is the fast one; the webhook is the reliable
one, and it is what settles a customer whose connection dropped between paying
and returning. Implementing the business logic twice, slightly differently, is
the classic way this goes wrong, so there is one `settlePayment()` and both
paths call it.

### `paid` is terminal, and that is what makes it idempotent

`is_permitted_payment_transition()` is a transition table in the same spirit as
`is_permitted_ad_transition()`, and its content is its absences. `paid → failed`
is not in it. That single absence is what makes a repeated callback, a second
tab, a refresh after payment, a retried webhook and a late `payment.failed`
notice all harmless — without a line of application code deciding whether
something has been seen before. `failed → paid` and `cancelled → paid` *are*
permitted, because Razorpay may capture a payment after the browser gave up on
it, and money having arrived is the fact that matters.

Webhook deliveries also claim their event id in `payment_webhook_events` before
doing anything, and release the claim if processing fails so that Razorpay's
retry gets another go. No payload is stored: a Razorpay payment entity carries
the payer's email, telephone number and card metadata, and none of that is ours
to keep.

### A price is never a number the browser sent

The payment row is inserted *before* the Razorpay order is created, so the
amount is stamped by `stamp_payment_amount()` from the `packages` table and the
order is then raised for what the database found. A client that names a price
names it into a column that is overwritten before it is stored. The figure the
checkout displays is the figure the order was created for, and Razorpay charges
against the order.

Money is an integer of paise everywhere — a price that is a float is a price
that eventually reads ₹198.99999 on somebody's receipt. Only the last step,
showing it to a person, divides.

### An old receipt does not change when the rates do

Every payment carries its own `amount_paise`, `package_name` and
`package_duration_days`, copied when the order was raised. An office that
re-prices Standard from ₹199 to ₹249 next year does not rewrite what a receipt
from this year says it bought. `/admin/packages` says so above the form, and
`payment_checks.sql` asserts it.

### Paying is not publishing

Payment and moderation are separate states, and paid + awaiting review is an
ordinary, correct one. Nothing in the payment path touches an advertisement's
status — settlement writes to `payments` and stops. The receipt says both
things rather than leaving somebody to infer that paying published their
advertisement.

The one place the two meet is the other way round: a renewal on a priced
package cannot be *approved* until it has been paid for. That is a trigger on
`ad_renewals` rather than a check inside `approve_renewal()`, because extending
a run is the thing of value and there is more than one way to reach it.

### The receipt is read from the database, not from the URL

`/my-ads/payments/[id]` re-reads the payment every time it is opened, so a
refresh, a second tab and a bookmark all show what actually happened. A page
that says "Payment successful" because of its own address is a page that will
eventually say it to somebody who was charged nothing.

### Staff correct wording; advertisers change facts

`correct_advertisement()` lets the office fix a title, description, category or
location — never price, contact details or photographs, which stay the
advertiser's and go back to them with "Request changes". A note is required and
lands in the history with the moderator's name. A correction does not change
the status: fixing a typo on a pending advertisement is not approving it.

### An advertiser corrects their own advertisement, within limits

`/my-ads/[id]/edit` re-validates with the same zod schemas the submission form
uses, so an edit cannot produce something the original form would have refused.
Whether the advertisement is yours is answered by `owner_ads` filtering on
`user_id = auth.uid()` inside the database — there is no ownership check in the
page to forget. Editing a live advertisement returns it to the queue, by
trigger. A finished advertisement is not editable at all: reviving one is a
renewal, and the guard refuses `expired → pending` from its owner so that the
page's promise is enforced rather than merely stated.

### The office and the public read different views

`moderation_ads` carries the advertiser's email address and telephone number
and returns nothing unless `is_staff()`. `public_ads` nulls a withheld number
and has no contact email at any consent level. The admin review page
deliberately does not reuse the public advertisement component: sharing one
would mean either that the office cannot see what it needs, or that somebody
widens the public component "just for admin" and the widening ships to the
reading side.

### Three independent checks guard the admin area

`src/proxy.ts` reads the caller's role and issues a real HTTP redirect before
any page renders. The admin layout asks again, for the day a route is added and
the proxy's matcher is not. And the database refuses regardless — the admin
views return nothing and every moderation call raises. The third is the one
that matters; the first two are a better experience. Being on `/admin` has never
made anybody staff.

### The audit trail is append-only

`audit_log` records every status change, role grant, block, payment settlement,
report resolution and report export, with the actor read from the verified token.
UPDATE and DELETE are revoked and a trigger raises on either, because an audit
trail somebody can quietly edit is decoration.

`write_audit()` is SECURITY DEFINER and was created in migration 0006 without a
grant, which in Postgres means EXECUTE to PUBLIC — so any signed-in account
could have written whatever it liked into the trail, including an approval
attributed to a moderator who never made it. Migration 0015 revokes that. The
existing callers are all trigger functions that are themselves SECURITY DEFINER,
so nothing else changed.

### Every figure is counted, and what is not counted says so

Nothing on the analytics pages is sampled, seeded, projected or rounded up from
a guess. Each panel is one call to one SQL function that counts real rows, and
the definitions it counts to are written beside the number rather than in a
document nobody opens: revenue is settled payments only, by the date the money
was taken; the approval rate divides by the decisions actually made in the
period; the renewal rate divides by the advertisements whose run **ended** in
the period, not by every advertisement on the site.

Where the site does not measure something, the panel says so instead of drawing
a plausible line. Three things are named on the dashboard as not measured: a
reader tapping a telephone or WhatsApp number, views inside a chosen period
(each advertisement keeps one running total, not a row per view), and revenue by
town. The "people who…" figures are counts of distinct people who did each thing
in the period, not a cohort followed through, so the page prints them as counts
and refuses to divide them into a conversion rate.

A query that fails or is refused returns `null`, never a zero. This matters most
for a moderator, who is refused revenue in the database: a refusal rendered as
`₹0` would put a figure on the screen that nobody counted.

### A moderator sees the queue; the money is the administrator's

`require_analytics_reader()` admits staff and trusted connections.
`require_revenue_reader()` admits administrators and trusted connections, and
guards `analytics_overview`, `analytics_timeseries`, `analytics_by_package`,
`analytics_by_category` and `analytics_funnel`. The dashboard also declines to
render those panels to a moderator, and the report registry marks them
`adminOnly` so the page and the CSV route both refuse — but the refusal that
holds is the one in Postgres, which a moderator meets whatever route they take
to the function.

### Searches are recorded; searchers are not

`search_events` has a term, a result count, a category and a timestamp. There is
no user id, no session id and no address, so it cannot become a record of what a
named person was looking for, even by a later change of mind. Recording happens
from the browser once results are on screen — a server render also happens for
prefetches and metadata, which would turn a hover into a search somebody made —
and only for the first page of results, because pages two and three of one
search are the same question. The category is resolved from its slug on the
server; a caller never hands over a uuid. `analytics.search_retention_days` in
`app_settings` decides how long the log is kept (ninety days by default) and the
daily sweep prunes it, because a retention period only enforced when somebody
remembers to run it is not a retention period.

### An export is a thing that happened

Taking figures out of the building is written into the audit trail before the
file is sent: who, which report, over what dates, how many rows. The CSV route
checks the caller's role itself rather than relying on the admin layout — a route
handler does not render inside a layout — and checks the report's own
restriction again on top of that. The file carries every row the report and
filter return, not the page the reader happened to be on, because a spreadsheet
of fifty rows out of four hundred with nothing to say so is how a wrong figure
ends up in a plan.

Money is written as rupees with two decimals and no symbol, so a spreadsheet can
add the column up. Any cell beginning `=`, `+`, `-`, `@`, a tab or a carriage
return is prefixed with an apostrophe: this export carries text the public typed,
and a search term beginning `=HYPERLINK(...)` would otherwise become a live
formula in the office's spreadsheet.

### The escaping that stands between an advertiser and a script block

`JSON.stringify` escapes quotes and backslashes and nothing else. Two JSON-LD
emitters wrote its output straight into a `<script>` element, so an
advertisement titled

    Flat for rent </script><script>…</script>

ended the script element early and had the rest parsed as HTML — stored
cross-site scripting on the public advertisement page, reachable by anyone who
could submit an advertisement. Titles deliberately allow `<`, because it is a
legitimate character to type, so the fix belongs at output:
`serialiseJsonLd()` escapes `<`, `>`, `&` and the two line separators that are
valid in JSON but terminate a JavaScript string. Every JSON-LD block in the
application goes through it, and `e2e/unit/security.spec.ts` proves both that
the dangerous sequences cannot survive and that parsing the output returns
exactly what went in.

### Rate limiting lives in Postgres, and stores no addresses

The obvious rate limiter is a counter in memory. On a serverless host it is
close to useless — every instance keeps its own, instances come and go between
requests, and requests sent in parallel are spread across instances that each
see a handful. It looks like protection in a code review and stops nobody.

So the counter is a table, because the database is the one thing every instance
shares, and consuming a unit is a single atomic statement: two simultaneous
requests get 1 and 2, never 1 and 1. The caller's address is hashed with a
server-side salt before a key is built, so `rate_limits` holds opaque strings
and cannot be read back as "who tried to sign in on Tuesday".

Every limit is set where a person will never reach it. The failure that matters
is not "an attacker got through" but "somebody in an internet café could not
sign in because a stranger on the same address already had". The limiter also
fails **open**: if the database is unreachable the request is allowed, because a
limiter that becomes an outage has done more damage than the abuse it guarded
against.

### The content policy, and its one honest compromise

`script-src` includes `'unsafe-inline'`. A nonce-based policy is stricter and is
what Next.js documents, but a nonce can only be injected during server
rendering — so every statically rendered page would receive a policy naming a
nonce its already-built HTML does not carry, and every script on it would be
blocked. The alternative is making the whole site dynamic, which costs real
speed on exactly the pages search engines fetch most.

This is defence in depth rather than the last line. The last line is that the
application renders no user-supplied HTML anywhere, and the one place user text
enters a `<script>` is the JSON-LD serialiser described above. `frame-ancestors
'none'`, `object-src 'none'`, `base-uri 'self'` and `form-action 'self'` are
unconditional. `e2e/security.spec.ts` asserts the headers are present AND that
no page is broken by them — a policy that silently blocks one script is the
failure mode worth testing for.

### Every indexable page states its own address

`lib/seo/metadata.ts` builds the title, description, canonical URL, Open Graph
card and Twitter/X card from one set of facts, so they cannot drift apart —
a page whose description matches on the page but not in the share card is the
usual result of spelling all three out by hand. There is deliberately **no
default description**: a page that does not supply one gets no description tag
rather than the site's boilerplate repeated forty times, and `/admin/seo` finds
the omission.

No `twitter:site` or `twitter:creator` is emitted. This business has no X
account recorded anywhere in the project, and an invented @name points at
somebody else.

### The listing URLs that ask to be ranked are a whitelist

A browse page takes a category, a place, a price range, a posted-within window,
a type, a sort order, a page number and any number of category facets.
Multiplied out that is tens of thousands of URLs over a few hundred
advertisements — the doorway-page problem arrived at by accident.

So `lib/seo/listing.ts` indexes the sections themselves, the location landing
pages, and their numbered pages. Everything a visitor narrowed — a search term,
a price band, a sort order, a facet — is `noindex, follow` and canonicalises to
the clean section it is a view of. Pagination goes the other way on purpose:
page two is indexed and canonical **to itself**, because it holds different
advertisements from page one and saying otherwise would claim a hundred
advertisements were a duplicate of twelve.

### A location page has to earn its existence

Nine categories by nine places is eighty-one URLs that could be generated in a
loop, most of them empty. `lib/seo/landings.ts` gives a pair a page only when it
has at least three live advertisements. Below that the URL still **works** —
somebody who filtered their way there gets a real page with the real, small list
— but it says `noindex` and stays out of the sitemap. Only a slug that is not a
real category or a real place is a 404.

### A missing advertisement returns a real 404, and that needs the proxy

Next.js 16.3.5 begins streaming as soon as the shell renders, and this site's
shell reads the session to draw the account menu. By the time a page discovers
its advertisement is missing the `200` has been sent, and the status cannot be
changed — `notFound()` renders the right page and injects `noindex`, but the
response is a soft 404. This was verified against a built server rather than
assumed; the response carries `Transfer-Encoding: chunked`.

Next's own documentation names the remedy: check before the response streams,
in `proxy`. So `lib/seo/missing.ts` settles the question there. It is kept
cheap — a category-and-place path is decided from configuration with no query
at all, and only an advertisement slug costs one indexed lookup. On any database
error the answer is "exists": a wrong 404 is far more expensive than a wrong
200, because Google removes the URL over it.

The 404 itself is served by `/classifieds/unavailable`, a Route Handler, because
a route handler can set its own status where a page cannot. It is a
self-contained document with inline CSS — it cannot use the React layout — which
in exchange makes it impossible for it to fail.

An advertisement that has merely **expired** is not missing. It keeps its URL and
answers 200 with "Advertisement expired" and `noindex`, because that address has
been printed and sent over WhatsApp, and a 404 would be less true than a page
saying what happened.

### Structured data describes only what the project knows

`Organization`, `WebSite` and `BreadcrumbList` site-wide, `LocalBusiness` on the
contact page, `ItemList` on the listing pages, and `Product` on an
advertisement. The rule is stricter than the vocabulary: schema.org will happily
accept an `aggregateRating`, `openingHours`, `geo` or `priceRange`, and this
office has none of them written down, so none is emitted. An advertisement with
no price gets no `offers` block rather than one containing a zero. A guessed
coordinate pair puts a pin on somebody else's shop.

The `SearchAction` is declared because the search it describes genuinely works:
`/classifieds?q=` is a real server-rendered query, not a JavaScript-only box.

### robots.txt blocks two things, and that is the point

Only paths a crawler would be redirected away from anyway (`/admin/`,
`/my-ads/`, `/dashboard/`) and machinery (`/api/`, `/auth/`, `/search`).

The sign-in forms, the post-advertisement form, expired advertisements and every
filtered view are left crawlable on purpose. Each says `noindex` in its own
metadata, and **a crawler has to be allowed to fetch a page in order to read
that**. Blocking them here would leave the URLs eligible to be indexed from a
link elsewhere with no way for Google to discover we did not want them. An
earlier version of this file disallowed `/account/`, a path this site does not
have.

### The sitemap is split before it needs to be

`/sitemap.xml` carries the pages that do not change one at a time — home,
sections, the information pages and whichever location landing pages currently
qualify. Advertisements are split across `/classifieds/sitemap/0.xml` onwards,
five thousand to a file, through Next's `generateSitemaps`; every file is named
in `robots.txt`. Each entry carries the advertisement's own `updated_at` as its
`lastmod`, because a sitemap that stamps everything with today teaches crawlers
to ignore its dates.

### /admin/seo reports no ranking

There is no SEO score, no keyword position, no impression count and no traffic
estimate, and their absence is the point: rankings live in Google's index and
impressions live in Search Console. A number invented here would be read as a
measurement and planned against. What it does report is everything decidable
from the site's own rows — duplicate slugs, slugs that collide with a section,
descriptions too short to make a snippet, sections with nothing in them,
navigation pointing at pages that do not exist.

### Two different things are called a report

`/admin/reports` is the reader-report queue — what somebody flagged as a fraud or
a duplicate — and it was there first. The business figures are at
`/admin/analytics/reports`. Putting the month's revenue where the moderators look
for complaints would be a confusion that lasted for years, so the sidebar calls
the first one "Reported advertisements".

### Contact details sit on the advertisement, not the profile

`profiles` is readable only by its owner and staff. Contact name, phone, WhatsApp
and email are columns on `ads`. A phone number therefore cannot leak through the
profiles table, and an advertiser can use different numbers on different ads.

### Category-specific fields use JSONB

Property ads need bedrooms and area; vehicles need year and kilometres. These live
in `ads.attributes` (JSONB, GIN-indexed) so adding a category never needs a
migration.

### Business values live in `app_settings`

Advertisement duration, image limits, the office address, phone numbers and
WhatsApp number are database rows, not constants. Changing the office phone number
is an UPDATE, not a deployment.

The footer reads them through `getOfficeDetails()`, with `src/config/site.ts` as
the fallback — field by field, so an unset row falls back to the value printed in
the paper rather than blanking the address. Those constants are what the site
falls back to, not what it shows.

### Full-text search uses the `simple` dictionary

Advertisement copy is frequently Hindi. The `english` dictionary would stem Hindi
words incorrectly, so the generated `search_vector` column uses `simple`, which
indexes both scripts. Titles are weighted above descriptions.

### Design tokens, two layers

`@theme` holds the raw palette; `@theme inline` maps semantic names (`surface`,
`fg-muted`, `primary-solid`, `critical-surface`) onto CSS variables. Components
reference only semantic tokens, so light and dark mode is a variable swap rather
than a `dark:` variant on every element. Dark mode follows the system setting and
can be overridden with `data-theme` on `<html>` when a toggle is added.

All text colour pairs were checked against WCAG AA (4.5:1) in both themes.

### Fonts are self-hosted

IBM Plex Sans, IBM Plex Sans Devanagari and Source Serif 4 ship as woff2 files in
`src/assets/fonts` and load through `next/font/local`. No third-party request on
first paint, and the Devanagari face means Hindi advertisement copy renders
properly rather than falling back to a system font.

---

## Project layout

```
src/
  app/
    (auth)/                sign in, sign up, password reset, and their actions
    auth/                  callback and sign-out route handlers
    classifieds/           browse, one advertisement, report, view and search actions
    my-ads/                the advertiser's dashboard, expired list, detail, renew, edit and payments
    admin/analytics/       the dashboard, the detailed reports and the CSV export
    admin/seo/             what the site looks like to a search engine
    classifieds/[slug]/[location]/
                           section-and-place landing pages, where inventory earns one
    classifieds/unavailable/
                           the genuine 404 for a missing advertisement
    opengraph-image.tsx    the generated share card
    sitemap.ts, robots.ts  the main sitemap and the crawl rules
    api/cron/              the expiry sweep (and the search-log prune) endpoint
    api/payments/          create-order, verify, and Razorpay's webhook
    post-ad/               the submission form and its server action
    about/, advertise/,    the public information pages, built from config/site.ts,
    contact/                 app_settings, ad-types and the packages table
  components/
    advertisements/        card, gallery, contact, report modal, view counter
    analytics/             line and bar charts, KPI card, funnel, range picker, empty states
    auth/                  account forms, header actions, sign-in panel
    classifieds/           filters, sorting, pagination, results
    layout/                header, footer, mobile nav
    post-ad/               the eight-step form
    lifecycle/             expiry badge and notice, renewal history and form, timeline
    notifications/         the bell, the mark-all control and the preferences form
    payments/              the checkout panel and the payment status badge
    site/                  the office's own details, shared by those pages
    ui/                    button, badge, container, field, icons, states
  lib/
    analytics/             ranges in the office's own day, the queries, the report registry
    security/              headers and the content policy, rate limits, structured logging
    seo/                   metadata and JSON-LD builders, indexing policy, landings, audit
    auth/                  session reading and the account schemas
    classifieds/           query parsing, filters, similarity — pure functions
    data/                  data access — public_ads, owner_ads, packages, settings
    lifecycle/             expiry wording in Indian calendar days, dashboard figures
    notifications/         templates, the two providers, and the queue worker
    payments/              Razorpay client, signatures, order and settlement service, webhook
    post-ad/               schema, state, drafts, file rules, content sniffing
    supabase/              browser, server, anonymous and service-role clients
    env.ts                 zod-validated environment access
  types/                   content and database types
supabase/
  migrations/              numbered, run in order
  test/                    local validation harness (never applied to Supabase)
  scheduling/              optional pg_cron schedule for the expiry sweep
  seed/                    development-only package rates; NOT a migration
e2e/                       Playwright, against a production build
  navigation.spec.ts       every link in the header and footer, asked of the server
  seo.spec.ts              the tags a search engine actually receives, read from
                             served HTML: canonicals, JSON-LD, status codes, sitemaps
  security.spec.ts         the headers, and whether the policy they carry lets
                             the site work
  accessibility.spec.ts    axe-core at WCAG 2.1 AA, plus keyboard and headings
  mobile.spec.ts           horizontal overflow at four widths, tap targets, inputs
  unit/                    pure functions — expiry wording, payment signatures,
                             notification templates and escaping, date ranges,
                             the CSV, and which listing URLs ask to be indexed
  db/                      the admin suite, against a real local database
    harness/               seed, PostgREST launcher, auth gateway, build
```

## Regenerating database types

Once the project is linked, replace the hand-written types:

```bash
npx supabase gen types typescript --project-id <id> --schema public > src/types/database.ts
```

## A note on advertiser liability

The footer carries the same disclaimer as the printed edition: advertisers are
responsible for their own content and readers should verify claims independently.
Keep it — it is there for a reason.
