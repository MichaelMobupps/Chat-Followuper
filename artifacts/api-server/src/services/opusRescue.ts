/**
 * Opus Rescue — Ticket 2.2-BE-C.
 *
 * Direct port of `rescue_with_opus` from stages/s3_enrich.py (~lines 1306-1514).
 * Called when the standard cascade (findOrg + collectContacts) fails or returns
 * 0 contacts. Opus has stronger world knowledge than Sonnet for reasoning about:
 *   - Parent companies (SMBC Consumer Finance → SMBC Group)
 *   - Localized name variants (Dia España → Grupo Dia, LINE Thailand → LINE Corp)
 *   - Developer name vs brand name vs legal entity
 *   - Product domain vs corporate domain (cash.app vs block.xyz)
 *   - Tiny/niche companies that may need parent-company resolution
 *
 * Returns refined ResolvedCompany strategies (2-4) ordered most→least likely.
 * The orchestrator iterates them, calling findOrg with each in turn.
 *
 * Web search:
 *   - When `useWebSearch: true`, the call uses Anthropic's `web_search_20260209`
 *     server-side tool (dynamic filtering; supported on Opus 4.8). Opus can
 *     search the web to ground its reasoning in
 *     fresh data — critical for tiny/regional companies absent from training.
 *   - When false, Opus answers from world knowledge only (cheaper, faster,
 *     occasionally less accurate).
 *
 * Audit fixes from 2.2-BE-A reused:
 *   - sanitizeStr / sanitizeForStorage on every input field before LLM
 *   - Hard caps on input sizes (description 400 chars, etc.)
 *   - Strategy count capped at 5 in the response (matches Python)
 *   - Name-plausibility check after each rescue strategy succeeds
 *   - LLM caller injected (testability)
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  modelRejectsSamplingParams,
  type ResolveCompanyUsage,
} from "./companyResolver";
import { sanitizeStr } from "./apolloProspector";

// ─── Constants ────────────────────────────────────────────────────────────

// Migrated from `claude-opus-4-1-20250805` (deprecated, retires 2026-08-05) to
// the current Opus. Opus 4.8 rejects `temperature` (dropped below) and defaults
// to thinking-off when the param is omitted, matching the prior no-thinking call.
/** Exported (2026-07-15) so the cost ledger prices this stage correctly. */
export const OPUS_MODEL = "claude-opus-4-8";
const OPUS_MAX_TOKENS_NO_SEARCH = 800;
const OPUS_MAX_TOKENS_WEB_SEARCH = 2000;
const OPUS_TEMPERATURE = 0.1;

const ANTHROPIC_TIMEOUT_MS = 90_000;
const ANTHROPIC_MAX_RETRIES = 2;

const MAX_DESCRIPTION_CHARS = 400;
const MAX_STRATEGIES_FROM_OPUS = 5;
const MAX_TRIED_ALREADY_TO_LLM = 12;

// ─── Types ────────────────────────────────────────────────────────────────

export interface OpusRescueInput {
  /** App display name (e.g. "Cash App", "Мир домовят"). */
  appName: string;
  /** Publisher / developer name from the store. */
  publisher: string;
  /** Developer legal entity if known (separate from brand). */
  legalName?: string;
  /** Developer website URL. */
  devUrl?: string;
  /** Developer support email. */
  devEmail?: string;
  /** Store URL the prospect came from (Play/App Store/website). */
  storeUrl?: string;
  /** Store category (e.g. "Finance", "Games > Casual"). */
  storeCategory?: string;
  /** App description (will be capped at 400 chars). */
  description?: string;
  /** What the upstream resolveCompany produced (the failed lookup input). */
  originalCompanyName: string;
  originalCorporateDomain?: string;
  originalAlternativeDomains?: string[];
  originalSearchQueries?: string[];
  originalParentCompany?: string;
  originalIsMultinational?: boolean;
  originalFocusMarket?: string;
  originalPrimaryMarket?: string;
  /** Why the cascade failed: "no_org_found" | "zero_contacts" | "ambiguous_orgs". */
  failureReason: "no_org_found" | "zero_contacts" | "ambiguous_orgs";
  /** Strategies already tried (so Opus doesn't repeat them). */
  triedAlready?: string[];
  /** Whether to enable web_search tool for Opus. Default true. */
  useWebSearch?: boolean;
}

export interface OpusRescueStrategy {
  /** Refined company name to search in Apollo. */
  companyName: string;
  /** Domain to try (or empty if Opus doesn't have one). */
  corporateDomain: string;
  /** Search queries to iterate. */
  searchQueries: string[];
  /** Why Opus thinks this strategy might work. */
  reasoning: string;
}

