ALTER TABLE "users" ADD COLUMN "pushover_hour_local" integer DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pushover_days" jsonb DEFAULT '[1,2,3,4,5]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "digest_days" jsonb DEFAULT '[0,1,2,3,4,5,6]'::jsonb NOT NULL;