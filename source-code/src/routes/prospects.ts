/**
 * /api/prospects CRUD routes — Ticket 1.7-BE-2.
 *
 * Closes the backend gap that blocked 1.7-FE-B: the seeder flow needs to
 * create a prospect before research/message-gen can persist anything to it.
 *
 * Convention: matches the 1.7-backend campaigns route — Zod validation,
 * requireAuth + AND-ed userId, 404 on cross-user access (no existence leak),
 * action_logs entries on create/delete.
 *
 * Routes:
 *   POST   /api/prospects        — create
 *   GET    /api/prospects/:id    — read
 *   PATCH  /api/prospects/:id    — update (phone is immutable)
 *   DELETE /api/prospects/:id    — delete (cascades to followups + conversations)
 *
 * Not in scope here: GET /api/prospects (list with filters). The Prospects
 * page is a placeholder; list endpoint will ship with that ticket.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
} from "drizzle-orm";
import { z, ZodError } from "zod/v4";
import {
  db,
  prospectsTable,
  campaignsTable,
  actionLogsTable,
  ACTION_TYPES,
  followupsTable,
  usersTable,
  type Prospect,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { detectCountry } from "../lib/geoGate";

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────────────
// LIST endpoint (Ticket prospects-list)
// ─────────────────────────────────────────────────────────────────────────
//
// Status semantics (single source of truth — FE mirrors these labels but
// does not recompute):
//   sent             — firstMessageSentAt is set; SDR has acted on this row
//   phone-blocked    — Apollo webhook confirmed geo-block; terminal failure
//   phone-no-match   — Apollo webhook confirmed no phone available; terminal
//   phone-pending    — phone is null and no terminal failure (waiting on
//                      webhook arrival from the bulk-flow async path)
//   ready            — phone is set AND firstMessageBody is set; clickable
//                      "Open WhatsApp" / "Open Telegram"
//   draft            — phone is set but no message yet (seeder flow exited
//                      before generation, or generate-message failed)
//
// Order of checks matters: sent dominates, then terminal failures, then
// phone presence, then message presence.

const PROSPECT_STATUSES = [
  "sent",
  "ready",
  "draft",
  "phone-pending",
  "phone-blocked",
  "phone-no-match",
] as const;
type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

const LIST_CHANNELS = ["whatsapp", "telegram", "teams"] as const;
const LIST_SORT_COLS = ["createdAt", "updatedAt", "prospectName"] as const;

const listProspectsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(PROSPECT_STATUSES).optional(),
  channel: z.enum(LIST_CHANNELS).optional(),
  country: z.string().regex(/^[A-Z]{2}$/, "ISO 2-letter country code").optional(),
  search: z.string().trim().min(1).max(200).optional(),
  sortBy: z.enum(LIST_SORT_COLS).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

function statusSqlFilter(status: ProspectStatus) {
  switch (status) {
    case "sent":
      return isNotNull(prospectsTable.firstMessageSentAt);
    case "phone-blocked":
      return and(
        isNull(prospectsTable.firstMessageSentAt),
        eq(prospectsTable.phoneRevealStatus, "blocked"),
      );
    case "phone-no-match":
      return and(
        isNull(prospectsTable.firstMessageSentAt),
        eq(prospectsTable.phoneRevealStatus, "no_match"),
      );
    case "phone-pending":
      return and(
        isNull(prospectsTable.firstMessageSentAt),
        isNull(prospectsTable.phone),
        ne(prospectsTable.phoneRevealStatus, "blocked"),
        ne(prospectsTable.phoneRevealStatus, "no_match"),
      );
    case "ready":
      return and(
        isNull(prospectsTable.firstMessageSentAt),
        isNotNull(prospectsTable.phone),
        isNotNull(prospectsTable.firstMessageBody),
      );
    case "draft":
      return and(
        isNull(prospectsTable.firstMessageSentAt),
        isNotNull(prospectsTable.phone),
        isNull(prospectsTable.firstMessageBody),
      );
  }
}

function computeProspectStatus(p: {
  phone: string | null;
  phoneRevealStatus: string;
  firstMessageBody: string | null;
  firstMessageSentAt: Date | string | null;
}): ProspectStatus {
  if (p.firstMessageSentAt) return "sent";
  if (p.phoneRevealStatus === "blocked") return "phone-blocked";
  if (p.phoneRevealStatus === "no_match") return "phone-no-match";
  if (!p.phone) return "phone-pending";
  if (p.firstMessageBody) return "ready";
  return "draft";
}

router.get(
  "/prospects",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as Request & { user: { id: string } }).user;

    let query;
    try {
      query = listProspectsQuerySchema.parse(req.query);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "invalid_query", issues: err.issues });
        return;
      }
      throw err;
    }

    const filters = [eq(prospectsTable.userId, user.id)];
    if (query.status) {
      const sf = statusSqlFilter(query.status);
      if (sf) filters.push(sf);
    }
    if (query.channel) {
      filters.push(eq(prospectsTable.firstMessageChannel, query.channel));
    }
    if (query.country) {
      filters.push(eq(prospectsTable.country, query.country));
    }
    if (query.search) {
      const like = `%${query.search}%`;
      const searchOr = or(
        ilike(prospectsTable.prospectName, like),
        ilike(prospectsTable.company, like),
      );
      if (searchOr) filters.push(searchOr);
    }
    const whereClause = and(...filters);

    const sortCol =
      query.sortBy === "prospectName"
        ? prospectsTable.prospectName
        : query.sortBy === "updatedAt"
          ? prospectsTable.updatedAt
          : prospectsTable.createdAt;
    const sortFn = query.sortDir === "asc" ? asc : desc;

    const offset = (query.page - 1) * query.perPage;

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: prospectsTable.id,
          prospectName: prospectsTable.prospectName,
          company: prospectsTable.company,
          title: prospectsTable.title,
          country: prospectsTable.country,
          language: prospectsTable.language,
          phone: prospectsTable.phone,
          phoneRevealStatus: prospectsTable.phoneRevealStatus,
          firstMessageBody: prospectsTable.firstMessageBody,
          firstMessageChannel: prospectsTable.firstMessageChannel,
          firstMessageSentAt: prospectsTable.firstMessageSentAt,
          apolloPersonId: prospectsTable.apolloPersonId,
          createdAt: prospectsTable.createdAt,
          updatedAt: prospectsTable.updatedAt,
        })
        .from(prospectsTable)
        .where(whereClause)
        .orderBy(sortFn(sortCol))
        .limit(query.perPage)
        .offset(offset),
      db
        .select({ value: count() })
        .from(prospectsTable)
        .where(whereClause),
    ]);

    const total = totalRow[0]?.value ?? 0;

    const prospects = rows.map((r) => ({
      id: r.id,
      prospectName: r.prospectName,
      company: r.company,
      title: r.title,
      country: r.country,
      language: r.language,
      phone: r.phone,
      phoneRevealStatus: r.phoneRevealStatus,
      firstMessageBody: r.firstMessageBody,
      firstMessageChannel: r.firstMessageChannel,
      firstMessageSentAt:
        r.firstMessageSentAt instanceof Date
          ? r.firstMessageSentAt.toISOString()
          : r.firstMessageSentAt,
      apolloPersonId: r.apolloPersonId,
      createdAt:
        r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      updatedAt:
        r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
      hasFirstMessage: r.firstMessageBody !== null && r.firstMessageBody.length > 0,
      status: computeProspectStatus(r),
    }));

    res.json({
      prospects,
      total,
      page: query.page,
      perPage: query.perPage,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────

/**
 * E.164 phone format. Apollo returns phones in this format and the
 * geo-gate in services/channels/whatsapp.ts assumes a leading "+" with
 * country code. Accepting freeform formats here would silently break the
 * geo gate downstream.
 */