export interface OpusRescueResult {
  /** Opus's one-sentence diagnosis of why the original lookup failed. */
  diagnosis: string;
  /** 0-5 ordered strategies (most likely first). */
  strategies: OpusRescueStrategy[];
  /** Ultimate parent company if Opus identified one (often inserted as strategy 0). */
  parentCompany: string;
  /** Parent company domain if known. */
  parentDomain: string;
  /** Anthropic input/output token usage if exposed. */
  usage?: ResolveCompanyUsage;
  /** True when Opus invoked web_search at least once during reasoning. */
  webSearchUsed: boolean;
  /**
   * How MANY server-side web searches ran. Distinct from webSearchUsed because
   * web_search bills per request: the boolean cannot be priced, the count can.
   * See the cost ledger (2026-07-15) — omitting this under-reported opus_rescue
   * by ~45%, unflagged.
   */
  webSearchRequests: number;
}

// ─── System prompt (verbatim port from Python) ────────────────────────────

const SYSTEM_PROMPT = `You are a senior business intelligence analyst specializing in B2B company identification.

A junior analyst tried to find a company in Apollo.io (a B2B sales database) and FAILED.
Your job is to figure out WHY the lookup failed and provide CORRECTED search parameters.

COMMON FAILURE PATTERNS you must reason about:
1. SUBSIDIARY vs PARENT: The app belongs to a subsidiary, but Apollo only indexes the parent.
   Example: "SMBC Consumer Finance" (subsidiary) → search for "SMBC Group" (parent, 123K employees)
   Example: "YouTube Music" → search for "Google" or "Alphabet"
   Example: "WhatsApp" → search for "Meta Platforms"

2. LOCALIZED NAME vs CORPORATE NAME: The app store name includes a country suffix or
   translation, but Apollo uses the international corporate name.
   Example: "Dia España" → "Grupo Dia" or just "Dia"
   Example: "LINE Thailand" → "LINE Corporation"
   Example: "Grab Singapore" → "Grab Holdings"

3. DEVELOPER NAME ≠ BRAND NAME: The Google Play developer is a studio or subsidiary,
   but Apollo indexes the parent publisher.
   Example: Developer "Astrum Entertainment" publishes "Мир домовят" → search "Astrum" or "ASTRUM LLC"
   Example: Developer "Supercell" publishes "Clash of Clans" → search "Supercell"

4. DOMAIN MISMATCH: The product domain differs from the corporate domain Apollo knows.
   Example: cash.app (product) vs block.xyz (corporate — what Apollo has)
   Example: promise.co.jp (subsidiary) vs smbc.co.jp (parent — what Apollo has)

5. TINY/NICHE COMPANY: The company is too small for Apollo. In this case, suggest the
   PARENT or HOLDING company if one exists. If you have web search available, use it to
   find: the actual legal entity name, the founder/CEO's LinkedIn, and the corporate
   email domain — any of these can unlock an Apollo match.

If WEB_SEARCH is available to you, USE IT for tiny/regional/recent companies that may
not be in your training data. Search the publisher domain, the developer name, the
legal entity, and any LinkedIn presence. Ground your strategies in what you find.

Think step by step about what went wrong and provide MULTIPLE alternative search strategies
that DIFFER from what was already tried.

Return ONLY valid JSON (in your final message after any web_search use):
{
  "diagnosis": "One sentence explaining why the initial lookup failed",
  "strategies": [
    {
      "company_name": "Name to search in Apollo",
      "corporate_domain": "Domain to try (or empty string if unknown)",
      "search_queries": ["query1", "query2"],
      "reasoning": "Why this strategy might work"
    }
  ],
  "parent_company": "Ultimate parent company name if different from all strategies",
  "parent_domain": "Parent company domain if known"
}

Provide 2-4 strategies, ordered from most likely to least likely.`;

// ─── User content builder ─────────────────────────────────────────────────

