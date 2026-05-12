#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────
// Patch 01: BE supplement — add GET /users/me/manual-ingest-settings to
// the prospects router. Required by ticket-2-7-fe so the dashboard can
// read the current toggle state on page load (the PATCH endpoint shipped
// in 2-7-be only returns state on write, not on read).
//
// Inserts a complete GET handler block immediately before the existing
// PATCH handler's JSDoc opener. Idempotent — keyed on a unique marker
// inside the new block.
// ──────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");

const REPO_ROOT = process.cwd();
const FILE = path.join(
  REPO_ROOT,
  "artifacts/api-server/src/routes/prospects.ts",
);

const MARKER = "GET /api/users/me/manual-ingest-settings";

// We anchor on the JSDoc header line of the PATCH handler shipped in
// 2-7-be. We don't replace it — we insert a complete block before its
// containing /** opener.
const ANCHOR_LINE = " * PATCH /api/users/me/manual-ingest-settings";

const INSERTION = `/**
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

`;

const src = fs.readFileSync(FILE, "utf8");

if (src.includes(MARKER)) {
  console.log("  01-route-get-manual-ingest-settings: already applied, skipping");
  process.exit(0);
}

const anchorIdx = src.indexOf(ANCHOR_LINE);
if (anchorIdx === -1) {
  console.error("  01-route-get-manual-ingest-settings: anchor not found");
  console.error(
    "    expected the JSDoc header line for the PATCH endpoint shipped in 2-7-be:",
  );
  console.error("    " + JSON.stringify(ANCHOR_LINE));
  console.error("    Has 2-7-be been deployed in this workspace?");
  process.exit(1);
}

// Walk backwards from the anchor to find the "/**" that opens the
// JSDoc block for the PATCH handler. Our complete GET block goes in
// BEFORE that opener; the PATCH block stays exactly as it was.
const jsdocStart = src.lastIndexOf("/**", anchorIdx);
if (jsdocStart === -1) {
  console.error(
    "  01-route-get-manual-ingest-settings: could not locate JSDoc opener for PATCH endpoint",
  );
  process.exit(1);
}

const updated = src.slice(0, jsdocStart) + INSERTION + src.slice(jsdocStart);

if (updated === src) {
  console.error("  01-route-get-manual-ingest-settings: replace was a no-op (unexpected)");
  process.exit(1);
}

fs.writeFileSync(FILE, updated);
console.log("  01-route-get-manual-ingest-settings: applied");
