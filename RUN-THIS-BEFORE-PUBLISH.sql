-- ===========================================================================
-- PRODUCTION SETUP — run BEFORE you Publish.   (v2, 2026-07-15)
-- ===========================================================================
--
-- v1 failed in the Replit SQL Console ("Invalid response from Replit driver").
-- The console cannot handle `DO $$ ... $$` blocks. v2 has none — same end
-- result, plain statements only.
--
-- HOW TO RUN: work through STEP 0 → STEP 5 below, ONE step at a time. Select
-- just that step's lines, then Run. Do NOT paste the whole file at once — that
-- is what broke v1.
--
-- SAFE TO RUN NOW, before the code ships: nothing here changes any behaviour.
-- The new column defaults to false = "not paused" = exactly what happens today,
-- and the new table starts empty. Nothing reads or writes either until Publish.
--
-- SAFE TO RUN TWICE: every step is guarded. If you are unsure whether a step
-- ran, run it again — it does nothing the second time.
--
-- VALIDATED: every step run against a copy of production's exact current state,
-- then run a second time, inside a transaction that was rolled back.
--
-- ===========================================================================
-- STEP 0 — READ ONLY. Changes nothing. Tells us where we are.
-- Run this FIRST, especially after the failed v1 attempt.
-- Expect all zeros on a fresh prod. Any 1s just mean part of v1 got through —
-- that is fine and safe; the steps below skip whatever already exists.
-- ===========================================================================
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = 'followups_paused') AS has_kill_switch_column,
  (SELECT count(*) FROM information_schema.tables
     WHERE table_name = 'llm_calls') AS has_ledger_table,
  (SELECT count(*) FROM pg_indexes
     WHERE tablename = 'llm_calls') AS ledger_index_count,
  (SELECT count(*) FROM pg_constraint
     WHERE conname LIKE 'llm_calls%' AND contype = 'f') AS ledger_foreign_key_count;


-- ===========================================================================
-- STEP 1 — the admin kill switch column.  (migration 0019)
-- Select the one ALTER line below, then Run.
-- ===========================================================================
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "followups_paused" boolean DEFAULT false NOT NULL;


-- ===========================================================================
-- STEP 2 — the cost ledger table.  (migration 0020)
-- Select the whole CREATE TABLE block including the final );  then Run.
--
-- The two foreign keys are declared INLINE here, with the exact names the app
-- expects. v1 added them afterwards inside DO $$ blocks — that is what the
-- console choked on. Same end state, no dollar-quoting.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "llm_calls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid CONSTRAINT "llm_calls_user_id_users_id_fk" REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "prospect_id" uuid CONSTRAINT "llm_calls_prospect_id_prospects_id_fk" REFERENCES "public"."prospects"("id") ON DELETE SET NULL,
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


-- ===========================================================================
-- STEP 3 — the ledger's indexes.  (migration 0020)
-- Four lines. Run them together, or one at a time if the console complains.
-- ===========================================================================
CREATE INDEX IF NOT EXISTS "llm_calls_user_created_idx" ON "llm_calls" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "llm_calls_model_idx" ON "llm_calls" ("model");
CREATE INDEX IF NOT EXISTS "llm_calls_task_idx" ON "llm_calls" ("task");
CREATE INDEX IF NOT EXISTS "llm_calls_prospect_id_idx" ON "llm_calls" ("prospect_id");


-- ===========================================================================
-- STEP 4 — the index the spend page needs.  (migration 0021)
-- ===========================================================================
CREATE INDEX IF NOT EXISTS "llm_calls_created_idx" ON "llm_calls" ("created_at");


-- ===========================================================================
-- STEP 5 — VERIFY. READ ONLY, changes nothing.
--
-- You want:   ALL GOOD - safe to Republish now
--
-- Anything else: STOP, do not Republish, send the result to Claude.
-- ===========================================================================
SELECT
  CASE
    WHEN (SELECT count(*) FROM information_schema.columns
           WHERE table_name = 'users' AND column_name = 'followups_paused') = 1
     AND (SELECT count(*) FROM information_schema.tables
           WHERE table_name = 'llm_calls') = 1
     AND (SELECT count(*) FROM pg_indexes
           WHERE tablename = 'llm_calls' AND indexname = 'llm_calls_created_idx') = 1
     AND (SELECT count(*) FROM pg_constraint
           WHERE conname LIKE 'llm_calls%' AND contype = 'f') = 2
    THEN 'ALL GOOD - safe to Republish now'
    ELSE 'NOT READY - do NOT Republish. Send this whole result to Claude.'
  END AS result,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = 'followups_paused') AS kill_switch_column_want_1,
  (SELECT count(*) FROM information_schema.tables
     WHERE table_name = 'llm_calls') AS ledger_table_want_1,
  -- 6 = the 5 indexes above + the primary key's own index, which PostgreSQL
  -- creates automatically and counts here too.
  (SELECT count(*) FROM pg_indexes
     WHERE tablename = 'llm_calls') AS ledger_indexes_want_6,
  (SELECT count(*) FROM pg_constraint
     WHERE conname LIKE 'llm_calls%' AND contype = 'f') AS ledger_foreign_keys_want_2;
