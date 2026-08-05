-- FUP-weekly: make the weekly digest send an atomic cross-process claim.
-- First remove any duplicate weekly-digest markers left by the pre-fix
-- check-then-send race (keep the lowest ctid per user+weekKey) so the unique
-- index can be built, then create the partial unique index.

DELETE FROM "action_logs" a
USING "action_logs" b
WHERE a."action_type" = 'digest.weekly_sent'
  AND b."action_type" = 'digest.weekly_sent'
  AND a."user_id" = b."user_id"
  AND (a."metadata" ->> 'weekKey') = (b."metadata" ->> 'weekKey')
  AND (a."metadata" ->> 'weekKey') IS NOT NULL
  AND a."ctid" > b."ctid";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "action_logs_weekly_digest_week_uq"
  ON "action_logs" ("user_id", ("metadata" ->> 'weekKey'))
  WHERE "action_type" = 'digest.weekly_sent' AND ("metadata" ->> 'weekKey') IS NOT NULL;
