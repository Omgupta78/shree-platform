# Going live

Everything in this file was checked against the code in this repository. Where
something could not be checked from here — because it depends on an account,
a domain or a provider that does not exist yet — it says so rather than
guessing.

Read the status words literally:

| Status | Means |
| --- | --- |
| **READY** | Verified in this repository or against a running build. Nothing to do. |
| **NEEDS CONFIGURATION** | The code is finished. It needs a credential, a domain or a setting that only you can supply. |
| **NEEDS MANUAL VERIFICATION** | Needs a real account, a real card or a real device to confirm. Cannot be proven from here. |
| **NEEDS ATTENTION** | A known gap. Listed with what it would take to close it. |

---

## 1. Launch checklist

### Domain and transport

| Item | Status | Notes |
| --- | --- | --- |
| HTTPS | NEEDS CONFIGURATION | Vercel issues and renews the certificate once the domain is added. Nothing in the code to change. |
| Canonical domain | NEEDS CONFIGURATION | Set `NEXT_PUBLIC_SITE_URL` to the exact origin, with scheme and no trailing slash. Every canonical URL, sitemap entry and share link is built from it. |
| www vs non-www | NEEDS CONFIGURATION | Pick one, add both to the host, and redirect the other to it. The code does not care which; it must only match `NEXT_PUBLIC_SITE_URL`. |
| HSTS | READY | `Strict-Transport-Security` is sent on every response, two years, subdomains included. Browsers ignore it over plain http, so local development is unaffected. |
| Security headers | READY | CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`. Tested against a running build in `e2e/security.spec.ts`, including that the policy does not break any page. `'unsafe-eval'` is added under `next dev` only — React needs it to reconstruct call stacks in development and never uses it in production; asserted in both directions. |

### Database

| Item | Status | Notes |
| --- | --- | --- |
| Schema | READY | Sixteen migrations, numbered, applied in order. No `drop table`, `drop column` or `truncate` anywhere — the schema can be rebuilt from an empty database. |
| Row-level security | READY | Enabled on all 19 tables, verified table by table. 386 assertions across eight suites; `npm run db:test`. |
| Reference data | READY | Categories and locations are seeded by migration `0002`. |
| Package prices | NEEDS CONFIGURATION | `supabase/seed/dev_package_prices.sql` is development rates and is **not** a migration. Set real prices in `/admin/packages` or by SQL. Until they are set, advertisements are free and go straight to the queue. |
| Backups | NEEDS CONFIGURATION | See §3. |

### Storage

| Item | Status | Notes |
| --- | --- | --- |
| Buckets | NEEDS CONFIGURATION | `ad-images` (public read) and `ad-artwork` (owner only) must exist in the Supabase project. |
| Policies | READY | Migration `0006`. Ownership is the first path segment, which must equal `auth.uid()`; a file outside that path is refused, and the refusal is asserted. |
| Upload validation | READY | Type sniffed from the file's own bytes, not its name or its declared type. 5 MB per photograph, 15 MB per artwork file. Storage paths are generated, never taken from the upload. |

### Payments

| Item | Status | Notes |
| --- | --- | --- |
| Integration | READY | 41 assertions in `payment_checks.sql`. The amount is read from the database, never from the browser. |
| Signature verification | READY | Callback and webhook verified with separate secrets, compared in constant time. |
| Duplicate protection | READY | `paid` is terminal in the transition table, so a repeated callback or webhook changes nothing. |
| Payment ≠ publication | READY | Settling a payment does not approve an advertisement. A renewal on a priced package cannot be approved until it is paid — both asserted. |
| Live keys | NEEDS CONFIGURATION | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` — live keys, not test. |
| Webhook | NEEDS CONFIGURATION | Point Razorpay at `https://YOUR-DOMAIN/api/payments/webhook`, subscribed to `payment.captured`, `payment.failed`, `order.paid`. Put its signing secret in `RAZORPAY_WEBHOOK_SECRET` — a **different** secret from the key secret. Without it the endpoint answers 503, so Razorpay retries rather than losing the event. |
| A real payment | NEEDS MANUAL VERIFICATION | One live transaction, end to end, with a real card. Cannot be done from here. |

### Notifications

