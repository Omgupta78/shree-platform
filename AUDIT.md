# Final project audit — phases 1–13

Produced by inspecting the codebase at commit `0e6da9d`, not from memory of
having built it. Where something is marked verified, it was run: the test
suites were executed, the routes were fetched from a production build, the
queries were read.

No code was changed while producing this report.

**Verdict: one blocker, and it is not in the code.** Four legal pages do not
exist, and Razorpay will not activate live payments without three of them.
Everything else is either working, needs a credential, or is a judgement call
recorded below.

---

## What was run, not assumed

| Check | Result |
| --- | --- |
| `npm run typecheck` | Clean |
| `npm run lint` | Clean, zero warnings |
| `npm run build` | Compiles, 58 routes |
| `npm run e2e` | **199 passed** against a production build |
| `npm run db:test` | **386 assertions passed** across 8 suites |
| Every public route fetched | 17 routes, all 200 |
| Every private route fetched signed-out | 10 routes, all refuse with a sign-in panel |
| Every hidden route fetched | 7 routes, all 404 |
| Repository + full git history searched for secrets | None found |

---

## CRITICAL

### C1 — Four legal pages do not exist

**Path:** `src/config/navigation.ts` lines 36–39 (`built: false`)
**Missing:** `/privacy`, `/terms`, `/disclaimer`, `/report`

**Problem.** The routes do not exist and return 404. They are correctly hidden
from the menus, so nothing on the site is broken — but they are absent.

**Why it matters.** Razorpay's merchant onboarding requires Terms &
Conditions, a Privacy Policy and a Refund/Cancellation policy published on the
website before it will activate live payments. India's IT Rules additionally
require a privacy policy for an intermediary hosting third-party content, which
is exactly what a classifieds site is. `/report` is the public route for
flagging an advertisement; the reporting *mechanism* exists and is tested, but
it is reachable only from an advertisement page, not from a standing address.

**Recommended fix.** Write the four pages from the real business details in
`src/config/site.ts`, leaving anything that needs a commercial decision — the
refund window, the data-retention period — marked for the office to complete.
Then flip the four `built` flags. No new mechanism is required.

**Blocks launch: YES** for anything involving payment. The site could run as a
free classifieds board without them, but not with Razorpay live.

---

## HIGH

### H1 — Backups are not configured

**Path:** deployment, not code. Documented in `DEPLOYMENT.md` §3.

**Problem.** Supabase takes no automatic backups on the free plan. Storage
buckets (`ad-images`, `ad-artwork`) are not included in a database backup on
*any* plan.

**Why it matters.** Advertisers' photographs exist nowhere else. `payments` and
`audit_log` cannot be reconstructed from anything.

**Recommended fix.** Either a paid Supabase plan for daily database backups, or
scheduled `pg_dump` to storage you control. Copy the storage buckets
separately. Rehearse one restore into a scratch project before launch.

**Blocks launch: YES** in the sense that launching without it risks total,
unrecoverable data loss. It is not a code defect.

### H2 — Nothing has been tested against a real database

**Problem.** This container has no Supabase credentials, so every application
path that touches Supabase ran against the offline dataset or not at all. The
386 database assertions run against a local Postgres with the real migrations
applied, which covers the SQL thoroughly — but the seam between the application
and a live Supabase has never been exercised.

**Specifically unverified:** a real payment end to end, a real Razorpay webhook
and a duplicate of it, email delivery from a verified domain, a WhatsApp
template message, sign-up through to publication, and the database half of the
missing-advertisement 404.

**Recommended fix.** Run the journeys in a staging Supabase project before
pointing a domain at it.

**Blocks launch: YES.** Not because a defect is known, but because absence of
evidence is not evidence of absence.

---

## MEDIUM

### M1 — Two owner-facing lists load every row

**Paths:**
- `src/lib/data/my-ads.ts:66` — `getMyAdvertisements()`
- `src/lib/data/payments.ts:33` — `getUserPayments()`

