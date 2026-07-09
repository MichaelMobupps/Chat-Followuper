-- prod-bring-to-head CHUNK 5/6 — drops: 0015 dead table + 0016 dormant Teams/Slack
-- Console-safe small batch (the full file trips the Replit SQL driver on
-- multi-statement results: "Invalid response from Replit driver").
-- Idempotent — safe to re-run even if a prior attempt partially applied.
-- If THIS chunk still errors, run its statements ONE at a time.
-- Run order: 1 → 6, then prod-verify-state.sql (every row ok = true).
--
-- FAIL-FAST: if a lock can't be acquired in 5s this errors instead of
-- stalling (a WAITING ALTER also blocks live app queries queued behind it —
-- never let it sit). On "lock timeout": run prod-diagnose-locks.sql, then
-- prod-unblock.sql, then re-run this chunk.
SET lock_timeout = '5s';

DROP TABLE IF EXISTS "magic_link_tokens" CASCADE;
DROP INDEX IF EXISTS "prospects_user_teams_unique";
DROP INDEX IF EXISTS "prospects_user_slack_unique";
ALTER TABLE "users"     DROP COLUMN IF EXISTS "microsoft_refresh_token";
ALTER TABLE "users"     DROP COLUMN IF EXISTS "slack_bot_token";
ALTER TABLE "prospects" DROP COLUMN IF EXISTS "teams_email";
ALTER TABLE "prospects" DROP COLUMN IF EXISTS "slack_user_id";
