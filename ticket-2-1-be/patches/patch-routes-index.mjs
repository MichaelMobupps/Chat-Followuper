#!/usr/bin/env node
/**
 * Anchored, idempotent patch for artifacts/api-server/src/routes/index.ts
 * - Adds `import prospectorRouter from "./prospector";`
 * - Mounts `router.use(prospectorRouter);`
 *
 * Anchored on `apolloRouter` rather than `prospectsRouter` (BE-2). Reason:
 * `apolloRouter` has been present in the file since well before any
 * Phase 1.7 work and is verified present in both the live repo and the
 * read-only `source-code/` mirror. `prospectsRouter` exists in live
 * (BE-2 is shipped) but is not consistently mirrored, so anchoring on
 * it would make this patch's behavior depend on mirror sync state.
 *
 * Mount order ends up: apollo → prospector → (existing prospects, if
 * mounted). Order of `router.use(...)` calls does not affect routing
 * because each router has a unique URL prefix.
 */
import fs from "node:fs";

const PATH = "artifacts/api-server/src/routes/index.ts";

let src = fs.readFileSync(PATH, "utf8");
const before = src;
const log = (m) => console.log(`[patch-routes-index] ${m}`);

const importAnchor = 'import apolloRouter from "./apollo";';
const importInsert =
  'import apolloRouter from "./apollo";\n' +
  'import prospectorRouter from "./prospector";';

if (src.includes('import prospectorRouter from "./prospector"')) {
  log("[SKIP] prospectorRouter import already present");
} else if (!src.includes(importAnchor)) {
  console.error(
    `[patch-routes-index] [FAIL] import anchor not found: ${importAnchor}`,
  );
  console.error(
    "       routes/index.ts is in an unexpected state — apolloRouter is",
  );
  console.error(
    "       supposed to be present since long before this ticket. Inspect.",
  );
  process.exit(2);
} else {
  src = src.replace(importAnchor, importInsert);
  log("[APPLY] added prospectorRouter import");
}

const mountAnchor = "router.use(apolloRouter);";
const mountInsert =
  "router.use(apolloRouter);\n" + "router.use(prospectorRouter);";

if (src.includes("router.use(prospectorRouter)")) {
  log("[SKIP] prospectorRouter already mounted");
} else if (!src.includes(mountAnchor)) {
  console.error(
    `[patch-routes-index] [FAIL] mount anchor not found: ${mountAnchor}`,
  );
  console.error(
    "       routes/index.ts is in an unexpected state — apolloRouter mount",
  );
  console.error(
    "       is supposed to be present. Inspect the file.",
  );
  process.exit(2);
} else {
  src = src.replace(mountAnchor, mountInsert);
  log("[APPLY] mounted prospectorRouter");
}

if (src === before) {
  log("[NOOP] no changes");
} else {
  fs.writeFileSync(PATH, src);
  log("[DONE] routes/index.ts updated");
}

const finalSrc = fs.readFileSync(PATH, "utf8");
const evidence = {
  prospectorRouter_import: (
    finalSrc.match(/import prospectorRouter from "\.\/prospector"/g) || []
  ).length,
  prospectorRouter_mount: (
    finalSrc.match(/router\.use\(prospectorRouter\)/g) || []
  ).length,
  apolloRouter_still_present: (
    finalSrc.match(/import apolloRouter from "\.\/apollo"/g) || []
  ).length,
};
console.log("[patch-routes-index] evidence:", JSON.stringify(evidence));
const expected = {
  prospectorRouter_import: 1,
  prospectorRouter_mount: 1,
  apolloRouter_still_present: 1,
};
for (const [k, v] of Object.entries(expected)) {
  if (evidence[k] !== v) {
    console.error(
      `[patch-routes-index] [FAIL] evidence ${k}: got ${evidence[k]}, expected ${v}`,
    );
    process.exit(3);
  }
}
console.log("[patch-routes-index] all evidence checks passed");
