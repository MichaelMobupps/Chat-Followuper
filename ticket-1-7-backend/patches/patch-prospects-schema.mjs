#!/usr/bin/env node
/**
 * Patch: add campaignId column + campaigns import to prospects schema.
 *
 * Target: lib/db/src/schema/prospects.ts
 *
 * Two anchored edits, each idempotent:
 *   1. Add `import { campaignsTable } from "./campaigns";` after the
 *      existing usersTable import.
 *   2. Add `campaignId` column right after `sourceMode`.
 *
 * Idempotency: if the postcondition is already met, the edit is skipped.
 * Anchor uniqueness: each anchor must occur exactly once in the file.
 *
 * Runs from repo root.
 */

import fs from "node:fs";
import crypto from "node:crypto";

const TARGETS = [
  process.env.TARGET_PATH ?? "lib/db/src/schema/prospects.ts",
  // Mirror: also patch the read-only review snapshot if present, so the
  // committed source-code/ tree stays in sync without a separate sync step.
  // sync-source-code.sh is the canonical sync; this is a belt-and-braces
  // safeguard for the local dev cycle.
];

const IMPORT_ANCHOR = `import { usersTable } from "./users";`;
const IMPORT_INSERT = `import { usersTable } from "./users";
import { campaignsTable } from "./campaigns";`;
const IMPORT_POST = /import\s*\{\s*campaignsTable\s*\}\s*from\s*"\.\/campaigns"/;

const COLUMN_ANCHOR = `    sourceMode: text("source_mode").notNull(),`;
const COLUMN_INSERT = `    sourceMode: text("source_mode").notNull(),
    campaignId: uuid("campaign_id").references(() => campaignsTable.id, {
      onDelete: "set null",
    }),`;
const COLUMN_POST = /campaignId:\s*uuid\("campaign_id"\)/;

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function evidence(label, content) {
  const bytes = Buffer.byteLength(content, "utf8");
  const lines = content.split("\n").length;
  return `${label} sha256=${sha256(content).slice(0, 12)} bytes=${bytes} lines=${lines}`;
}

function applyEdit({ filePath, name, anchor, insert, post }) {
  const before = fs.readFileSync(filePath, "utf8");

  if (post.test(before)) {
    console.log(`[SKIP] ${name}: postcondition already met in ${filePath}`);
    return { changed: false, content: before };
  }

  const occurrences = before.split(anchor).length - 1;
  if (occurrences === 0) {
    throw new Error(`[FAIL] ${name}: anchor not found in ${filePath}`);
  }
  if (occurrences > 1) {
    throw new Error(
      `[FAIL] ${name}: anchor appears ${occurrences} times in ${filePath} (expected 1)`,
    );
  }

  const after = before.replace(anchor, insert);
  if (!post.test(after)) {
    throw new Error(`[FAIL] ${name}: postcondition not met after substitution`);
  }

  fs.writeFileSync(filePath, after, "utf8");
  console.log(`[OK]   ${name}: applied to ${filePath}`);
  return { changed: true, content: after };
}

let exitCode = 0;
for (const filePath of TARGETS) {
  if (!fs.existsSync(filePath)) {
    console.log(`[MISS] ${filePath} not present, skipping`);
    continue;
  }

  console.log(`---`);
  console.log(`File: ${filePath}`);
  const pre = fs.readFileSync(filePath, "utf8");
  console.log(evidence("[PRE]  ", pre));

  try {
    const r1 = applyEdit({
      filePath,
      name: "import-campaignsTable",
      anchor: IMPORT_ANCHOR,
      insert: IMPORT_INSERT,
      post: IMPORT_POST,
    });
    const r2 = applyEdit({
      filePath,
      name: "column-campaignId",
      anchor: COLUMN_ANCHOR,
      insert: COLUMN_INSERT,
      post: COLUMN_POST,
    });

    const post = fs.readFileSync(filePath, "utf8");
    console.log(evidence("[POST] ", post));

    const grepImport = (post.match(/campaignsTable/g) || []).length;
    const grepColumn = (post.match(/campaignId/g) || []).length;
    console.log(
      `[GREP] campaignsTable=${grepImport} (expected ≥1)  campaignId=${grepColumn} (expected ≥1)`,
    );

    if (grepImport < 1 || grepColumn < 1) {
      console.error(`[FAIL] grep evidence below threshold for ${filePath}`);
      exitCode = 1;
    }
  } catch (err) {
    console.error(err.message);
    exitCode = 1;
  }
}

process.exit(exitCode);
