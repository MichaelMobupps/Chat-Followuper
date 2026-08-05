-- FUP5: make the followups uniqueness channel-aware. The scheduler's existence
-- check keys on (prospect_id, channel), but the old unique index was
-- (prospect_id, stage) only — so sequencing a prospect on a second channel hit
-- onConflictDoNothing on every stage and silently created nothing (while the
-- returned count still incremented). The new index (prospect_id, channel, stage)
-- is strictly looser than the old one, so no existing row can violate it — safe
-- to swap in place. Idempotent.
DROP INDEX IF EXISTS "followups_prospect_stage_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "followups_prospect_channel_stage_unique" ON "followups" ("prospect_id","channel","stage");