const PHONE_RE = /^\+[1-9]\d{6,14}$/;

const SOURCE_MODES = ["manual", "apollo", "csv"] as const;

const ISO_LANG_RE = /^[a-z]{2}(-[A-Z]{2})?$/;
const ISO_COUNTRY_RE = /^[A-Z]{2}$/;

// System-only fields (replied, followupPaused, phoneReveal*, id, userId,
// createdAt, updatedAt, firstMessageChannel, firstMessageSentAt) are
// rejected automatically by the schema's .strict() — any key not
// declared in baseProspectFields raises "unrecognized_keys". No separate
// allowlist is needed.
//
// firstMessageBody is admitted (added in Ticket edit-message-capability)
// to support manual edits from the detail page. Channel and SentAt
// remain system-only — they are set by generateMessage and the send
// pipeline respectively.

const baseProspectFields = {
  /** First message body — manually editable on PATCH, system-set
   *  on initial generation by generateMessage. Trimmed non-empty
   *  string up to 20k chars, or null to clear. Added in Ticket
   *  edit-message-capability. */
  firstMessageBody: z.string().trim().min(1).max(20000).nullable().optional(),
  prospectName: z.string().trim().min(1).max(200).nullable().optional(),
  company: z.string().trim().min(1).max(200).nullable().optional(),
  title: z.string().trim().min(1).max(200).nullable().optional(),
  vertical: z.string().trim().min(1).max(100).nullable().optional(),
  subVertical: z.string().trim().min(1).max(100).nullable().optional(),
  product: z.string().trim().min(1).max(200).nullable().optional(),
  country: z
    .string()
    .trim()
    .regex(ISO_COUNTRY_RE, "ISO 2-letter country code")
    .nullable()
    .optional(),
  language: z
    .string()
    .trim()
    .regex(ISO_LANG_RE, "ISO language code, e.g. 'en' or 'pt-BR'")
    .nullable()
    .optional(),
  telegramHandle: z.string().trim().min(1).max(100).nullable().optional(),
  teamsEmail: z.string().trim().email().nullable().optional(),
  linkedinUrl: z.string().trim().url().nullable().optional(),
  apolloPersonId: z.string().trim().min(1).max(200).nullable().optional(),
  apolloOrgId: z.string().trim().min(1).max(200).nullable().optional(),
  contextNotes: z.string().trim().max(5000).nullable().optional(),
  // researchBrief is a free-form jsonb — the SSE result event payload
  // structure is defined by services/prospectResearch.ts. We accept any
  // object here and let downstream consumers validate. Nullable so PATCH
  // can clear it.
  researchBrief: z.record(z.string(), z.unknown()).nullable().optional(),
  campaignId: z.string().uuid().nullable().optional(),
};