**Problem.** Both select every row for the signed-in advertiser with no
`.range()` or `.limit()`. Every other list in the project pages: the public
browse (`public-ads.ts:199`), the admin queue
(`admin/advertisements.ts:180`) and admin payments (`payments.ts:91`) all use
`.range()`.

**Why it matters.** Bounded by one person's own activity, so it is not a
denial-of-service surface — but a business advertising weekly for three years
accumulates hundreds of advertisements and payments, and both pages would load
all of them into one response.

**Recommended fix.** The same `.range()` pattern already used three times
elsewhere in the same layer, plus the existing `AdminPagination` component.

**Blocks launch: NO.** It will be invisible for the first year.

### M2 — No error-monitoring provider

**Problem.** Errors are written as structured JSON to stdout and collected by
the host. Nothing alerts anybody.

**Why it matters.** A payment settlement failing at 2 a.m. is discovered when
an advertiser telephones the office.

**Recommended fix.** Sentry's Next.js SDK. `src/app/error.tsx` and
`src/app/global-error.tsx` are where a reporter is called. Deliberately not
added — it is a paid dependency and was not asked for.

**Blocks launch: NO.**

### M3 — Content-Security-Policy allows `'unsafe-inline'` for scripts

**Path:** `src/lib/security/headers.ts:48`

**Problem.** A nonce-based policy is stricter. A nonce can only be injected
during server rendering, so every statically rendered page would receive a
policy naming a nonce its already-built HTML does not carry, and every script
on it would be blocked. The alternative is rendering the whole site
dynamically.

**Why it matters.** It weakens CSP as a second line against cross-site
scripting.

**Why it is acceptable.** The application renders no user-supplied HTML
anywhere. The single place user text enters a `<script>` is the JSON-LD
serialiser, which escapes it and has its own tests (see C-fixed below).
`frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'` and
`form-action 'self'` are unconditional. `e2e/security.spec.ts` asserts both
that the headers are present and that no page is broken by them.

**Blocks launch: NO.** Recorded so the decision is visible rather than implied.

### M4 — No bot protection on public forms

**Problem.** Rate limiting exists (14 assertions). There is no CAPTCHA on
advertisement submission or sign-up.

**Why it matters.** A determined spammer with rotating addresses can still fill
the moderation queue.

**Recommended fix.** Revisit if spam appears. Every advertisement passes a human
moderator before publication, so the cost is the office's time, not public
exposure. The place to add it is `submitAdvertisementAction`.

**Blocks launch: NO.**

---

## LOW

### L1 — Dead module

**Path:** `src/lib/supabase/client.ts` (17 lines)

`createSupabaseBrowserClient()` is imported by nothing. All Supabase access in
the application is server-side. Harmless; keep it if realtime is planned, delete
it otherwise. **Blocks launch: NO.**

### L2 — The `/edition` feature is scaffolded but unbuilt

`src/lib/mock/editions.ts` holds placeholder edition data. It is correctly
gated: the homepage renders the panel only behind `isPageBuilt('/edition')`,
which is false, and the same flag hides the menu item. Nothing invented reaches
a visitor — verified by fetching the homepage. **Blocks launch: NO.**

---

## Specific items requested

### Mock data
`src/lib/mock/advertisements.ts` and `editions.ts`. The advertisements are the
documented offline fallback — the site runs on them when Supabase is not
configured, and says on screen that it is not connected. The editions are gated
off entirely (L2). **No mock data reaches a configured production site.**

### Hardcoded values
None found. Prices come from the `packages` table; business details from
`config/site.ts` overlaid by `app_settings`; the site origin from
`NEXT_PUBLIC_SITE_URL`. No stray hostnames outside the documented integrations.
The one literal that looks like a price, `format.ts:35`, is a display threshold
for compact notation.

