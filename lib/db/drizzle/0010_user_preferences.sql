ALTER TABLE "users" ADD COLUMN "preferred_channel" text DEFAULT 'whatsapp' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pushover_quiet_hour_start" integer DEFAULT 8 NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pushover_quiet_hour_end" integer DEFAULT 20 NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "message_template" text;