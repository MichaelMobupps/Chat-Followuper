#!/usr/bin/env node
/**
 * Ticket prospects-list hotfix — fix list-endpoint route path
 *
 * artifacts/api-server/src/routes/prospects.ts
 *
 * The original patch put `router.get("/", ...)` for the list endpoint
 * assuming the prospectsRouter was mounted at `/api/prospects`. It's
 * actually mounted at `/api` with no path prefix (see routes/index.ts:
 * `router.use(prospectsRouter)` and app.ts: `app.use("/api", router)`),
 * so every route handler inside this file must include `/prospects` in
 * its path string — the convention the existing CRUD handlers already
 * follow.
 *
 * Existing routes (correct):
 *   POST   "/prospects"          → POST  /api/prospects
 *   GET    "/prospects/:id"      → GET   /api/prospects/X
 *   PATCH  "/prospects/:id"      → PATCH /api/prospects/X
 *   DELETE "/prospects/:id"      → DELETE /api/prospects/X
 *
 * My patch (broken):
 *   GET    "/"                   → GET   /api/  (and /api) ← wrong
 *
 * Fix:
 *   GET    "/prospects"          → GET   /api/prospects ✓
 *
 * Side benefit: removes the spurious auth-gated handler at /api and
 * /api/ that my original patch accidentally introduced.
 *
 * Single anchored edit. Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/routes/prospects.ts",
);

const EDIT_OLD = `router.get(
  "/",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as Request & { user: { id: string } }).user;

    let query;
    try {
      query = listProspectsQuerySchema.parse(req.query);`;

const EDIT_NEW = `router.get(
  "/prospects",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as Request & { user: { id: string } }).user;

    let query;
    try {
      query = listProspectsQuerySchema.parse(req.query);`;

// Marker = the corrected path with the surrounding context that's unique
// to this specific handler (listProspectsQuerySchema is only used here).
const EDIT_MARKER = `router.get(
  "/prospects",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as Request & { user: { id: string } }).user;

    let query;
    try {
      query = listProspectsQuerySchema.parse(req.query);`;

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count += 1;
    idx += needle.length;
  }
  return count;
}

let source;
try {
  source = readFileSync(FILE, "utf8");
} catch (err) {
  console.error(`[FATAL] cannot read ${FILE}: ${err.message}`);
  process.exit(2);
}

const m = countOccurrences(source, EDIT_MARKER);
const o = countOccurrences(source, EDIT_OLD);

if (m > 0) {
  console.log("[fix-list-route-path] SKIP — already applied");
  process.exit(0);
}
if (o === 0) {
  console.log("[fix-list-route-path] NOOP — anchor not found (was the prospects-list ticket applied?)");
  process.exit(3);
}
if (o > 1) {
  console.log(`[fix-list-route-path] FAIL — anchor matched ${o} times`);
  process.exit(3);
}

writeFileSync(FILE, source.replace(EDIT_OLD, EDIT_NEW), "utf8");

const next = readFileSync(FILE, "utf8");
const evidence = {
  prospectsPathPresent: countOccurrences(next, `router.get(\n  "/prospects",\n  requireAuth,`) === 1,
  brokenRootPathGone: countOccurrences(next, `router.get(\n  "/",\n  requireAuth,`) === 0,
  marker: countOccurrences(next, EDIT_MARKER) === 1,
};
console.log("[fix-list-route-path] APPLY — patch applied");
console.log("[fix-list-route-path] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[fix-list-route-path] FAIL — evidence check failed");
  process.exit(4);
}

process.exit(0);
