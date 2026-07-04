-- ===========================================================================
-- Production pre-migration cleanup  (Replit SQL Console version)
-- ---------------------------------------------------------------------------
-- Removes only redundant DUPLICATE rows (keeping the OLDEST of each set) so the
-- deploy's new UNIQUE rules can apply. Safe to re-run; each step prints how many
-- rows it removed.
--
-- HOW TO RUN in the Replit SQL Console:
--   1. Click inside this code.
--   2. Select ALL of it  (Cmd+A / Ctrl+A).
--   3. Click Run.  The console wraps the selection in one transaction for you.
--   (Do NOT add BEGIN/COMMIT — this console rejects them.)
-- ===========================================================================

-- 1) Duplicate "weekly digest sent" audit markers (the most likely blocker).
--    Just send-history markers; extra copies are noise. Keep earliest per (user, week).
WITH deleted AS (
  DELETE FROM "action_logs" a
  USING "action_logs" b
  WHERE a."action_type" = 'digest.weekly_sent'
    AND b."action_type" = 'digest.weekly_sent'
    AND a."user_id" = b."user_id"
    AND (a."metadata" ->> 'weekKey') = (b."metadata" ->> 'weekKey')
    AND (a."metadata" ->> 'weekKey') IS NOT NULL
    AND a."id" > b."id"
  RETURNING a."id"
)
SELECT 'weekly_digest markers removed: ' || count(*) FROM deleted;

-- 2) Duplicate prospects sharing the same contact identity for the same user
--    (same person added twice). Keep the earliest row per identity.
WITH deleted AS (
  DELETE FROM "prospects" a USING "prospects" b
  WHERE a."user_id" = b."user_id"
    AND a."apollo_person_id" = b."apollo_person_id"
    AND a."apollo_person_id" IS NOT NULL
    AND a."id" > b."id"
  RETURNING a."id"
)
SELECT 'duplicate prospects (apollo) removed: ' || count(*) FROM deleted;

WITH deleted AS (
  DELETE FROM "prospects" a USING "prospects" b
  WHERE a."user_id" = b."user_id"
    AND a."telegram_handle" = b."telegram_handle"
    AND a."telegram_handle" IS NOT NULL
    AND a."id" > b."id"
  RETURNING a."id"
)
SELECT 'duplicate prospects (telegram) removed: ' || count(*) FROM deleted;

WITH deleted AS (
  DELETE FROM "prospects" a USING "prospects" b
  WHERE a."user_id" = b."user_id"
    AND a."teams_email" = b."teams_email"
    AND a."teams_email" IS NOT NULL
    AND a."id" > b."id"
  RETURNING a."id"
)
SELECT 'duplicate prospects (teams) removed: ' || count(*) FROM deleted;

WITH deleted AS (
  DELETE FROM "prospects" a USING "prospects" b
  WHERE a."user_id" = b."user_id"
    AND a."slack_user_id" = b."slack_user_id"
    AND a."slack_user_id" IS NOT NULL
    AND a."id" > b."id"
  RETURNING a."id"
)
SELECT 'duplicate prospects (slack) removed: ' || count(*) FROM deleted;
