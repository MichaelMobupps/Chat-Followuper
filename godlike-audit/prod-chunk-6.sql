-- prod-bring-to-head CHUNK 6/6 — 0018 reminders & schedule columns
-- Console-safe small batch (the full file trips the Replit SQL driver on
-- multi-statement results: "Invalid response from Replit driver").
-- Idempotent — safe to re-run even if a prior attempt partially applied.
-- If THIS chunk still errors, run its statements ONE at a time.
-- Run order: 1 → 6, then prod-verify-state.sql (every row ok = true).

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pushover_hour_local" integer DEFAULT 12 NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pushover_days" jsonb DEFAULT '[1,2,3,4,5]'::jsonb NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "digest_days" jsonb DEFAULT '[0,1,2,3,4,5,6]'::jsonb NOT NULL;
