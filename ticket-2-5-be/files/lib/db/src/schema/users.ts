import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Doctrine variants — Ticket 2.5-BE.
 *
 * Per-stage rhetorical strategy the SDR wants this followup to take.
 * Derived from the existing stage-rotation logic baked into the critic
 * prompt (services/messagePrompts.ts), which today hard-codes:
 *   stage 1 → new insight or data point
 *   stage 2 → competitor or market move (shift angle)
 *   stage 3 → direct and easy out
 *   stage 4+ → continue rotating fresh angles
 *
 * Exposed here so the SDR can override the per-stage default from the
 * sequence-config page. This ticket stores the choice. A separate
 * follow-up ticket will wire variant-aware branching into the critic
 * prompt so the choice actually changes what the LLM produces. Until
 * then, persisting a variant is data-layer-only; the generator still
 * uses its hard-coded per-stage logic.
 */
export const DOCTRINE_VARIANTS = [
  "new_insight",
  "competitor_move",
  "easy_out",
  "fresh_angle",
  "proof_point",
  "urgency",
  "social_proof",
] as const;
export type DoctrineVariant = (typeof DOCTRINE_VARIANTS)[number];

export interface StageTiming {
  minDays: number;
  maxDays: number;
  /**
   * Doctrine variant for this stage. Optional in the type to tolerate
   * pre-migration rows that don't carry the field yet — the 0006
   * migration backfills existing rows so production data always has
   * the field, but defensive reads should still treat it as optional
   * and fall back to the per-stage default below.
   */
  doctrineVariant?: DoctrineVariant;
}

/**
 * Default variant per stage index (0-indexed). Matches the existing
 * stage-rotation defaults in the critic prompt.
 */
export const DEFAULT_STAGE_VARIANT: DoctrineVariant[] = [
  "new_insight",
  "competitor_move",
  "easy_out",
];

export function defaultVariantForStage(stageIndex: number): DoctrineVariant {
  return DEFAULT_STAGE_VARIANT[stageIndex] ?? "fresh_angle";
}

export const DEFAULT_STAGE_TIMING: StageTiming[] = [
  { minDays: 3, maxDays: 7, doctrineVariant: "new_insight" },
  { minDays: 10, maxDays: 14, doctrineVariant: "competitor_move" },
  { minDays: 21, maxDays: 28, doctrineVariant: "easy_out" },
];

export const DEFAULT_SEND_DAYS: number[] = [1, 2, 3, 4, 5];

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  isConnected: boolean("is_connected").notNull().default(false),
  stageTiming: jsonb("stage_timing")
    .$type<StageTiming[]>()
    .notNull()
    .default(DEFAULT_STAGE_TIMING),
  sendDays: jsonb("send_days")
    .$type<number[]>()
    .notNull()
    .default(DEFAULT_SEND_DAYS),
  sendHourStart: integer("send_hour_start").notNull().default(8),
  sendHourEnd: integer("send_hour_end").notNull().default(18),
  maxFollowups: integer("max_followups").notNull().default(3),
  requireApproval: boolean("require_approval").notNull().default(false),
  digestHourLocal: integer("digest_hour_local").notNull().default(9),
  digestTimezone: text("digest_timezone").notNull().default("Asia/Jerusalem"),
  microsoftRefreshToken: text("microsoft_refresh_token"),
  slackBotToken: text("slack_bot_token"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
