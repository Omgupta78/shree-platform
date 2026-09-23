-- =============================================================================
-- LOCAL VALIDATION ONLY — not applied to Supabase.
--
-- Phase 13. The rate limiter, and the two properties that make it worth having.
--
-- A rate limiter is easy to write and easy to write wrongly, and both mistakes
-- are silent: one lets everything through, the other locks out the first
-- person who tries. So the counter is asserted at its boundary — the request
-- that is still allowed, and the very next one that is not — rather than
-- somewhere comfortably in the middle.
--
-- The table it uses holds no address and no identity. The application hashes
-- the caller before building a key, so these buckets are opaque strings; the
-- assertions below use obviously-fake ones.
-- =============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

delete from public.test_assertions;
insert into public.test_assertions values (0);

delete from public.rate_limits where bucket like 'test:%';

-- =========================================================================
-- 1. The boundary
-- =========================================================================
do $$
declare
  allowed boolean;
  i       int;
begin
  -- Three allowed in a long window.
  for i in 1..3 loop
    select public.consume_rate_limit('test:boundary', 3, 3600) into allowed;
    assert allowed, format('request %s of 3 was refused', i);
  end loop;
  perform public.ok('every request up to the limit is allowed');

  select public.consume_rate_limit('test:boundary', 3, 3600) into allowed;
  assert not allowed, 'the fourth request was allowed';
  perform public.ok('the request after the limit is refused');

  -- And it stays refused; a refusal does not reset anything.
  select public.consume_rate_limit('test:boundary', 3, 3600) into allowed;
  assert not allowed, 'a later request was allowed again';
  perform public.ok('a refusal does not reset the counter');
end $$;

-- =========================================================================
-- 2. Buckets are separate
-- =========================================================================
/*
 * The property that stops one busy caller locking out everybody else. If the
 * key were shared — by action alone, say, rather than by action AND caller —
 * one script would deny the whole town.
 */
do $$
declare allowed boolean;
begin
  select public.consume_rate_limit('test:separate:a', 1, 3600) into allowed;
  assert allowed;
  select public.consume_rate_limit('test:separate:a', 1, 3600) into allowed;
  assert not allowed, 'bucket A was not exhausted';

  select public.consume_rate_limit('test:separate:b', 1, 3600) into allowed;
  assert allowed, 'exhausting one bucket refused a different one';
  perform public.ok('one caller reaching their limit does not affect another');
end $$;

-- =========================================================================
-- 3. The window closes
-- =========================================================================
do $$
declare allowed boolean;
begin
  select public.consume_rate_limit('test:window', 1, 3600) into allowed;
  assert allowed;
  select public.consume_rate_limit('test:window', 1, 3600) into allowed;
  assert not allowed, 'the second request inside the window was allowed';

  -- Move the window into the past rather than waiting an hour for it.
  update public.rate_limits
     set window_started_at = now() - interval '2 hours'
   where bucket = 'test:window';

  select public.consume_rate_limit('test:window', 1, 3600) into allowed;
  assert allowed, 'the counter did not reset once its window had closed';
  perform public.ok('a closed window starts the count again');

  assert (select count from public.rate_limits where bucket = 'test:window') = 1,
    'the new window did not start from one';
  perform public.ok('a new window starts from one, not from where the old one stopped');
end $$;

-- =========================================================================
-- 4. A missing key never locks anybody out
-- =========================================================================
/*
 * The application cannot always identify a caller — a request behind a proxy
 * that strips the forwarding header, for instance. Refusing in that case would
 * turn one misconfiguration into a total outage, so the limiter allows.
 */
do $$
declare allowed boolean;
begin
  select public.consume_rate_limit(null, 1, 3600) into allowed;
  assert allowed, 'a null key was refused';
  select public.consume_rate_limit('', 1, 3600) into allowed;
  assert allowed, 'an empty key was refused';
  perform public.ok('an unidentifiable caller is allowed through, not locked out');
end $$;

-- =========================================================================
-- 5. Nobody can read or reset their own counter
-- =========================================================================
set role authenticated;
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);

do $$
begin
  begin
    perform 1 from public.rate_limits;
    raise exception 'FAIL: an advertiser read the rate limit table';
  exception when insufficient_privilege then
    perform public.ok('the counters are unreadable — nobody can see how close they are');
  end;

  begin
    delete from public.rate_limits where bucket = 'test:boundary';
    raise exception 'FAIL: an advertiser deleted their own counter';
  exception when insufficient_privilege then
    perform public.ok('a caller cannot delete their way out of a limit');
  end;

  begin
    update public.rate_limits set count = 0;
    raise exception 'FAIL: an advertiser reset their own counter';
  exception when insufficient_privilege then
    perform public.ok('a caller cannot reset their own counter');
  end;

  -- But consuming still works: the function is the only door, and it is open.
  perform public.consume_rate_limit('test:asuser', 5, 60);
  perform public.ok('an ordinary caller can still be counted through the function');

  begin
    perform public.prune_rate_limits();
    raise exception 'FAIL: an advertiser pruned the counters';
  exception when insufficient_privilege then
    perform public.ok('pruning is not an advertiser''s to do');
  end;
end $$;

reset role;
select set_config('test.uid', '', false);

-- =========================================================================
-- 6. Housekeeping removes only what is finished
-- =========================================================================
do $$
declare gone int;
begin
  insert into public.rate_limits (bucket, window_started_at, count)
  values ('test:old', now() - interval '3 hours', 9)
  on conflict (bucket) do update set window_started_at = excluded.window_started_at;

  select public.prune_rate_limits() into gone;
  assert gone >= 1, 'nothing was pruned';
  assert not exists (select 1 from public.rate_limits where bucket = 'test:old'),
    'a stale bucket survived the prune';
  perform public.ok('a bucket whose window closed long ago is removed');

  assert exists (select 1 from public.rate_limits where bucket = 'test:asuser'),
    'a bucket still inside its window was pruned';
  perform public.ok('a bucket still inside its window is left alone');
end $$;

delete from public.rate_limits where bucket like 'test:%';

do $$
declare n int;
begin
  select t.n into n from public.test_assertions t;
  raise notice '% assertions passed.', n;
end $$;

\echo ''
