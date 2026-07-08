/**
 * /api/followups routes — Ticket 2.5-BE.
 *
 * Follow-up management for the per-channel follow-up pages
 * (/followup/whatsapp, /followup/telegram). Channel-parameterized so a
 * single router serves both chat-tool follow-up flows; both WhatsApp's and
 * Telegram's send mechanisms are implemented (they use the deep-link
 * generateLink + recordSendIntent services). The list/edit/bulk-archive
 * endpoints are channel-agnostic. (Teams/Slack were removed — never built
 * past a 501 stub.)
 *
 * Routes:
 *   GET    /api/followups                    — list with filters (channel-parameterized)
 *   POST   /api/prospects/:id/send-next-followup — generate next followup message + deep link
 *   PATCH  /api/followups/:id                — edit a scheduled followup
 *   POST   /api/followups/bulk/archive       — bulk hard-delete prospects (cascades to followups + conversations)
 *
 * Convention: matches the 1.7-backend / prospects.ts pattern — Zod
 * validation, requireAuth + userId scoping on every read and write,
 * 404 (not 403) on cross-user access to avoid existence leaks,
 * action_logs entry on mutations.
 *
 * UI-status mapping (single source of truth, FE mirrors but does NOT recompute):
 *   paused        → prospect.followupPaused = true
 *   replied       → prospect.replied = 1
 *   not_yet_sent  → no followup with sentAt set for this prospect+channel; not paused; not replied
 *   sent          → at least one followup with sentAt set; more still scheduled; not paused; not replied
 *   no_reply      → sentCount >= user.maxFollowups; none scheduled; not replied; not paused (terminal)
 *
 * Order of precedence in the derived field: paused > replied > terminal-no-reply > sent > not_yet_sent.
 * The list query applies the user's chosen `status` filter strictly (e.g. a paused-AND-replied
 * row appears under `paused` only, not under `replied`).
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z, ZodError } from "zod/v4";
import {
  db,
  prospectsTable,
  followupsTable,
  usersTable,
  actionLogsTable,
  ACTION_TYPES,
  type Followup,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import {
  generateLink,
  GeoGateBlockedError,
  InvalidPhoneError,
} from "../services/channels/whatsapp";
import { generateLink as generateTelegramLink } from "../services/channels/telegram";
import { generateAndPersistFollowupMessage } from "../services/followupMessageService";

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const SUPPORTED_CHANNELS = ["whatsapp", "telegram"] as const;
type SupportedChannel = (typeof SUPPORTED_CHANNELS)[number];

const SEND_IMPLEMENTED_CHANNELS: ReadonlySet<SupportedChannel> = new Set([
  "whatsapp",
  "telegram",
]);

const LIST_STATUSES = [
  "all",
  "not_yet_sent",
  "sent",
  "replied",
  "no_reply",
  "paused",
] as const;
type ListStatus = (typeof LIST_STATUSES)[number];

const FOLLOWUP_EDITABLE_STATUSES = [
  "scheduled",
  "queued",
  "cancelled",
  "sent",
] as const;

// ─────────────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  channel: z.enum(SUPPORTED_CHANNELS),
  status: z.enum(LIST_STATUSES).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});

const patchFollowupBodySchema = z.object({
  generatedMessage: z.string().min(1).max(10000).optional(),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  status: z.enum(FOLLOWUP_EDITABLE_STATUSES).optional(),
}).refine(
  (v) => Object.keys(v).length > 0,
  { message: "at least one field must be provided" },
);

const bulkArchiveBodySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("prospect_ids"),
    prospectIds: z.array(z.string().uuid()).min(1).max(500),
  }),
  z.object({
    mode: z.literal("filter"),
    channel: z.enum(SUPPORTED_CHANNELS),
    filter: z.enum(["replied", "no_reply", "paused"]),
  }),
]);

// ─────────────────────────────────────────────────────────────────
// SQL helpers — status filter expressions
// ─────────────────────────────────────────────────────────────────

/**
 * Build the WHERE clause for a given UI status under a given channel.
 * `maxFollowups` is the user's configured cap, used for the terminal
 * `no_reply` derivation. Returns undefined for `all` (no extra filter).
 */
