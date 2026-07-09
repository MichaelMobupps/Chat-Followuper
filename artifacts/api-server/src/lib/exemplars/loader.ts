/**
 * Follow-up exemplar library — loader + email→chat adaptation.
 *
 * Source assets (workspace root, provided by the user):
 *   - Followupper_exemplars_widened.jsonl        (canonical, ~1272 rows)
 *   - Followupper_exemplars_additions_only.jsonl (~1260 rows, subset/overlap)
 *
 * Each row is an EMAIL follow-up exemplar keyed by (vertical, offer_type,
 * language, market, stage) with body text in the target language. These were
 * written for the email Followuper — they carry email-isms (a `subject`
 * field, "my note"/"my email" phrasing) that MUST NOT leak into chat
 * messages. This module:
 *
 *   1. Loads + merges both jsonl files (dedupe by id; widened wins).
 *   2. ADAPTS each body to chat: drops the subject entirely, rewrites
 *      English email vocabulary to chat vocabulary, and EXCLUDES any body
 *      that still contains email vocabulary after adaptation (multi-language
 *      reject list — we never rewrite non-English text, we only filter it).
 *   3. Exposes the adapted library as an in-memory singleton for the
 *      selector (see select.ts).
 *
 * WHY exemplars: few-shot style references let a cheaper writer model
 * (gemini-3.5-flash) hit the doctrine register that previously needed
 * Opus — the core of the LLM cost reframe. Numbers in exemplar bodies are
 * ILLUSTRATIVE (tagged in the source data); the prompt block instructs the
 * writer to mirror shape/register only, never copy claims.
 */
import fs from "node:fs";
import path from "node:path";
import { logger } from "../logger";

export interface RawExemplar {
  parent_id: string;
  id: string;
  stage: number;
  subject: string;         // email-only artifact — dropped at adaptation
  body: string;
  angle: string;
  vertical: string;
  offer_type: string;      // cps | ua | retargeting | ...
  language: string;        // ISO 639-1 primary tag ("en", "ar", ...)
  market: string;          // country display name ("Qatar", "United States")
  rule_pack?: string;
  illustrative_flags?: string[];
  register_notes?: string;
}

export interface ChatExemplar {
  id: string;
  stage: number;
  body: string;            // chat-adapted body
  angle: string;
  vertical: string;
  offerType: string;
  language: string;
  market: string;
}

export interface ExemplarStats {
  loaded: number;          // rows parsed from disk (post-dedupe)
  adapted: number;         // rows that survived email→chat adaptation
  excluded: number;        // rows dropped (residual email vocabulary)
  parseErrors: number;     // malformed jsonl lines skipped
  dir: string | null;      // resolved data directory (null = not found)
}

const WIDENED_FILE = "Followupper_exemplars_widened.jsonl";
const ADDITIONS_FILE = "Followupper_exemplars_additions_only.jsonl";

// ─────────────────────────────────────────────────────────────────
// Data-directory resolution
// ─────────────────────────────────────────────────────────────────
//
// The jsonl files live at the WORKSPACE ROOT (two levels above the
// api-server package), but cwd differs between dev (`pnpm dev` from the
// package), deploy (repo root), and scripts. Resolve by candidate walk-up
// from cwd, overridable with EXEMPLARS_DIR. Resolution is cached; a miss is
// logged once and the library degrades to empty (generation still works —
// prompts simply carry no exemplar block).

let resolvedDir: string | null | undefined;

function resolveDataDir(): string | null {
  if (resolvedDir !== undefined) return resolvedDir;

  const candidates: string[] = [];
  if (process.env.EXEMPLARS_DIR) candidates.push(process.env.EXEMPLARS_DIR);
  let cur = process.cwd();
  for (let i = 0; i < 5; i++) {
    candidates.push(cur);
    cur = path.dirname(cur);
  }

  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, WIDENED_FILE))) {
        resolvedDir = dir;
        return dir;
      }
    } catch {
      // unreadable candidate — keep walking
    }
  }

  logger.warn(
    { candidates },
    "[exemplars] library files not found — generation will run WITHOUT exemplar blocks. " +
      "Set EXEMPLARS_DIR to the directory containing " + WIDENED_FILE,
  );
  resolvedDir = null;
  return null;
}

// ─────────────────────────────────────────────────────────────────
// Email→chat adaptation
// ─────────────────────────────────────────────────────────────────
//
// English bodies get a targeted rewrite of email vocabulary → chat
// vocabulary. Non-English bodies are never rewritten (we can't safely edit
// a language we're not rendering) — they pass through the REJECT check
// only: if they contain email vocabulary in their language, they're
// excluded from the library rather than shipped with an email-ism.

// EN rewrites, applied in order. Word-boundary anchored.
const EN_REWRITES: Array<[RegExp, string]> = [
  [/\bmy (?:previous|earlier|last) (?:email|e-mail|note)\b/gi, "my last message"],
  [/\bmy (?:email|e-mail|note)\b/gi, "my message"],
  [/\b(this|that|the|previous|earlier|last) (?:email|e-mail)\b/gi, "$1 message"],
  [/\be-?mails\b/gi, "messages"],
  [/\be-?mail\b/gi, "message"],
  [/\byour inbox\b/gi, "your chat"],
  [/\bsubject line\b/gi, "message"],
];

