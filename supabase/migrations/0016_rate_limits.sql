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
