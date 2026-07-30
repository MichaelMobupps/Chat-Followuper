-- Maintenance M1: additive-only reconciliation of the repo schema with the
-- live database.
--
-- Context: this database was built by a different migration lineage than this
-- repo's (see the M1 ledger entry in TODO.md). The two diverge in both
-- directions. This migration closes ONLY the additive direction: the five
-- items the repo schema declares that the live database lacks.
--
-- It deliberately does NOT touch the 22 live-only items (llm_calls,
-- daily_usage.pushover_sent, and the nine users.pushover_*/digest_days/
-- followups_paused/message_template/preferred_channel columns). Those hold
-- data this repo's schema does not describe; removing them would be
-- destructive and is explicitly out of scope.
--
-- Every statement is strictly additive: ADD COLUMN (nullable, no default),
-- CREATE TABLE, CREATE INDEX. Nothing is dropped, renamed, retyped, or
-- rewritten. Every statement is IF NOT EXISTS, so re-running is a no-op.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "microsoft_refresh_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "slack_bot_token" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "teams_email" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "slack_user_id" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "magic_link_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"action" text NOT NULL,
	"payload_json" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "magic_link_tokens_token_unique" UNIQUE("token"),
	CONSTRAINT "magic_link_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "magic_link_tokens_token_idx" ON "magic_link_tokens" USING btree ("token");
