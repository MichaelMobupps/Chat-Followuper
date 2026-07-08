/**
 * Company Resolver — Ticket 2.2-BE-A.
 *
 * Direct port of `resolve_company` from the email prospector's stages/s3_enrich.py
 * (~lines 441-700). Given a brand/app/domain/country tuple, calls Sonnet with the
 * email prospector's exact business-intelligence disambiguation prompt and returns
 * the real company entity that should be searched in Apollo.
 *
 * Ported verbatim from Python:
 *   - System prompt (8-step thinking, Cash App→Block / Tinder→Match Group examples,
 *     Emma fintech vs Emma mattress disambiguation rule, multinational signals)
 *   - JSON output shape (company_name, parent_company, corporate_domain,
 *     alternative_domains, search_queries, is_multinational, focus_market,
 *     primary_market, reasoning)
 *   - Post-processing: strip URLs from search_queries; ensure company_name and
 *     parent_company are in search_queries; if non-Latin company name, add Latin
 *     alternatives.
 *   - FREE_EMAIL_DOMAINS filter for contact-domain extraction.
 *
 * Diverges from Python:
 *   - Python takes app_name, store_info, row, llm. We take a smaller input
 *     because 2.1-BE doesn't fetch description/category/dev_email yet. Optional
 *     fields are passed through to the LLM as "unknown" when missing.
 *   - Anthropic SDK is used directly (no LLMClient wrapper). No adaptive thinking,
 *     no web search — same as email prospector's resolve_company (web search only
 *     fires in Opus rescue, which lands in 2.2-BE-C).
 *
 * Audit fixes (Godlike v2 audit, Cycle 1):
 *   F1 (latency cap)        — maxRetries reduced from 2 to 1; SDK worst case is
 *                             now 2 × 90s = 180s instead of 270s. Outer timeout
 *                             enforced at route level.
 *   F4 (diagnostic error)   — Empty companyName from LLM now triggers a final
 *                             domain-based fallback before throwing; thrown error
 *                             names exactly which fallbacks were attempted.
 *   F5 (JSON fallback)      — Greedy regex replaced with a balanced-brace
 *                             scanner that handles prose-then-JSON-then-prose
 *                             layouts robustly.
 *   F6 (type contract)      — JSDoc on ResolvedCompany.companyName explicitly
 *                             documents the non-empty runtime invariant for
 *                             callers of resolveCompany().
 *   F7 (secret scrubbing)   — redactSecrets() helper exported; route uses it on
 *                             error_detail before action_log write.
 *   F9 (token usage)        — defaultLLMCaller surfaces resp.usage; resolveCompany
 *                             returns usage in ResolveCompanyResult.
 *
 * Testability: the underlying LLM call is exposed as an injectable function so
 * integration tests can mock it without burning Anthropic credits.
 */

import Anthropic from "@anthropic-ai/sdk";

// ─── Types ────────────────────────────────────────────────────────────────

/**
 * Input to resolveCompany. Required: at least one of {brand, appName, domain}.
 * Optional context fields will be passed to the LLM if available, marked
 * "unknown" otherwise. 2.1-BE provides {brand, appName, domain, country};
 * future enrichment passes can add description/devEmail/legalName.
 */
export interface ResolveCompanyInput {
  brand: string | null;
  appName: string | null;
  domain: string | null;
  country: string | null;
  description?: string | null;
  developerEmail?: string | null;
  developerLegalName?: string | null;
  storeUrl?: string | null;
  storeCategory?: string | null;
  publisherContactEmails?: string | null;
  /** "play_store" | "app_store" | "website" | "unknown" — informs LLM context */
  sourceType?: string | null;
}

/**
 * Output of resolveCompany. Mirrors the Python `resolve_company` return dict.
 * Field names converted to camelCase per TS conventions.
 *
 * INVARIANT: After a successful resolveCompany() call, `companyName` is
 * guaranteed non-empty. The function throws rather than returning a result
 * with empty companyName. Callers may rely on this invariant; the type system
 * doesn't enforce it (TS lacks a clean NonEmptyString brand without runtime
 * cost) but the runtime contract holds.
 */
