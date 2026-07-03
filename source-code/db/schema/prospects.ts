import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { campaignsTable } from "./campaigns";

export const prospectsTable = pgTable(
  "prospects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    prospectName: text("prospect_name"),
    company: text("company"),
    title: text("title"),
    vertical: text("vertical"),
    subVertical: text("sub_vertical"),
    product: text("product"),
    country: text("country"),
    language: text("language"),
    /**
     * Phone (E.164). Nullable since Ticket 2.3-BE-B to support
     * pending-reveal prospects in the bulk WhatsApp flow: Apollo's
     * "Maybe: please request direct dial" path returns no phone, so
     * we create the prospect with phone=null and apolloPersonId set,
     * then the webhook handler promotes phoneNumber → phone via the
     * correlationId lookup once Apollo's bulk_match resolves.
     *
     * The (userId, phone) unique constraint still applies once phone
     * is non-null; PostgreSQL permits multiple NULLs in a UNIQUE index.
     *
     * Routes that build wa.me deep links MUST null-check phone before
     * calling generateLink (see routes/whatsappLink.ts → 409
     * phone_reveal_pending).
     */
    phone: text("phone"),
    telegramHandle: text("telegram_handle"),
    teamsEmail: text("teams_email"),
    slackUserId: text("slack_user_id"),
    linkedinUrl: text("linkedin_url"),
    apolloPersonId: text("apollo_person_id"),
    apolloOrgId: text("apollo_org_id"),
    sourceMode: text("source_mode").notNull(),
    campaignId: uuid("campaign_id").references(() => campaignsTable.id, {
      onDelete: "set null",
    }),
    contextNotes: text("context_notes"),
    /**
     * Pre-platform context (Ticket 2.7-BE-A).
     *
     * Optional free-text paste of the last message the SDR sent to this
     * prospect in their actual WhatsApp/Telegram, captured at manual
     * ingest time so the first Followuper-generated message can pick up
     * where the off-platform conversation left off. Fed into the
     * message generator's context when present.
     *
     * Null for Apollo-sourced prospects and for manual-ingest prospects
     * where the SDR skipped the optional field.
     */
    prePlatformContext: text("pre_platform_context"),
    researchBrief: jsonb("research_brief"),
    firstMessageBody: text("first_message_body"),
    firstMessageChannel: text("first_message_channel"),
    firstMessageSentAt: timestamp("first_message_sent_at", {
      withTimezone: true,
    }),
    replied: integer("replied").notNull().default(0),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    followupPaused: boolean("followup_paused").notNull().default(false),
    /**
     * Phone reveal columns (Ticket 1.5b — async Apollo phone reveal flow).
     *
     * Apollo's phone-reveal pattern is asynchronous: the request endpoint
     * accepts a person id and a webhook URL, returns 202, then later POSTs
     * the resolved phone number to the webhook. We persist a short-lived
     * correlation token at request time, then match the webhook callback
     * to the originating prospect via that token. The token (32 raw bytes,
     * base64url-encoded) is the lookup key — never the prospect id, which
     * if leaked would let an attacker replay phone-reveal callbacks.
     *
     * Status enum (text, not Postgres enum, to keep migrations cheap):
     *   - "none"     no reveal has been requested for this prospect
     *   - "pending"  request has been sent to Apollo, awaiting webhook
     *   - "arrived"  webhook delivered a phone, geo gate passed, stored
     *   - "blocked"  webhook delivered a phone, geo gate rejected; no
     *                phone is persisted in this case
     *   - "no_match" Apollo returned no phone for this person (terminal)
     *   - "expired"  pending reveal aged past REVEAL_PENDING_MAX_AGE_HOURS
     *                with no webhook; soft terminal (Ticket 1.5c). A late
     *                webhook can still promote it to "arrived".
     *
     * phoneNumber is populated ONLY on the "arrived" path, after the geo
     * gate passes. On "blocked" the phone is intentionally discarded.
     */
    phoneRevealStatus: text("phone_reveal_status").notNull().default("none"),
    phoneNumber: text("phone_number"),
    phoneRevealRequestedAt: timestamp("phone_reveal_requested_at", {
      withTimezone: true,
    }),
    phoneRevealCompletedAt: timestamp("phone_reveal_completed_at", {
      withTimezone: true,
    }),
    phoneRevealCorrelationId: text("phone_reveal_correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("prospects_user_phone_unique").on(table.userId, table.phone),
    // Webhook-handler hot path: lookup by correlation token. Indexed for
    // O(log n) lookup on what would otherwise be a full-table scan.
    index("prospects_phone_reveal_correlation_idx").on(
      table.phoneRevealCorrelationId,
    ),
    // DB4: covering index for the campaign_id FK so deleting a campaign doesn't
    // sequential-scan + lock the whole prospects table.
    index("prospects_campaign_id_idx").on(table.campaignId),
    // DB5: the (user_id, phone) unique index doesn't dedup non-phone identities
    // (NULLs are distinct), so Telegram/Teams/Slack + reveal-pending prospects
    // (phone=null) could be created — and messaged — repeatedly. Partial unique
    // indexes per identity dedup them per user without constraining null rows.
    uniqueIndex("prospects_user_telegram_unique")
      .on(table.userId, table.telegramHandle)
      .where(sql`${table.telegramHandle} IS NOT NULL`),
    uniqueIndex("prospects_user_teams_unique")
      .on(table.userId, table.teamsEmail)
      .where(sql`${table.teamsEmail} IS NOT NULL`),
    uniqueIndex("prospects_user_slack_unique")
      .on(table.userId, table.slackUserId)
      .where(sql`${table.slackUserId} IS NOT NULL`),
    uniqueIndex("prospects_user_apollo_person_unique")
      .on(table.userId, table.apolloPersonId)
      .where(sql`${table.apolloPersonId} IS NOT NULL`),
  ],
);

export const insertProspectSchema = createInsertSchema(prospectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProspect = z.infer<typeof insertProspectSchema>;
export type Prospect = typeof prospectsTable.$inferSelect;