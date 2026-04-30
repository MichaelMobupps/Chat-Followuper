CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"is_connected" boolean DEFAULT false NOT NULL,
	"stage_timing" jsonb,
	"send_days" jsonb,
	"send_hour_start" integer,
	"send_hour_end" integer,
	"max_followups" integer,
	"require_approval" boolean DEFAULT false NOT NULL,
	"digest_hour_local" integer DEFAULT 9 NOT NULL,
	"digest_timezone" text DEFAULT 'Asia/Jerusalem' NOT NULL,
	"microsoft_refresh_token" text,
	"slack_bot_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"prospect_name" text,
	"company" text,
	"title" text,
	"vertical" text,
	"sub_vertical" text,
	"product" text,
	"country" text,
	"language" text,
	"phone" text NOT NULL,
	"telegram_handle" text,
	"teams_email" text,
	"slack_user_id" text,
	"linkedin_url" text,
	"apollo_person_id" text,
	"source_mode" text NOT NULL,
	"context_notes" text,
	"first_message_body" text,
	"first_message_channel" text,
	"first_message_sent_at" timestamp with time zone,
	"replied" integer DEFAULT 0 NOT NULL,
	"replied_at" timestamp with time zone,
	"followup_paused" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "followups" (
	"id" serial PRIMARY KEY NOT NULL,
	"prospect_id" uuid NOT NULL,
	"stage" integer NOT NULL,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"generated_message" text,
	"sent_at" timestamp with time zone,
	"deep_link_url" text,
	"clicked_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"prospect_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"channel" text NOT NULL,
	"body" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"source_followup_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_link_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"action" text NOT NULL,
	"payload_json" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "magic_link_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "oauth_nonces" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"nonce" text NOT NULL,
	"provider" text NOT NULL,
	"redirect_uri" text,
	"metadata" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_nonces_nonce_unique" UNIQUE("nonce")
);
--> statement-breakpoint
CREATE TABLE "daily_usage" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"messages_generated" integer DEFAULT 0 NOT NULL,
	"messages_sent" integer DEFAULT 0 NOT NULL,
	"apollo_reveals_used" integer DEFAULT 0 NOT NULL,
	"anthropic_spend_usd" numeric(10, 4) DEFAULT '0' NOT NULL,
	"digest_sent" boolean DEFAULT false NOT NULL,
	CONSTRAINT "daily_usage_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "action_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"prospect_id" uuid,
	"followup_id" integer,
	"action_type" varchar(50) NOT NULL,
	"action_status" varchar(20) NOT NULL,
	"duration_ms" integer,
	"error_detail" text,
	"metadata" jsonb,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followups" ADD CONSTRAINT "followups_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_source_followup_id_followups_id_fk" FOREIGN KEY ("source_followup_id") REFERENCES "public"."followups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_link_tokens" ADD CONSTRAINT "magic_link_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_nonces" ADD CONSTRAINT "oauth_nonces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_usage" ADD CONSTRAINT "daily_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_followup_id_followups_id_fk" FOREIGN KEY ("followup_id") REFERENCES "public"."followups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prospects_user_phone_unique" ON "prospects" USING btree ("user_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "followups_prospect_stage_unique" ON "followups" USING btree ("prospect_id","stage");--> statement-breakpoint
CREATE INDEX "conversations_prospect_ts_idx" ON "conversations" USING btree ("prospect_id","ts" DESC);--> statement-breakpoint
CREATE INDEX "magic_link_tokens_token_idx" ON "magic_link_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "oauth_nonces_nonce_idx" ON "oauth_nonces" USING btree ("nonce");--> statement-breakpoint
CREATE INDEX "action_logs_user_executed_idx" ON "action_logs" USING btree ("user_id","executed_at");--> statement-breakpoint
CREATE INDEX "action_logs_type_idx" ON "action_logs" USING btree ("action_type");