-- The ONE statement that matters: create the weekly-digest rule CORRECTLY
-- (Replit's auto-generated version swapped the uuid/text types and failed).
-- Once production has this, Replit's next publish skips it and applies the rest.
-- The trailing SELECT just gives the console a result to show so it's happy.
CREATE UNIQUE INDEX IF NOT EXISTS "action_logs_weekly_digest_week_uq"
  ON "action_logs" ("user_id", ("metadata" ->> 'weekKey'))
  WHERE "action_type" = 'digest.weekly_sent' AND ("metadata" ->> 'weekKey') IS NOT NULL;

SELECT 'weekly digest index is now in place' AS status;