const createProspectBodySchema = z
  .object({
    ...baseProspectFields,
    phone: z
      .string()
      .trim()
      .regex(
        PHONE_RE,
        "Phone must be E.164 format, e.g. '+919900000111'",
      )
      .nullable()
      .optional(),
    sourceMode: z.enum(SOURCE_MODES),
  })
  .strict()
  .superRefine((data, ctx) => {
    // Ticket 2.3-BE-B: phone is optional ONLY for pending-reveal
    // prospects (bulk WhatsApp flow). If phone is absent, apolloPersonId
    // MUST be set so the async webhook handler can later promote
    // phoneNumber → phone via the correlationId lookup. Without
    // apolloPersonId, the prospect can never become contactable
    // through any flow we support today.
    const phoneIsAbsent =
      data.phone === undefined ||
      data.phone === null ||
      data.phone.length === 0;
    if (phoneIsAbsent && !data.apolloPersonId) {
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message:
          "phone is required unless apolloPersonId is set (pending-reveal prospect)",
      });
    }
  });

const updateProspectBodySchema = z
  .object(baseProspectFields)
  .strict();

type CreateProspectBody = z.infer<typeof createProspectBodySchema>;
type UpdateProspectBody = z.infer<typeof updateProspectBodySchema>;

function zodErrorToHttp(err: ZodError): {
  status: 400;
  body: { error: string; issues: { path: string; message: string }[] };
} {
  return {
    status: 400,
    body: {
      error: "invalid_body",
      issues: err.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

async function fetchOwnedProspect(
  prospectId: string,
  userId: string,
): Promise<Prospect | null> {
  const rows = await db
    .select()
    .from(prospectsTable)
    .where(
      and(
        eq(prospectsTable.id, prospectId),
        eq(prospectsTable.userId, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function assertCampaignOwnedOrNull(
  campaignId: string | undefined,
  userId: string,
): Promise<{ ok: true } | { ok: false; reason: "not_found" }> {
  if (!campaignId) return { ok: true };
  const rows = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(
      and(
        eq(campaignsTable.id, campaignId),
        eq(campaignsTable.userId, userId),
      ),
    )
    .limit(1);
  if (rows.length === 0) return { ok: false, reason: "not_found" };
  return { ok: true };
}

function isUuidLike(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────

/**
 * POST /api/prospects — create a prospect.
 *
 * 201 → { ...prospect }
 * 400 → invalid body (Zod issues attached) or invalid_campaign_id
 * 409 → duplicate phone (unique constraint on user_id, phone)
 */
router.post(
  "/prospects",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const start = Date.now();

    let body: CreateProspectBody;
    try {
      body = createProspectBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        const mapped = zodErrorToHttp(err);
        res.status(mapped.status).json(mapped.body);
        return;
      }
      throw err;
    }

    if (body.campaignId) {
      const check = await assertCampaignOwnedOrNull(
        body.campaignId,
        user.id,
      );
      if (!check.ok) {
        res.status(400).json({
          error: "invalid_campaign_id",
          detail: "Campaign does not exist or is not owned by this user.",
        });
        return;
      }
    }

    // Dedupe by Apollo person ID. The existing onConflictDoNothing
    // below dedupes by (userId, phone), but pending-reveal prospects
    // have phone = NULL and PostgreSQL allows infinite NULLs in unique
    // indexes. Without this pre-check, re-running a bulk batch on the
    // same company creates a new row per attempt (the Arushi 3-row
    // case). Race condition: two concurrent inserts could both pass
    // this check; future ticket adds a partial unique index on
    // (userId, apolloPersonId) WHERE apolloPersonId IS NOT NULL.
    if (body.apolloPersonId) {
      const existing = await db
        .select({ id: prospectsTable.id })
        .from(prospectsTable)
        .where(
          and(
            eq(prospectsTable.userId, user.id),
            eq(prospectsTable.apolloPersonId, body.apolloPersonId),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        res.status(409).json({
          error: "duplicate_apollo_person",
          detail:
            "A prospect with this Apollo person ID already exists for this user.",
          existingProspectId: existing[0]!.id,
        });
        return;
      }
    }
    // Use onConflictDoNothing instead of try/catch on SQLSTATE 23505 —
    // drizzle wraps the underlying pg error and the code surface differs
    // across drivers. Empty returning() means a duplicate phone hit the
    // (user_id, phone) unique index. Race-safe: the DB still enforces.
    const inserted = await db
      .insert(prospectsTable)
      .values({
        userId: user.id,
        // phone may be null for pending-reveal prospects (Ticket 2.3-BE-B).
        // The webhook handler in services/apollo.ts promotes phoneNumber →
        // phone when Apollo's bulk_match resolves the async reveal.
        phone: body.phone ?? null,
        sourceMode: body.sourceMode,
        prospectName: body.prospectName ?? null,
        company: body.company ?? null,
        title: body.title ?? null,
        vertical: body.vertical ?? null,
        subVertical: body.subVertical ?? null,
        product: body.product ?? null,
        country: body.country ?? null,
        language: body.language ?? null,
        telegramHandle: body.telegramHandle ?? null,
        teamsEmail: body.teamsEmail ?? null,
        linkedinUrl: body.linkedinUrl ?? null,
        apolloPersonId: body.apolloPersonId ?? null,
        apolloOrgId: body.apolloOrgId ?? null,
        contextNotes: body.contextNotes ?? null,
        researchBrief: body.researchBrief ?? null,
        campaignId: body.campaignId ?? null,
      })
      .onConflictDoNothing({
        target: [prospectsTable.userId, prospectsTable.phone],
      })
      .returning();

    if (inserted.length === 0) {
      res.status(409).json({
        error: "duplicate_phone",
        detail:
          "A prospect with this phone already exists for this user.",
      });
      return;
    }

    const prospect = inserted[0]!;

    // Audit trail — best-effort.
    try {
      await db.insert(actionLogsTable).values({
        userId: user.id,
        actionType: ACTION_TYPES.prospectCreated,
        actionStatus: "success",
        durationMs: Date.now() - start,
        metadata: {
          prospectId: prospect.id,
          sourceMode: body.sourceMode,
          campaignId: body.campaignId ?? null,
          hasResearchBrief: body.researchBrief != null,
        },
      });
    } catch {
      // ignore audit failure
    }

    res.status(201).json(prospect);
  },
);

/**
 * GET /api/prospects/:id — read.
 *
 * 200 → { ...prospect }
 * 404 → not found OR cross-user (no distinction surfaced)
 */
router.get(
  "/prospects/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const prospectId = String(req.params.id);

    if (!isUuidLike(prospectId)) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const prospect = await fetchOwnedProspect(prospectId, user.id);
    if (!prospect) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    res.status(200).json(prospect);
  },
);

/**
 * PATCH /api/prospects/:id — update editable fields.
 *
 * Phone is immutable (changing it would invalidate cached whatsapp links
 * and the unique-key relationship; if a typo needs fixing, recreate).
 * System fields (firstMessage*, replied*, followupPaused, phoneReveal*) are
 * not accepted via this endpoint.
 *
 * 200 → { ...prospect }
 * 400 → invalid body (incl. attempts to set phone or system fields)
 *       or invalid_campaign_id
 * 404 → not found OR cross-user
 */
router.patch(
  "/prospects/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const prospectId = String(req.params.id);

    if (!isUuidLike(prospectId)) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    let body: UpdateProspectBody;
    try {
      body = updateProspectBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        const mapped = zodErrorToHttp(err);
        res.status(mapped.status).json(mapped.body);
        return;
      }
      throw err;
    }

    // Existence + ownership check before any mutation
    const existing = await fetchOwnedProspect(prospectId, user.id);
    if (!existing) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    if (body.campaignId !== undefined && body.campaignId !== null) {
      const check = await assertCampaignOwnedOrNull(
        body.campaignId,
        user.id,
      );
      if (!check.ok) {
        res.status(400).json({
          error: "invalid_campaign_id",
          detail: "Campaign does not exist or is not owned by this user.",
        });
        return;
      }
    }

    // Build the update set explicitly. `undefined` means "not in body —
    // do not update"; explicit null means "clear this field".
    const updates: Partial<typeof prospectsTable.$inferInsert> = {};
    if (body.firstMessageBody !== undefined) updates.firstMessageBody = body.firstMessageBody;
    if (body.prospectName !== undefined) updates.prospectName = body.prospectName;
    if (body.company !== undefined) updates.company = body.company;
    if (body.title !== undefined) updates.title = body.title;
    if (body.vertical !== undefined) updates.vertical = body.vertical;
    if (body.subVertical !== undefined) updates.subVertical = body.subVertical;
    if (body.product !== undefined) updates.product = body.product;
    if (body.country !== undefined) updates.country = body.country;
    if (body.language !== undefined) updates.language = body.language;
    if (body.telegramHandle !== undefined) updates.telegramHandle = body.telegramHandle;
    if (body.teamsEmail !== undefined) updates.teamsEmail = body.teamsEmail;
    if (body.linkedinUrl !== undefined) updates.linkedinUrl = body.linkedinUrl;
    if (body.apolloPersonId !== undefined) updates.apolloPersonId = body.apolloPersonId;
    if (body.apolloOrgId !== undefined) updates.apolloOrgId = body.apolloOrgId;
    if (body.contextNotes !== undefined) updates.contextNotes = body.contextNotes;
    if (body.researchBrief !== undefined) updates.researchBrief = body.researchBrief;
    if (body.campaignId !== undefined) updates.campaignId = body.campaignId;

    if (Object.keys(updates).length === 0) {
      // No-op patch: return current state.
      res.status(200).json(existing);
      return;
    }

    const updated = await db
      .update(prospectsTable)
      .set(updates)
      .where(
        and(
          eq(prospectsTable.id, prospectId),
          eq(prospectsTable.userId, user.id),
        ),
      )
      .returning();

    res.status(200).json(updated[0]);
  },
);

/**
 * DELETE /api/prospects/:id — delete (cascades to followups + conversations).
 *
 * 200 → { ok: true }
 * 404 → not found OR cross-user
 */
router.delete(
  "/prospects/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const prospectId = String(req.params.id);
    const start = Date.now();

    if (!isUuidLike(prospectId)) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    // Existence + ownership check before delete
    const existing = await fetchOwnedProspect(prospectId, user.id);
    if (!existing) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    await db
      .delete(prospectsTable)
      .where(
        and(
          eq(prospectsTable.id, prospectId),
          eq(prospectsTable.userId, user.id),
        ),
      );

    // Audit trail — best-effort.
    try {
      await db.insert(actionLogsTable).values({
        userId: user.id,
        actionType: ACTION_TYPES.prospectDeleted,
        actionStatus: "success",
        durationMs: Date.now() - start,
        metadata: {
          prospectId,
          sourceMode: existing.sourceMode,
          hadResearchBrief: existing.researchBrief != null,
          hadFirstMessage: existing.firstMessageBody != null,
        },
      });
    } catch {
      // ignore audit failure
    }

    res.status(200).json({ ok: true });
  },
);

// ─────────────────────────────────────────────────────────────────
// Ticket 2.5-BE — followup management endpoints
// ─────────────────────────────────────────────────────────────────
//
// POST /api/prospects/:id/mark-replied
//   Sets prospect.replied = 1, prospect.repliedAt = now (or supplied
//   timestamp). Cancels any remaining scheduled followups for this
//   prospect (sets followups.status = 'cancelled' where sentAt IS
//   NULL AND status = 'scheduled'). Idempotent: calling on an already-
//   replied prospect returns 200 with the current state.
//
// POST /api/prospects/:id/archive
//   Thin alias over DELETE /api/prospects/:id. Same hard-delete
//   semantics: cascades to followups + conversations via FK. Lives
//   under a verb endpoint so the FE has a label that matches the
//   "Archive" UI action.
//
// POST /api/prospects/bulk/pause
//   Toggle followupPaused for many prospects in one call. Body shape:
//     { prospectIds: string[], paused: boolean }
//   Single endpoint handles both pause (paused: true) and unpause
//   (paused: false). Returns count of rows updated.

const markRepliedBodySchema = z.object({
  repliedAt: z.string().datetime({ offset: true }).optional(),
}).strict();

router.post(
  "/prospects/:id/mark-replied",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as Request & { user: { id: string } }).user;
    const prospectId = String(req.params.id);
    const start = Date.now();

    if (!isUuidLike(prospectId)) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    let body;
    try {
      body = markRepliedBodySchema.parse(req.body ?? {});
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "invalid_body", issues: err.issues });
        return;
      }
      throw err;
    }

    const existing = await fetchOwnedProspect(prospectId, user.id);
    if (!existing) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const repliedAt = body.repliedAt ? new Date(body.repliedAt) : new Date();

    // Idempotency: if already replied, return current state without
    // re-touching the row or re-cancelling followups.
    if (existing.replied === 1) {
      res.status(200).json({ prospect: existing, cancelledFollowups: 0, alreadyReplied: true });
      return;
    }

    // Update the prospect row.
    const [updatedProspect] = await db
      .update(prospectsTable)
      .set({
        replied: 1,
        repliedAt,
      })
      .where(
        and(
          eq(prospectsTable.id, prospectId),
          eq(prospectsTable.userId, user.id),
        ),
      )
      .returning();

    // Cancel any remaining scheduled followups for this prospect (all channels).
    // We don't filter by channel — if the prospect has replied via one
    // channel, sequential follow-ups on the SAME prospect on any other
    // channel are also presumed undesirable. SDR can re-enable specific
    // followups via PATCH /followups/:id if they disagree.
    const cancelled = await db
      .update(followupsTable)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(followupsTable.prospectId, prospectId),
          eq(followupsTable.status, "scheduled"),
          isNull(followupsTable.sentAt),
        ),
      )
      .returning({ id: followupsTable.id });

    try {
      await db.insert(actionLogsTable).values({
        userId: user.id,
        prospectId,
        actionType: ACTION_TYPES.prospectReplied,
        actionStatus: "success",
        durationMs: Date.now() - start,
        metadata: {
          cancelledFollowupCount: cancelled.length,
          repliedAt: repliedAt.toISOString(),
        },
      });
    } catch {
      // best-effort audit
    }

    res.status(200).json({
      prospect: updatedProspect,
      cancelledFollowups: cancelled.length,
      alreadyReplied: false,
    });
  },
);

