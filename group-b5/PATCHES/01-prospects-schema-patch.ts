/**
 * SCHEMA PATCH for lib/db/src/schema/prospects.ts
 *
 * Adds a `researchBrief jsonb` column to the prospects table to store the
 * structured ProspectBrief produced by the research stage at seed time.
 *
 * APPLY THIS PATCH:
 *   1. Open lib/db/src/schema/prospects.ts in your editor
 *   2. Add `jsonb` to the drizzle-orm/pg-core import line (existing line)
 *   3. Add the researchBrief column line (shown below) in the prospects
 *      table definition, just before the `replied` column
 *   4. Run drizzle migration generate + apply (commands in PATCHES/README.md)
 *
 * The column is nullable because:
 *   - Pre-existing prospects (if any) have no brief
 *   - The seeder UI may want to allow draft prospects before research runs
 *   - Research can be re-run later if needed; the column is overwritten
 *
 * The TypeScript type for the brief is exported from
 *   artifacts/api-server/src/services/prospectResearch.ts as `ProspectBrief`
 */

// ─────────────────────────────────────────────────────────────────
// PATCH — top-of-file import line (modify existing line)
// ─────────────────────────────────────────────────────────────────
//
// BEFORE:
//   import {
//     pgTable,
//     uuid,
//     text,
//     integer,
//     boolean,
//     timestamp,
//     uniqueIndex,
//   } from "drizzle-orm/pg-core";
//
// AFTER (add `jsonb`):
//   import {
//     pgTable,
//     uuid,
//     text,
//     integer,
//     boolean,
//     timestamp,
//     uniqueIndex,
//     jsonb,
//   } from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────────────────────────
// PATCH — column addition inside prospectsTable definition
// ─────────────────────────────────────────────────────────────────
//
// Add this column line just before the `replied` column:
//
//   researchBrief: jsonb("research_brief").$type<ProspectBrief | null>(),
//
// The `$type` annotation gives TypeScript awareness of the JSON shape
// without enforcing it at the database level (jsonb stores any JSON).
// Import the type at the top of prospects.ts:
//
//   import type { ProspectBrief } from "../../../../artifacts/api-server/src/services/prospectResearch";
//
// If your repo uses path aliases for the api-server, use the alias instead
// of the relative path. Example: `import type { ProspectBrief } from "@workspace/api-server/services/prospectResearch";`
//
// If the type import creates a circular dependency between db schema and
// api-server services, fall back to:
//
//   researchBrief: jsonb("research_brief"),
//
// without the $type annotation. The runtime behavior is identical; only the
// TypeScript inference differs. Casts at the call site cover the gap.

// ─────────────────────────────────────────────────────────────────
// FULL PATCHED FILE (drop-in replacement) — use this if you prefer
// ─────────────────────────────────────────────────────────────────

export const PATCHED_PROSPECTS_SCHEMA = `import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

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
    phone: text("phone").notNull(),
    telegramHandle: text("telegram_handle"),
    teamsEmail: text("teams_email"),
    slackUserId: text("slack_user_id"),
    linkedinUrl: text("linkedin_url"),
    apolloPersonId: text("apollo_person_id"),
    sourceMode: text("source_mode").notNull(),
    contextNotes: text("context_notes"),
    // ── NEW COLUMN — research brief produced by the research stage ──
    // Stored as JSONB; structure is ProspectBrief from
    // artifacts/api-server/src/services/prospectResearch.ts
    researchBrief: jsonb("research_brief"),
    firstMessageBody: text("first_message_body"),
    firstMessageChannel: text("first_message_channel"),
    firstMessageSentAt: timestamp("first_message_sent_at", {
      withTimezone: true,
    }),
    replied: integer("replied").notNull().default(0),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    followupPaused: boolean("followup_paused").notNull().default(false),
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
  ],
);

export const insertProspectSchema = createInsertSchema(prospectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProspect = z.infer<typeof insertProspectSchema>;
export type Prospect = typeof prospectsTable.$inferSelect;
`;
