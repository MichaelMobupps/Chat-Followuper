-- BATCH 2 of 4 — foreign-key covering indexes. These touch action_logs, which
-- may be large, so give it a few seconds. Run, confirm no red error, then Batch 3.
CREATE INDEX IF NOT EXISTS "prospects_campaign_id_idx"             ON "prospects"     ("campaign_id");
CREATE INDEX IF NOT EXISTS "action_logs_prospect_id_idx"          ON "action_logs"   ("prospect_id");
CREATE INDEX IF NOT EXISTS "action_logs_followup_id_idx"          ON "action_logs"   ("followup_id");
CREATE INDEX IF NOT EXISTS "conversations_source_followup_id_idx" ON "conversations" ("source_followup_id");
CREATE INDEX IF NOT EXISTS "oauth_nonces_user_id_idx"             ON "oauth_nonces"  ("user_id");