router.post(
  "/prospects/:id/archive",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as Request & { user: { id: string } }).user;
    const prospectId = String(req.params.id);
    const start = Date.now();

    if (!isUuidLike(prospectId)) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const existing = await fetchOwnedProspect(prospectId, user.id);
    if (!existing) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    await db
      .delete(prospectsTable)
      .where(
        and(
          eq(prospectsTable.id, prospectId),
          eq(prospectsTable.userId, user.id),
        ),
      );

    try {
      await db.insert(actionLogsTable).values({
        userId: user.id,
        actionType: ACTION_TYPES.prospectDeleted,
        actionStatus: "success",
        durationMs: Date.now() - start,
        metadata: {
          via: "archive_endpoint",
          prospectId,
          sourceMode: existing.sourceMode,
          hadResearchBrief: existing.researchBrief != null,
          hadFirstMessage: existing.firstMessageBody != null,
        },
      });
    } catch {
      // best-effort audit
    }

    res.status(200).json({ ok: true, archivedProspectId: prospectId });
  },
);

const bulkPauseBodySchema = z.object({
  prospectIds: z.array(z.string().uuid()).min(1).max(500),
  paused: z.boolean(),
});

router.post(
  "/prospects/bulk/pause",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as Request & { user: { id: string } }).user;

    let body;
    try {
      body = bulkPauseBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "invalid_body", issues: err.issues });
        return;
      }
      throw err;
    }

    // Confirm ownership of every ID. Anything not owned is silently
    // dropped — no existence leak.
    const owned = await db
      .select({ id: prospectsTable.id })
      .from(prospectsTable)
      .where(
        and(
          inArray(prospectsTable.id, body.prospectIds),
          eq(prospectsTable.userId, user.id),
        ),
      );
    const targetIds = owned.map((r) => r.id);

    if (targetIds.length === 0) {
      res.status(200).json({ updated: 0, ids: [] });
      return;
    }

    await db
      .update(prospectsTable)
      .set({ followupPaused: body.paused })
      .where(
        and(
          inArray(prospectsTable.id, targetIds),
          eq(prospectsTable.userId, user.id),
        ),
      );

    // One log row per prospect for clean audit trail.
    try {
      await db.insert(actionLogsTable).values(
        targetIds.map((id) => ({
          userId: user.id,
          prospectId: id,
          actionType: ACTION_TYPES.prospectPaused,
          actionStatus: "success" as const,
          metadata: { paused: body.paused, via: "bulk_pause" },
        })),
      );
    } catch {
      // best-effort audit
    }

    res.status(200).json({ updated: targetIds.length, ids: targetIds });
  },
);

