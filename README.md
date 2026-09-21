# Shree Classified — classified advertising platform

Digital classifieds for **Shree Advertising & Marketing**, Roorkee.

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 · Supabase (Postgres, Auth, Storage) · deployed on Vercel.

---

## Build status

**Phases 1 to 8 are complete.** The site reads and writes real data, the
office has somewhere to work, and every advertisement has a lifecycle: a run
calculated on approval, automatic expiry, renewal through review, and
administrator overrides with an audit trail.

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
| 9 | Payments integration, notifications, analytics | Not started |

### Routes

| Route | What it is |
| ----- | ---------- |
| `/` | Home |
| `/categories` | Category index |
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
| `/api/cron/expire-advertisements` | The expiry sweep, for a scheduler; needs `CRON_SECRET` |
| `/admin/advertisements/[id]` | One advertisement, and the decisions available on it |
| `/admin/reports` | Reader reports |
| `/admin/activity` | The moderation history |
| `/admin/categories`, `/admin/users` | Administrators only |

### Not built yet, by instruction

The payment provider integration, notifications and analytics. The schema for
payments is in place and tested — what is missing is the provider, not the
record it would settle against. Renewal chooses a package but charges nothing;
packages carry a duration, and their price stays unset until the office supplies
rates.

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
applies every migration to a scratch database and runs **229 assertions**: 22 in
`rls_checks.sql` from Phase 1, 103 in `backend_checks.sql` covering the ten
escalation attacks, consent, payments, reports, favourites, the audit trail,
storage paths, slug issuance and reference format, and 60 in
`moderation_checks.sql` covering the transition table, the moderation call, the
audit note, what each role may read, what an advertiser may correct, staff
corrections, that every category and location the site offers exists, and what
the public can see at every step; and 44 in `lifecycle_checks.sql` covering run
lengths, the sweep's idempotency, renewal timing and ownership, both renewal
paths, the administrator overrides and every refusal between two advertisers.

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

`e2e` also runs `e2e/unit/expiry.spec.ts`, the expiry wording as pure
functions — run it with `TZ=America/Los_Angeles` to see that the answers are
Indian dates whatever the machine's clock says.

---

## Deploying to Vercel

1. Push this repository to GitHub.
2. In Vercel: **Add New → Project → import the repository**.
3. Add the four environment variables above under **Settings → Environment Variables**.
   Leave `NEXT_PUBLIC_SITE_URL` blank to derive it from the deployment URL, or set it
   to your custom domain once connected.
4. Deploy, then add your domain under **Settings → Domains** and follow the DNS
   instructions at your registrar.

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

`audit_log` records every status change, role grant, block, payment settlement and
report resolution, with the actor read from the verified token. UPDATE and DELETE
are revoked and a trigger raises on either, because an audit trail somebody can
quietly edit is decoration.

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
is an UPDATE, not a deployment. The footer and header read from this table.

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
    classifieds/           browse, one advertisement, report and view actions
    my-ads/                the advertiser's dashboard, expired list, detail, renew and edit
    api/cron/              the expiry sweep endpoint
    post-ad/               the submission form and its server action
  components/
    advertisements/        card, gallery, contact, report modal, view counter
    auth/                  account forms, header actions, sign-in panel
    classifieds/           filters, sorting, pagination, results
    layout/                header, footer, mobile nav
    post-ad/               the eight-step form
    lifecycle/             expiry badge and notice, renewal history and form, timeline
    ui/                    button, badge, container, field, icons, states
  lib/
    auth/                  session reading and the account schemas
    classifieds/           query parsing, filters, similarity — pure functions
    data/                  data access — public_ads, owner_ads, packages, settings
    lifecycle/             expiry wording in Indian calendar days, dashboard figures
    post-ad/               schema, state, drafts, file rules, content sniffing
    supabase/              browser, server, anonymous and service-role clients
    env.ts                 zod-validated environment access
  types/                   content and database types
supabase/
  migrations/              numbered, run in order
  test/                    local validation harness (never applied to Supabase)
  scheduling/              optional pg_cron schedule for the expiry sweep
e2e/                       Playwright, against a production build
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
