-- prod-bring-to-head CHUNK 4/6 — identity + weekly-digest uniques (needs prod-migration-fix.sql first if dupes exist)
-- Console-safe small batch (the full file trips the Replit SQL driver on
-- multi-statement results: "Invalid response from Replit driver").
-- Idempotent — safe to re-run even if a prior attempt partially applied.
-- If THIS chunk still errors, run its statements ONE at a time.
-- Run order: 1 → 6, then prod-verify-state.sql (every row ok = true).

CREATE UNIQUE INDEX IF NOT EXISTS "prospects_user_apollo_person_unique"
  ON "prospects" ("user_id","apollo_person_id") WHERE "apollo_person_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "prospects_user_telegram_unique"
  ON "prospects" ("user_id","telegram_handle") WHERE "telegram_handle" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "prospects_user_linkedin_unique"
  ON "prospects" ("user_id","linkedin_url")    WHERE "linkedin_url"    IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "action_logs_weekly_digest_week_uq"
  ON "action_logs" ("user_id", ("metadata" ->> 'weekKey'))
  WHERE "action_type" = 'digest.weekly_sent' AND ("metadata" ->> 'weekKey') IS NOT NULL;