// ─────────────────────────────────────────────────────────────────────────
// Manual ingest routes — Ticket 2.7-BE-A — manual prospect ingest
// ─────────────────────────────────────────────────────────────────────────
//
// Two endpoints supporting the SDR-driven flow of "follow up on people
// I'm already in touch with" — prospects who never came through Apollo.
//
//   POST  /api/prospects/manual-ingest             — create one
//   PATCH /api/users/me/manual-ingest-settings     — toggle channel on/off
//
// Scope this ticket: WhatsApp only. Telegram manual ingest is deferred to
// its own ticket because the t.me deep-link mechanism needs a handle, not
// a phone, and the identifier-shape decision was left open at scoping
// time.
//
// PATCH path note: settings live under /users/me/* not /prospects/* to
// avoid being shadowed by the existing wildcard PATCH /prospects/:id —
// Express matches in registration order and the :id route would catch
// "manual-ingest-settings" first, isUuidLike rejects it, 404. Using the
// users/me namespace matches the existing /api/users/me/sequence-config
// pattern and keeps the path collision-free.
//
// Enrichment posture: ingest stores ONLY what the SDR provided plus
// derived country from the phone. Company-name disambiguation, vertical
// classification, and the research_brief are filled lazily by the
// existing prospectResearch / message generation pipeline on first
// draft, same as for Apollo prospects. This keeps ingest snappy (no
// 5-10s LLM wait on the form) and avoids new wiring against
// classification code paths that have drifted since the 2.2 work.

