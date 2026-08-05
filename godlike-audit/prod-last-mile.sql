-- Prod last-mile: only the bits the state-check did NOT confirm.
-- Columns, weekly-digest index, apollo/telegram uniques, magic_link drop,
-- and the followups channel-stage index are ALREADY on prod. Everything
-- below is idempotent (IF [NOT] EXISTS) so re-running is harmless.
-- Small on purpose (the full bring-to-head tripped a Replit console error).

CREATE INDEX IF NOT EXISTS "prospects_campaign_id_idx" ON "prospects" ("campaign_id");
CREATE INDEX IF NOT EXISTS "action_logs_prospect_id_idx" ON "action_logs" ("prospect_id");
CREATE INDEX IF NOT EXISTS "action_logs_followup_id_idx" ON "action_logs" ("followup_id");
CREATE INDEX IF NOT EXISTS "conversations_source_followup_id_idx" ON "conversations" ("source_followup_id");
CREATE INDEX IF NOT EXISTS "oauth_nonces_user_id_idx" ON "oauth_nonces" ("user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "prospects_user_linkedin_unique"
  ON "prospects" ("user_id","linkedin_url") WHERE "linkedin_url" IS NOT NULL;

DROP INDEX IF EXISTS "prospects_user_teams_unique";
DROP INDEX IF EXISTS "prospects_user_slack_unique";
ALTER TABLE "users"     DROP COLUMN IF EXISTS "microsoft_refresh_token";
ALTER TABLE "users"     DROP COLUMN IF EXISTS "slack_bot_token";
ALTER TABLE "prospects" DROP COLUMN IF EXISTS "teams_email";
ALTER TABLE "prospects" DROP COLUMN IF EXISTS "slack_user_id";
