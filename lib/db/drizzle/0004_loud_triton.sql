ALTER TABLE "prospects" ADD COLUMN "phone_reveal_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "phone_number" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "phone_reveal_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "phone_reveal_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "phone_reveal_correlation_id" text;--> statement-breakpoint
CREATE INDEX "prospects_phone_reveal_correlation_idx" ON "prospects" USING btree ("phone_reveal_correlation_id");