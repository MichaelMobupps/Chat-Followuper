#!/usr/bin/env node
/**
 * Anchored, idempotent patch for artifacts/api-server/src/routes/index.ts
 * - Adds `import prospectsRouter from "./prospects";`
 * - Mounts `router.use(prospectsRouter);`
 *
 * Anchored on the existing apolloRouter import + mount so insertion
 * sequence preserves the curated route order.
 */
import fs from "node:fs";

const PATH = "artifacts/api-server/src/routes/index.ts";

let src = fs.readFileSync(PATH, "utf8");
const before = src;
const log = (m) => console.log(`[patch-routes-index] ${m}`);

// === 1. Add import ===
const importAnchor = 'import apolloRouter from "./apollo";';
const importInsert =
  'import apolloRouter from "./apollo";\n' +
  'import prospectsRouter from "./prospects";';

if (src.includes('import prospectsRouter from "./prospects"')) {
  log("[SKIP] import already present");
} else if (!src.includes(importAnchor)) {
  console.error(
    `[patch-routes-index] [FAIL] import anchor not found: ${importAnchor}`,
  );
  process.exit(2);
} else {
  src = src.replace(importAnchor, importInsert);
  log("[APPLY] added prospectsRouter import");
}

// === 2. Mount router ===
const mountAnchor = "router.use(apolloRouter);";
const mountInsert =
  "router.use(apolloRouter);\n" + "router.use(prospectsRouter);";

if (src.includes("router.use(prospectsRouter)")) {
  log("[SKIP] router already mounted");
} else if (!src.includes(mountAnchor)) {
  console.error(
    `[patch-routes-index] [FAIL] mount anchor not found: ${mountAnchor}`,
  );
  process.exit(2);
} else {
  src = src.replace(mountAnchor, mountInsert);
  log("[APPLY] mounted prospectsRouter");
}

// === Write ===
if (src === before) {
  log("[NOOP] no changes");
} else {
  fs.writeFileSync(PATH, src);
  log("[DONE] routes/index.ts updated");
}

// === Evidence ===
const finalSrc = fs.readFileSync(PATH, "utf8");
const evidence = {
  prospectsRouter_import: (
    finalSrc.match(/import prospectsRouter from "\.\/prospects"/g) || []
  ).length,
  prospectsRouter_mount: (
    finalSrc.match(/router\.use\(prospectsRouter\)/g) || []
  ).length,
};
console.log("[patch-routes-index] evidence:", JSON.stringify(evidence));
const expected = { prospectsRouter_import: 1, prospectsRouter_mount: 1 };
for (const [k, v] of Object.entries(expected)) {
  if (evidence[k] !== v) {
    console.error(
      `[patch-routes-index] [FAIL] evidence ${k}: got ${evidence[k]}, expected ${v}`,
    );
    process.exit(3);
  }
}
console.log("[patch-routes-index] all evidence checks passed");