function buildUserContent(input: OpusRescueInput): string {
  const appName = sanitizeStr(input.appName);
  const publisher = sanitizeStr(input.publisher);
  const legalName = sanitizeStr(input.legalName);
  const devUrl = sanitizeStr(input.devUrl);
  const devEmail = sanitizeStr(input.devEmail);
  const storeUrl = sanitizeStr(input.storeUrl);
  const storeCategory = sanitizeStr(input.storeCategory);
  const description = sanitizeStr(input.description).slice(0, MAX_DESCRIPTION_CHARS);
  const origName = sanitizeStr(input.originalCompanyName);
  const origDomain = sanitizeStr(input.originalCorporateDomain);
  const origAlts = (input.originalAlternativeDomains || []).map(sanitizeStr).filter(Boolean).slice(0, 8);
  const origQueries = (input.originalSearchQueries || []).map(sanitizeStr).filter(Boolean).slice(0, 5);
  const origParent = sanitizeStr(input.originalParentCompany);
  const tried = (input.triedAlready || [])
    .map(sanitizeStr)
    .filter(Boolean)
    .slice(0, MAX_TRIED_ALREADY_TO_LLM);
  const triedBlock =
    tried.length > 0 ? tried.map((t) => `  - ${t}`).join("\n") : "  (none recorded)";

  const failureReadable =
    input.failureReason === "no_org_found"
      ? "Apollo cascade returned no organization match"
      : input.failureReason === "zero_contacts"
        ? "Organization was found but contact search returned 0 valid contacts"
        : "Multiple candidate orgs returned across different industries (ambiguous)";

  return `FAILED LOOKUP — please diagnose and provide corrected search parameters.

App name: ${appName}
Publisher / Developer name: ${publisher}
Developer legal entity: ${legalName || "unknown"}
Developer website: ${devUrl || "unknown"}
Developer support email: ${devEmail || "unknown"}
Store URL: ${storeUrl || "unknown"}
Store category: ${storeCategory || "unknown"}
App description: ${description || "(none)"}

WHAT THE JUNIOR ANALYST TRIED:
  Company name searched: ${origName || "?"}
  Corporate domain tried: ${origDomain || "?"}
  Alternative domains tried: ${JSON.stringify(origAlts)}
  Search queries tried: ${JSON.stringify(origQueries)}
  Parent company identified: ${origParent || "none"}

FAILURE REASON: ${failureReadable}

ALREADY-TRIED STRATEGIES (do NOT repeat these):
${triedBlock}

What is the CORRECT company to search for? Think about parent companies, name variants,
and corporate domains that a B2B database like Apollo would actually index. If you have
web search, search for the publisher domain and the developer/legal entity to ground
your strategies in real evidence.`;
}

// ─── JSON parsing ─────────────────────────────────────────────────────────

function parseRescueJson(text: string): {
  diagnosis: string;
  strategies: Array<{
    company_name: string;
    corporate_domain: string;
    search_queries: string[];
    reasoning: string;
  }>;
  parent_company: string;
  parent_domain: string;
} | null {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  }
  cleaned = cleaned.trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  const diagnosis = typeof obj.diagnosis === "string" ? obj.diagnosis : "";
  const parentCompany = typeof obj.parent_company === "string" ? obj.parent_company : "";
  const parentDomain = typeof obj.parent_domain === "string" ? obj.parent_domain : "";

  const stratsRaw = Array.isArray(obj.strategies) ? obj.strategies : [];
  const strategies: Array<{
    company_name: string;
    corporate_domain: string;
    search_queries: string[];
    reasoning: string;
  }> = [];
  for (const s of stratsRaw) {
    if (!s || typeof s !== "object") continue;
    const srec = s as Record<string, unknown>;
    const queriesRaw = Array.isArray(srec.search_queries) ? srec.search_queries : [];
    strategies.push({
      company_name: typeof srec.company_name === "string" ? srec.company_name : "",
      corporate_domain:
        typeof srec.corporate_domain === "string" ? srec.corporate_domain : "",
      search_queries: queriesRaw
        .filter((q): q is string => typeof q === "string")
        .slice(0, 5),
      reasoning: typeof srec.reasoning === "string" ? srec.reasoning : "",
    });
  }

  return {
    diagnosis,
    strategies,
    parent_company: parentCompany,
    parent_domain: parentDomain,
  };
}

// ─── LLM caller (raw Anthropic SDK with optional web_search tool) ────────

let _anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (_anthropicClient) return _anthropicClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. opusRescue requires Opus access for LLM-based escalation.",
    );
  }
  _anthropicClient = new Anthropic({
    apiKey,
    timeout: ANTHROPIC_TIMEOUT_MS,
    maxRetries: ANTHROPIC_MAX_RETRIES,
  });
  return _anthropicClient;
}

/**
 * Pluggable LLM caller signature. Distinct from companyResolver.LLMCaller because
 * opusRescue needs to optionally enable the `web_search` server-side tool. Tests
 * can inject a fake that returns canned strategies without burning Opus credits.
 */
