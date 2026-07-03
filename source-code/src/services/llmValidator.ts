/**
 * LLM Org Validator — Ticket 2.2-BE-C.
 *
 * Direct port of `llm_validate_org_candidates` from stages/s3_enrich.py
 * (~lines 1516-1628). Used by the discovery orchestrator's "smart" findOrg
 * path: when the strict cascade fails, fall back to a relaxed name search
 * and ask Sonnet to pick the correct org from the candidate pool.
 *
 * Why this exists:
 *   - Apollo returns candidates by fuzzy name match. Multiple companies share
 *     names (Astrum Games vs Astrum Capital; Emma fintech vs Emma Sleep).
 *   - The strict cascade rejects orgs whose domain doesn't match. That's
 *     correct for high-precision but loses recall on:
 *       - Brand vs legal entity ("Casualino Games" → "Casualino JSC")
 *       - Localized names ("Dia España" → "Grupo Dia")
 *       - Product vs corporate domain (cash.app → block.xyz)
 *   - Sonnet picks the correct candidate using rich context (industry,
 *     country, app category, description, dev URL, contact domains).
 *
 * Decision rules ported verbatim:
 *   1. Brand-root match + plausible industry/country → "medium" confidence,
 *      no domain match required.
 *   2. Multiple shared-root candidates → pick the one with best industry
 *      or country alignment.
 *   3. No shared brand root → return null (don't guess).
 *   4. Industry contradicts app category → reject (mattress for fintech).
 *
 * Audit fixes from 2.2-BE-A reused:
 *   - sanitizeForStorage on text fields before LLM round-trip
 *   - sanitizeForStorage on returned org name/domain before threading further
 *   - Hard caps on input sizes (max 8 candidates, 300-char description, etc.)
 *   - LLMCaller injection for testability
 */

import {
  defaultLLMCaller,
  type LLMCaller,
  type ResolveCompanyUsage,
} from "./companyResolver";
import { sanitizeStr } from "./apolloProspector";

// ─── Constants ────────────────────────────────────────────────────────────

// Migrated from the retired `claude-sonnet-4-20250514` (retired 2026-06-15 → 404).
// The shared defaultLLMCaller drops `temperature` and disables thinking for this
// model (both required on Sonnet 5); see companyResolver.modelRejectsSamplingParams.
const VALIDATOR_MODEL = "claude-sonnet-5";
const VALIDATOR_MAX_TOKENS = 250;
const VALIDATOR_TEMPERATURE = 0.0;

const MAX_CANDIDATES_TO_LLM = 8;
const MAX_CONTEXT_DESCRIPTION_CHARS = 300;
const MAX_CONTACT_DOMAINS_TO_LLM = 4;

// ─── Types ────────────────────────────────────────────────────────────────

/**
 * One Apollo candidate returned from /mixed_companies/search. Untyped because
 * Apollo returns a heterogeneous shape; we sanitize fields at extraction time.
 */
export interface ApolloOrgCandidate {
  id?: unknown;
  name?: unknown;
  primary_domain?: unknown;
  domain?: unknown;
  website_url?: unknown;
  industry?: unknown;
  country?: unknown;
  raw_address?: unknown;
  estimated_num_employees?: unknown;
  keywords?: unknown;
  short_description?: unknown;
  description?: unknown;
}

export interface ValidateOrgInput {
  /** App display name (for context to the LLM, e.g. "Cash App"). */
  appName: string;
  /** Original company name we're trying to match. */
  companyName: string;
  /** Candidate orgs from Apollo's name search. Capped at 8 by the validator. */
  candidates: ApolloOrgCandidate[];
  /** Optional context that improves match quality. */
  storeCategory?: string;
  storeDescription?: string;
  developerHint?: string;
  devUrl?: string;
  contactDomains?: string[];
}

export interface ValidateOrgResult {
  /** The matched candidate, or null if no confident match. */
  matched: ApolloOrgCandidate | null;
  /** "high" | "medium" | "low" — only "high"/"medium" produce a non-null match. */
  confidence: "high" | "medium" | "low";
  /** One-sentence reasoning from the LLM (sanitized + length-capped). */
  reasoning: string;
  /** Anthropic input/output token usage if exposed by the SDK. */
  usage?: ResolveCompanyUsage;
}

