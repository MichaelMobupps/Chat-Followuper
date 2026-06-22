import {
  pgTable,
  uuid,
  integer,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { prospectsTable } from "./prospects";
import { followupsTable } from "./followups";

export const actionLogsTable = pgTable(
  "action_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    prospectId: uuid("prospect_id").references(() => prospectsTable.id, {
      onDelete: "set null",
    }),
    followupId: integer("followup_id").references(() => followupsTable.id, {
      onDelete: "set null",
    }),
    actionType: varchar("action_type", { length: 50 }).notNull(),
    actionStatus: varchar("action_status", { length: 20 }).notNull(),
    durationMs: integer("duration_ms"),
    errorDetail: text("error_detail"),
    metadata: jsonb("metadata"),
    executedAt: timestamp("executed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("action_logs_user_executed_idx").on(table.userId, table.executedAt),
    index("action_logs_type_idx").on(table.actionType),
  ],
);

export const ACTION_TYPES = {
  authLogin: "auth.login",
  authLogout: "auth.logout",
  channelWhatsappConnected: "channel.whatsapp.connected",
  seederOrgSearch: "seeder.org_search",
  seederPeopleSearch: "seeder.people_search",
  seederReveal: "seeder.reveal",
  seederMessageGenerated: "seeder.message_generated",
  prospectCreated: "prospect.created",
  prospectReplied: "prospect.replied",
  prospectPaused: "prospect.paused",
  prospectSkipped: "prospect.skipped",
  prospectDeleted: "prospect.deleted",
  // Ticket 2.7-BE-A — manual prospect ingest.
  //
  // manualIngestSingle: SDR submitted a one-off manual prospect via the
  // manual ingest form (4 fields plus optional context). Source mode on
  // the resulting prospect is "manual"; metadata records channel/ticker
  // and whether prePlatformContext was provided.
  //
  // manualIngestToggle: SDR flipped the manual-ingest toggle for a given
  // channel. metadata.channel records the channel slug; metadata.enabled
  // records the new boolean state.
  manualIngestSingle: "prospect.manual_ingest.single",
  manualIngestToggle: "user.manual_ingest_toggle",
  // Ticket 2.8-BE — bulk manual prospect ingest.
  //
  // manualIngestBulk: SDR submitted a multi-row manual ingest payload via
  // POST /api/prospects/manual-ingest/bulk. Recorded once per request,
  // independent of how many rows succeeded. metadata.rowCount /
  // .acceptedCount / .rejectedCount give the request-level breakdown.
  // Per-accepted-row audit rows are still emitted under manualIngestSingle
  // (with metadata.viaBulk = true) so per-prospect audit trails stay
  // queryable by the existing single-ingest action type.
  manualIngestBulk: "prospect.manual_ingest.bulk",
  followupQueued: "followup.queued",
  followupGenerated: "followup.generated",
  followupSent: "followup.sent",
  followupFailed: "followup.failed",
  followupSnoozed: "followup.snoozed",
  // Ticket 2.5-BE — followup management
  followupEdited: "followup.edited",
  sequenceConfigUpdated: "sequence_config.updated",
  digestSent: "digest.sent",
  digestReplyHandled: "digest.reply_handled",
  capExceededSpend: "cap.exceeded.spend",
  capExceededReveals: "cap.exceeded.reveals",
  whatsappSendIntent: "whatsapp.send_intent",
  whatsappLinkGenerated: "whatsapp.link_generated",
  telegramSendIntent: "telegram.send_intent",
  telegramLinkGenerated: "telegram.link_generated",
  // Ticket 1.5b — async Apollo phone reveal flow. Three terminal states
  // for the audit trail: requested (outbound POST sent), arrived (webhook
  // delivered phone, geo gate passed, phone stored), blocked (webhook
  // delivered phone, geo gate rejected, phone NOT stored). The phone
  // number itself is intentionally never written to action_logs.metadata
  // — only the country code, on the blocked path, for diagnostic value.
  apolloPhoneRevealRequested: "apollo.phone_reveal_requested",
  apolloPhoneRevealArrived: "apollo.phone_reveal_arrived",
  apolloPhoneRevealBlocked: "apollo.phone_reveal_blocked",
  prospectorUrlsResolved: "prospector.urls_resolved",
  prospectorCompanyResolved: "prospector.company_resolved",
  prospectorOrgFound: "prospector.org_found",
  prospectorContactsCollected: "prospector.contacts_collected",
  prospectorDiscoverSimple: "prospector.discover_simple",
  prospectorDiscover: "prospector.discover",
} as const;

export type ActionType = (typeof ACTION_TYPES)[keyof typeof ACTION_TYPES];
export type ActionStatus = "success" | "failure" | "skipped" | "blocked";

export const insertActionLogSchema = createInsertSchema(actionLogsTable).omit({
  id: true,
  executedAt: true,
});
export type InsertActionLog = z.infer<typeof insertActionLogSchema>;
export type ActionLog = typeof actionLogsTable.$inferSelect;