export interface ResolvedCompany {
  /** The company that DIRECTLY publishes the app, in Latin script. May be a
   *  subsidiary (Astrum Entertainment) — parent goes in parentCompany.
   *  RUNTIME INVARIANT: non-empty (resolveCompany throws if it would be empty). */
  companyName: string;
  /** Ultimate parent/holding company if different from companyName.
   *  Empty string if companyName is already the top-level entity. */
  parentCompany: string;
  /** Primary corporate email domain (e.g. block.xyz for Cash App, not cash.app).
   *  Possibly empty if the LLM couldn't determine and no domain hint was provided. */
  corporateDomain: string;
  /** Other domains owned by THIS SAME company. Used as alt domain enrich
   *  candidates in find_org Strategy 2. */
  alternativeDomains: string[];
  /** 2-4 short company name strings to find this company in Apollo.
   *  RUNTIME INVARIANT: contains at least 1 entry (companyName itself is
   *  always pushed in if missing). */
  searchQueries: string[];
  /** True if the company has dedicated regional teams in 5+ countries. */
  isMultinational: boolean;
  /** Country name where THIS app instance is focused (multinational only). */
  focusMarket: string;
  /** HQ country — determines email language. "Spain" for Grupo Dia, "Japan"
   *  for SMBC, "United States" for Meta. Always HQ, not where popular. */
  primaryMarket: string;
  /** One-sentence LLM reasoning for the disambiguation. */
  reasoning: string;
}

/**
 * Anthropic token usage for one resolveCompany call. Mirrors the SDK's
 * `usage` object shape. Both fields are nullable because not all providers /
 * SDK versions expose them; treat absence as "unknown" rather than zero.
 */
export interface ResolveCompanyUsage {
  inputTokens?: number;
  outputTokens?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────

/** Free email providers that should never be treated as corporate domain hints.
 *  Ported from email prospector stages/s3_enrich.py FREE_EMAIL_DOMAINS. */
export const FREE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.de",
  "mail.com",
  "yandex.ru",
  "qq.com",
  "mail.ru",
  "163.com",
  "126.com",
  "yeah.net",
]);

const DEFAULT_SONNET_MODEL =
  process.env.PROSPECTOR_SONNET_MODEL ?? "claude-sonnet-4-6";

const ANTHROPIC_TIMEOUT_MS = 90_000;
/** Audit fix F1: was 2; reduced so worst-case is 2 retries × 90s = 180s, not 270s.
 *  The SDK retries on 429 and 5xx; one retry is enough for transient blips. */
const ANTHROPIC_MAX_RETRIES = 1;
const RESOLVE_MAX_TOKENS = 1500;
const RESOLVE_TEMPERATURE = 0.1;

// ─── System prompt (verbatim port from Python) ────────────────────────────

