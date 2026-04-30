ALTER TABLE "users" ALTER COLUMN "stage_timing" SET DEFAULT '[{"minDays":3,"maxDays":7},{"minDays":10,"maxDays":14},{"minDays":21,"maxDays":28}]'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "send_days" SET DEFAULT '[1,2,3,4,5]'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "send_hour_start" SET DEFAULT 8;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "send_hour_end" SET DEFAULT 18;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "max_followups" SET DEFAULT 3;--> statement-breakpoint
UPDATE "users" SET "stage_timing" = '[{"minDays":3,"maxDays":7},{"minDays":10,"maxDays":14},{"minDays":21,"maxDays":28}]'::jsonb WHERE "stage_timing" IS NULL;--> statement-breakpoint
UPDATE "users" SET "send_days" = '[1,2,3,4,5]'::jsonb WHERE "send_days" IS NULL;--> statement-breakpoint
UPDATE "users" SET "send_hour_start" = 8 WHERE "send_hour_start" IS NULL;--> statement-breakpoint
UPDATE "users" SET "send_hour_end" = 18 WHERE "send_hour_end" IS NULL;--> statement-breakpoint
UPDATE "users" SET "max_followups" = 3 WHERE "max_followups" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "stage_timing" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "send_days" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "send_hour_start" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "send_hour_end" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "max_followups" SET NOT NULL;
