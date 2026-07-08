-- ===========================================================================
-- Bring PRODUCTION up to date, correctly.
-- ---------------------------------------------------------------------------
-- ⚠ RUN ORDER (B4): this script builds UNIQUE indexes (0013 identity uniques,
--   0014 weekly-digest unique). If prod already has DUPLICATE rows on those
--   keys, the CREATE UNIQUE INDEX statements FAIL. Run these FIRST, in order:
--     1. prod-state-check.sql                      (read-only; what exists)
--     2. prod-migration-fix.sql                    (removes duplicate rows)
--     3. prod-cancel-legacy-channel-followups.sql  (audit-2 F4/D2 zombie rows)
--   THEN this file. It assumes prod is already at ~0007 (references
--   oauth_nonces / conversations). "Guarded / re-runnable" below refers to the
--   IF [NOT] EXISTS guards, NOT to duplicate-row tolerance.
-- ---------------------------------------------------------------------------
-- This applies exactly the same schema changes Replit's auto-generated
-- migration intends, but:
--   * the "weekly digest" unique index is written with CORRECT column types
--     (Replit's generated version swapped uuid/text operator classes, which is
--      why it failed: 'operator class "text_ops" does not accept data type uuid'),
--   * every statement is guarded (IF EXISTS / IF NOT EXISTS) so it is safe and
--     can be re-run.
-- After this runs, production matches development, so the next Republish has
-- nothing left to migrate and skips the broken statement.
--
-- HOW TO RUN in the Replit SQL Console (Production Database):
--   Click in the code, Select All (Cmd+A / Ctrl+A), click Run.
--   (No BEGIN/COMMIT — this console adds the transaction itself.)
-- ===========================================================================

-- New columns -------------------------------------------------------------
ALTER TABLE "users"       ADD COLUMN IF NOT EXISTS "pushover_user_key"         text;
ALTER TABLE "users"       ADD COLUMN IF NOT EXISTS "preferred_channel"         text    DEFAULT 'whatsapp' NOT NULL;
ALTER TABLE "users"       ADD COLUMN IF NOT EXISTS "pushover_quiet_hour_start" integer DEFAULT 8  NOT NULL;
ALTER TABLE "users"       ADD COLUMN IF NOT EXISTS "pushover_quiet_hour_end"   integer DEFAULT 20 NOT NULL;
ALTER TABLE "users"       ADD COLUMN IF NOT EXISTS "message_template"          text;
ALTER TABLE "daily_usage" ADD COLUMN IF NOT EXISTS "pushover_sent"             boolean DEFAULT false NOT NULL;

-- Foreign-key covering indexes -------------------------------------------
CREATE INDEX IF NOT EXISTS "prospects_campaign_id_idx"            ON "prospects"     ("campaign_id");
CREATE INDEX IF NOT EXISTS "action_logs_prospect_id_idx"         ON "action_logs"   ("prospect_id");
CREATE INDEX IF NOT EXISTS "action_logs_followup_id_idx"         ON "action_logs"   ("followup_id");
CREATE INDEX IF NOT EXISTS "conversations_source_followup_id_idx" ON "conversations" ("source_followup_id");
CREATE INDEX IF NOT EXISTS "oauth_nonces_user_id_idx"            ON "oauth_nonces"  ("user_id");

-- Followups uniqueness: make it channel-aware ----------------------------
DROP INDEX IF EXISTS "followups_prospect_stage_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "followups_prospect_channel_stage_unique"
  ON "followups" ("prospect_id","channel","stage");

-- Prospect identity uniqueness (per user) --------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "prospects_user_apollo_person_unique"
  ON "prospects" ("user_id","apollo_person_id") WHERE "apollo_person_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "prospects_user_slack_unique"
  ON "prospects" ("user_id","slack_user_id")   WHERE "slack_user_id"   IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "prospects_user_teams_unique"
  ON "prospects" ("user_id","teams_email")     WHERE "teams_email"     IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "prospects_user_telegram_unique"
  ON "prospects" ("user_id","telegram_handle") WHERE "telegram_handle" IS NOT NULL;

-- Weekly-digest uniqueness -- THE STATEMENT REPLIT GOT WRONG.
-- Correct version: no operator classes, so Postgres uses the right ones for
-- each column type (user_id = uuid, weekKey expression = text).
CREATE UNIQUE INDEX IF NOT EXISTS "action_logs_weekly_digest_week_uq"
  ON "action_logs" ("user_id", ("metadata" ->> 'weekKey'))
  WHERE "action_type" = 'digest.weekly_sent' AND ("metadata" ->> 'weekKey') IS NOT NULL;

-- Drop the dead, unused table --------------------------------------------
DROP TABLE IF EXISTS "magic_link_tokens" CASCADE;
