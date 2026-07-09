/**
 * Competitor grounding library — (country, vertical, subvertical) →
 * curated peer/competitor lists for country-matched references.
 *
 * Source: competitor_library.jsonl at the workspace root (user-provided,
 * ~1112 rows). Row shape:
 *   { country, country_code, vertical, subvertical,
 *     competitors: [{name, operates_in_country, tier: "core"|"secondary"}],
 *     cross_border: string[], avoid: string[] }
 *
 * WHY: the doctrine requires country-matched peer references ("Indian
 * prospect = Indian peers"). Previously the writer model had to KNOW local
 * competitors — one reason the writer needed Opus. Injecting a curated,
 * pre-verified list lets gemini-3.5-flash name-drop correctly and removes a
 * whole class of hallucinated-peer failures. The `avoid` list doubles as a
 * hard negative ("never mention").
 *
 * Same path-resolution + lazy-singleton pattern as exemplars/loader.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { logger } from "../logger";

export interface CompetitorEntry {
  country: string;
  countryCode: string;
  vertical: string;
  subvertical: string;
  core: string[];
  secondary: string[];
  crossBorder: string[];
  avoid: string[];
}

const LIBRARY_FILE = "competitor_library.jsonl";

let entries: CompetitorEntry[] | undefined;

function loadLibrary(): CompetitorEntry[] {
  if (entries !== undefined) return entries;

  // Reuse the same walk-up strategy as the exemplar loader (the files ship
  // side-by-side at the workspace root). EXEMPLARS_DIR override applies too.
  const candidates: string[] = [];
  if (process.env.EXEMPLARS_DIR) candidates.push(process.env.EXEMPLARS_DIR);
  let cur = process.cwd();
  for (let i = 0; i < 5; i++) {
    candidates.push(cur);
    cur = path.dirname(cur);
  }

  let filePath: string | null = null;
  for (const dir of candidates) {
    try {
      const p = path.join(dir, LIBRARY_FILE);
      if (fs.existsSync(p)) {
        filePath = p;
        break;
      }
    } catch {
      // keep walking
    }
  }

  const loaded: CompetitorEntry[] = [];
  let parseErrors = 0;
  // Guarded read: existsSync passing doesn't guarantee readability (perms,
  // path-is-a-directory). This runs on the generation request path and the
  // failure wouldn't cache (entries assigned only at the end) — an unguarded
  // throw would re-walk and re-throw on EVERY request. Degrade to empty.
  let rawText: string | null = null;
  if (filePath) {
    try {
      rawText = fs.readFileSync(filePath, "utf8");
    } catch (err) {
      logger.warn({ err: String(err), filePath }, "[competitors] library unreadable — degrading to no competitor block");
    }
  }
  if (rawText !== null) {
    for (const line of rawText.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed) as {
          country?: string;
          country_code?: string;
          vertical?: string;
          subvertical?: string;
          competitors?: Array<{ name?: string; operates_in_country?: boolean; tier?: string }>;
          cross_border?: string[];
          avoid?: string[];
        };
        if (!row.country || !row.vertical) {
          parseErrors += 1;
          continue;
        }
        const competitors = (row.competitors || []).filter(
          (c) => c.name && c.operates_in_country !== false,
        );
        loaded.push({
          country: row.country,
          countryCode: (row.country_code || "").toUpperCase(),
          vertical: (row.vertical || "").toLowerCase(),
          subvertical: (row.subvertical || "").toLowerCase(),
          core: competitors.filter((c) => c.tier === "core").map((c) => c.name!) ,
          secondary: competitors.filter((c) => c.tier !== "core").map((c) => c.name!),
          crossBorder: row.cross_border || [],
          avoid: row.avoid || [],
        });
      } catch {
        parseErrors += 1;
      }
    }
  } else if (!filePath) {
    logger.warn(
      "[competitors] " + LIBRARY_FILE + " not found — prompts will carry no competitor grounding block",
    );
  }

  logger.info({ rows: loaded.length, parseErrors }, "[competitors] library loaded");
  entries = loaded;
  return entries;
}

/**
 * Look up the best competitor entry for a prospect. Match priority:
 *   1. country + vertical + subvertical (subvertical substring match)
 *   2. country + vertical
 * Country matches on display name OR ISO code, case-insensitive.
 * Deterministic: first match in file order at each priority level.
 */
export function lookupCompetitors(
  country: string,
  vertical: string,
  subVertical: string | null,
): CompetitorEntry | null {
  const lib = loadLibrary();
  if (lib.length === 0) return null;

  const c = (country || "").trim().toLowerCase();
  if (!c) return null;
  const v = (vertical || "").trim().toLowerCase();
  const sub = (subVertical || "").trim().toLowerCase();

  const countryMatches = lib.filter(
    (e) => e.country.toLowerCase() === c || e.countryCode.toLowerCase() === c,
  );
  if (countryMatches.length === 0) return null;

  const verticalMatches = countryMatches.filter(
    (e) => e.vertical === v || (v.length >= 4 && (v.includes(e.vertical) || e.vertical.includes(v))),
  );
  if (verticalMatches.length === 0) return null;

  if (sub) {
    const subMatch = verticalMatches.find(
      (e) => e.subvertical && (sub.includes(e.subvertical) || e.subvertical.includes(sub)),
    );
    if (subMatch) return subMatch;
  }
  return verticalMatches[0];
}

/**
 * Render a competitor grounding block for the writer USER prompt.
 * Returns "" when no entry matches (block simply absent — the writer then
 * follows the existing doctrine rule to only reference peers it is sure of).
 */
export function buildCompetitorBlock(entry: CompetitorEntry | null): string {
  if (!entry) return "";
  const parts: string[] = [];
  if (entry.core.length) parts.push(`CORE PEERS: ${entry.core.join(", ")}`);
  if (entry.secondary.length) parts.push(`SECONDARY: ${entry.secondary.slice(0, 6).join(", ")}`);
  if (entry.crossBorder.length) parts.push(`CROSS-BORDER PLAYERS: ${entry.crossBorder.slice(0, 4).join(", ")}`);
  if (parts.length === 0) return "";
  const avoidLine = entry.avoid.length
    ? `\nNEVER mention (wrong market/context): ${entry.avoid.slice(0, 10).join(", ")}`
    : "";
  return `
COMPETITOR GROUNDING for ${entry.country} / ${entry.vertical}${entry.subvertical ? " / " + entry.subvertical : ""} (when the message name-drops a peer or competitor, use ONLY names from this verified list — do not invent others):
${parts.join("\n")}${avoidLine}
`;
}

/** Test hook. */
export function __resetCompetitorCacheForTests(): void {
  entries = undefined;
}
