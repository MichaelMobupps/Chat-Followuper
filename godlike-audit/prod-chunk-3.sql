-- prod-bring-to-head CHUNK 3/6 — followups channel-aware uniqueness
-- Console-safe small batch (the full file trips the Replit SQL driver on
-- multi-statement results: "Invalid response from Replit driver").
-- Idempotent — safe to re-run even if a prior attempt partially applied.
-- If THIS chunk still errors, run its statements ONE at a time.
-- Run order: 1 → 6, then prod-verify-state.sql (every row ok = true).

DROP INDEX IF EXISTS "followups_prospect_stage_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "followups_prospect_channel_stage_unique"
  ON "followups" ("prospect_id","channel","stage");
