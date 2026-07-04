-- BATCH 1 of 4 — new columns (fast). Run, confirm no red error, then Batch 2.
ALTER TABLE "users"       ADD COLUMN IF NOT EXISTS "pushover_user_key"         text;
ALTER TABLE "users"       ADD COLUMN IF NOT EXISTS "preferred_channel"         text    DEFAULT 'whatsapp' NOT NULL;
ALTER TABLE "users"       ADD COLUMN IF NOT EXISTS "pushover_quiet_hour_start" integer DEFAULT 8  NOT NULL;
ALTER TABLE "users"       ADD COLUMN IF NOT EXISTS "pushover_quiet_hour_end"   integer DEFAULT 20 NOT NULL;
ALTER TABLE "users"       ADD COLUMN IF NOT EXISTS "message_template"          text;
ALTER TABLE "daily_usage" ADD COLUMN IF NOT EXISTS "pushover_sent"             boolean DEFAULT false NOT NULL;
