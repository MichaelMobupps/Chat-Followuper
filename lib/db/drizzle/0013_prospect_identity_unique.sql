-- DB5: partial unique indexes so non-phone identities dedup per user. The
-- existing (user_id, phone) unique index treats NULLs as distinct, so a prospect
-- reached only by telegram/teams/slack (phone=null), or a reveal-pending
-- prospect (phone=null, apollo_person_id set), could be inserted — and messaged
-- — repeatedly. Each index is partial (WHERE col IS NOT NULL) so it constrains
-- only rows that actually carry that identity. Additive + idempotent. (Verified
-- no existing duplicates before authoring; if a future environment has dupes,
-- dedupe before applying.)
CREATE UNIQUE INDEX IF NOT EXISTS "prospects_user_telegram_unique" ON "prospects" ("user_id","telegram_handle") WHERE "telegram_handle" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prospects_user_teams_unique" ON "prospects" ("user_id","teams_email") WHERE "teams_email" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prospects_user_slack_unique" ON "prospects" ("user_id","slack_user_id") WHERE "slack_user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prospects_user_apollo_person_unique" ON "prospects" ("user_id","apollo_person_id") WHERE "apollo_person_id" IS NOT NULL;
