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
import { and, eq } from "drizzle-orm";
import { z, ZodError } from "zod/v4";
import {
  db,
  prospectsTable,
  campaignsTable,
  actionLogsTable,
  ACTION_TYPES,
  type Prospect,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

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

// System-only fields (firstMessage*, replied, followupPaused, phoneReveal*,
// id, userId, createdAt, updatedAt) are rejected automatically by the
// schema's .strict() — any key not declared in baseProspectFields raises
// "unrecognized_keys". No separate allowlist is needed.

const baseProspectFields = {
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
      ),
    sourceMode: z.enum(SOURCE_MODES),
  })
  .strict();

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

    try {
      const inserted = await db
        .insert(prospectsTable)
        .values({
          userId: user.id,
          phone: body.phone,
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
        .returning();

      const prospect = inserted[0]!;

      // Audit trail — best-effort, must not fail the create.
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
    } catch (err) {
      // Postgres unique violation on (user_id, phone) → 409.
      // node-postgres surfaces SQLSTATE 23505 on err.code.
      const errAny = err as { code?: string };
      if (errAny?.code === "23505") {
        res.status(409).json({
          error: "duplicate_phone",
          detail:
            "A prospect with this phone already exists for this user.",
        });
        return;
      }
      throw err;
    }
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

export default router;
