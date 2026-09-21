#!/usr/bin/env bash
# Rebuilds the local end-to-end database from the migrations and the seed,
# then starts the gateway (which starts PostgREST).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
export PGHOST=${PGHOST:-/tmp} PGPORT=${PGPORT:-5433} PGUSER=${PGUSER:-claude}
DB=shree_e2e

psql -q -d postgres -c "drop database if exists $DB with (force);" -c "create database $DB;" >/dev/null
for f in "$root"/supabase/test/_local_shim.sql "$root"/supabase/migrations/*.sql "$here/seed.sql"; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -c 'set client_min_messages = warning;' -f "$f" >/dev/null
done
echo "database $DB ready"
exec node "$here/gateway.mjs"