export type OpusRescueLLMCaller = (params: {
  system: string;
  userContent: string;
  model: string;
  maxTokens: number;
  temperature: number;
  enableWebSearch: boolean;
}) => Promise<{ text: string; usage?: ResolveCompanyUsage; webSearchUsed: boolean; webSearchRequests: number }>;

export const defaultOpusRescueLLMCaller: OpusRescueLLMCaller = async ({
  system,
  userContent,
  model,
  maxTokens,
  temperature,
  enableWebSearch,
}) => {
  const client = getAnthropicClient();
  // Anthropic web search tool: server-side, model-invoked.
  // Tool spec uses unknown cast since the SDK's Tool union may not include
  // the partner-tool variant in older typings. The wire format is the
  // documented Anthropic tools API shape.
  const webSearchTool = {
    type: "web_search_20260209",
    name: "web_search",
  };

  const resp = await client.messages.create({
    model,
    max_tokens: maxTokens,
    // Opus 4.7/4.8 (and Sonnet 5 / Fable 5) reject non-default sampling params
    // with a 400 — omit `temperature` for them and steer via prompting instead.
    ...(modelRejectsSamplingParams(model) ? {} : { temperature }),
    system,
    messages: [{ role: "user", content: userContent }],
    ...(enableWebSearch
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ tools: [webSearchTool] } as any)
      : {}),
  });

  let text = "";
  let webSearchUsed = false;
  for (const block of resp.content) {
    if (block.type === "text") {
      text += block.text;
    } else if (block.type === "tool_use" || block.type === "server_tool_use") {
      // Server-side web_search invocation appears as a tool_use block.
      // Treat any tool_use as evidence Opus actually searched.
      webSearchUsed = true;
    }
  }
  if (!text.trim()) {
    throw new Error(`Empty model output from ${model}`);
  }

  const usage: ResolveCompanyUsage | undefined = resp.usage
    ? {
        inputTokens:
          typeof resp.usage.input_tokens === "number" ? resp.usage.input_tokens : undefined,
        outputTokens:
          typeof resp.usage.output_tokens === "number" ? resp.usage.output_tokens : undefined,
      }
    : undefined;

  // The COUNT, not just "did it search" (2026-07-15 audit). web_search bills a
  // per-request fee that never appears in token counts, so `webSearchUsed:
  // boolean` was unpriceable — the cost ledger booked opus_rescue at tokens
  // only, ~45% under actual, with cost_unpriced=false so nothing flagged it.
  // Cast: SDK usage typings may omit the partner-tool server_tool_use field.
  // Same extraction prospectResearch.ts already does.
  const webSearchRequests = Number(
    (resp.usage as any)?.server_tool_use?.web_search_requests ?? 0,
  );

  return { text, usage, webSearchUsed, webSearchRequests };
};

// ─── Public: opusRescue ───────────────────────────────────────────────────

export interface OpusRescueOptions {
  /** Inject a custom LLM caller for tests; defaults to real Anthropic SDK. */
  llmCaller?: OpusRescueLLMCaller;
}

/**
 * Run Opus rescue: ask Opus for refined search strategies given the failed
 * cascade context. Returns 0-5 strategies + diagnosis + parent-company info.
 *
 * Caller (the orchestrator) iterates the strategies, calling findOrg with each
 * until one succeeds. Caller is responsible for the post-rescue
 * "name plausibility" check (port of Python lines 1477-1496) — keeping that
 * in the orchestrator avoids tangling org-shape logic into the rescue caller.
 *
 * Throws ONLY on:
 *   - Missing ANTHROPIC_API_KEY (programmer error)
 *
 * On any other failure (timeout, malformed JSON, network), returns a result
 * with empty strategies and diagnosis="opus_rescue_failed: <reason>" so the
 * orchestrator can fall through to the next escalation step.
 */