// ─── System prompt (verbatim port from Python) ────────────────────────────

const SYSTEM_PROMPT = `You are a company matching expert. Given a company we're looking for and a list of Apollo.io search results, determine if any result IS the correct company.

Consider:
- LEGAL ENTITY vs BRAND: Apollo often indexes the legal entity (e.g. "Casualino JSC", "Astrum LLC") while app stores show a marketing brand (e.g. "Casualino Games", "Astrum Entertainment"). A shared brand root with a different legal/structural suffix is a STRONG match when industry and country also align.
- Name variants (Grupo Dia = Dia España, SMBC Group contains SMBC Consumer Finance)
- Parent vs subsidiary — either may be the right answer
- Industry MUST be plausible. A mobile game publisher is NOT a medical company. But accept industry synonyms: "computer games" ≈ "video games" ≈ "mobile games".
- Country/region should be plausible for the app's origin
- Employee count can be small — indie studios often have <30 employees

DECISION RULES:
1. If a candidate's name contains or is contained by the brand root of our target (stripping "Inc/Ltd/LLC/JSC/Games/Studios/Entertainment"), AND its country or industry is plausible — return it as "medium" confidence. Do not require a domain match. Do not require the full name to match.
2. If multiple candidates share the brand root, pick the one whose industry best matches the app category or whose country matches the app's origin.
3. If NO candidate shares the brand root with plausible industry/country — return 0.
4. Never pick a candidate whose industry clearly contradicts the app category (e.g. mattress company for a fintech app).

Return ONLY valid JSON:
{
  "match_index": 1,
  "confidence": "high",
  "reasoning": "One sentence explaining the match or why no match"
}

Return match_index > 0 when confidence is "high" or "medium".`;

// ─── User content builder ─────────────────────────────────────────────────

function describeCandidate(c: ApolloOrgCandidate, idx: number): string {
  const name = sanitizeStr(c.name) || "?";
  const domain = sanitizeStr(c.primary_domain) || sanitizeStr(c.domain) || "";
  const website = sanitizeStr(c.website_url) || "";
  const industry = sanitizeStr(c.industry) || "";
  const country = sanitizeStr(c.country) || sanitizeStr(c.raw_address) || "";
  const employees =
    typeof c.estimated_num_employees === "number"
      ? String(c.estimated_num_employees)
      : "?";
  const kwArr = Array.isArray(c.keywords) ? c.keywords : [];
  const kw = kwArr.slice(0, 6).map((k) => sanitizeStr(k)).filter(Boolean);
  const kwStr = kw.length > 0 ? `, keywords=[${kw.join(", ")}]` : "";
  const shortDesc =
    sanitizeStr(c.short_description) || sanitizeStr(c.description) || "";
  const descStr = shortDesc
    ? `, desc='${shortDesc.slice(0, 180).replace(/'/g, "")}'`
    : "";
  return (
    `  [${idx + 1}] name='${name}' domain='${domain}' ` +
    `website='${website}' industry='${industry}' country='${country}' ` +
    `employees=${employees}${kwStr}${descStr}`
  );
}

function buildUserContent(input: ValidateOrgInput): string {
  const appName = sanitizeStr(input.appName);
  const companyName = sanitizeStr(input.companyName);
  const storeCategory = sanitizeStr(input.storeCategory);
  const storeDescription = sanitizeStr(input.storeDescription).slice(
    0,
    MAX_CONTEXT_DESCRIPTION_CHARS,
  );
  const developerHint = sanitizeStr(input.developerHint);
  const devUrl = sanitizeStr(input.devUrl);
  const contactDomains = (input.contactDomains || [])
    .map(sanitizeStr)
    .filter(Boolean)
    .slice(0, MAX_CONTACT_DOMAINS_TO_LLM);

  const contextParts: string[] = [
    `Looking for: "${companyName}" (publishes app: "${appName}")`,
  ];
  if (storeCategory) contextParts.push(`App category: ${storeCategory}`);
  if (storeDescription) contextParts.push(`App description: ${storeDescription}`);
  if (devUrl) contextParts.push(`Developer website: ${devUrl}`);
  if (developerHint) contextParts.push(`Developer info: ${developerHint}`);
  if (contactDomains.length > 0) {
    contextParts.push(`Known corporate email domains: ${contactDomains.join(", ")}`);
  }

  const candDescriptions = input.candidates
    .slice(0, MAX_CANDIDATES_TO_LLM)
    .map(describeCandidate)
    .join("\n");

  return (
    `${contextParts.join("\n")}\n\n` +
    `Apollo search results:\n${candDescriptions}\n\n` +
    `Which result (if any) is the correct company? Apply the decision rules above.`
  );
}

