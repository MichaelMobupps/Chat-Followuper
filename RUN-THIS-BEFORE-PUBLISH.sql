-- ===========================================================================
-- PRODUCTION SETUP — run BEFORE you Publish.   (v4, 2026-07-16)
-- ===========================================================================
--
-- HOW TO USE (the only rules):
--   1. Every runnable line below is ONE SHORT STATEMENT on ONE LINE.
--   2. Select one line (triple-click it), press Run. Then the next line.
--   3. Never select two lines together.
--
-- Why v4: v3 still had three multi-line statements (a status check, the big
-- CREATE TABLE, the final verify). Selecting 14 lines exactly is easy to get
-- wrong and long statements error in the console. v4 has none of that — the
-- table is built one short line at a time.
--
-- SAFE TO RUN NOW, before the code ships: nothing here changes any behaviour.
-- SAFE TO RUN TWICE: every line is guarded or self-resetting. If you are not
-- sure whether a line ran, just run it again.
-- VALIDATED 2026-07-16: the whole sequence was run against a simulated
-- prod-at-current-state AND against a fully-migrated copy, twice each, in a
-- rolled-back transaction — zero errors on every path.
--
-- If ANY line errors: STOP, copy the error, send it to Claude. Do not publish.
--
-- ===========================================================================
-- STEP 1 — the admin kill-switch column. (migration 0019)
-- ===========================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS followups_paused boolean DEFAULT false NOT NULL;

-- ===========================================================================
-- STEP 2 — the cost-ledger table, empty shell first. (migration 0020)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS llm_calls (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

-- ===========================================================================
-- STEPS 3–13 — its columns, one per Run, any order, skip-proof.
-- ===========================================================================
ALTER TABLE llm_calls ADD COLUMN IF NOT EXISTS user_id uuid;

ALTER TABLE llm_calls ADD COLUMN IF NOT EXISTS prospect_id uuid;

ALTER TABLE llm_calls ADD COLUMN IF NOT EXISTS task text NOT NULL;

ALTER TABLE llm_calls ADD COLUMN IF NOT EXISTS model text NOT NULL;

ALTER TABLE llm_calls ADD COLUMN IF NOT EXISTS provider text NOT NULL;

ALTER TABLE llm_calls ADD COLUMN IF NOT EXISTS fallback boolean DEFAULT false NOT NULL;

ALTER TABLE llm_calls ADD COLUMN IF NOT EXISTS input_tokens integer DEFAULT 0 NOT NULL;

ALTER TABLE llm_calls ADD COLUMN IF NOT EXISTS output_tokens integer DEFAULT 0 NOT NULL;

ALTER TABLE llm_calls ADD COLUMN IF NOT EXISTS cost_usd numeric(12,6) DEFAULT 0 NOT NULL;

ALTER TABLE llm_calls ADD COLUMN IF NOT EXISTS cost_unpriced boolean DEFAULT false NOT NULL;

ALTER TABLE llm_calls ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now() NOT NULL;

-- ===========================================================================
-- STEPS 14–17 — the two links to users/prospects. Each link is a PAIR:
-- the DROP resets it (fine if it says nothing to drop), the ADD creates it.
-- Always run the pair in order: DROP line, then its ADD line.
-- ===========================================================================
ALTER TABLE llm_calls DROP CONSTRAINT IF EXISTS llm_calls_user_id_users_id_fk;

ALTER TABLE llm_calls ADD CONSTRAINT llm_calls_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE llm_calls DROP CONSTRAINT IF EXISTS llm_calls_prospect_id_prospects_id_fk;

ALTER TABLE llm_calls ADD CONSTRAINT llm_calls_prospect_id_prospects_id_fk FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE SET NULL;

-- ===========================================================================
-- STEPS 18–22 — five indexes. (migrations 0020 + 0021)
-- Speed only: if one refuses to run, it is NOT a reason to stop the deploy.
-- ===========================================================================
CREATE INDEX IF NOT EXISTS llm_calls_user_created_idx ON llm_calls (user_id, created_at);

CREATE INDEX IF NOT EXISTS llm_calls_model_idx ON llm_calls (model);

CREATE INDEX IF NOT EXISTS llm_calls_task_idx ON llm_calls (task);

CREATE INDEX IF NOT EXISTS llm_calls_prospect_id_idx ON llm_calls (prospect_id);

CREATE INDEX IF NOT EXISTS llm_calls_created_idx ON llm_calls (created_at);

-- ===========================================================================
-- STEPS 23–26 — VERIFY. Read-only, changes nothing, run any time.
-- Each line's answer must equal the number in its column name (want_1 → 1,
-- want_6 → 6, want_2 → 2). All four right = safe to Republish now.
-- Any other number: STOP, do not Republish, send the numbers to Claude.
-- ===========================================================================
SELECT count(*) AS kill_switch_want_1 FROM information_schema.columns WHERE table_name='users' AND column_name='followups_paused';

SELECT count(*) AS ledger_table_want_1 FROM information_schema.tables WHERE table_name='llm_calls';

SELECT count(*) AS ledger_indexes_want_6 FROM pg_indexes WHERE tablename='llm_calls';

SELECT count(*) AS ledger_links_want_2 FROM pg_constraint WHERE conname LIKE 'llm_calls%' AND contype='f';

-- ===========================================================================
-- AFTER ALL FOUR VERIFY NUMBERS ARE RIGHT:
--   1. Republish the app.
--   2. Set the ADMIN_EMAILS secret:  ADMIN_EMAILS=michael@mobupps.com
--      (until it is set, NOBODY is admin — that is intentional and safe).
-- ===========================================================================