| Item | Status | Notes |
| --- | --- | --- |
| In-app | READY | Written in the same transaction as the event that caused them. |
| Email | NEEDS CONFIGURATION | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`. The sending domain must be verified with the provider first. Without these, queued email is recorded as `skipped` with a reason — not as a failure for somebody to investigate. |
| WhatsApp | NEEDS CONFIGURATION | Needs an **approved template** with three body parameters. A token without `WHATSAPP_TEMPLATE_NAME` can send nothing, and the application says so plainly. Off by default for every advertiser. |
| Worker | NEEDS CONFIGURATION | Hourly cron, already in `vercel.json`. Needs `CRON_SECRET`. |

### Scheduled jobs

| Item | Status | Notes |
| --- | --- | --- |
| Expiry sweep | READY | Daily at 18:30 UTC — midnight in Roorkee. Also prunes the search log and the rate-limit buckets. |
| Notification worker | READY | Hourly. |
| Idempotency | READY | Both are safe to run twice: the sweep only moves advertisements whose date has passed, and a claimed delivery is not handed to a second worker. |
| Authorisation | READY | `Authorization: Bearer <CRON_SECRET>`, compared in constant time. Without the secret set, both endpoints refuse everything rather than running open. |
| `CRON_SECRET` | NEEDS CONFIGURATION | At least 16 characters. Vercel sends it automatically once it is set on the project. |

### Search engines

| Item | Status | Notes |
| --- | --- | --- |
| Metadata, canonicals, JSON-LD | READY | 31 checks in `e2e/seo.spec.ts` read the served HTML. |
| Sitemap | READY | `/sitemap.xml` plus split advertisement sitemaps. Every URL in it is fetched and asserted to return 200. |
| robots.txt | READY | Blocks only what a crawler would be redirected away from, plus machinery. |
| Search Console | NEEDS CONFIGURATION | Add the property, submit `/sitemap.xml`. This is also the only place real ranking and impression data exists — `/admin/seo` deliberately reports none. |

### Operations

| Item | Status | Notes |
| --- | --- | --- |
| Health check | READY | `GET /api/health`. 200 when the database answers, 503 when it does not. Reveals no version, environment, hostname or configuration. |
| Structured logging | READY | JSON to stdout, collected by any host. A field-name guard redacts anything called `password`, `token`, `secret`, `signature`, `phone`, `email` and similar even if a future refactor passes one. |
| Error monitoring | NEEDS CONFIGURATION | No provider is wired in — deliberately, rather than adding a paid dependency unasked. Vercel's own logs collect the structured entries. If you want alerting, Sentry's Next.js SDK drops in; `src/app/error.tsx` and `global-error.tsx` are where a reporter would be called. |
| Rate limiting | READY | Counters in Postgres, so they work across serverless instances. 14 assertions. Keys are hashes; no address is stored. |
| Audit trail | READY | Append-only, enforced by trigger. Covers moderation, role changes, payment settlement, package price changes, manual expiry and report exports. |

### The site itself

| Item | Status | Notes |
| --- | --- | --- |
| Accessibility | READY | axe-core, WCAG 2.1 A and AA, across nine pages plus an advertisement page. Zero violations. Keyboard operation, focus visibility and heading structure are asserted separately. |
| Mobile | READY | No horizontal overflow at 360, 414, 768 and 1280 px across ten pages. Tap targets, input types and font sizes asserted. |
| Error pages | READY | 404, the route error boundary and the root error boundary each offer a search, the sections and a way home. |
| Production build | READY | `npm run verify` — typecheck, lint at zero warnings, build, and the full end-to-end suite. |

---

## 2. Environment variables

Names and comments are in `.env.example`. Set them on the host, never in the
repository.

**Required for a working site**

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — safe in the
  browser; row-level security governs what they can reach.
- `SUPABASE_SERVICE_ROLE_KEY` — **secret**, bypasses row-level security. Server
  only. Never prefix with `NEXT_PUBLIC_`.
- `NEXT_PUBLIC_SITE_URL` — the canonical origin.
- `CRON_SECRET` — at least 16 characters.

**Required for payments**

- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.

**Optional**

- `RATE_LIMIT_SALT` — falls back to `CRON_SECRET`, so rate limiting works
  without it.
- `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`.
- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANGUAGE`,
  `WHATSAPP_API_VERSION`.

No secret is committed. The repository and its whole history were searched for
key patterns before this was written.

---

## 3. Backups

**Status: NEEDS CONFIGURATION.** This section describes what to set up. It does
not claim anything is running, because from here there is no way to confirm it.

**What must be backed up**

1. The Postgres database — every table. `ads`, `payments`, `profiles` and
   `audit_log` are the ones that cannot be reconstructed from anything else.
2. Supabase Storage — the `ad-images` and `ad-artwork` buckets. These are
   advertisers' own files and exist nowhere else.

**How**

Supabase takes automatic daily backups on its paid plans, retained according to
the plan. On the free plan there are none, and the answer is either to upgrade
or to run `pg_dump` on a schedule to storage you control. Storage buckets are
**not** included in the database backup and need copying separately.

