ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferred_channel" text DEFAULT 'whatsapp' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pushover_quiet_hour_start" integer DEFAULT 8 NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pushover_quiet_hour_end" integer DEFAULT 20 NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "message_template" text;