-- audit-2 S3: drop the dormant Teams/Slack columns + their partial-unique
-- indexes. These were left dormant when F-C removed the Teams/Slack channels;
-- with the channels gone they have zero code references and will never be used
-- (ties off the old DB2 token-encryption residual — nothing to encrypt).
-- Guarded (IF EXISTS) so it is safe to re-run and to apply on prod by hand.
DROP INDEX IF EXISTS "prospects_user_teams_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "prospects_user_slack_unique";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "microsoft_refresh_token";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "slack_bot_token";--> statement-breakpoint
ALTER TABLE "prospects" DROP COLUMN IF EXISTS "teams_email";--> statement-breakpoint
ALTER TABLE "prospects" DROP COLUMN IF EXISTS "slack_user_id";
