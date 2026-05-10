#!/usr/bin/env node
/**
 * Ticket prospects-list — backend patch
 *
 * artifacts/api-server/src/routes/prospects.ts
 *
 * Adds GET /api/prospects (list with filters/sort/pagination), closing
 * the gap explicitly noted in the file's own header comment:
 *   "Not in scope here: GET /api/prospects (list with filters)."
 *
 * Two anchored edits:
 *   1. Extend the drizzle-orm import: + asc, count, desc, ilike,
 *      isNotNull, isNull, ne, or, sql
 *   2. Insert the LIST endpoint section between router declaration
 *      and existing Validation section
 *
 * Status computation lives server-side: a single source of truth so
 * the FE doesn't reimplement the rules. The endpoint accepts a
 * status filter, builds an equivalent SQL predicate, and also stamps
 * the computed status onto each row in the response.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/routes/prospects.ts",
);

// ──────────────────────────────────────────────────────────────────
// Edit 1 — extend drizzle-orm import
// ──────────────────────────────────────────────────────────────────

const IMPORTS_OLD = `import { and, eq } from "drizzle-orm";`;

const IMPORTS_NEW = `import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  ne,
  or,
} from "drizzle-orm";`;

const IMPORTS_MARKER = `import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,`;

// ──────────────────────────────────────────────────────────────────
// Edit 2 — insert LIST endpoint section
// ──────────────────────────────────────────────────────────────────

const LIST_SECTION_OLD = `const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────────────
// Validation`;

const LIST_SECTION_NEW = `const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────────────
// LIST endpoint (Ticket prospects-list)
// ─────────────────────────────────────────────────────────────────────────
//
// Status semantics (single source of truth — FE mirrors these labels but
// does not recompute):
//   sent             — firstMessageSentAt is set; SDR has acted on this row
//   phone-blocked    — Apollo webhook confirmed geo-block; terminal failure
//   phone-no-match   — Apollo webhook confirmed no phone available; terminal
//   phone-pending    — phone is null and no terminal failure (waiting on
//                      webhook arrival from the bulk-flow async path)
//   ready            — phone is set AND firstMessageBody is set; clickable
//                      "Open WhatsApp" / "Open Telegram"
//   draft            — phone is set but no message yet (seeder flow exited
//                      before generation, or generate-message failed)
//
// Order of checks matters: sent dominates, then terminal failures, then
// phone presence, then message presence.

const PROSPECT_STATUSES = [
  "sent",
  "ready",
  "draft",
  "phone-pending",
  "phone-blocked",
  "phone-no-match",
] as const;
type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

const LIST_CHANNELS = ["whatsapp", "telegram", "teams"] as const;
const LIST_SORT_COLS = ["createdAt", "updatedAt", "prospectName"] as const;

const listProspectsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(PROSPECT_STATUSES).optional(),
  channel: z.enum(LIST_CHANNELS).optional(),
  country: z.string().regex(/^[A-Z]{2}$/, "ISO 2-letter country code").optional(),
  search: z.string().trim().min(1).max(200).optional(),
  sortBy: z.enum(LIST_SORT_COLS).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

function statusSqlFilter(status: ProspectStatus) {
  switch (status) {
    case "sent":
      return isNotNull(prospectsTable.firstMessageSentAt);
    case "phone-blocked":
      return and(
        isNull(prospectsTable.firstMessageSentAt),
        eq(prospectsTable.phoneRevealStatus, "blocked"),
      );
    case "phone-no-match":
      return and(
        isNull(prospectsTable.firstMessageSentAt),
        eq(prospectsTable.phoneRevealStatus, "no_match"),
      );
    case "phone-pending":
      return and(
        isNull(prospectsTable.firstMessageSentAt),
        isNull(prospectsTable.phone),
        ne(prospectsTable.phoneRevealStatus, "blocked"),
        ne(prospectsTable.phoneRevealStatus, "no_match"),
      );
    case "ready":
      return and(
        isNull(prospectsTable.firstMessageSentAt),
        isNotNull(prospectsTable.phone),
        isNotNull(prospectsTable.firstMessageBody),
      );
    case "draft":
      return and(
        isNull(prospectsTable.firstMessageSentAt),
        isNotNull(prospectsTable.phone),
        isNull(prospectsTable.firstMessageBody),
      );
  }
}

function computeProspectStatus(p: {
  phone: string | null;
  phoneRevealStatus: string;
  firstMessageBody: string | null;
  firstMessageSentAt: Date | string | null;
}): ProspectStatus {
  if (p.firstMessageSentAt) return "sent";
  if (p.phoneRevealStatus === "blocked") return "phone-blocked";
  if (p.phoneRevealStatus === "no_match") return "phone-no-match";
  if (!p.phone) return "phone-pending";
  if (p.firstMessageBody) return "ready";
  return "draft";
}

router.get(
  "/",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as Request & { user: { id: string } }).user;

    let query;
    try {
      query = listProspectsQuerySchema.parse(req.query);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: "invalid_query", issues: err.issues });
        return;
      }
      throw err;
    }

    const filters = [eq(prospectsTable.userId, user.id)];
    if (query.status) {
      const sf = statusSqlFilter(query.status);
      if (sf) filters.push(sf);
    }
    if (query.channel) {
      filters.push(eq(prospectsTable.firstMessageChannel, query.channel));
    }
    if (query.country) {
      filters.push(eq(prospectsTable.country, query.country));
    }
    if (query.search) {
      const like = \`%\${query.search}%\`;
      const searchOr = or(
        ilike(prospectsTable.prospectName, like),
        ilike(prospectsTable.company, like),
      );
      if (searchOr) filters.push(searchOr);
    }
    const whereClause = and(...filters);

    const sortCol =
      query.sortBy === "prospectName"
        ? prospectsTable.prospectName
        : query.sortBy === "updatedAt"
          ? prospectsTable.updatedAt
          : prospectsTable.createdAt;
    const sortFn = query.sortDir === "asc" ? asc : desc;

    const offset = (query.page - 1) * query.perPage;

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: prospectsTable.id,
          prospectName: prospectsTable.prospectName,
          company: prospectsTable.company,
          title: prospectsTable.title,
          country: prospectsTable.country,
          language: prospectsTable.language,
          phone: prospectsTable.phone,
          phoneRevealStatus: prospectsTable.phoneRevealStatus,
          firstMessageBody: prospectsTable.firstMessageBody,
          firstMessageChannel: prospectsTable.firstMessageChannel,
          firstMessageSentAt: prospectsTable.firstMessageSentAt,
          apolloPersonId: prospectsTable.apolloPersonId,
          createdAt: prospectsTable.createdAt,
          updatedAt: prospectsTable.updatedAt,
        })
        .from(prospectsTable)
        .where(whereClause)
        .orderBy(sortFn(sortCol))
        .limit(query.perPage)
        .offset(offset),
      db
        .select({ value: count() })
        .from(prospectsTable)
        .where(whereClause),
    ]);

    const total = totalRow[0]?.value ?? 0;

    const prospects = rows.map((r) => ({
      id: r.id,
      prospectName: r.prospectName,
      company: r.company,
      title: r.title,
      country: r.country,
      language: r.language,
      phone: r.phone,
      phoneRevealStatus: r.phoneRevealStatus,
      firstMessageChannel: r.firstMessageChannel,
      firstMessageSentAt:
        r.firstMessageSentAt instanceof Date
          ? r.firstMessageSentAt.toISOString()
          : r.firstMessageSentAt,
      apolloPersonId: r.apolloPersonId,
      createdAt:
        r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      updatedAt:
        r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
      hasFirstMessage: r.firstMessageBody !== null && r.firstMessageBody.length > 0,
      status: computeProspectStatus(r),
    }));

    res.json({
      prospects,
      total,
      page: query.page,
      perPage: query.perPage,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────
// Validation`;

const LIST_SECTION_MARKER = `// LIST endpoint (Ticket prospects-list)`;

// ──────────────────────────────────────────────────────────────────
// applyEdit (APPEND-aware idempotency)
// ──────────────────────────────────────────────────────────────────

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count += 1;
    idx += needle.length;
  }
  return count;
}

function applyEdit(label, source, oldStr, newStr, marker) {
  const m = countOccurrences(source, marker);
  const o = countOccurrences(source, oldStr);
  if (m > 0) {
    console.log(`[${label}] SKIP — already applied`);
    return { source, ok: true };
  }
  if (o === 0) {
    console.log(`[${label}] NOOP — neither anchor nor marker found`);
    return { source, ok: false };
  }
  if (o > 1) {
    console.log(`[${label}] FAIL — anchor matched ${o} times`);
    return { source, ok: false };
  }
  console.log(`[${label}] APPLY — patch applied`);
  return { source: source.replace(oldStr, newStr), ok: true };
}

let source;
try {
  source = readFileSync(FILE, "utf8");
} catch (err) {
  console.error(`[FATAL] cannot read ${FILE}: ${err.message}`);
  process.exit(2);
}

const r1 = applyEdit("imports", source, IMPORTS_OLD, IMPORTS_NEW, IMPORTS_MARKER);
if (!r1.ok) process.exit(3);
source = r1.source;

const r2 = applyEdit("list-section", source, LIST_SECTION_OLD, LIST_SECTION_NEW, LIST_SECTION_MARKER);
if (!r2.ok) process.exit(3);
source = r2.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  newDrizzleImportsPresent:
    countOccurrences(source, "  asc,") === 1 &&
    countOccurrences(source, "  count,") === 1 &&
    countOccurrences(source, "  ilike,") === 1 &&
    countOccurrences(source, "  isNotNull,") === 1,
  listEndpointPresent: countOccurrences(source, `router.get(\n  "/",\n  requireAuth,`) >= 1,
  statusFilterFnPresent: countOccurrences(source, "function statusSqlFilter") === 1,
  computeStatusFnPresent: countOccurrences(source, "function computeProspectStatus") === 1,
  listMarker: countOccurrences(source, LIST_SECTION_MARKER) === 1,
};
console.log("[be-prospects-list] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[be-prospects-list] FAIL — evidence check failed");
  process.exit(4);
}

console.log("[be-prospects-list] DONE — GET /api/prospects added");
process.exit(0);
