-- ===========================================================================
-- WHY is the ALTER stalling? READ-ONLY diagnosis (single SELECT).
-- ALTER TABLE needs an ACCESS EXCLUSIVE lock; it queues behind ANY open
-- transaction touching "users" — including an orphaned transaction from the
-- earlier failed 27-statement batch, or the live app's connections.
--
-- Read the output:
--   - rows with waiting = true          → your stuck ALTER (or things queued behind it)
--   - rows with state = 'idle in transaction' → LOCK HOLDERS going nowhere.
--     These are the usual culprits (an orphaned console run). Note their pid,
--     then run prod-unblock.sql.
--   - long xact_age on an 'active' row  → a genuinely long query; wait or kill.
-- ===========================================================================
SELECT
  pid,
  state,
  wait_event_type || '/' || coalesce(wait_event, '-') AS waiting_on,
  (now() - xact_start)::text  AS xact_age,
  (now() - query_start)::text AS query_age,
  left(query, 90)             AS query
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid()
  AND (state <> 'idle' OR xact_start IS NOT NULL)
ORDER BY xact_start NULLS LAST;
