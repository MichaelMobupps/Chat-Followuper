#!/usr/bin/env node
/**
 * Patch: mount campaigns and generateMessage routers in the API router barrel.
 *
 * Target: artifacts/api-server/src/routes/index.ts
 *
 * Two anchored edits:
 *   1. Add the imports right after the existing apolloRouter import.
 *   2. Add the router.use() lines right after the existing router.use(apolloRouter).
 *
 * Idempotent: each edit checks its postcondition. Anchor uniqueness enforced.
 *
 * Runs from repo root.
 */

import fs from "node:fs";
import crypto from "node:crypto";

const TARGET = process.env.TARGET_PATH ?? "artifacts/api-server/src/routes/index.ts";

const IMPORT_ANCHOR = `import apolloRouter from "./apollo";`;
const IMPORT_INSERT = `import apolloRouter from "./apollo";
import campaignsRouter from "./campaigns";
import generateMessageRouter from "./generateMessage";`;
const IMPORT_POST_CAMPAIGNS = /import\s+campaignsRouter\s+from\s+"\.\/campaigns"/;
const IMPORT_POST_GENERATE = /import\s+generateMessageRouter\s+from\s+"\.\/generateMessage"/;

const USE_ANCHOR = `router.use(apolloRouter);`;
const USE_INSERT = `router.use(apolloRouter);
router.use(campaignsRouter);
router.use(generateMessageRouter);`;
const USE_POST_CAMPAIGNS = /router\.use\(campaignsRouter\)/;
const USE_POST_GENERATE = /router\.use\(generateMessageRouter\)/;

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function evidence(label, content) {
  const bytes = Buffer.byteLength(content, "utf8");
  const lines = content.split("\n").length;
  return `${label} sha256=${sha256(content).slice(0, 12)} bytes=${bytes} lines=${lines}`;
}

function applyEdit({ name, anchor, insert, postChecks, content }) {
  if (postChecks.every((re) => re.test(content))) {
    console.log(`[SKIP] ${name}: postcondition already met`);
    return content;
  }

  const occ = content.split(anchor).length - 1;
  if (occ === 0) throw new Error(`[FAIL] ${name}: anchor not found`);
  if (occ > 1)
    throw new Error(`[FAIL] ${name}: anchor appears ${occ} times (expected 1)`);

  const after = content.replace(anchor, insert);
  if (!postChecks.every((re) => re.test(after))) {
    throw new Error(`[FAIL] ${name}: postcondition not met`);
  }
  console.log(`[OK]   ${name}`);
  return after;
}

if (!fs.existsSync(TARGET)) {
  console.error(`[FAIL] target not found: ${TARGET}`);
  process.exit(1);
}

let content = fs.readFileSync(TARGET, "utf8");
console.log(evidence("[PRE]  ", content));

try {
  content = applyEdit({
    name: "import-routers",
    anchor: IMPORT_ANCHOR,
    insert: IMPORT_INSERT,
    postChecks: [IMPORT_POST_CAMPAIGNS, IMPORT_POST_GENERATE],
    content,
  });
  content = applyEdit({
    name: "mount-routers",
    anchor: USE_ANCHOR,
    insert: USE_INSERT,
    postChecks: [USE_POST_CAMPAIGNS, USE_POST_GENERATE],
    content,
  });
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

fs.writeFileSync(TARGET, content, "utf8");
console.log(evidence("[POST] ", content));

const grepImport = (content.match(/campaignsRouter|generateMessageRouter/g) || []).length;
const grepUse = (content.match(/router\.use\((campaignsRouter|generateMessageRouter)\)/g) || []).length;
console.log(`[GREP] router-identifiers=${grepImport} (expected ≥4) router.use=${grepUse} (expected ≥2)`);

if (grepImport < 4 || grepUse < 2) {
  console.error(`[FAIL] grep evidence below threshold`);
  process.exit(1);
}

console.log(`[OK] patched ${TARGET}`);