const MANUAL_INGEST_CHANNELS = ["whatsapp"] as const;

const TICKERS = ["web", "mobile"] as const;
type Ticker = (typeof TICKERS)[number];

// firstName is constrained to 100 chars (matches prospectName max). It is
// stored as prospect_name verbatim; the LLM uses it in the greeting.
// company is constrained to 200 (matches existing company column max).
// prePlatformContext is constrained to 5000 (one paragraph of pasted
// conversation; matches contextNotes max).
const manualIngestBodySchema = z
  .object({
    channel: z.enum(MANUAL_INGEST_CHANNELS),
    firstName: z.string().trim().min(1).max(100),
    phone: z
      .string()
      .trim()
      .regex(PHONE_RE, "Phone must be E.164 format, e.g. '+919900000111'"),
    company: z.string().trim().min(1).max(200),
    ticker: z.enum(TICKERS),
    prePlatformContext: z.string().trim().max(5000).nullable().optional(),
  })
  .strict();

const manualIngestToggleBodySchema = z
  .object({
    channel: z.enum(MANUAL_INGEST_CHANNELS),
    enabled: z.boolean(),
  })
  .strict();

/**
 * Map the SDR's web/mobile ticker to a coarse vertical string. The
 * existing research/classification pipeline refines this on first
 * message draft; what we store here is just enough to route through
 * the right doctrine pack initially.
 */