// ─── JSON parsing (lenient, mirrors companyResolver pattern) ──────────────

function parseValidatorJson(text: string): {
  match_index: number;
  confidence: "high" | "medium" | "low";
  reasoning: string;
} | null {
  // Strip code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  }
  cleaned = cleaned.trim();

  // Find first { ... last } (model sometimes leaks prose around JSON)
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  const slice = cleaned.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const matchIdx = typeof obj.match_index === "number" ? obj.match_index : 0;
  const confRaw = typeof obj.confidence === "string" ? obj.confidence.toLowerCase() : "low";
  const conf: "high" | "medium" | "low" =
    confRaw === "high" || confRaw === "medium" ? confRaw : "low";
  const reasoning =
    typeof obj.reasoning === "string" ? obj.reasoning.slice(0, 500) : "";
  return { match_index: matchIdx, confidence: conf, reasoning };
}

// ─── Public: validateOrgCandidates ────────────────────────────────────────

export interface ValidateOrgOptions {
  /** Inject a custom LLM caller for tests; defaults to real Anthropic SDK. */
  llmCaller?: LLMCaller;
}

/**
 * Ask Sonnet to pick the correct Apollo org from a candidate pool.
 *
 * Returns the matched candidate (preserving Apollo's raw shape so the caller
 * can map it through `_org_from_dict` equivalents) plus confidence and
 * reasoning. Returns null match when:
 *   - candidates is empty
 *   - LLM returns confidence "low" or no match_index
 *   - LLM call throws (logged, not surfaced to user)
 */
export async function validateOrgCandidates(
  input: ValidateOrgInput,
  opts: ValidateOrgOptions = {},
): Promise<ValidateOrgResult> {
  if (!input.candidates || input.candidates.length === 0) {
    return { matched: null, confidence: "low", reasoning: "no candidates", usage: undefined };
  }
  const cappedCandidates = input.candidates.slice(0, MAX_CANDIDATES_TO_LLM);

  const llm = opts.llmCaller ?? defaultLLMCaller;
  const userContent = buildUserContent({ ...input, candidates: cappedCandidates });

  let result: { text: string; usage?: ResolveCompanyUsage };
  try {
    result = await llm({
      system: SYSTEM_PROMPT,
      userContent,
      model: VALIDATOR_MODEL,
      maxTokens: VALIDATOR_MAX_TOKENS,
      temperature: VALIDATOR_TEMPERATURE,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[llmValidator] LLM call failed: ${msg}`);
    return { matched: null, confidence: "low", reasoning: `llm_error: ${msg.slice(0, 200)}`, usage: undefined };
  }

  const parsed = parseValidatorJson(result.text);
  if (!parsed) {
    console.warn(`[llmValidator] failed to parse JSON from model output (len=${result.text.length})`);
    return { matched: null, confidence: "low", reasoning: "json_parse_failure", usage: result.usage };
  }

  if (
    parsed.match_index <= 0 ||
    parsed.match_index > cappedCandidates.length ||
    parsed.confidence === "low"
  ) {
    return {
      matched: null,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      usage: result.usage,
    };
  }

  return {
    matched: cappedCandidates[parsed.match_index - 1],
    confidence: parsed.confidence,
    reasoning: parsed.reasoning,
    usage: result.usage,
  };
}