export async function opusRescue(
  input: OpusRescueInput,
  opts: OpusRescueOptions = {},
): Promise<OpusRescueResult> {
  const llm = opts.llmCaller ?? defaultOpusRescueLLMCaller;
  const useWebSearch = input.useWebSearch !== false; // default true
  const maxTokens = useWebSearch ? OPUS_MAX_TOKENS_WEB_SEARCH : OPUS_MAX_TOKENS_NO_SEARCH;

  const userContent = buildUserContent(input);

  let llmResult: { text: string; usage?: ResolveCompanyUsage; webSearchUsed: boolean; webSearchRequests: number };
  try {
    llmResult = await llm({
      system: SYSTEM_PROMPT,
      userContent,
      model: OPUS_MODEL,
      maxTokens,
      temperature: OPUS_TEMPERATURE,
      enableWebSearch: useWebSearch,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[opusRescue] LLM call failed: ${msg.slice(0, 200)}`);
    return {
      diagnosis: `opus_rescue_failed: ${msg.slice(0, 100)}`,
      strategies: [],
      parentCompany: "",
      parentDomain: "",
      usage: undefined,
      webSearchUsed: false,
      webSearchRequests: 0,
    };
  }

  const parsed = parseRescueJson(llmResult.text);
  if (!parsed) {
    console.warn(`[opusRescue] failed to parse Opus output (len=${llmResult.text.length})`);
    return {
      diagnosis: "opus_rescue_failed: json_parse_failure",
      strategies: [],
      parentCompany: "",
      parentDomain: "",
      usage: llmResult.usage,
      webSearchUsed: llmResult.webSearchUsed,
      webSearchRequests: llmResult.webSearchRequests,
    };
  }

  // Cap strategies at 5 (port: Python uses [:5])
  let strategies: OpusRescueStrategy[] = parsed.strategies
    .slice(0, MAX_STRATEGIES_FROM_OPUS)
    .map((s) => ({
      companyName: sanitizeStr(s.company_name),
      corporateDomain: sanitizeStr(s.corporate_domain),
      searchQueries: s.search_queries.map(sanitizeStr).filter(Boolean),
      reasoning: sanitizeStr(s.reasoning).slice(0, 500),
    }))
    .filter((s) => s.companyName);

  const parentCompany = sanitizeStr(parsed.parent_company);
  const parentDomain = sanitizeStr(parsed.parent_domain);

  // If Opus identified a parent + domain, prepend as strategy 0 (port: Python lines 1434-1440)
  if (parentCompany && parentDomain) {
    strategies = [
      {
        companyName: parentCompany,
        corporateDomain: parentDomain,
        searchQueries: [parentCompany],
        reasoning: "Parent company override (Opus rescue inserted)",
      },
      ...strategies,
    ].slice(0, MAX_STRATEGIES_FROM_OPUS);
  }

  return {
    diagnosis: sanitizeStr(parsed.diagnosis).slice(0, 500),
    strategies,
    parentCompany,
    parentDomain,
    usage: llmResult.usage,
    webSearchUsed: llmResult.webSearchUsed,
    webSearchRequests: llmResult.webSearchRequests,
  };
}

// ─── Name plausibility check (helper for orchestrator) ────────────────────

const NAME_PLAUSIBILITY_NOISE = new Set([
  "inc",
  "ltd",
  "llc",
  "corp",
  "group",
  "the",
  "co",
  "company",
]);

function nameWords(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w && !NAME_PLAUSIBILITY_NOISE.has(w)),
  );
}

/**
 * Port of Python lines 1477-1496: after a rescue strategy succeeds, check that
 * the resolved org name is plausibly related to the original company or the
 * strategy name. Prevents catastrophic misidentifications like Astrum → VK.
 *
 * Returns true if the org name is plausibly related to either:
 *   - the original company name (shared significant word), OR
 *   - the strategy company name (substring either direction)
 */
export function isOrgNamePlausible(
  orgName: string,
  originalCompanyName: string,
  strategyCompanyName: string,
): boolean {
  const orgLower = sanitizeStr(orgName).toLowerCase();
  const origLower = sanitizeStr(originalCompanyName).toLowerCase();
  const stratLower = sanitizeStr(strategyCompanyName).toLowerCase();
  if (!orgLower) return false;

  const origWords = nameWords(origLower);
  const orgWords = nameWords(orgLower);

  let hasOverlap = false;
  for (const w of origWords) {
    if (orgWords.has(w)) {
      hasOverlap = true;
      break;
    }
  }

  const stratMatches =
    Boolean(stratLower) &&
    (orgLower.includes(stratLower) || stratLower.includes(orgLower));
  const origMatches =
    Boolean(origLower) &&
    (orgLower.includes(origLower) || origLower.includes(orgLower))
    // Fixed copy-paste bug: the second clause previously read
    // `origLower.includes(origLower)` (orig ∈ orig, always true), which made
    // origMatches always true whenever origLower was non-empty and defeated
    // the entire plausibility gate. The intended check is substring in either
    // direction between the resolved org and the original company name.
    ;

  return hasOverlap || stratMatches || origMatches;
}
