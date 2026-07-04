-- BATCH 3 of 4 — followups + prospect uniqueness rules. Run, confirm no red
-- error, then Batch 4.
DROP INDEX IF EXISTS "followups_prospect_stage_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "followups_prospect_channel_stage_unique"
  ON "followups" ("prospect_id","channel","stage");
CREATE UNIQUE INDEX IF NOT EXISTS "prospects_user_apollo_person_unique"
  ON "prospects" ("user_id","apollo_person_id") WHERE "apollo_person_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "prospects_user_slack_unique"
  ON "prospects" ("user_id","slack_user_id")   WHERE "slack_user_id"   IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "prospects_user_teams_unique"
  ON "prospects" ("user_id","teams_email")     WHERE "teams_email"     IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "prospects_user_telegram_unique"
  ON "prospects" ("user_id","telegram_handle") WHERE "telegram_handle" IS NOT NULL;
