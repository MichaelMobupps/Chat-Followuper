-- DB4: covering indexes for foreign keys that had none. Without these, deleting
-- a parent row (campaign, prospect, followup, user) forces Postgres to
-- sequential-scan AND take a lock on the child table to check for referencing
-- rows. action_logs is append-only and unbounded, so its FKs are the worst.
-- All additive and idempotent (IF NOT EXISTS) — safe to re-run.
--
-- Note: on a large production table you may prefer CREATE INDEX CONCURRENTLY
-- (run manually, outside a transaction) to avoid a write lock during the build.
-- The plain form below runs inside the migration transaction and is fine for
-- dev/staging and small tables.
CREATE INDEX IF NOT EXISTS "prospects_campaign_id_idx" ON "prospects" ("campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "action_logs_prospect_id_idx" ON "action_logs" ("prospect_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "action_logs_followup_id_idx" ON "action_logs" ("followup_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_source_followup_id_idx" ON "conversations" ("source_followup_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "magic_link_tokens_user_id_idx" ON "magic_link_tokens" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_nonces_user_id_idx" ON "oauth_nonces" ("user_id");