const SYSTEM_PROMPT = `You are a business intelligence analyst. Given a mobile app's details,
determine the ACTUAL parent company that owns/publishes this app.

IMPORTANT: The developer website domain often does NOT match the company name in business databases.
Examples:
- Cash App → developer site is cash.app, but the company is "Block, Inc." (formerly Square)
- Call of Duty Mobile → developer is activision.com, but the company is "Activision Blizzard" (now part of Microsoft)
- Tinder → listed under match.com, but the company is "Match Group"
- Instagram → the company is "Meta Platforms"

CRITICAL DISAMBIGUATION RULE:
Many company names are shared by completely unrelated businesses. Before outputting a domain,
verify that the domain belongs to a company in the SAME INDUSTRY as the app.
Examples of name collisions:
- "Emma" the fintech budgeting app (emma-app.com) vs "Emma" the mattress company (emma.com) — DIFFERENT companies
- "Bolt" the ride-hailing app (bolt.eu) vs "Bolt" the hardware company (bolt.com) — DIFFERENT companies
- "Plum" the savings app (withplum.com) vs "Plum" the restaurant (plumrestaurant.com) — DIFFERENT companies
If the app description mentions budgeting/finance but the domain you're about to output sells mattresses,
you have the WRONG company. Use the developer website URL and app description to determine the correct domain.

Think step by step:
1. What app is this? What does it DO? (read the description carefully)
2. Who publishes it? What is the developer website?
3. What is the legal/business entity behind the publisher?
4. What name would this company be listed under in a B2B sales database?
5. What is the company's primary corporate domain (for email)?
6. VERIFY: Does the domain from step 5 belong to a company in the same industry as this app?
   If NOT, the domain is wrong — find the correct one using the developer website.
7. Is this company multinational (present in 5+ countries with dedicated local teams)?
   Signals that indicate multinational: regional HQ structure, country-specific subdomains or apps, local legal entities in multiple countries, dedicated regional leadership teams. A global app with one central team is NOT multinational for this purpose. A funded startup with 200 employees in one country is NOT multinational even if their app is globally available.
8. If multinational, what is the focus market for THIS specific app instance?
   Use the country field, publisher country, store category localisation, and description to determine.

Return ONLY valid JSON:
{
  "company_name": "The company name IN ENGLISH / LATIN SCRIPT that DIRECTLY publishes this app, as it would appear in Apollo/LinkedIn. NEVER return names in Japanese, Chinese, Korean, Cyrillic or other non-Latin scripts. IMPORTANT: Use the DIRECT publisher or developer studio name, NOT the ultimate parent conglomerate. Examples: for a game by Astrum Entertainment (owned by VK), use 'Astrum Entertainment' NOT 'VK'. For an app by SMBC Consumer Finance (part of SMBC Group), use 'SMBC Consumer Finance'. The parent goes in the parent_company field. Only use the parent if the app is directly published by the parent itself (e.g. 'Tencent' for PUBG Mobile where Tencent is the direct publisher).",
  "parent_company": "Ultimate parent/holding company if different from company_name (e.g. 'VK' for Astrum Entertainment, 'SMBC Group' for SMBC Consumer Finance). Empty string if company_name IS the top-level entity.",
  "corporate_domain": "Primary corporate email domain (e.g. block.xyz for Cash App, not cash.app)",
  "alternative_domains": ["ONLY other domains owned by THIS SAME company — NOT domains of different companies with a similar name. If emma-app.com is the fintech company, do NOT include emma.com (mattress company) or emma-sleep.com (also mattress). Leave empty if unsure."],
  "search_queries": ["2-4 SHORT company name strings to find this company in Apollo. Include BOTH the direct publisher name AND the parent company name if different. NEVER include URLs, store links, or domains — only company names. Example for Astrum Entertainment owned by VK: ['Astrum Entertainment', 'Astrum', 'VK', 'ASTRUM LLC']"],
  "is_multinational": false,
  "focus_market": "Country name or empty string if not multinational",
  "primary_market": "The country where this company's HEADQUARTERS is located. This determines the email language. Examples: 'China' for Tencent (HQ in Shenzhen), 'Spain' for Grupo Dia (HQ in Madrid), 'Japan' for SMBC (HQ in Tokyo), 'United States' for Meta (HQ in Menlo Park). Always use the HQ country, NOT where the app is popular or where contacts are located.",
  "reasoning": "One sentence explaining your logic"
}`;

// ─── Helpers ──────────────────────────────────────────────────────────────

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function safeStr(v: unknown): string {
  return isNonEmptyString(v) ? v.trim() : "";
}

/**
 * Extract candidate corporate domains from a publisher contact emails string.
 * Mirrors the Python ranking by splitting on space/comma/semicolon, filtering
 * free email providers, deduping while preserving order.
 */