function statusWhereClause(
  status: ListStatus,
  channel: SupportedChannel,
  maxFollowups: number,
) {
  const channelLit = sql.raw(`'${channel}'`);

  // We hand-quote channel into the SQL literal because Drizzle's
  // parameterized binding inside a raw SQL fragment for EXISTS is
  // awkward. SAFE because `channel` is validated against the
  // SUPPORTED_CHANNELS enum above — no user input reaches this string.
  // Same for maxFollowups (validated as int 0-20 in the sequence-config
  // schema and read from the DB).
  const maxLit = sql.raw(String(maxFollowups));

  switch (status) {
    case "paused":
      return eq(prospectsTable.followupPaused, true);

    case "replied":
      return and(
        eq(prospectsTable.followupPaused, false),
        eq(prospectsTable.replied, 1),
      );

    case "not_yet_sent":
      return and(
        eq(prospectsTable.followupPaused, false),
        eq(prospectsTable.replied, 0),
        sql`NOT EXISTS (
          SELECT 1 FROM followups f
          WHERE f.prospect_id = ${prospectsTable.id}
            AND f.channel = ${channelLit}
            AND f.sent_at IS NOT NULL
        )`,
      );

    case "sent":
      return and(
        eq(prospectsTable.followupPaused, false),
        eq(prospectsTable.replied, 0),
        sql`EXISTS (
          SELECT 1 FROM followups f
          WHERE f.prospect_id = ${prospectsTable.id}
            AND f.channel = ${channelLit}
            AND f.sent_at IS NOT NULL
        )`,
        sql`EXISTS (
          SELECT 1 FROM followups f
          WHERE f.prospect_id = ${prospectsTable.id}
            AND f.channel = ${channelLit}
            AND f.sent_at IS NULL
            AND f.status = 'scheduled'
        )`,
      );

    case "no_reply":
      return and(
        eq(prospectsTable.followupPaused, false),
        eq(prospectsTable.replied, 0),
        sql`(SELECT COUNT(*) FROM followups f
              WHERE f.prospect_id = ${prospectsTable.id}
                AND f.channel = ${channelLit}
                AND f.sent_at IS NOT NULL) >= ${maxLit}`,
        sql`NOT EXISTS (
          SELECT 1 FROM followups f
          WHERE f.prospect_id = ${prospectsTable.id}
            AND f.channel = ${channelLit}
            AND f.sent_at IS NULL
            AND f.status = 'scheduled'
        )`,
      );

    case "all":
    default:
      // For `all`, restrict to prospects that have at least one followup
      // for this channel OR have a firstMessageChannel matching it (so
      // the page shows newly-created prospects with no scheduled
      // followups yet alongside ones with sequences underway).
      return sql`(
        EXISTS (
          SELECT 1 FROM followups f
          WHERE f.prospect_id = ${prospectsTable.id}
            AND f.channel = ${channelLit}
        )
        OR ${prospectsTable.firstMessageChannel} = ${channelLit}
      )`;
  }
}

/**
 * Derive the UI status from a fully-loaded row. Used to set the
 * `derived.uiStatus` field on each returned item, so the FE never has
 * to recompute. Mirrors the SQL filter logic above; if the two
 * disagree, that's a bug — change them together.
 */
function deriveUiStatus(args: {
  paused: boolean;
  replied: number;
  sentCount: number;
  scheduledCount: number;
  maxFollowups: number;
}): ListStatus {
  if (args.paused) return "paused";
  if (args.replied === 1) return "replied";
  if (args.sentCount === 0) return "not_yet_sent";
  if (args.sentCount >= args.maxFollowups && args.scheduledCount === 0) {
    return "no_reply";
  }
  return "sent";
}

// ─────────────────────────────────────────────────────────────────
// GET /api/followups
// ─────────────────────────────────────────────────────────────────