### Fake statistics
None. Phase 11 removed the possibility structurally: every analytics query
returns `null` rather than `0` when it fails or is refused, and each panel
prints "Data not available yet" rather than a zero that reads as a measurement.
`/admin/seo` deliberately reports no ranking, score or traffic figure.

### Test credentials
None in the repository or in any of its 17 commits. Searched for
`rzp_live`/`sk_live`/JWT/private-key patterns across full history.

### Development-only code
`'unsafe-eval'` in the CSP, gated on `NODE_ENV === 'development'` and asserted
in both directions. `supabase/seed/dev_package_prices.sql`, which is explicitly
not a migration and is never applied automatically.

### Console/debug statements
No `console.log`, no `debugger`, no `alert()`. `console.error`/`warn` appear
only inside the structured logger and error boundaries.

### Unused code
One module (L1).

### Broken routes
None. 40 page routes; every `built: true` navigation entry resolves; every
`built: false` entry genuinely 404s. Asserted continuously by
`e2e/navigation.spec.ts`, which checks the flags are honest in *both*
directions.

### Missing environment variables
None. Every variable read by the code is documented in `.env.example`, and
every documented variable is read. Cross-checked in both directions.

### Missing database migrations
None. Sixteen migrations, sequentially numbered, no duplicate prefixes, all 20
`create table` statements idempotent. No `drop table`, `drop column` or
`truncate` anywhere — the schema rebuilds from empty.

### Missing RLS policies
None. Row-level security is enabled on all 19 application tables, checked table
by table against the list of tables created.

### Missing indexes
None identified. Forty-one indexes. Every access pattern named in the brief is
covered: `ads` by status, category, user, created_at and expiry; `payments` by
user, status and settlement date; `notifications` by recipient and unread.

### Security vulnerabilities
**One was found during Phase 13 and is fixed** — stored cross-site scripting.
Two JSON-LD emitters wrote `JSON.stringify()` straight into a `<script>`
element; that function does not escape `<`, so an advertisement titled
`Flat </script><script>…</script>` ended the element early and had the rest
parsed as HTML. Reachable by anyone who could submit an advertisement. Fixed
with one shared serialiser and five assertions.

**No others found.** Payment amounts are read from the database; signatures are
verified with separate secrets in constant time; `paid` is terminal so
duplicates are no-ops; storage ownership is the first path segment; uploads are
sniffed from their own bytes. Cross-user access is covered by roughly 90
refusal assertions across the suites.

---

## PRODUCTION BLOCKERS

1. **The four legal pages** (C1) — Razorpay will not go live without three of
   them.
2. **Backups** (H1) — not a code defect, but launching without them risks
   unrecoverable loss.
3. **A staging run against a real Supabase and a real payment** (H2) — the
   application-to-Supabase seam has never been exercised.

## NON-BLOCKING ISSUES

- M1 unpaged owner lists · M2 no error alerting · M3 CSP compromise ·
  M4 no bot protection · L1 dead module · L2 unbuilt edition feature

## MANUAL CONFIGURATION REQUIRED

Domain and `NEXT_PUBLIC_SITE_URL` · Supabase project and credentials ·
`SUPABASE_SERVICE_ROLE_KEY` · `CRON_SECRET` · the two storage buckets · live
Razorpay keys and webhook secret · real package prices · promoting the first
administrator by SQL · Search Console · email and WhatsApp providers if wanted.
Full detail in `DEPLOYMENT.md`.

## OPTIONAL IMPROVEMENTS

Page the two owner lists · add Sentry · delete the dead module · build the
edition feature or remove its scaffolding · revisit bot protection if spam
appears.

---

## What this audit cannot tell you

It inspected the code and ran the tests. It did not exercise a real payment, a
real webhook, a real email, a real phone, or a real Supabase project, because
this environment has credentials for none of them. Nothing here should be read
as "the payment flow works in production" — only as "the payment flow is
correct as written, and its logic is covered by 41 assertions."
