-- Audit-2 S3 — drop dormant Teams/Slack columns on PRODUCTION (migration 0016)
--
-- When F-C removed the Teams/Slack channels, these columns + partial-unique
-- indexes were left dormant. With the channels gone they have ZERO code
-- references and will never be used, so they can be dropped. This also ties off
-- the old DB2 residual (microsoft_refresh_token / slack_bot_token were the
-- "encrypt when the OAuth ships" columns — that OAuth will never ship).
--
-- The migrator applies migration 0016 automatically on the next Republish once
-- prod is at head; this file is the by-hand equivalent for the Replit SQL
-- console. Guarded (IF EXISTS) — safe to re-run.
--
-- Run AFTER prod-bring-to-head.sql (so prod is otherwise at head first).
DROP INDEX IF EXISTS "prospects_user_teams_unique";
DROP INDEX IF EXISTS "prospects_user_slack_unique";
ALTER TABLE "users"     DROP COLUMN IF EXISTS "microsoft_refresh_token";
ALTER TABLE "users"     DROP COLUMN IF EXISTS "slack_bot_token";
ALTER TABLE "prospects" DROP COLUMN IF EXISTS "teams_email";
ALTER TABLE "prospects" DROP COLUMN IF EXISTS "slack_user_id";
