/**
 * Seed → classification.
 *
 * Turns a MINIMAL seed — a company / brand name, or a Google Play / App Store /
 * website URL — into a fully-classified prospect the research + message pipeline
 * can consume: { company, vertical (web_cps | mobile), subVertical (a VALID
 * taxonomy code), country, language, product }.
 *
 * Design goals:
 *   - Ask the operator for as LITTLE as possible; derive the rest here (the
 *     product wants: paste a company name or a store/site URL, AI figures it out).
 *   - Reuse existing primitives: `resolveUrl` for URL seeds, Anthropic
 *     server-side web_search (same pattern as opusRescue / prospectResearch) for
 *     the actual classification, `taxonomy` for the valid code set + web/mobile
 *     routing.
 *   - Best-effort + GRACEFUL: never throw on a bad classification — fall back to
 *     URL-derived platform + safe defaults so the caller always gets a usable
 *     result. Any operator-supplied override ALWAYS wins over the model's guess.
 */
import { anthropic } from "../lib/anthropic";
import { withAnthropicRetry } from "./anthropicRetry";
import { computeCost, webSearchFeeUsd } from "../lib/pricing";
import { logger } from "../lib/logger";
import { resolveUrl, type ResolvedUrlType } from "./urlResolver";
import {
  ALL_SUB_VERTICALS,
  isValidSubVertical,
  getDoctrineDomain,
} from "../lib/doctrine/taxonomy";
import { getLanguageForCountry } from "../lib/geoGate";
import { primarySubtag } from "../lib/localeResolver";

const CLASSIFIER_MODEL = "claude-opus-4-8";
// Same partner web-search tool used in opusRescue.ts / prospectResearch.ts.
const WEB_SEARCH_TOOL = { type: "web_search_20260209", name: "web_search" };
const CLASSIFIER_ENABLE_WEB_SEARCH =
  process.env.CLASSIFIER_ENABLE_WEB_SEARCH !== "false";
// Web search fans out to several round-trips; override the client's 60s default.
const CLASSIFIER_TIMEOUT_MS = 90_000;

export type SeedType = ResolvedUrlType | "company_name";

export interface ClassifySeedInput {
  /** A company / brand name, or a Play Store / App Store / website URL. */
  seed: string;
  // Optional operator overrides — anything provided WINS over classification.
  company?: string;
  vertical?: string; // "web_cps" | "mobile" (coarse)
  subVertical?: string;
  country?: string;
  language?: string;
  product?: string;
}

export interface ClassifiedSeed {
  company: string;
  /** Coarse vertical as stored on prospects.vertical: "web_cps" | "mobile". */
  vertical: string;
  /** A VALID taxonomy sub-vertical code (guaranteed by isValidSubVertical). */
  subVertical: string;
  country: string;
  language: string; // ISO 639-1
  product: string;
  seedType: SeedType;
  appName: string | null;
  domain: string | null;
  webSearchUsed: boolean;
  /** Which fields the model actually determined vs defaulted (for UI + audit). */
  notes: string;
  costUsd: number;
}

interface AnthropicMessage {
  content: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function looksLikeUrl(seed: string): boolean {
  const s = seed.trim();
  return (
    /^https?:\/\//i.test(s) ||
    /^www\./i.test(s) ||
    /\b(play\.google\.com|apps\.apple\.com|itunes\.apple\.com)\b/i.test(s) ||
    // bare domain like "foo.com" or "foo.co.uk/bar" (no spaces)
    (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|\?|$)/i.test(s) && !/\s/.test(s))
  );
}

function coarseVerticalFor(subVertical: string): string {
  return getDoctrineDomain(subVertical) === "webCps" ? "web_cps" : "mobile";
}

function defaultSubVerticalFor(coarse: string): string {
  return coarse === "web_cps"
    ? "cps_web_classifieds_general"
    : "utility_general_mobile";
}

function defaultProductFor(coarse: string): string {
  return coarse === "web_cps"
    ? "CPS / performance marketing"
    : "mobile user acquisition";
}

/** Group the valid taxonomy codes by doctrine domain so the model both picks a
 *  valid code AND implicitly learns which codes are web vs mobile. */
