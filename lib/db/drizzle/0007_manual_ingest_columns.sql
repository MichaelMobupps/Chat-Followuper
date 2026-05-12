ALTER TABLE "users" ADD COLUMN "manual_ingest_channels" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "pre_platform_context" text;