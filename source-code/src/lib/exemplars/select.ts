/**
 * Exemplar selection — deterministic retrieval of the best K chat-adapted
 * follow-up exemplars for a prospect context.
 *
 * DETERMINISM MATTERS: the same (language, stage, vertical, offer, market)
 * must always select the same exemplars in the same order, so the rendered
 * prompt is byte-stable → provider-side prompt caching (Anthropic prefix
 * cache, Gemini implicit cache) actually hits on regeneration.
 *
 * Scoring (all additive, ties broken by exemplar id):
 *   language exact ................ +8   (hard requirement — see below)
 *   stage exact ................... +4
 *   stage adjacent (|Δ|=1) ........ +2
 *   vertical exact ................ +3
 *   vertical loose (substring) .... +2
 *   offer type match .............. +2
 *   market match .................. +1
 *
 * Language is a hard filter, not just a score: a Vietnamese prospect must
 * never see an Arabic exemplar. If the prospect language has no exemplars,
 * we fall back to English (register/shape still transfer; the writer prompt
 * already forces output language), and if even English is empty we return []
 * and the prompt simply carries no exemplar block.
 */
import { getExemplarLibrary, type ChatExemplar } from "./loader";

export interface ExemplarQuery {
  language: string;            // ISO 639-1 (possibly with region tag)
  stage: number;               // follow-up stage (1+); prospector callers pass 1
  vertical: string;            // prospect top-level vertical
  subVertical: string | null;
  product: string;             // e.g. "Mobile UA", "Web CPS" — mapped to offer type
  country: string;             // display name
}

/** Map the free-text product field to the library's offer_type vocabulary. */
export function productToOfferType(product: string): string | null {
  const p = (product || "").toLowerCase();
  if (/retarget/.test(p)) return "retargeting";
  if (/\bcps\b|cost per sale|revenue share/.test(p)) return "cps";
  if (/\bua\b|user acquisition|install/.test(p)) return "ua";
  return null;
}

function scoreExemplar(ex: ChatExemplar, q: {
  stage: number; vertical: string; subVertical: string | null;
  offerType: string | null; country: string;
}): number {
  let score = 0;

  if (ex.stage === q.stage) score += 4;
  else if (Math.abs(ex.stage - q.stage) === 1) score += 2;

  const exV = ex.vertical.toLowerCase();
  const ctxV = (q.vertical || "").toLowerCase();
  const ctxSub = (q.subVertical || "").toLowerCase();
  if (exV && exV === ctxV) score += 3;
  // Loose containment match. The ≥4-char guard applies to ALL branches (&&
  // binds tighter than || — unparenthesized it guarded only the last one),
  // so a 1-3 char fragment can't spuriously prefix-match unrelated verticals.
  else if (
    exV &&
    ctxV.length >= 4 &&
    (ctxSub.includes(exV) || ctxV.includes(exV) || exV.includes(ctxV))
  )
    score += 2;

  if (q.offerType && ex.offerType === q.offerType) score += 2;

  if (q.country && ex.market && ex.market.toLowerCase() === q.country.toLowerCase()) score += 1;

  return score;
}

/**
 * Select the top-K exemplars for a prospect context. Deterministic.
 * K defaults to 2 — enough to anchor register without bloating the prompt.
 */
export function selectExemplars(query: ExemplarQuery, k = 2): ChatExemplar[] {
  const library = getExemplarLibrary();
  if (library.length === 0) return [];

  const lang = (query.language || "en").trim().split(/[-_]/)[0].toLowerCase();
  const offerType = productToOfferType(query.product);
  const scoreQuery = {
    stage: Math.max(1, query.stage || 1),
    vertical: query.vertical,
    subVertical: query.subVertical,
    offerType,
    country: query.country,
  };

  const pick = (candidates: ChatExemplar[]): ChatExemplar[] =>
    candidates
      .map((ex) => ({ ex, score: scoreExemplar(ex, scoreQuery) }))
      .sort((a, b) => b.score - a.score || (a.ex.id < b.ex.id ? -1 : 1))
      .slice(0, k)
      .map((s) => s.ex);

  const inLanguage = library.filter((ex) => ex.language === lang);
  if (inLanguage.length > 0) return pick(inLanguage);

  // Language fallback: English exemplars still teach shape/register; the
  // writer prompt independently forces the output language.
  const english = library.filter((ex) => ex.language === "en");
  return english.length > 0 ? pick(english) : [];
}

// Cap per-exemplar body length in the prompt. Bodies run ~400-700 chars;
// the cap is a guard against outliers, cut on a word boundary.
const MAX_EXEMPLAR_CHARS = 900;

/**
 * Render selected exemplars as a prompt block for the writer USER prompt.
 * Returns "" when there are no exemplars (block simply absent).
 *
 * The framing line is load-bearing: exemplar numbers are illustrative and
 * their brands/claims belong to OTHER prospects — the writer must mirror
 * register and shape only. Without that instruction a small model will
 * happily copy "6,500 validated sales/day" into an unrelated pitch.
 */
export function buildExemplarBlock(exemplars: ChatExemplar[]): string {
  if (exemplars.length === 0) return "";

  const rendered = exemplars
    .map((ex) => {
      let body = ex.body;
      if (body.length > MAX_EXEMPLAR_CHARS) {
        const cut = body.slice(0, MAX_EXEMPLAR_CHARS);
        body = cut.slice(0, Math.max(cut.lastIndexOf(" "), MAX_EXEMPLAR_CHARS - 80)) + " ...";
      }
      return `--- EXEMPLAR (stage ${ex.stage}, ${ex.vertical}${ex.offerType ? "/" + ex.offerType : ""}) ---\n${body}`;
    })
    .join("\n\n");

  return `
STYLE EXEMPLARS (chat register references — study the SHAPE: prior-thread reference, single proof point, soft CTA, sentence economy. These are for DIFFERENT companies; their numbers are illustrative and their claims are NOT yours. Do NOT copy their numbers, brands, or claims — only mirror the register and structure):
${rendered}
`;
}