function buildValidCodeList(): string {
  const groups: Record<string, string[]> = {
    mobileGaming: [],
    mobileNonGaming: [],
    webCps: [],
  };
  for (const code of ALL_SUB_VERTICALS) {
    groups[getDoctrineDomain(code)]!.push(code);
  }
  return [
    `MOBILE GAMING sub-vertical codes (vertical = "mobile"):\n${groups.mobileGaming.join(", ")}`,
    `MOBILE NON-GAMING sub-vertical codes (vertical = "mobile"):\n${groups.mobileNonGaming.join(", ")}`,
    `WEB CPS sub-vertical codes (vertical = "web_cps"):\n${groups.webCps.join(", ")}`,
  ].join("\n\n");
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  let trimmed = raw.replace(/```json\s*|```/g, "").trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) trimmed = trimmed.slice(first, last + 1);
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// ─────────────────────────────────────────────────────────────────
// Prompt
// ─────────────────────────────────────────────────────────────────

function buildClassifierSystemPrompt(): string {
  return `You are a B2B market-intelligence analyst at MobUpps, a mobile and web performance-marketing network. Given a seed (a company/brand name or a store/website URL), determine what the company actually does and classify it for our outreach pipeline. Use web search to verify the company, its market, and its app/site when helpful.

Output STRICT JSON only (no markdown, no prose), with exactly these keys:
{
  "company": "the canonical company/brand name",
  "vertical": "web_cps | mobile",   // web_cps = they monetize a WEBSITE on a cost-per-sale/lead basis; mobile = they run a MOBILE APP (games or non-games)
  "sub_vertical": "one of the exact codes from the list below — pick the single best fit",
  "country": "the company's PRIMARY market as an English country name (e.g. 'Brazil', 'United States')",
  "language": "the ISO 639-1 code of the business-communication language for that market (e.g. 'pt', 'en', 'de')",
  "product": "short label for what MobUpps would sell them, e.g. 'mobile user acquisition' or 'CPS / performance marketing'",
  "confidence": "high | medium | low",
  "notes": "one short sentence on how you classified them"
}

RULES:
- sub_vertical MUST be copied EXACTLY from the allowed list. If nothing fits well, pick the closest general code for the right platform.
- vertical MUST be consistent with the sub_vertical you pick (web codes → web_cps, mobile codes → mobile).
- A Google Play or App Store URL means the prospect is a MOBILE app. A plain website usually means WEB.
- NEVER invent a company that does not exist. If the seed is ambiguous or unknown, classify from the platform hint + the most likely general category and set confidence "low".

ALLOWED sub_vertical CODES:
${buildValidCodeList()}`;
}

function buildClassifierUserPrompt(facts: {
  seed: string;
  seedType: SeedType;
  brand: string | null;
  appName: string | null;
  domain: string | null;
  country: string | null;
}): string {
  const lines = [
    `SEED: ${facts.seed}`,
    `SEED TYPE: ${facts.seedType}`,
    facts.brand ? `Resolved brand: ${facts.brand}` : "",
    facts.appName ? `Resolved app name: ${facts.appName}` : "",
    facts.domain ? `Resolved domain: ${facts.domain}` : "",
    facts.country ? `Resolved country hint: ${facts.country}` : "",
  ].filter(Boolean);
  return `${lines.join("\n")}\n\nClassify this prospect. Return JSON only.`;
}

// ─────────────────────────────────────────────────────────────────
// Public: classify a seed
// ─────────────────────────────────────────────────────────────────