router.get(
  "/followups",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;

    let query: z.infer<typeof listQuerySchema>;
    try {
      query = listQuerySchema.parse(req.query);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "invalid_query", issues: err.issues });
        return;
      }
      throw err;
    }

    // Read user's maxFollowups for the no_reply terminal calculation.
    const userRows = await db
      .select({ maxFollowups: usersTable.maxFollowups })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    const maxFollowups = userRows[0]?.maxFollowups ?? 3;

    const statusClause = statusWhereClause(
      query.status,
      query.channel,
      maxFollowups,
    );
    const whereClause = statusClause
      ? and(eq(prospectsTable.userId, user.id), statusClause)
      : eq(prospectsTable.userId, user.id);

    const offset = (query.page - 1) * query.perPage;

    // Two queries: paginated prospect list + their followups. Joining
    // and aggregating in one go is feasible but clutters the read path;
    // for v1 the overhead of a second query is negligible at our row
    // counts. Revisit if list latency becomes a real concern.
    const [prospectRows, totalRow] = await Promise.all([
      db
        .select({
          id: prospectsTable.id,
          prospectName: prospectsTable.prospectName,
          company: prospectsTable.company,
          title: prospectsTable.title,
          vertical: prospectsTable.vertical,
          subVertical: prospectsTable.subVertical,
          country: prospectsTable.country,
          language: prospectsTable.language,
          phone: prospectsTable.phone,
          telegramHandle: prospectsTable.telegramHandle,
          firstMessageBody: prospectsTable.firstMessageBody,
          firstMessageChannel: prospectsTable.firstMessageChannel,
          firstMessageSentAt: prospectsTable.firstMessageSentAt,
          replied: prospectsTable.replied,
          repliedAt: prospectsTable.repliedAt,
          followupPaused: prospectsTable.followupPaused,
          campaignId: prospectsTable.campaignId,
          createdAt: prospectsTable.createdAt,
          updatedAt: prospectsTable.updatedAt,
        })
        .from(prospectsTable)
        .where(whereClause)
        .orderBy(desc(prospectsTable.updatedAt))
        .limit(query.perPage)
        .offset(offset),
      db
        .select({ value: count() })
        .from(prospectsTable)
        .where(whereClause),
    ]);

    const total = totalRow[0]?.value ?? 0;
    const prospectIds = prospectRows.map((p) => p.id);

    // Fetch followups for these prospects in one go.
    const followupRows = prospectIds.length === 0
      ? []
      : await db
          .select()
          .from(followupsTable)
          .where(
            and(
              inArray(followupsTable.prospectId, prospectIds),
              eq(followupsTable.channel, query.channel),
            ),
          )
          .orderBy(asc(followupsTable.stage));

    // Group followups by prospectId once.
    const followupsByProspect = new Map<string, Followup[]>();
    for (const f of followupRows) {
      const arr = followupsByProspect.get(f.prospectId);
      if (arr) {
        arr.push(f);
      } else {
        followupsByProspect.set(f.prospectId, [f]);
      }
    }

    const items = prospectRows.map((p) => {
      const fs = followupsByProspect.get(p.id) ?? [];
      const sent = fs.filter((f) => f.sentAt !== null);
      const scheduled = fs.filter(
        (f) => f.sentAt === null && f.status === "scheduled",
      );
      const sentCount = sent.length;
      const scheduledCount = scheduled.length;

      const lastSent =
        sent.length > 0
          ? [...sent].sort((a, b) => {
              const ta = a.sentAt ? new Date(a.sentAt).getTime() : 0;
              const tb = b.sentAt ? new Date(b.sentAt).getTime() : 0;
              return tb - ta;
            })[0]
          : null;

      const nextScheduled =
        scheduled.length > 0
          ? [...scheduled].sort((a, b) => a.stage - b.stage)[0]
          : null;

      return {
        prospect: p,
        followups: fs,
        derived: {
          uiStatus: deriveUiStatus({
            paused: p.followupPaused,
            replied: p.replied,
            sentCount,
            scheduledCount,
            maxFollowups,
          }),
          sentCount,
          scheduledCount,
          totalCount: fs.length,
          maxFollowups,
          lastSent: lastSent ?? null,
          nextScheduled: nextScheduled ?? null,
        },
      };
    });

    res.status(200).json({
      items,
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.ceil(total / query.perPage),
    });
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/prospects/:id/send-next-followup
// ─────────────────────────────────────────────────────────────────

