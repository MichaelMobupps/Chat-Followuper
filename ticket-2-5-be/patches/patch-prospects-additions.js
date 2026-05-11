#!/usr/bin/env node
/**
 * Ticket 2.5-BE, patch: extend artifacts/api-server/src/routes/prospects.ts
 *
 * Adds three new endpoints to the existing prospects router:
 *   POST /api/prospects/:id/mark-replied
 *   POST /api/prospects/:id/archive
 *   POST /api/prospects/bulk/pause
 *
 * Adds two missing imports to the existing import blocks:
 *   - inArray  (from drizzle-orm)
 *   - followupsTable  (from @workspace/db)
 *
 * Idempotent: re-running on an already-patched file is a SKIP.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const TARGET = path.join(
  process.cwd(),
  "artifacts",
  "api-server",
  "src",
  "routes",
  "prospects.ts",
);

const ADDITIONS_FILE = path.join(__dirname, "..", "additions", "prospects-additions.ts");

function sha256(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function applyOnce(src, oldText, newText, label) {
  if (newText !== oldText && src.includes(newText)) {
    // Already applied — confirm old text is gone too. If both old AND
    // new appear, that's an unexpected state worth bailing on.
    if (src.includes(oldText) && oldText !== newText) {
      console.error(`[${label}] FAIL — both old and new markers present`);
      process.exit(4);
    }
    console.log(`[${label}] SKIP — already applied`);
    return src;
  }
  const count = src.split(oldText).length - 1;
  if (count === 0) {
    console.error(`[${label}] NOOP — anchor not found:\n${oldText.substring(0, 120)}…`);
    process.exit(2);
  }
  if (count > 1) {
    console.error(`[${label}] FAIL — anchor matched ${count} times`);
    process.exit(2);
  }
  const idx = src.indexOf(oldText);
  return src.substring(0, idx) + newText + src.substring(idx + oldText.length);
}

function main() {
  if (!fs.existsSync(TARGET)) {
    console.error(`[FATAL] missing target: ${TARGET}`);
    process.exit(5);
  }
  if (!fs.existsSync(ADDITIONS_FILE)) {
    console.error(`[FATAL] missing additions file: ${ADDITIONS_FILE}`);
    process.exit(5);
  }

  let src = fs.readFileSync(TARGET, "utf8");
  const additions = fs.readFileSync(ADDITIONS_FILE, "utf8");

  // ── Edit 1: add `inArray,` to drizzle-orm import list ──
  // Anchor: the existing `isNull,` line in the drizzle import block.
  // We insert `inArray,` ALPHABETICALLY before `isNotNull,`.
  src = applyOnce(
    src,
    "  ilike,\n  isNotNull,\n  isNull,\n  ne,\n",
    "  ilike,\n  inArray,\n  isNotNull,\n  isNull,\n  ne,\n",
    "add-inArray-import",
  );

  // ── Edit 2: add `followupsTable,` to @workspace/db import list ──
  // Anchor: the line after actionLogsTable, ACTION_TYPES.
  src = applyOnce(
    src,
    "  actionLogsTable,\n  ACTION_TYPES,\n  type Prospect,\n",
    "  actionLogsTable,\n  ACTION_TYPES,\n  followupsTable,\n  type Prospect,\n",
    "add-followupsTable-import",
  );

  // ── Edit 3: insert the new endpoints right before `export default router;` ──
  // We strip the leading newline-trimming and trailing `export default router;\n`
  // from the additions file so we paste only the new endpoint code, then
  // re-emit the export line.
  //
  // Special idempotency note: `oldText` ("export default router;\n") is a
  // substring of `newText` (the additions + the export line), so the
  // generic applyOnce can't detect "already applied" via substring
  // inclusion alone. We use a unique sentinel from the additions
  // content instead.
  const stripped = additions
    .replace(/\s*export default router;\s*$/m, "")
    .trim();

  const ENDPOINT_SENTINEL =
    "// Ticket 2.5-BE — followup management endpoints";
  if (src.includes(ENDPOINT_SENTINEL)) {
    console.log("[add-endpoints] SKIP — already applied");
  } else {
    const oldText = "export default router;\n";
    const count = src.split(oldText).length - 1;
    if (count === 0) {
      console.error("[add-endpoints] NOOP — anchor not found");
      process.exit(2);
    }
    if (count > 1) {
      console.error(`[add-endpoints] FAIL — anchor matched ${count} times`);
      process.exit(2);
    }
    const idx = src.indexOf(oldText);
    src =
      src.substring(0, idx) +
      stripped +
      "\n\n" +
      oldText +
      src.substring(idx + oldText.length);
  }

  fs.writeFileSync(TARGET, src);

  // Evidence checks
  const evidence = {
    inArrayImported: /\n\s+inArray,\s*\n/.test(src),
    followupsTableImported: /\n\s+followupsTable,\s*\n/.test(src),
    markRepliedEndpoint: src.includes('"/prospects/:id/mark-replied"'),
    archiveEndpoint: src.includes('"/prospects/:id/archive"'),
    bulkPauseEndpoint: src.includes('"/prospects/bulk/pause"'),
    bulkPauseBodySchema: src.includes("bulkPauseBodySchema"),
    markRepliedBodySchema: src.includes("markRepliedBodySchema"),
    cancelsScheduledFollowups: src.includes('eq(followupsTable.status, "scheduled")'),
    auditEntryForReplied: src.includes("ACTION_TYPES.prospectReplied"),
    auditEntryForPaused: src.includes("ACTION_TYPES.prospectPaused"),
    auditEntryForArchive: src.includes('via: "archive_endpoint"'),
    exportRouterAtEnd: src.trimEnd().endsWith("export default router;"),
    isUuidLikeIntact: src.includes("function isUuidLike("),
    fetchOwnedProspectIntact: src.includes("async function fetchOwnedProspect("),
    listEndpointIntact: src.includes('router.get(\n  "/prospects",'),
    deleteEndpointIntact: src.includes("router.delete(\n  \"/prospects/:id\""),
  };

  console.log("[prospects-additions] [evidence]", JSON.stringify(evidence));
  const failing = Object.entries(evidence).filter(([_, v]) => !v).map(([k]) => k);
  if (failing.length > 0) {
    console.error("[prospects-additions] FAIL —", failing);
    process.exit(4);
  }

  console.log("[prospects-additions] DONE");
  console.log("[prospects-additions] sha256:", sha256(src));
}

main();
