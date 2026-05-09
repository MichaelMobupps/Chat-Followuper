#!/usr/bin/env node
/**
 * Patch: add `export * from "./campaigns";` to the schema barrel.
 *
 * Target: lib/db/src/schema/index.ts
 *
 * Idempotent: skips if the line already exists. Anchor: the existing
 * prospects export. Inserts the campaigns export immediately after.
 *
 * Runs from repo root.
 */

import fs from "node:fs";
import crypto from "node:crypto";

const TARGET = process.env.TARGET_PATH ?? "lib/db/src/schema/index.ts";

const ANCHOR = `export * from "./prospects";`;
const INSERT = `export * from "./prospects";
export * from "./campaigns";`;
const POST = /export\s*\*\s*from\s*"\.\/campaigns"/;

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function evidence(label, content) {
  const bytes = Buffer.byteLength(content, "utf8");
  const lines = content.split("\n").length;
  return `${label} sha256=${sha256(content).slice(0, 12)} bytes=${bytes} lines=${lines}`;
}

if (!fs.existsSync(TARGET)) {
  console.error(`[FAIL] target not found: ${TARGET}`);
  process.exit(1);
}

const before = fs.readFileSync(TARGET, "utf8");
console.log(evidence("[PRE]  ", before));

if (POST.test(before)) {
  console.log(`[SKIP] ${TARGET} already exports campaigns`);
  process.exit(0);
}

const occ = before.split(ANCHOR).length - 1;
if (occ === 0) {
  console.error(`[FAIL] anchor not found in ${TARGET}`);
  process.exit(1);
}
if (occ > 1) {
  console.error(`[FAIL] anchor appears ${occ} times in ${TARGET} (expected 1)`);
  process.exit(1);
}

const after = before.replace(ANCHOR, INSERT);
if (!POST.test(after)) {
  console.error(`[FAIL] postcondition not met after substitution`);
  process.exit(1);
}

fs.writeFileSync(TARGET, after, "utf8");
console.log(evidence("[POST] ", after));

const grep = (after.match(/campaigns/g) || []).length;
console.log(`[GREP] campaigns=${grep} (expected ≥1)`);
console.log(`[OK] patched ${TARGET}`);