const sendNextBodySchema = z.object({
  channel: z.enum(SUPPORTED_CHANNELS),
});

router.post(
  "/prospects/:id/send-next-followup",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const prospectId = String(req.params.id);

    let body;
    try {
      body = sendNextBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "invalid_body", issues: err.issues });
        return;
      }
      throw err;
    }

    if (!SEND_IMPLEMENTED_CHANNELS.has(body.channel)) {
      res.status(501).json({
        error: "channel_send_not_implemented",
        channel: body.channel,
        note: `Send is currently only implemented for: ${[...SEND_IMPLEMENTED_CHANNELS].join(", ")}.`,
      });
      return;
    }

    // Verify prospect ownership before any work.
    const prospectRows = await db
      .select()
      .from(prospectsTable)
      .where(
        and(
          eq(prospectsTable.id, prospectId),
          eq(prospectsTable.userId, user.id),
        ),
      )
      .limit(1);
    const prospect = prospectRows[0];
    if (!prospect) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    if (prospect.followupPaused) {
      res.status(409).json({ error: "prospect_paused" });
      return;
    }
    if (prospect.replied === 1) {
      res.status(409).json({ error: "prospect_replied" });
      return;
    }
    if (!prospect.phone && body.channel === "whatsapp") {
      // Same pattern as routes/whatsappLink.ts: distinguish pending
      // Apollo phone reveal from a hard "no phone" by checking the
      // reveal status column.
      if (
        prospect.phoneRevealStatus === "pending" ||
        prospect.phoneRevealStatus === "none"
      ) {
        res.status(409).json({ error: "phone_reveal_pending" });
      } else {
        res.status(409).json({ error: "no_phone" });
      }
      return;
    }
    if (body.channel === "telegram" && !prospect.telegramHandle && !prospect.phone) {
      // Telegram can deep-link by @handle or by E.164 phone. If neither
      // identifier is stored, there is no link to open.
      res.status(409).json({ error: "no_telegram_identifier" });
      return;
    }

    // Find next scheduled followup for this prospect+channel (lowest stage,
    // not yet sent).
    const nextRows = await db
      .select()
      .from(followupsTable)
      .where(
        and(
          eq(followupsTable.prospectId, prospectId),
          eq(followupsTable.channel, body.channel),
          eq(followupsTable.status, "scheduled"),
          isNull(followupsTable.sentAt),
        ),
      )
      .orderBy(asc(followupsTable.stage))
      .limit(1);
    const next = nextRows[0];
    if (!next) {
      res.status(409).json({ error: "no_scheduled_followup" });
      return;
    }

    let messageBody = next.generatedMessage?.trim() ?? "";
    if (!messageBody) {
      const senderName =
        user.name?.trim()?.split(/\s+/)[0] ??
        user.email.split("@")[0] ??
        "there";
      try {
        const generated = await generateAndPersistFollowupMessage({
          followupId: next.id,
          userId: user.id,
          senderName,
        });
        messageBody = generated.message;
      } catch (genErr) {
        const code =
          genErr instanceof Error ? genErr.message : "generation_failed";
        res.status(409).json({
          error: code,
          followupId: next.id,
          stage: next.stage,
        });
        return;
      }
    }

    if (body.channel === "whatsapp") {
      // phone is nullable (pending Apollo reveal). Guard before generateLink,
      // which would otherwise throw a TypeError on a null phone instead of a
      // clean 409 (mirrors routes/whatsappLink.ts).
      if (!prospect.phone) {
        res.status(409).json({ error: "phone_reveal_pending" });
        return;
      }
      try {
        const url = generateLink(prospect.phone, messageBody);
        // We do NOT mark sentAt here. The actual send completes when the
        // user clicks the link and either /prospects/:id/send-intent is
        // called or a future worker observes the clickedAt write. This
        // endpoint just hands the SDR the link to click; it's the same
        // model as the existing prospect-stage-0 wa.me flow.
        res.status(200).json({
          followupId: next.id,
          stage: next.stage,
          deepLinkUrl: url,
          generatedMessage: messageBody,
        });
      } catch (err) {
        if (err instanceof InvalidPhoneError) {
          res.status(422).json({ error: "invalid_phone" });
          return;
        }
        if (err instanceof GeoGateBlockedError) {
          res.status(422).json({ error: "geo_blocked", country: err.country });
          return;
        }
        throw err;
      }
    } else if (body.channel === "telegram") {
      // Same model as the WhatsApp branch above: build the deep link
      // and let the FE open it. No geo gate (Telegram is universally
      // available), no async reveal step. sentAt stays null; the
      // click event flows through send-intent / clickedAt when that
      // route is channel-parameterized in a later ticket.
      const telegramIdentifier = prospect.telegramHandle ?? prospect.phone;
      if (!telegramIdentifier) {
        res.status(409).json({ error: "no_telegram_identifier" });
        return;
      }
      const url = generateTelegramLink(telegramIdentifier, messageBody);
      res.status(200).json({
        followupId: next.id,
        stage: next.stage,
        deepLinkUrl: url,
        generatedMessage: messageBody,
      });
    } else {
      // Defensive — should be impossible given the SEND_IMPLEMENTED guard above.
      res.status(501).json({ error: "channel_send_not_implemented" });
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// PATCH /api/followups/:id
// ─────────────────────────────────────────────────────────────────

router.patch(
  "/followups/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const followupIdRaw = String(req.params.id);
    const followupId = Number.parseInt(followupIdRaw, 10);
    if (!Number.isFinite(followupId) || followupId <= 0) {
      res.status(400).json({ error: "invalid_followup_id" });
      return;
    }

    let body;
    try {
      body = patchFollowupBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "invalid_body", issues: err.issues });
        return;
      }
      throw err;
    }

    // Resolve the followup AND verify it belongs to a prospect the
    // requesting user owns. 404 (not 403) on cross-user access.
    const found = await db
      .select({
        followup: followupsTable,
        prospectUserId: prospectsTable.userId,
      })
      .from(followupsTable)
      .innerJoin(
        prospectsTable,
        eq(followupsTable.prospectId, prospectsTable.id),
      )
      .where(eq(followupsTable.id, followupId))
      .limit(1);

    const row = found[0];
    if (!row || row.prospectUserId !== user.id) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const updated = await db
      .update(followupsTable)
      .set({
        ...(body.generatedMessage !== undefined && {
          generatedMessage: body.generatedMessage,
        }),
        ...(body.scheduledAt !== undefined && {
          scheduledAt: new Date(body.scheduledAt),
        }),
        ...(body.status !== undefined && { status: body.status }),
      })
      .where(eq(followupsTable.id, followupId))
      .returning();

    await db.insert(actionLogsTable).values({
      userId: user.id,
      prospectId: row.followup.prospectId,
      followupId: followupId,
      actionType: ACTION_TYPES.followupEdited,
      actionStatus: "success",
      metadata: {
        patchedFields: Object.keys(body),
        stage: row.followup.stage,
      },
    });

    res.status(200).json({ followup: updated[0] });
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/followups/bulk/archive
// ─────────────────────────────────────────────────────────────────
//
// "Archive" in v1 is a hard delete (cascades to followups + conversations
// via the FK ON DELETE cascade). Pre-launch state means no production
// data is at risk; if soft-delete becomes a real need, a future ticket
// adds prospects.archivedAt + retrofits list filters.

