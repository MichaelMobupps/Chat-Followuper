-- ===========================================================================
-- PRODUCTION: apply migrations 0019 + 0020 + 0021  (admin dashboard)
-- Created 2026-07-15. Paste this WHOLE file into the Replit SQL Console
-- (Production DB) and run it. Then Republish.
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES
--   0019  adds users.followups_paused   — the admin kill switch (default false)
--   0020  creates the llm_calls table   — the per-call cost ledger
--   0021  adds an index on llm_calls.created_at (the spend page needs it)
--
-- WHY IT MUST RUN **BEFORE** THE CODE DEPLOYS
--   The new code reads users.followups_paused on EVERY API request. If the code
--   is live and the column is missing, every request fails to load the signed-in
--   user, and every rep gets silently logged out of the whole product. Running
--   this first makes that impossible.
--
-- IS IT SAFE TO RUN NOW, BEFORE THE CODE?  YES — and that is the point.
--   Nothing here changes any existing behaviour:
--     * followups_paused defaults to FALSE on every existing row = "not paused"
--       = exactly what happens today. Nothing reads it until the new code ships.
--     * llm_calls is a brand-new empty table. Nothing writes it until then.
--   So prod can sit in this state indefinitely with zero effect.
--
-- IS IT SAFE TO RUN TWICE?  YES.
--   Every statement is guarded (IF NOT EXISTS / constraint-existence checks).
--   Running it again does nothing and reports OK. If you are unsure whether it
--   ran, just run it again.
--
-- WILL IT LOCK THE USERS TABLE?  No, not meaningfully.
--   PostgreSQL 16 (which this app pins) stores a constant DEFAULT in the
--   catalog instead of rewriting every row, so the users table is touched for
--   milliseconds, not minutes.
--
-- VALIDATED: run inside BEGIN…ROLLBACK against the dev database at head —
-- every statement a clean no-op, zero net change.
-- ===========================================================================

-- ── 0019 — the admin kill switch ───────────────────────────────────────────
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "followups_paused" boolean DEFAULT false NOT NULL;

-- ── 0020 — the per-call LLM cost ledger ────────────────────────────────────
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

-- Foreign keys. ON DELETE SET NULL, not CASCADE: deleting a user must not erase
-- the record that we spent money on their behalf. The spend happened.
-- Guarded by name AND table, since a constraint name is only unique per table.
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'llm_calls_user_id_users_id_fk'
		  AND conrelid = 'public.llm_calls'::regclass
	) THEN
		ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;

DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'llm_calls_prospect_id_prospects_id_fk'
		  AND conrelid = 'public.llm_calls'::regclass
	) THEN
		ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;

CREATE INDEX IF NOT EXISTS "llm_calls_user_created_idx" ON "llm_calls" USING btree ("user_id","created_at");
CREATE INDEX IF NOT EXISTS "llm_calls_model_idx" ON "llm_calls" USING btree ("model");
CREATE INDEX IF NOT EXISTS "llm_calls_task_idx" ON "llm_calls" USING btree ("task");
CREATE INDEX IF NOT EXISTS "llm_calls_prospect_id_idx" ON "llm_calls" USING btree ("prospect_id");

-- ── 0021 — index the spend page reads on every load ────────────────────────
CREATE INDEX IF NOT EXISTS "llm_calls_created_idx" ON "llm_calls" USING btree ("created_at");

-- ===========================================================================
-- VERIFY — read-only. This changes nothing; it just checks the work.
--
-- You want ONE row back, saying:  ALL GOOD — safe to Republish now
--
-- If it says anything else, STOP and do not Republish. Send the text to Claude.
-- ===========================================================================
SELECT
  CASE
    WHEN (SELECT count(*) FROM information_schema.columns
           WHERE table_name = 'users' AND column_name = 'followups_paused') = 1
     AND (SELECT count(*) FROM information_schema.tables
           WHERE table_name = 'llm_calls') = 1
     AND (SELECT count(*) FROM pg_indexes
           WHERE tablename = 'llm_calls'
             AND indexname = 'llm_calls_created_idx') = 1
     AND (SELECT count(*) FROM pg_constraint
           WHERE conrelid = 'public.llm_calls'::regclass AND contype = 'f') = 2
    THEN 'ALL GOOD — safe to Republish now'
    ELSE 'NOT READY — do NOT Republish. Send this whole result to Claude.'
  END AS result,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = 'followups_paused') AS kill_switch_column_expect_1,
  (SELECT count(*) FROM information_schema.tables
     WHERE table_name = 'llm_calls') AS ledger_table_expect_1,
  -- 6 = the 5 indexes created above + the primary key's own index, which
  -- PostgreSQL creates automatically and counts here too.
  (SELECT count(*) FROM pg_indexes
     WHERE tablename = 'llm_calls') AS ledger_indexes_expect_6,
  (SELECT count(*) FROM pg_constraint
     WHERE conrelid = 'public.llm_calls'::regclass AND contype = 'f') AS ledger_foreign_keys_expect_2;
