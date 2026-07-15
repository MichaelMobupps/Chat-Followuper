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
   * Doctrine variant for this stage. Optional in the type because it is a
   * nested field inside the `stage_timing` jsonb column, and migration 0006
   * only changed the column DEFAULT (applied to newly-created rows) — it did
   * NOT run an UPDATE to backfill existing rows. So users created before 0006
   * carry `stage_timing` entries WITHOUT this field. Reads MUST treat it as
   * optional and fall back to `defaultVariantForStage` below.
   *
   * (Audit DB6: the previous comment here claimed 0006 "backfills existing
   * rows so production data always has the field" — it does not. The optional
   * type + per-stage default is what actually keeps this safe.)
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
  /**
   * Pushover user key for mobile follow-up reminders (optional).
   * Each rep installs the Pushover app and pastes their key from
   * pushover.net/dashboard. Null means Pushover reminders are off.
   */
  pushoverUserKey: text("pushover_user_key"),
  /**
   * Default follow-up channel for new prospects and digest links.
   * One of: whatsapp, telegram. (Teams/Slack were removed.)
   */
  preferredChannel: text("preferred_channel").notNull().default("whatsapp"),
  /**
   * Local-hour window (in digestTimezone) when Pushover may be sent.
   * Outside [start, end) is treated as quiet hours.
   */
  pushoverQuietHourStart: integer("pushover_quiet_hour_start")
    .notNull()
    .default(8),
  pushoverQuietHourEnd: integer("pushover_quiet_hour_end")
    .notNull()
    .default(20),
  /**
   * Reminders & schedule (2026-07-09): per-user control of WHEN reminders
   * fire — previously env-global (PUSHOVER_HOUR_LOCAL=12, weekdays-only
   * hardcoded, email digest every day).
   *
   * pushoverHourLocal — local hour (in digestTimezone) the Pushover reminder
   *   batch fires for this user. digestTimezone is the single per-user zone
   *   for all reminder scheduling (the old global Etc/GMT-2 is retired).
   * pushoverDays — weekdays (0=Sun..6=Sat) Pushover reminders may fire.
   * digestDays — weekdays the email digest may send.
   */
  pushoverHourLocal: integer("pushover_hour_local").notNull().default(12),
  pushoverDays: jsonb("pushover_days")
    .$type<number[]>()
    .notNull()
    .default([1, 2, 3, 4, 5]),
  digestDays: jsonb("digest_days")
    .$type<number[]>()
    .notNull()
    .default([0, 1, 2, 3, 4, 5, 6]),
  /**
   * Optional personal sign-off appended to every generated message.
   */
  messageTemplate: text("message_template"),
  /**
   * Channels with manual prospect ingest enabled (Ticket 2.7-BE-A).
   *
   * Per-user toggle for each follow-up channel. When a channel slug
   * appears in this array, the channel page UI exposes the manual
   * contact ingest controls. Empty array means manual ingest is off
   * everywhere; the page behaves as it did pre-2.7.
   *
   * Stored as a string array rather than a per-channel boolean record
   * to keep schema additions minimal as Teams/Slack land. Channel slug
   * values: "whatsapp" (scoped to whatsapp this ticket; "telegram"
   * lands in 2.9-BE once the identifier-shape decision resolves).
   */
  manualIngestChannels: jsonb("manual_ingest_channels")
    .$type<string[]>()
    .notNull()
    .default([]),
  /**
   * Admin kill switch (2026-07-15): stop this user's FOLLOW-UPS being sent.
   *
   * User decision 2026-07-14: a per-USER switch, distinct from the per-PROSPECT
   * `prospects.followup_paused` that already exists. Both are checked; either
   * one being true stops the send. This one is set by an admin, not the rep.
   *
   * SCOPE — deliberately narrow, and the name is the contract:
   *   - STOPS: follow-up sends + the notifications that drive them (digest
   *     email, pushover digest, overdue escalations, Monday queue-clear nudge),
   *     and every route that sends/stamps a follow-up.
   *   - DOES NOT STOP: the Friday weekly STATS digest (user decision
   *     2026-07-15 — it reports numbers, it does not act on the rep's behalf,
   *     and a paused rep still wants their reporting), nor FIRST messages
   *     (stage 0). A flag named followups_paused must not silently gate
   *     first-touch; that would need its own flag and its own decision.
   *
   * There is NO shared chokepoint for follow-up sends — the due-row predicate
   * is duplicated across 5 selection sites — so this flag is enforced at 11
   * call sites, not one. See smokeKillSwitch.ts, which asserts every one of
   * them; if you add a send path, add it there too or the switch leaks.
   */
  followupsPaused: boolean("followups_paused").notNull().default(false),
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