// Residual email vocabulary per language family — if any of these survive
// adaptation, the exemplar is EXCLUDED. Conservative: false-positive
// exclusion just shrinks the library slightly; a false negative would leak
// an email-ism into a chat message.
const RESIDUAL_EMAIL_RE: RegExp[] = [
  /e-?mail/i,            // en/de/fr/pt/it/nl (E-Mail, e-mail, email)
  /\binbox\b/i,
  /\bunsubscribe\b/i,
  /\bsubject\s*line\b/i,
  /correo electr/i,      // es
  /courriel/i,           // fr
  /e-posta/i,            // tr
  /электронн\w* почт/i,  // ru
  /\bписьм[оае]\b/i,     // ru "letter"
  // AUDIT (2026-07-09): the library spans ~47 languages, not just the 8 this
  // list was first written for — ~50 th/hi/bn/fa/ur bodies shipped with their
  // native word for "email" ("following up on my previous email"). Every
  // language present in the data with an email word must appear here.
  /بريد|[إا]?يميل/,      // ar (mail + 'imayl transliteration)
  /ای\s?میل|ایمیل/,      // fa/ur (Arabic-script "email" transliteration)
  /ईमेल|इमेल/,           // hi
  /ইমেইল|ইমেল/,          // bn
  /อีเมล/,               // th (also matches อีเมล์)
  /אימייל|דוא["']?ל/,    // he
  /メール/,               // ja
  /메일/,                 // ko — bare "메일" (mail) also covers "이메일" (e-mail)
  /邮件|郵件/,            // zh
];

/**
 * Adapt one email exemplar body to chat. Returns the adapted body, or null
 * when the body can't be made chat-safe (residual email vocabulary).
 */
export function adaptEmailBodyToChat(body: string, language: string): string | null {
  let text = body.trim();
  if (!text) return null;

  // Strip any leaked "Subject:"/"Re:" first line — subjects don't exist in chat.
  text = text.replace(/^\s*(?:Subject|Re)\s*:\s*[^\n]*\n/i, "");

  const lang = (language || "").trim().split(/[-_]/)[0].toLowerCase();
  if (lang === "en") {
    for (const [re, replacement] of EN_REWRITES) {
      text = text.replace(re, replacement);
    }
  }

  for (const re of RESIDUAL_EMAIL_RE) {
    if (re.test(text)) return null;
  }

  return text;
}

// ─────────────────────────────────────────────────────────────────
// Library loading (lazy singleton)
// ─────────────────────────────────────────────────────────────────

let library: ChatExemplar[] | undefined;
let stats: ExemplarStats | undefined;

function parseJsonlFile(filePath: string, into: Map<string, RawExemplar>, counters: { parseErrors: number }): void {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return; // optional file missing — fine
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as RawExemplar;
      if (!row.id || typeof row.body !== "string") {
        counters.parseErrors += 1;
        continue;
      }
      into.set(row.id, row);
    } catch {
      counters.parseErrors += 1;
    }
  }
}

/** Load (or return cached) chat-adapted exemplar library. Never throws. */
export function getExemplarLibrary(): ChatExemplar[] {
  if (library !== undefined) return library;

  const dir = resolveDataDir();
  const counters = { parseErrors: 0 };
  const merged = new Map<string, RawExemplar>();

  if (dir) {
    // additions first, widened second → widened wins on id collision.
    parseJsonlFile(path.join(dir, ADDITIONS_FILE), merged, counters);
    parseJsonlFile(path.join(dir, WIDENED_FILE), merged, counters);
  }

  let excluded = 0;
  const adapted: ChatExemplar[] = [];
  for (const row of merged.values()) {
    const body = adaptEmailBodyToChat(row.body, row.language);
    if (body === null) {
      excluded += 1;
      continue;
    }
    adapted.push({
      id: row.id,
      stage: Number(row.stage) || 1,
      body,
      angle: row.angle || "",
      vertical: row.vertical || "",
      offerType: row.offer_type || "",
      language: (row.language || "").trim().split(/[-_]/)[0].toLowerCase(),
      market: row.market || "",
    });
  }

  // Deterministic base order (id) so selection is stable across processes —
  // stable prompts are cache-friendly on both providers.
  adapted.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  library = adapted;
  stats = {
    loaded: merged.size,
    adapted: adapted.length,
    excluded,
    parseErrors: counters.parseErrors,
    dir,
  };
  logger.info(stats, "[exemplars] library loaded");
  return library;
}

export function getExemplarStats(): ExemplarStats {
  getExemplarLibrary();
  return stats!;
}

/** Test hook — clears the cached library + dir resolution. */
export function __resetExemplarCacheForTests(): void {
  library = undefined;
  stats = undefined;
  resolvedDir = undefined;
}
