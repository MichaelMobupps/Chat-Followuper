-- Per-call LLM cost ledger (2026-07-15). One row per model invocation, written
-- at lib/llm/router.ts callLLMRole + the 4 services that bypass it.
--
-- Existing cost records are lossy by construction: daily_usage keeps ONE summed
-- USD per (user, day), and action_logs.metadata blends a whole writer→critic→
-- rewriter chain into one untyped number. Neither can answer "what did we spend,
-- on which model, for whom" — see lib/db/src/schema/llm_calls.ts for the full
-- rationale and the (unbackfillable) history gap.
--
-- Guarded so it is safe to re-run and to apply on prod BY HAND, which is how
-- migrations actually reach prod here (0016's note + godlike-audit/prod-*.sql).
-- CREATE TABLE/INDEX take IF NOT EXISTS; ADD CONSTRAINT does not, so the two FKs
-- are guarded via pg_constraint lookups that preserve drizzle's exact constraint
-- names — renaming them would make the next `drizzle-kit generate` see a diff
-- and try to "fix" a schema that is already correct.
--
-- Additive only: new table, no existing row or query touched. Applying this
-- changes no behaviour until the ledger writes ship with it.
CREATE TABLE IF NOT EXISTS "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"prospect_id" uuid,
	"task" text NOT NULL,
	"model" text NOT NULL,
	"provider" text NOT NULL,
	"fallback" boolean DEFAULT false NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"cost_unpriced" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'llm_calls_user_id_users_id_fk') THEN
		ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'llm_calls_prospect_id_prospects_id_fk') THEN
		ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_calls_user_created_idx" ON "llm_calls" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_calls_model_idx" ON "llm_calls" USING btree ("model");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_calls_task_idx" ON "llm_calls" USING btree ("task");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_calls_prospect_id_idx" ON "llm_calls" USING btree ("prospect_id");
