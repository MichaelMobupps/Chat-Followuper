ALTER TABLE "users" ALTER COLUMN "stage_timing" SET DEFAULT '[{"minDays":3,"maxDays":7},{"minDays":10,"maxDays":14},{"minDays":21,"maxDays":28}]'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "stage_timing" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "send_days" SET DEFAULT '[1,2,3,4,5]'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "send_days" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "send_hour_start" SET DEFAULT 8;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "send_hour_start" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "send_hour_end" SET DEFAULT 18;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "send_hour_end" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "max_followups" SET DEFAULT 3;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "max_followups" SET NOT NULL;