#!/usr/bin/env bash
# Validates the migrations against a scratch Postgres database.
# Requires a local Postgres 16; Supabase itself is not involved — the parts of
# a Supabase project that live outside `public` are stood up by _local_shim.sql.
set -euo pipefail
DB=${1:-shree_test}
here="$(cd "$(dirname "$0")/../.." && pwd)"

psql -q -c "drop database if exists $DB;" -c "create database $DB;" >/dev/null
for f in "$here"/supabase/test/_local_shim.sql "$here"/supabase/migrations/*.sql; do
  echo "applying $(basename "$f")"
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -c 'set client_min_messages = warning;' -f "$f" >/dev/null
done

status=0
for suite in rls_checks backend_checks moderation_checks lifecycle_checks payment_checks notification_checks analytics_checks security_checks; do
  echo
  echo "── $suite"
  if ! psql -v ON_ERROR_STOP=1 -d "$DB" -f "$here/supabase/test/$suite.sql" 2>&1 \
       | grep -E 'PASS|FAIL|ERROR|assertions'; then
    status=1
  fi
done
exit $status
