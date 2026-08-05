-- ===========================================================================
-- UNBLOCK the stalled ALTER: terminate abandoned transactions.
-- Kills only sessions that are 'idle in transaction' for >60s — i.e. holding
-- locks while doing nothing (the orphaned earlier console run is exactly
-- this). The live app's healthy connections are 'idle' (no open txn) or
-- 'active' and are NOT touched; anything killed simply reconnects from the
-- pool. Single SELECT — console-safe.
-- ===========================================================================
SELECT
  pid,
  (now() - xact_start)::text AS was_stuck_for,
  left(query, 60)            AS last_query,
  pg_terminate_backend(pid)  AS terminated
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid()
  AND state = 'idle in transaction'
  AND (now() - xact_start) > interval '60 seconds';