function tickerToCoarseVertical(ticker: Ticker): string {
  return ticker === "web" ? "web_cps" : "mobile";
}

/**
 * POST /api/prospects/manual-ingest
 *
 * Creates a manually-ingested prospect.
 *
 *   201 → { ...prospect }
 *   400 → invalid_body (Zod issues attached)
 *   409 → duplicate_phone (existing (user_id, phone) unique index)
 */
router.post(
  "/prospects/manual-ingest",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const start = Date.now();

    let body: z.infer<typeof manualIngestBodySchema>;
    try {
      body = manualIngestBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        const mapped = zodErrorToHttp(err);
        res.status(mapped.status).json(mapped.body);
        return;
      }
      throw err;
    }

    // Country derivation is best-effort. detectCountry may return null
    // for prefixes outside the known allow-list; in that case country
    // is left null and the language defaults apply downstream. We do
    // NOT reject on unknown country here — the existing wa.me send
    // path surfaces geo issues at click time via geoGate, matching the
    // Apollo flow's behavior.
    const country = detectCountry(body.phone);

    const inserted = await db
      .insert(prospectsTable)
      .values({
        userId: user.id,
        phone: body.phone,
        sourceMode: "manual",
        prospectName: body.firstName,
        company: body.company,
        vertical: tickerToCoarseVertical(body.ticker),
        country: country ?? null,
        prePlatformContext: body.prePlatformContext ?? null,
      })
      .onConflictDoNothing({
        target: [prospectsTable.userId, prospectsTable.phone],
      })
      .returning();

    if (inserted.length === 0) {
      res.status(409).json({
        error: "duplicate_phone",
        detail: "A prospect with this phone already exists for this user.",
      });
      return;
    }

    const prospect = inserted[0]!;

    try {
      await db.insert(actionLogsTable).values({
        userId: user.id,
        prospectId: prospect.id,
        actionType: ACTION_TYPES.manualIngestSingle,
        actionStatus: "success",
        durationMs: Date.now() - start,
        metadata: {
          channel: body.channel,
          ticker: body.ticker,
          hasPrePlatformContext: !!body.prePlatformContext,
          country: country ?? null,
        },
      });
    } catch {
      // ignore audit failure
    }

    res.status(201).json(prospect);
  },
);

