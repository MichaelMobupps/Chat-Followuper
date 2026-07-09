-- prod-bring-to-head CHUNK 1/6 — new columns (pre-0013)
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

ALTER TABLE "users"       ADD COLUMN IF NOT EXISTS "pushover_user_key"         text;
ALTER TABLE "users"       ADD COLUMN IF NOT EXISTS "preferred_channel"         text    DEFAULT 'whatsapp' NOT NULL;
ALTER TABLE "users"       ADD COLUMN IF NOT EXISTS "pushover_quiet_hour_start" integer DEFAULT 8  NOT NULL;
ALTER TABLE "users"       ADD COLUMN IF NOT EXISTS "pushover_quiet_hour_end"   integer DEFAULT 20 NOT NULL;
ALTER TABLE "users"       ADD COLUMN IF NOT EXISTS "message_template"          text;
ALTER TABLE "daily_usage" ADD COLUMN IF NOT EXISTS "pushover_sent"             boolean DEFAULT false NOT NULL;