router.post(
  "/followups/bulk/archive",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;

    let body;
    try {
      body = bulkArchiveBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "invalid_body", issues: err.issues });
        return;
      }
      throw err;
    }

    let targetIds: string[];
    if (body.mode === "prospect_ids") {
      // Confirm all IDs belong to the requesting user before deleting.
      // Anything that doesn't is silently dropped (no existence leak).
      const owned = await db
        .select({ id: prospectsTable.id })
        .from(prospectsTable)
        .where(
          and(
            inArray(prospectsTable.id, body.prospectIds),
            eq(prospectsTable.userId, user.id),
          ),
        );
      targetIds = owned.map((r) => r.id);
    } else {
      // mode === "filter"
      const userRows = await db
        .select({ maxFollowups: usersTable.maxFollowups })
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .limit(1);
      const maxFollowups = userRows[0]?.maxFollowups ?? 3;

      const filterClause = statusWhereClause(
        body.filter,
        body.channel,
        maxFollowups,
      );
      const where = filterClause
        ? and(eq(prospectsTable.userId, user.id), filterClause)
        : eq(prospectsTable.userId, user.id);

      const rows = await db
        .select({ id: prospectsTable.id })
        .from(prospectsTable)
        .where(where);
      targetIds = rows.map((r) => r.id);
    }

    if (targetIds.length === 0) {
      res.status(200).json({ archived: 0, ids: [] });
      return;
    }

    // Delete in one statement. Followups + conversations are cascaded
    // via FK constraints (prospects.id ON DELETE cascade).
    await db
      .delete(prospectsTable)
      .where(
        and(
          inArray(prospectsTable.id, targetIds),
          eq(prospectsTable.userId, user.id),
        ),
      );

    // Log one action row per deleted prospect for audit.
    if (targetIds.length > 0) {
      await db.insert(actionLogsTable).values(
        targetIds.map((id) => ({
          userId: user.id,
          prospectId: null, // FK was just deleted; set null
          actionType: ACTION_TYPES.prospectDeleted,
          actionStatus: "success" as const,
          metadata: {
            via: "followups_bulk_archive",
            mode: body.mode,
            ...(body.mode === "filter" && {
              channel: body.channel,
              filter: body.filter,
            }),
            originalProspectId: id,
          },
        })),
      );
    }

    res.status(200).json({ archived: targetIds.length, ids: targetIds });
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/followups/:id/snooze
// ─────────────────────────────────────────────────────────────────