export async function classifySeed(
  input: ClassifySeedInput,
): Promise<ClassifiedSeed> {
  const seed = (input.seed || "").trim();

  // ── 1. Resolve URL seeds to concrete facts (platform, brand, country). ──
  let seedType: SeedType = "company_name";
  let brand: string | null = null;
  let appName: string | null = null;
  let domain: string | null = null;
  let urlCountry: string | null = null;
  let platformCoarseHint: string | null = null;

  if (seed && looksLikeUrl(seed)) {
    try {
      const resolved = await resolveUrl(seed);
      seedType = resolved.type;
      brand = resolved.brand;
      appName = resolved.appName;
      domain = resolved.domain;
      urlCountry = resolved.country;
      if (resolved.type === "play_store" || resolved.type === "app_store") {
        platformCoarseHint = "mobile";
      } else if (resolved.type === "website") {
        platformCoarseHint = "web_cps";
      }
    } catch (err) {
      logger.warn({ err: String(err) }, "seedClassifier: resolveUrl failed");
    }
  }

  // ── 2. Ask Opus (with web search) to classify. Best-effort. ──
  let parsed: Record<string, unknown> | null = null;
  let webSearchUsed = false;
  let costUsd = 0;

  const runClassify = async (useWebSearch: boolean): Promise<AnthropicMessage> =>
    (await withAnthropicRetry(
      () =>
        anthropic.messages.create(
          {
            model: CLASSIFIER_MODEL,
            max_tokens: useWebSearch ? 2000 : 1200,
            system: buildClassifierSystemPrompt(),
            messages: [
              {
                role: "user",
                content: buildClassifierUserPrompt({
                  seed,
                  seedType,
                  brand,
                  appName,
                  domain,
                  country: urlCountry,
                }),
              },
            ],
            // Cast: SDK typings lack the partner web_search tool variant.
            ...(useWebSearch ? ({ tools: [WEB_SEARCH_TOOL] } as any) : {}),
          },
          // Override the client's 60s default when searching.
          useWebSearch ? { timeout: CLASSIFIER_TIMEOUT_MS } : {},
        ),
      { label: useWebSearch ? "classify+web_search" : "classify" },
    )) as AnthropicMessage;

  try {
    let resp: AnthropicMessage;
    try {
      resp = await runClassify(CLASSIFIER_ENABLE_WEB_SEARCH);
    } catch (err) {
      if (CLASSIFIER_ENABLE_WEB_SEARCH) {
        logger.warn(
          { err: String(err) },
          "seedClassifier: web_search classify failed; retrying without web search",
        );
        resp = await runClassify(false);
      } else {
        throw err;
      }
    }

    // Last non-empty text block is the JSON (web search interleaves tool blocks).
    const texts = resp.content.filter(
      (b): b is { type: string; text: string } =>
        b.type === "text" &&
        typeof b.text === "string" &&
        b.text.trim().length > 0,
    );
    webSearchUsed = resp.content.some(
      (b) => b.type === "tool_use" || b.type === "server_tool_use",
    );
    const last = texts[texts.length - 1];
    if (last) parsed = parseJsonObject(last.text);

    if (resp.usage) {
      // Include the server-side web_search per-request fee (not in token counts).
      const webSearchReqs = Number(
        (resp.usage as any)?.server_tool_use?.web_search_requests ?? 0,
      );
      costUsd =
        computeCost(
          CLASSIFIER_MODEL,
          resp.usage.input_tokens ?? 0,
          resp.usage.output_tokens ?? 0,
        ).usd + webSearchFeeUsd(webSearchReqs);
    }
  } catch (err) {
    // Total failure — fall back to URL/platform-derived defaults below.
    logger.warn(
      { err: String(err) },
      "seedClassifier: classification failed; using platform defaults",
    );
  }

  // ── 3. Reconcile model output → validated fields, then apply overrides. ──
  const modelSubVertical = str(parsed?.sub_vertical);
  const modelCompany = str(parsed?.company);
  const modelCountry = str(parsed?.country);
  // primarySubtag normalizes regional tags (e.g. "pt-BR" → "pt") so a valid
  // ISO-639-1 language isn't discarded by the strict 2-letter guard below and
  // mis-fallen-back to "en" via the country NAME (getLanguageForCountry wants a
  // code). A full word like "portuguese" still fails the guard → country/en path.
  const modelLanguage = primarySubtag(str(parsed?.language)).toLowerCase();
  const modelProduct = str(parsed?.product);
  const modelNotes = str(parsed?.notes);

  // sub-vertical: operator override wins; else validated model output; else
  // platform-hint default; else a safe mobile default.
  let subVertical: string;
  if (input.subVertical && isValidSubVertical(input.subVertical)) {
    subVertical = input.subVertical;
  } else if (isValidSubVertical(modelSubVertical)) {
    subVertical = modelSubVertical;
  } else {
    subVertical = defaultSubVerticalFor(platformCoarseHint ?? "mobile");
  }

  // vertical is AUTHORITATIVELY derived from the chosen sub-vertical (keeps
  // web/mobile consistent with the doctrine domain), unless the operator
  // explicitly overrode it.
  const vertical =
    input.vertical === "web_cps" || input.vertical === "mobile"
      ? input.vertical
      : coarseVerticalFor(subVertical);

  const company =
    input.company?.trim() || modelCompany || brand || appName || seed;

  const country = input.country?.trim() || modelCountry || urlCountry || "";

  const language =
    input.language?.trim() ||
    (modelLanguage && /^[a-z]{2}$/.test(modelLanguage) ? modelLanguage : "") ||
    (country ? getLanguageForCountry(country) : "") ||
    "en";

  const product =
    input.product?.trim() || modelProduct || defaultProductFor(vertical);

  const notes =
    modelNotes ||
    (parsed
      ? "classified from model output"
      : "classification unavailable — used platform/default heuristics");

  return {
    company,
    vertical,
    subVertical,
    country,
    language,
    product,
    seedType,
    appName,
    domain,
    webSearchUsed,
    notes,
    costUsd,
  };
}