**Restoring**

Restoring the database is a Supabase dashboard operation. Rehearse it once,
into a scratch project, before you need it — a backup nobody has restored is a
hypothesis. The schema itself can always be rebuilt from `supabase/migrations`,
in order; it is the rows that need the backup.

**During testing**: do not point a test run at the production project. The
end-to-end database suite drops and recreates its database on every run.

---

## 3a. Applying the migrations to a new Supabase project

The sixteen migrations must be applied **in order**, and two of them must be
applied **on their own**.

`0008` and `0012` each do nothing but add a value to an enum
(`changes_requested`, `cancelled`). Postgres will not let a value added by
`ALTER TYPE ... ADD VALUE` be *used* until that transaction has committed — and
`0009` and `0013` use them. Supabase's SQL editor runs whatever you paste as a
single transaction, so pasting all sixteen at once fails with:

```
ERROR: unsafe use of new value "changes_requested" of enum type ad_status
```

That is not a fault in the migrations; it is why those two are separate files.

**Two ways to apply them.**

*The CLI*, which runs each file separately and has no such problem:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

*The SQL editor*, in five runs. Group the files like this, running each group
to completion before starting the next:

| Run | Files |
| --- | --- |
| 1 | `0001` – `0007` |
| 2 | `0008` **alone** |
| 3 | `0009` – `0011` |
| 4 | `0012` **alone** |
| 5 | `0013` – `0016` |

Either way, check afterwards that the schema is complete:

```sql
select count(*) from information_schema.tables
 where table_schema = 'public' and table_type = 'BASE TABLE';          -- 19
select count(*) from pg_tables where schemaname = 'public' and rowsecurity;  -- 19
select count(*) from public.categories;                                -- 43
select count(*) from public.packages;                                  -- 3
```

If the table count is right but the RLS count is lower, stop: a table without
row-level security is readable by anybody holding the anon key, which is a key
that ships to every browser.

---

## 4. Deploying to Vercel

The project is a standard Next.js application; nothing about the hosting is
unusual.

1. Import the repository. Build command, output and install are detected —
   leave them alone.
2. Set every environment variable from §2 for Production.
3. Add the domain; set `NEXT_PUBLIC_SITE_URL` to match exactly.
4. Cron is already declared in `vercel.json`. Confirm both jobs appear under
   the project's Cron Jobs after the first deployment.
5. Apply the migrations to the production Supabase project, in order.
6. Create the two storage buckets.
7. Promote yourself to administrator. There is deliberately no interface for
   this — the guard refuses a role change from anyone but an administrator or a
   direct SQL connection, so the first one is made in the SQL editor:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
8. Point the Razorpay webhook at the live domain.
9. Fetch `/api/health` and confirm `{"status":"ok","database":"ok"}`.

---

## 5. What is not done

Stated plainly, because a launch checklist that says everything is finished is
not a checklist.

**NEEDS ATTENTION**

- **Content-Security-Policy uses `'unsafe-inline'` for scripts.** A nonce-based
  policy is stricter, but a nonce can only be injected during server rendering,
  so every statically rendered page would receive a policy naming a nonce its
  HTML does not carry and every script on it would be blocked. The alternative
  is making the whole site dynamic, which costs real speed on exactly the pages
  search engines fetch most. The reasoning is written out in
  `src/lib/security/headers.ts`. What makes this acceptable rather than
  careless: the application renders no user-supplied HTML anywhere, and the one
  place user text enters a `<script>` — the JSON-LD serialiser — escapes it and
  has its own tests.
- **No error-monitoring provider.** Errors are logged as structured JSON and
  collected by the host. There is no alerting.
- **No bot protection on public forms.** Rate limiting is in place; there is no
  CAPTCHA. For a local classifieds site taking advertisements from people who
  telephone the office anyway, a CAPTCHA on every submission costs more in
  abandoned advertisements than it saves. Worth revisiting if spam appears —
  the place to add it is `submitAdvertisementAction`.

**NEEDS MANUAL VERIFICATION** — none of these can be proven from a container
with no credentials:

- A real payment, end to end, with a live key and a real card.
- A real Razorpay webhook delivery, and a duplicate of it.
- Email delivery from a verified sending domain.
- A WhatsApp template message against an approved template.
- The database-backed half of the missing-advertisement 404 (the slug lookup).
  The parts decided from configuration are tested; the lookup needs a reachable
  Supabase.
- The end-to-end journeys in §42 of the brief — signup through to publication —
  which need a live database and a real session.
- Behaviour on a physical handset. Mobile layout is asserted at four widths in
  a real browser engine, which is not the same as a phone in a hand.