/**
 * GET /api/users/me/manual-ingest-settings
 *
 * Read the current manual ingest toggle state for the authenticated
 * user. Returns the same shape as PATCH so the FE can use one type
 * across both endpoints.
 *
 * Added Ticket 2.7-FE: the FE needs the initial toggle state on page
 * load; PATCH alone wasn't enough.
 *
 *   200 → { manualIngestChannels: string[] }
 */
router.get(
  "/users/me/manual-ingest-settings",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;

    const rows = await db
      .select({ channels: usersTable.manualIngestChannels })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);

    const manualIngestChannels = rows[0]?.channels ?? [];
    res.status(200).json({ manualIngestChannels });
  },
);

/**
 * PATCH /api/users/me/manual-ingest-settings
 *
 * Toggle manual ingest on/off for a given channel. State persists on
 * users.manualIngestChannels — the array of channel slugs currently
 * enabled. FE reads the array to render toggle state and the manual
 * contacts section.
 *
 * Mounted under /users/me/* rather than /prospects/* to dodge the
 * wildcard PATCH /prospects/:id route — see top-of-section note.
 *
 *   200 → { manualIngestChannels: string[] }
 *   400 → invalid_body
 */
router.patch(
  "/users/me/manual-ingest-settings",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;

    let body: z.infer<typeof manualIngestToggleBodySchema>;
    try {
      body = manualIngestToggleBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        const mapped = zodErrorToHttp(err);
        res.status(mapped.status).json(mapped.body);
        return;
      }
      throw err;
    }

    // Read-modify-write on the JSON array. Last-write-wins semantics —
    // concurrent toggles on the same channel are non-issues since the
    // operation is idempotent (enable-then-enable === enable).
    const existing = await db
      .select({ channels: usersTable.manualIngestChannels })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);

    const current = existing[0]?.channels ?? [];
    const currentSet = new Set<string>(current);
    if (body.enabled) {
      currentSet.add(body.channel);
    } else {
      currentSet.delete(body.channel);
    }
    const next = Array.from(currentSet);

    await db
      .update(usersTable)
      .set({ manualIngestChannels: next })
      .where(eq(usersTable.id, user.id));

    try {
      await db.insert(actionLogsTable).values({
        userId: user.id,
        actionType: ACTION_TYPES.manualIngestToggle,
        actionStatus: "success",
        metadata: { channel: body.channel, enabled: body.enabled },
      });
    } catch {
      // ignore audit failure
    }

    res.status(200).json({ manualIngestChannels: next });
  },
);

export default router;
