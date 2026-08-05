-- BATCH 4 of 4 — the corrected weekly-digest rule (the one Replit got wrong)
-- and dropping the dead table. Run and confirm no red error.
CREATE UNIQUE INDEX IF NOT EXISTS "action_logs_weekly_digest_week_uq"
  ON "action_logs" ("user_id", ("metadata" ->> 'weekKey'))
  WHERE "action_type" = 'digest.weekly_sent' AND ("metadata" ->> 'weekKey') IS NOT NULL;
DROP TABLE IF EXISTS "magic_link_tokens" CASCADE;