const SNOOZE_PRESETS = ["1d", "3d", "next_monday"] as const;
type SnoozePreset = (typeof SNOOZE_PRESETS)[number];

const snoozeBodySchema = z.object({
  preset: z.enum(SNOOZE_PRESETS),
});

function computeSnoozedAt(preset: SnoozePreset, from: Date): Date {
  const d = new Date(from);
  if (preset === "1d") {
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (preset === "3d") {
    d.setDate(d.getDate() + 3);
    return d;
  }
  // next_monday — upcoming Monday (if today is Monday, next week)
  const day = d.getDay();
  let daysUntil = (8 - day) % 7;
  if (daysUntil === 0) daysUntil = 7;
  d.setDate(d.getDate() + daysUntil);
  d.setHours(9, 0, 0, 0);
  return d;
}

router.post(
  "/followups/:id/snooze",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const followupIdRaw = String(req.params.id);
    const followupId = Number.parseInt(followupIdRaw, 10);
    if (!Number.isFinite(followupId) || followupId <= 0) {
      res.status(400).json({ error: "invalid_followup_id" });
      return;
    }

    let body: z.infer<typeof snoozeBodySchema>;
    try {
      body = snoozeBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "invalid_body", issues: err.issues });
        return;
      }
      throw err;
    }

    const found = await db
      .select({
        followup: followupsTable,
        prospectUserId: prospectsTable.userId,
      })
      .from(followupsTable)
      .innerJoin(
        prospectsTable,
        eq(followupsTable.prospectId, prospectsTable.id),
      )
      .where(eq(followupsTable.id, followupId))
      .limit(1);

    const row = found[0];
    if (!row || row.prospectUserId !== user.id) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    if (row.followup.sentAt) {
      res.status(409).json({ error: "already_sent" });
      return;
    }

    const previousAt = row.followup.scheduledAt;
    const newScheduledAt = computeSnoozedAt(body.preset, previousAt);

    const updated = await db
      .update(followupsTable)
      .set({ scheduledAt: newScheduledAt })
      .where(eq(followupsTable.id, followupId))
      .returning();

    await db.insert(actionLogsTable).values({
      userId: user.id,
      prospectId: row.followup.prospectId,
      followupId,
      actionType: ACTION_TYPES.followupSnoozed,
      actionStatus: "success",
      metadata: {
        preset: body.preset,
        previousScheduledAt: previousAt.toISOString(),
        newScheduledAt: newScheduledAt.toISOString(),
        stage: row.followup.stage,
      },
    });

    res.status(200).json({ followup: updated[0] });
  },
);

export default router;
