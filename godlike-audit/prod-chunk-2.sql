-- prod-bring-to-head CHUNK 2/6 — foreign-key covering indexes
-- Console-safe small batch (the full file trips the Replit SQL driver on
-- multi-statement results: "Invalid response from Replit driver").
-- Idempotent — safe to re-run even if a prior attempt partially applied.
-- If THIS chunk still errors, run its statements ONE at a time.
-- Run order: 1 → 6, then prod-verify-state.sql (every row ok = true).

CREATE INDEX IF NOT EXISTS "prospects_campaign_id_idx"             ON "prospects"     ("campaign_id");
CREATE INDEX IF NOT EXISTS "action_logs_prospect_id_idx"          ON "action_logs"   ("prospect_id");
CREATE INDEX IF NOT EXISTS "action_logs_followup_id_idx"          ON "action_logs"   ("followup_id");
CREATE INDEX IF NOT EXISTS "conversations_source_followup_id_idx" ON "conversations" ("source_followup_id");
CREATE INDEX IF NOT EXISTS "oauth_nonces_user_id_idx"             ON "oauth_nonces"  ("user_id");
