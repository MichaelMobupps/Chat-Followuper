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

export default router;
