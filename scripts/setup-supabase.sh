#!/usr/bin/env bash
#
# Bring a fresh Supabase project up to what this application expects:
# the sixteen migrations, the two storage buckets, and a verification pass.
#
# Safe to run more than once. Every migration is idempotent, bucket creation
# treats "already exists" as success, and nothing here deletes anything.
#
# It prints no secret, ever — only whether one is set.
#
# Needs, in the environment:
#   SUPABASE_DB_URL              the pooler/direct connection string
#   NEXT_PUBLIC_SUPABASE_URL     https://<ref>.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY    secret; used only for the Storage API
#
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
fail() { printf '\n  ✗ %s\n' "$1" >&2; exit 1; }
step() { printf '\n── %s\n' "$1"; }

# ---------------------------------------------------------------- checks --
step "Credentials"
for var in SUPABASE_DB_URL NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY; do
  if [ -z "${!var:-}" ]; then
    fail "$var is not set. See DEPLOYMENT.md §2; do not paste it into a chat."
  fi
  printf '  %-28s set\n' "$var"
done

command -v psql >/dev/null || fail "psql is not on PATH."

# Refuse to touch a project that already holds advertisements unless told to.
existing=$(psql "$SUPABASE_DB_URL" -tAc \
  "select coalesce((select count(*) from public.ads), 0)" 2>/dev/null || echo 0)
if [ "${existing:-0}" -gt 0 ] && [ "${ALLOW_NON_EMPTY:-}" != "yes" ]; then
  fail "This project already holds $existing advertisements. Re-run with ALLOW_NON_EMPTY=yes if that is expected."
fi

# ------------------------------------------------------------ migrations --
step "Migrations"
# One psql invocation per file. That is the whole reason this works: 0008 and
# 0012 add enum values, and a value added by ALTER TYPE cannot be USED until
# its transaction commits — which 0009 and 0013 do. Pasting all sixteen into
# the SQL editor at once fails for exactly that reason.
for file in "$here"/supabase/migrations/*.sql; do
  name=$(basename "$file")
  printf '  %-52s' "$name"
  if psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -f "$file" >/dev/null 2>/tmp/mig.err; then
    echo "ok"
  else
    echo "FAILED"
    sed 's/^/      /' /tmp/mig.err >&2
    fail "Stopped at $name. Nothing after it was applied."
  fi
done

# --------------------------------------------------------------- buckets --
step "Storage buckets"
create_bucket() {
  local id="$1" public="$2" body=/tmp/shree-bucket.out code
  printf '  %-28s' "$id (public=$public)"
  : >"$body"

  code=$(curl -sS -o "$body" -w '%{http_code}' --max-time 30 \
    -X POST "$NEXT_PUBLIC_SUPABASE_URL/storage/v1/bucket" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"$id\",\"name\":\"$id\",\"public\":$public}" 2>>"$body") || true

  case "${code:-000}" in
    200|201) echo "created" ;;
    # Supabase answers 400 or 409 for a bucket that is already there. That is
    # success for our purposes: this script is meant to be safe to re-run.
    400|409)
      if grep -qi "already exists\|Duplicate" "$body"; then
        echo "already there"
      else
        echo "FAILED ($code)"; sed 's/^/      /' "$body" >&2; return 1
      fi ;;
    401|403)
      echo "FAILED ($code)"
      echo "      The service role key was refused. Check it is the service_role" >&2
      echo "      key and not the anon key, and that it matches this project." >&2
      return 1 ;;
    000)
      echo "FAILED (no response)"
      echo "      Could not reach $NEXT_PUBLIC_SUPABASE_URL — check the URL, and" >&2
      echo "      that outbound HTTPS is permitted from wherever this is running." >&2
      return 1 ;;
    *) echo "FAILED ($code)"; sed 's/^/      /' "$body" >&2; return 1 ;;
  esac
}
create_bucket ad-images true   || fail "Could not create ad-images."
create_bucket ad-artwork false || fail "Could not create ad-artwork."

# ---------------------------------------------------------- verification --
step "Verification"
q() { psql "$SUPABASE_DB_URL" -tAc "$1" 2>/dev/null | tr -d '[:space:]'; }

tables=$(q  "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")
rls=$(q     "select count(*) from pg_tables where schemaname='public' and rowsecurity")
policies=$(q "select count(*) from pg_policies where schemaname='public'")
cats=$(q    "select count(*) from public.categories")
locs=$(q    "select count(*) from public.locations")
pkgs=$(q    "select count(*) from public.packages")

printf '  %-22s %s\n' "tables"          "$tables"
printf '  %-22s %s\n' "with RLS"        "$rls"
printf '  %-22s %s\n' "policies"        "$policies"
printf '  %-22s %s\n' "categories"      "$cats"
printf '  %-22s %s\n' "locations"       "$locs"
printf '  %-22s %s\n' "packages"        "$pkgs"

problems=0
# The one that matters. A public table without row-level security is readable
# by anybody holding the anon key, and that key ships to every browser.
if [ "$tables" != "$rls" ]; then
  printf '\n  ✗ %s of %s tables have row-level security.\n' "$rls" "$tables" >&2
  psql "$SUPABASE_DB_URL" -tAc \
    "select '      unprotected: '||tablename from pg_tables
      where schemaname='public' and not rowsecurity order by tablename" >&2
  problems=1
fi
[ "${cats:-0}" -ge 9 ]  || { echo "  ✗ categories look unseeded." >&2; problems=1; }
[ "${pkgs:-0}" -ge 3 ]  || { echo "  ✗ packages look unseeded." >&2; problems=1; }

[ "$problems" -eq 0 ] || fail "Verification failed. Do not point a domain at this project yet."

cat <<'DONE'

  ✓ Schema, buckets and seed data are in place.

  Still yours to do, and nothing here can do them:
    1. Sign up through the site, then promote yourself:
         update public.profiles set role = 'admin' where email = 'you@example.com';
    2. Set real package prices in /admin/packages — they are null until you do,
       which means advertisements are free and skip the checkout entirely.
    3. Arrange backups. Supabase's free plan takes none, and storage buckets
       are not included in a database backup on any plan. See DEPLOYMENT.md §3.
DONE
