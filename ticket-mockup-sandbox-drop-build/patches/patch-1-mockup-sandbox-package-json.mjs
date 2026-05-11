#!/usr/bin/env node
/**
 * Ticket mockup-sandbox-drop-build, patch 1/1: artifacts/mockup-sandbox/package.json
 *
 * One atomic edit: remove the "build": "vite build" line entirely from the
 * scripts block.
 *
 * Background:
 *   - artifacts/mockup-sandbox is kind="design", a dev-only canvas for
 *     previewing UI components. It is never served in production and produces
 *     no production artifact.
 *   - artifacts/mockup-sandbox/vite.config.ts hard-throws when PORT or
 *     BASE_PATH environment variables are missing (lines 9-13, 23-28). These
 *     are only set by the dev-runtime [services.env] block in artifact.toml,
 *     not by Replit's deployment build phase.
 *   - The repo root package.json build script runs:
 *         pnpm run typecheck && pnpm -r --if-present run build
 *     The "-r --if-present" form walks every workspace package and runs its
 *     "build" script if one exists. mockup-sandbox declares "build": "vite
 *     build", so it gets picked up. vite.config.ts then throws on the missing
 *     PORT/BASE_PATH and the deploy fails.
 *
 * Fix:
 *   Remove the "build" script from mockup-sandbox's package.json. pnpm
 *   --if-present will then simply skip mockup-sandbox in the deploy walk.
 *   Local "pnpm dev" / "pnpm preview" / "pnpm typecheck" inside the
 *   mockup-sandbox package remain unaffected because each is its own script
 *   key.
 *
 * Why this and not the alternatives:
 *   B (default PORT/BASE_PATH in vite.config.ts) -- still produces an unused
 *     dist/ on every deploy; pollutes the artifact tree.
 *   C (add [services.production] to artifact.toml) -- tells Replit deploy
 *     "this is a production service" when it explicitly is not.
 *   A (this patch) -- removes the dead deploy work entirely. Matches the
 *     hammer-vs-nail principle.
 *
 * JSON-safety note:
 *   The anchor includes the line's leading 4-space indent, trailing comma,
 *   and trailing newline so removing the line leaves the surrounding JSON
 *   syntactically valid. The "dev" line above keeps its trailing comma; the
 *   "preview" line below becomes the line right after "dev".
 *
 * Idempotent. Anchor em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/mockup-sandbox/package.json",
);

// =================================================================
// Edit 1 - Remove the "build": "vite build", line entirely
// =================================================================
//
// Anchor includes the leading 4 spaces, the full line content, and
// the trailing LF. After replacement, the LF before "preview" stays
// intact via the trailing LF of the "dev" line above.

const E1_OLD = `    "build": "vite build",\n`;
const E1_NEW = ``;

// MARKER is the post-state indicator: the absence of the build line
// is hard to detect alone, so use a distinctive adjacency check.
// In the post-patched file, "dev" is directly followed (with its
// trailing comma + newline) by "preview". In the pre-patched file,
// "dev" is followed by "build". We detect "already applied" by
// checking that the build line is gone AND the dev->preview adjacency
// is present.

const E1_MARKER = `    "dev": "vite dev",\n    "preview": "vite preview",`;

// =================================================================
// applyEdit helper - matches the canonical multi-edit pattern
// =================================================================

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) { count++; idx += needle.length; }
  return count;
}

function applyEdit(label, source, oldStr, newStr, marker) {
  const m = countOccurrences(source, marker);
  const o = countOccurrences(source, oldStr);
  if (m > 0) { console.log(`[${label}] SKIP - already applied`); return { source, ok: true }; }
  if (o === 0) { console.log(`[${label}] NOOP - anchor not found`); return { source, ok: false }; }
  if (o > 1) { console.log(`[${label}] FAIL - anchor matched ${o} times`); return { source, ok: false }; }
  console.log(`[${label}] APPLY`);
  return { source: source.replace(oldStr, newStr), ok: true };
}

let source;
try { source = readFileSync(FILE, "utf8"); }
catch (err) { console.error(`[FATAL] cannot read ${FILE}: ${err.message}`); process.exit(2); }

for (const [label, oldStr, newStr, marker] of [
  ["drop-build-script", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

// =================================================================
// Evidence - confirm the post-state
// =================================================================
//
// Critical post-state checks:
//   1. The build line is gone.
//   2. The dev-comma-preview adjacency exists.
//   3. The JSON is still parseable (the writeFileSync output round-trips
//      through JSON.parse without throwing).
//   4. Other scripts (dev, preview, typecheck) are unchanged.
//   5. The "name" field at top is unchanged.

let parsed;
try { parsed = JSON.parse(source); }
catch (err) { console.error(`[FATAL] post-patch JSON parse failed: ${err.message}`); process.exit(4); }

const evidence = {
  buildLineRemoved:     !source.includes(`"build": "vite build"`),
  buildKeyAbsent:       !("build" in (parsed.scripts || {})),
  devScriptIntact:      parsed.scripts?.dev === "vite dev",
  previewScriptIntact:  parsed.scripts?.preview === "vite preview",
  typecheckIntact:      parsed.scripts?.typecheck === "tsc -p tsconfig.json --noEmit",
  scriptsKeyCount:      Object.keys(parsed.scripts || {}).length === 3,
  packageNameIntact:    parsed.name === "@workspace/mockup-sandbox",
  packageVersionIntact: parsed.version === "2.0.0",
  packagePrivateIntact: parsed.private === true,
  packageTypeIntact:    parsed.type === "module",
  devDepsIntact:        typeof parsed.devDependencies === "object" &&
                        Object.keys(parsed.devDependencies).length > 0,
  jsonParseable:        true,
  devPreviewAdjacent:   source.includes(`    "dev": "vite dev",\n    "preview": "vite preview",`),
};
console.log("[mockup-sandbox-package-json] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[mockup-sandbox-package-json] FAIL -", failing.join(", "));
  process.exit(5);
}
console.log("[mockup-sandbox-package-json] DONE");