export function extractContactDomains(
  contactsString: string | null | undefined,
): string[] {
  if (!contactsString) return [];
  const normalized = contactsString.replace(/[,;]/g, " ");
  const seen: string[] = [];
  for (const token of normalized.split(/\s+/)) {
    const cleaned = token.replace(/^[.,:<>()[\]"']+|[.,:<>()[\]"']+$/g, "");
    if (!cleaned.includes("@")) continue;
    const domain = cleaned.split("@")[1]?.toLowerCase();
    if (!domain) continue;
    if (FREE_EMAIL_DOMAINS.has(domain)) continue;
    if (!seen.includes(domain)) seen.push(domain);
  }
  return seen;
}

/**
 * Heuristic check: does this string contain non-Latin characters? Mirrors the
 * Python `any(ord(c) > 0x024F for c in s if c.isalpha())` test. Used to flag
 * Japanese/Chinese/Korean/Cyrillic company names that need Latin alternatives
 * added to search_queries so Apollo can find the org.
 *
 * Latin-1 Supplement (0x00A0-0x00FF) and Latin Extended-A (0x0100-0x017F) and
 * Latin Extended-B (0x0180-0x024F) are NOT flagged — Apollo handles "Café" and
 * "Naïve" fine. Flag triggers at codepoint > 0x024F (Latin Extended-B end).
 */
export function hasNonLatinChars(s: string): boolean {
  for (const ch of s) {
    if (!/\p{L}/u.test(ch)) continue;
    if (ch.codePointAt(0)! > 0x024f) return true;
  }
  return false;
}

/**
 * Audit fix F7: Redact common secret patterns from a string before it lands
 * in logs or storage. Defense in depth — third-party SDK error messages are
 * not trusted to never leak credentials.
 *
 * Patterns scrubbed:
 *   - Anthropic API keys (sk-ant-...)
 *   - Generic OpenAI-style keys (sk-...)
 *   - Bearer tokens (Bearer ...)
 *   - Authorization header values
 *
 * Replaces matches with `[REDACTED]`. Non-secret content unaffected.
 */
export function redactSecrets(s: string): string {
  if (!s) return s;
  return s
    .replace(/sk-ant-[A-Za-z0-9_\-]{10,}/g, "[REDACTED]")
    .replace(/\bsk-[A-Za-z0-9]{20,}/g, "[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._\-+/=]{20,}/gi, "Bearer [REDACTED]")
    .replace(
      /Authorization\s*:\s*[A-Za-z0-9._\-+/= ]{20,}/gi,
      "Authorization: [REDACTED]",
    );
}

/**
 * Audit fix F3: Sanitize an LLM-output string before storing in
 * action_logs.metadata or any other persistence layer. Strips control
 * characters and caps length. Defense in depth against stored XSS in any
 * downstream UI that displays metadata.
 *
 * This does NOT escape HTML — that's a presentation-layer concern. It just
 * strips the raw bytes that have no business in a company name (control
 * chars, null bytes, line breaks).
 */
export function sanitizeForStorage(
  s: string | null | undefined,
  maxLen: number = 500,
): string | null {
  if (s == null) return null;
  if (typeof s !== "string") return null;
  // Strip all C0/C1 control chars (0x00-0x1F, 0x7F-0x9F) including newlines/tabs.
  // Keep printable ASCII and Unicode beyond C1.
  // eslint-disable-next-line no-control-regex
  const stripped = s.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
  return stripped.length > maxLen ? stripped.slice(0, maxLen) : stripped;
}

/**
 * Audit fix F5: Extract the first balanced-brace JSON object from a string.
 * Replaces the previous greedy regex `\{[\s\S]*\}` which over-captured when
 * LLM responses contained prose-then-JSON-then-prose with stray braces in the
 * prose.
 *
 * Walks the string character-by-character, tracking string-literal state and
 * brace depth. Returns the first matched balanced object, or null if none.
 */
function extractFirstJsonObject(s: string): string | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escapeNext = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (inString) {
      if (c === "\\") {
        escapeNext = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        return s.slice(start, i + 1);
      }
      if (depth < 0) {
        // unbalanced — reset
        depth = 0;
        start = -1;
      }
    }
  }
  return null;
}

/**
 * Strip code-fence markers and extract the first balanced JSON object.
 * Replaces the Python `call_json` post-processing.
 */
function parseJsonResponse(raw: string): unknown {
  let cleaned = raw
    .replace(/^\s*```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const obj = extractFirstJsonObject(cleaned);
    if (!obj) {
      throw new Error("LLM returned no parseable JSON object");
    }
    return JSON.parse(obj);
  }
}

// ─── LLM call (injectable for tests) ──────────────────────────────────────

/**
 * Result returned by an LLMCaller — text plus optional usage metadata.
 * Audit fix F9: usage is now part of the contract so callers can surface
 * cost in their responses.
 */
export interface LLMCallerResult {
  text: string;
  usage?: ResolveCompanyUsage;
}

/**
 * The shape we expect the LLM caller to satisfy. Production uses the real
 * Anthropic SDK; tests inject a fake that returns canned responses.
 */
export type LLMCaller = (params: {
  system: string;
  userContent: string;
  model: string;
  maxTokens: number;
  temperature: number;
}) => Promise<LLMCallerResult>;

let _defaultClient: Anthropic | null = null;

function getDefaultClient(): Anthropic {
  if (_defaultClient) return _defaultClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it as a Replit Secret. " +
        "companyResolver requires Sonnet access for company disambiguation.",
    );
  }
  _defaultClient = new Anthropic({
    apiKey,
    timeout: ANTHROPIC_TIMEOUT_MS,
    maxRetries: ANTHROPIC_MAX_RETRIES,
  });
  return _defaultClient;
}

/**
 * Opus 4.7/4.8, Sonnet 5, and Fable 5 reject non-default sampling params
 * (`temperature`/`top_p`/`top_k`) with an HTTP 400. Callers targeting those
 * models must omit `temperature` entirely and steer via prompting instead.
 * Older families (Sonnet 4.6/4.5, Opus 4.6/earlier, Haiku 4.5) still accept it.
 */
export function modelRejectsSamplingParams(model: string): boolean {
  return /claude-(opus-4-[78]|sonnet-5|fable-5)/.test(model);
}

/**
 * Sonnet 5 enables adaptive thinking when the `thinking` param is omitted. Our
 * short, deterministic JSON-extraction calls run on tiny token budgets that a
 * thinking pass would exhaust (truncating the JSON), so disable thinking
 * explicitly for that model. Opus 4.7/4.8 default to thinking-off on omission,
 * so they don't need this.
 *
 * L9 (audit-2, verified against the Claude API reference): Fable 5 is
 * deliberately EXCLUDED — thinking is always on there and an explicit
 * `thinking: {type: "disabled"}` returns a 400 (the param must be omitted).
 * Sonnet 5 accepts `disabled`. So if PROSPECTOR_SONNET_MODEL is ever set to
 * claude-fable-5, we omit the thinking param entirely (adaptive thinking will
 * consume budget — prefer a Sonnet-tier model for this extraction path).
 */
function modelDefaultsAdaptiveThinking(model: string): boolean {
  return /claude-sonnet-5/.test(model);
}

/** Default LLM caller: real Anthropic SDK. */
export const defaultLLMCaller: LLMCaller = async ({
  system,
  userContent,
  model,
  maxTokens,
  temperature,
}) => {
  const client = getDefaultClient();
  const resp = await client.messages.create({
    model,
    max_tokens: maxTokens,
    // New-model families 400 on non-default sampling params — omit for them.
    ...(modelRejectsSamplingParams(model) ? {} : { temperature }),
    // Keep these extraction calls non-thinking (small budget, deterministic output).
    ...(modelDefaultsAdaptiveThinking(model)
      ? { thinking: { type: "disabled" as const } }
      : {}),
    system,
    messages: [{ role: "user", content: userContent }],
  });

  let text = "";
  for (const block of resp.content) {
    if (block.type === "text") text += block.text;
  }
  if (!text.trim()) {
    throw new Error(`Empty model output from ${model}`);
  }

  // Audit fix F9: surface token usage when the SDK exposes it. Some SDK
  // versions or providers may not populate it; absent → undefined, not 0.
  const usage: ResolveCompanyUsage | undefined = resp.usage
    ? {
        inputTokens:
          typeof resp.usage.input_tokens === "number"
            ? resp.usage.input_tokens
            : undefined,
        outputTokens:
          typeof resp.usage.output_tokens === "number"
            ? resp.usage.output_tokens
            : undefined,
      }
    : undefined;

  return { text, usage };
};

// ─── User content builder ─────────────────────────────────────────────────

function buildUserContent(input: ResolveCompanyInput): string {
  const brand = safeStr(input.brand);
  const appName = safeStr(input.appName);
  const domain = safeStr(input.domain);
  const country = safeStr(input.country);
  const description = safeStr(input.description).slice(0, 400);
  const devEmail = safeStr(input.developerEmail);
  const legalName = safeStr(input.developerLegalName);
  const storeUrl = safeStr(input.storeUrl);
  const storeCategory = safeStr(input.storeCategory);
  const pubContacts = safeStr(input.publisherContactEmails);
  const sourceType = safeStr(input.sourceType);

  const contactDomains = extractContactDomains(
    [pubContacts, devEmail].filter(Boolean).join(" "),
  );
  const developerHint = domain || "";

  const appNameForPrompt = appName || brand || "(unknown)";
  const publisherForPrompt = brand || legalName || "(unknown)";

  const lines = [
    `App: ${appNameForPrompt}`,
    `Publisher name: ${publisherForPrompt}`,
    `Developer legal entity: ${legalName || "unknown"}`,
    `Developer website: ${developerHint || "unknown"}`,
    `Store URL: ${storeUrl || "unknown"}`,
    `Store category: ${storeCategory || "unknown"}`,
    `Description: ${description || "unknown"}`,
    `Publisher contact emails: ${pubContacts || "unknown"}`,
    `Corporate domains extracted from emails: ${
      contactDomains.length > 0 ? contactDomains.join(", ") : "none"
    }`,
  ];

  if (country) {
    lines.push(`Country (from URL/store): ${country}`);
  }
  if (sourceType) {
    lines.push(`URL type: ${sourceType}`);
  }

  if (sourceType === "website" || (!appName && brand)) {
    lines.push(
      `\nNote: This prospect came from a curated list (no app store URL available).` +
        ` The name "${brand || appNameForPrompt}" may be the company name itself,` +
        ` not just an app name.`,
    );
    if (country) {
      lines.push(`Country: ${country}`);
    }
    lines.push(`Use web knowledge to determine the correct company entity.`);
  }

  return lines.join("\n");
}

// ─── Post-processing (verbatim port + audit fixes) ────────────────────────

/**
 * Mirrors the Python post-processing block:
 *   - Strip URLs from search_queries
 *   - Always include company_name and parent_company in search_queries
 *   - If company_name is non-Latin, add publisher and app_name as Latin alts
 *   - If contactDomains has values, fill corporateDomain when LLM didn't pick
 *     one, and append remaining contactDomains to alternativeDomains
 *   - If no corporateDomain, fall back to the developerDomainHint
 *   - Cap searchQueries at 5 entries
 *
 * Audit fix F4: when companyName ends up empty after LLM and brand/appName
 * fallbacks both fail, derive from domain (capitalized first label) as a
 * final last-ditch fallback. Preserves the email-prospector ResolveCompany
 * happy path while making the unhappy path reachable instead of throwing.
 */
function postProcess(
  raw: Record<string, unknown>,
  input: ResolveCompanyInput,
): ResolvedCompany {
  let companyName = safeStr(raw.company_name);
  const parentCompany = safeStr(raw.parent_company);
  let corporateDomain = safeStr(raw.corporate_domain);
  const alternativeDomains = (Array.isArray(raw.alternative_domains)
    ? (raw.alternative_domains as unknown[])
    : []
  )
    .map((v) => safeStr(v))
    .filter(Boolean);

  let searchQueries = (Array.isArray(raw.search_queries)
    ? (raw.search_queries as unknown[])
    : []
  )
    .map((v) => safeStr(v))
    .filter(Boolean);

  const isMultinational = raw.is_multinational === true;
  const focusMarket = safeStr(raw.focus_market) || safeStr(input.country);
  const primaryMarket =
    safeStr(raw.primary_market) ||
    safeStr(raw.focus_market) ||
    safeStr(input.country);
  const reasoning = safeStr(raw.reasoning);

  // companyName fallback chain (audit fix F4)
  if (!companyName) {
    companyName = safeStr(input.brand) || safeStr(input.appName);
  }
  if (!companyName && safeStr(input.domain)) {
    // Last-ditch: capitalized first label of domain
    const firstLabel = safeStr(input.domain).split(".")[0];
    if (firstLabel.length > 0) {
      companyName =
        firstLabel.charAt(0).toUpperCase() + firstLabel.slice(1).toLowerCase();
    }
  }

  // Domain hint pipeline: contact emails first, then 2.1-BE-supplied domain.
  const pubContacts = safeStr(input.publisherContactEmails);
  const devEmail = safeStr(input.developerEmail);
  const contactDomains = extractContactDomains(
    [pubContacts, devEmail].filter(Boolean).join(" "),
  );

  const developerHint = safeStr(input.domain);

  if (contactDomains.length > 0) {
    if (!corporateDomain) {
      corporateDomain = contactDomains[0];
    }
    for (const cd of contactDomains) {
      if (cd !== corporateDomain && !alternativeDomains.includes(cd)) {
        alternativeDomains.push(cd);
      }
    }
  }

  if (!corporateDomain && developerHint) {
    corporateDomain = developerHint;
  }
  if (
    developerHint &&
    developerHint !== corporateDomain &&
    !alternativeDomains.includes(developerHint)
  ) {
    alternativeDomains.push(developerHint);
  }

  // 1. Strip URLs from search_queries
  searchQueries = searchQueries.filter(
    (q) => !q.startsWith("http://") && !q.startsWith("https://"),
  );

  // 2. Always include companyName and parentCompany at the head of search_queries
  for (const name of [companyName, parentCompany]) {
    if (name && !searchQueries.includes(name)) {
      searchQueries.unshift(name);
    }
  }

  // 3. Non-Latin company name → add publisher / appName as Latin fallbacks
  if (companyName && hasNonLatinChars(companyName)) {
    const fallbacks = [safeStr(input.brand), safeStr(input.appName)];
    for (const alt of fallbacks) {
      if (
        alt &&
        !alt.startsWith("http") &&
        !searchQueries.includes(alt) &&
        !hasNonLatinChars(alt)
      ) {
        searchQueries.push(alt);
      }
    }
  }

  searchQueries = searchQueries.slice(0, 5);

  return {
    companyName,
    parentCompany,
    corporateDomain,
    alternativeDomains,
    searchQueries,
    isMultinational,
    focusMarket,
    primaryMarket,
    reasoning,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────

export interface ResolveCompanyOptions {
  llmCaller?: LLMCaller;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ResolveCompanyResult {
  resolved: ResolvedCompany;
  /** LLM call latency in ms. Useful for cost/performance reporting. */
  latencyMs: number;
  /** Anthropic input/output token usage if exposed by the SDK. */
  usage?: ResolveCompanyUsage;
}

/**
 * Resolve a company from sparse input (brand, appName, domain, country) using
 * the email prospector's exact disambiguation prompt and post-processing.
 *
 * RUNTIME INVARIANT: on success, result.resolved.companyName is non-empty
 * and result.resolved.searchQueries has length ≥ 1. The function THROWS
 * rather than returns a result violating this invariant.
 *
 * Throws on:
 *   - Missing ANTHROPIC_API_KEY (caught at module init for default caller)
 *   - LLM returning non-JSON / unparseable response
 *   - LLM returning JSON missing all of {company_name, brand, appName, domain}
 *   - Network/timeout errors from the SDK (the SDK retries 1x internally)
 *
 * Callers should catch these and surface as 502 Bad Gateway or 504 Gateway
 * Timeout to the user — the resolver itself never returns a "failed" object.
 */
export async function resolveCompany(
  input: ResolveCompanyInput,
  opts: ResolveCompanyOptions = {},
): Promise<ResolveCompanyResult> {
  const llm = opts.llmCaller ?? defaultLLMCaller;
  const model = opts.model ?? DEFAULT_SONNET_MODEL;
  const maxTokens = opts.maxTokens ?? RESOLVE_MAX_TOKENS;
  const temperature = opts.temperature ?? RESOLVE_TEMPERATURE;

  const userContent = buildUserContent(input);
  const start = Date.now();
  const callResult = await llm({
    system: SYSTEM_PROMPT,
    userContent,
    model,
    maxTokens,
    temperature,
  });
  const latencyMs = Date.now() - start;

  const parsed = parseJsonResponse(callResult.text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("LLM returned non-object JSON");
  }

  const resolved = postProcess(parsed as Record<string, unknown>, input);

  // Audit fix F4: companyName invariant. After all postProcess fallbacks,
  // companyName must be non-empty. If still empty, every fallback path was
  // also empty — surface a precise error message.
  if (!resolved.companyName) {
    const tried: string[] = [];
    if (raw_field_was_present(parsed, "company_name")) tried.push("LLM company_name");
    if (input.brand) tried.push("input.brand");
    if (input.appName) tried.push("input.appName");
    if (input.domain) tried.push("input.domain (first label)");
    throw new Error(
      `companyName empty after all fallbacks. Fallbacks attempted (and empty): ` +
        (tried.length > 0 ? tried.join(", ") : "none — all input fields were empty"),
    );
  }

  // searchQueries invariant: at minimum, companyName itself was unshifted into
  // it during post-processing, so length ≥ 1.

  return { resolved, latencyMs, usage: callResult.usage };
}

/** Helper: did the LLM include this key in its response object at all?
 *  (Used in F4 error message construction to distinguish "LLM omitted field"
 *  from "LLM returned empty value for field".) */
function raw_field_was_present(parsed: unknown, key: string): boolean {
  return (
    parsed !== null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    Object.prototype.hasOwnProperty.call(parsed, key)
  );
}
