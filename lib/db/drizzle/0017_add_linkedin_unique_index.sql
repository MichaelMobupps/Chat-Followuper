-- F-A: per-user LinkedIn dedup (partial unique on linkedin_url). Idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS "prospects_user_linkedin_unique" ON "prospects" USING btree ("user_id","linkedin_url") WHERE "prospects"."linkedin_url" IS NOT NULL;
