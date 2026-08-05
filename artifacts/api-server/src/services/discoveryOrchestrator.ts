/**
 * Discovery Orchestrator — Ticket 2.2-BE-C.
 *
 * The production discovery chain. Layers above 2.2-BE-A's resolveCompany and
 * 2.2-BE-B's findOrg + collectContacts:
 *
 *   1. resolveCompany (2.2-BE-A)
 *   2. findOrg strict (2.2-BE-B) → if hit, proceed
 *   3. findOrg smart (relaxed name search + LLM candidate validation) → if hit, proceed
 *   4. opusRescue (2-4 refined strategies + retry findOrg per strategy) → if hit, proceed
 *   5. collectContacts (2.2-BE-B)
 *   6. expandToSubsidiaries (2.2-BE-C Phase 3) when contacts < target
 *
 * Each step records its outcome in a unified `DiscoveryAudit` log so the
 * /discover response and action_log capture the complete decision trail
 * without re-running anything.
 *
 * Cancellation: an optional AbortSignal threads through every Apollo call
 * (apolloProspector accepts it) and through opusRescue's LLM call. When the
 * route's outer 300s timeout fires, the orchestrator halts within ~1-2
 * Apollo round-trips rather than burning credits in the background.
 *
 * Cost control: the orchestrator caps total Apollo calls at a configurable
 * budget (default 80) so a runaway cascade can't drain the Apollo plan. When
 * the budget is exhausted, current step finishes and the orchestrator returns
 * with `status: "budget_exhausted"`.
 */

import { computeCost, webSearchFeeUsd } from "../lib/pricing";
import { recordLlmCall, type LedgerContext } from "../lib/llmLedger";
import {
  resolveCompany,
  DEFAULT_SONNET_MODEL,
  type ResolveCompanyInput,
  type ResolveCompanyResult,
  type ResolvedCompany,
  type ResolveCompanyUsage,
  type LLMCaller,
} from "./companyResolver";
import {
  findOrg,
  enrichOrgByDomain,
  searchOrgByNameValidated,
  stripLegalSuffix,
  type ApolloOrg,
  type FindOrgResult,
} from "./orgFinder";
import {
  collectContacts,
  type ApolloContact,
  type CollectContactsResult,
} from "./contactCollector";
import {
  apolloPost,
  apolloBudgetStore,
  sanitizeStr,
} from "./apolloProspector";
import {
  validateOrgCandidates,
  VALIDATOR_MODEL,
  type ApolloOrgCandidate,
} from "./llmValidator";
import {
  opusRescue,
  OPUS_MODEL,
  isOrgNamePlausible,
  type OpusRescueInput,
  type OpusRescueResult,
  type OpusRescueLLMCaller,
} from "./opusRescue";
import {
  expandToSubsidiaries,
  type SubsidiaryExpansionResult,
} from "./subsidiaryExpander";

// ─── Constants ────────────────────────────────────────────────────────────

/** Default Apollo-call budget per /discover request. Hard, exact per-call cap
 *  (APO5); the cascade halts cleanly when reached. A typical successful
 *  discovery (org found + 6 contacts) measures ~14 real calls, so 80 leaves
 *  generous headroom for the rescue/enrichment/subsidiary tail while still
 *  capping the pathological per-person-enrichment runaway.
 *
 *  Env-overridable via APOLLO_CALL_BUDGET so operators can re-tune from
 *  production `apolloCallsConsumed` telemetry without a deploy. Clamped to the
 *  same [10, 200] range as the per-request `apolloCallBudget` override. */
const FALLBACK_APOLLO_CALL_BUDGET = 80;
const MIN_APOLLO_CALL_BUDGET = 10;
const MAX_APOLLO_CALL_BUDGET = 200;

function defaultApolloCallBudget(): number {
  const raw = process.env.APOLLO_CALL_BUDGET;
  if (raw === undefined || raw.trim() === "") return FALLBACK_APOLLO_CALL_BUDGET;
  const n = Number(raw);
  if (!Number.isInteger(n)) return FALLBACK_APOLLO_CALL_BUDGET;
  return Math.min(MAX_APOLLO_CALL_BUDGET, Math.max(MIN_APOLLO_CALL_BUDGET, n));
}

/** Cap on smart-search names tried (port: Python uses [:8]). */
const SMART_SEARCH_NAMES_CAP = 8;

/** Per-name search results page size for smart search candidate collection. */
const SMART_SEARCH_PER_PAGE = 25;

/** Generic brand suffix regex for smart search (port from Python). */
const GENERIC_BRAND_SUFFIXES =
  /\s+(Games?|Studios?|Entertainment|Interactive|Apps?|Mobile|Software|Technologies|Tech|Digital|Media|Productions?|Publishing|Publisher|Network|Networks|Solutions|Systems|Labs?|Works|Worldwide|International|Global|Online|Web|Cloud|AI|Play|Game|Gaming)\s*$/i;

function stripGenericBrandSuffix(name: string): string {
  if (!name) return name;
  const cleaned = name.replace(GENERIC_BRAND_SUFFIXES, "").trim().replace(/,\s*$/, "").trim();
  return cleaned || name;
}

// ─── Types ────────────────────────────────────────────────────────────────

export interface DiscoveryInput {
  /** Same as resolveCompany input — orchestrator runs that as step 1. */
  brand?: string;
  appName?: string;
  domain?: string;
  country?: string;
  description?: string;
  developerEmail?: string;
  legalName?: string;
  storeUrl?: string;
  storeCategory?: string;
  sourceType?: "play_store" | "app_store" | "website";
  /** Target contact count. Default 6, max 50. */
  targetContacts?: number;
  /** Disable Phase 3 subsidiary expansion (keeps cost down for known-singleton companies). */
  skipSubsidiaryExpansion?: boolean;
  /** Disable Opus rescue (resolveCompany + findOrg only). */
  skipOpusRescue?: boolean;
  /** Disable web_search inside Opus rescue (cheaper, less accurate). */
  disableWebSearchInRescue?: boolean;
  /** Apollo-call budget for this request (cascade halts when reached). */
  apolloCallBudget?: number;
  /** External AbortSignal — fires when route timeout or client disconnect. */
  signal?: AbortSignal;
  /**
   * Cost-ledger attribution (2026-07-15 audit). Rows are written HERE, next to
   * each LLM call, rather than by the route from `result.llmUsage`.
   *
   * The route-level version lost every row whenever discover() threw: llmUsage
   * is a local that dies with the exception, and the LLM steps (1/3/4) all run
   * BEFORE the long Apollo contact-collection step that actually times out. So a
   * 504 silently discarded ~$0.18 of Sonnet + Sonnet-5 + Opus — and the
   * discoveries that need Opus rescue are both the most expensive AND the most
   * likely to time out, so the ledger under-reported hardest exactly where the
   * money was.
   */
  ledger?: LedgerContext | undefined;
}

export interface DiscoveryAudit {
  /** Step that ultimately succeeded (or "none" if no org). */
  resolution:
    | "strict_cascade"
    | "smart_llm_validated"
    | "opus_rescue"
    | "no_org";
  /** Strict cascade (2.2-BE-B findOrg) attempts log. Always populated. */
  strictAttempts: FindOrgResult["attempts"];
  /** Strict cascade strategy that succeeded (or "none"). */
  strictStrategy: FindOrgResult["strategy"];
  /** Whether maybeUpgradeToParent swapped to parent during strict cascade. */
  upgradedToParent: boolean;
  /** Smart-search step: ran? matched? confidence? */
  smartSearch?: {
    candidatesCollected: number;
    matchedCandidate: boolean;
    confidence: "high" | "medium" | "low";
    reasoning: string;
  };
  /** Opus rescue step: ran? diagnosis? strategies tried? which succeeded? */
  opusRescue?: {
    ran: boolean;
    diagnosis: string;
    strategiesAttempted: number;
    strategySucceeded: number; // 0 = none
    webSearchUsed: boolean;
    rejectedDueToImplausibleName?: string;
  };
  /** Phase 3 subsidiary expansion. */
  subsidiaryExpansion?: SubsidiaryExpansionResult;
  /** Apollo call count (for budget visibility). */
  apolloCallsConsumed: number;
  /** Whether the budget was hit before completion. */
  budgetExhausted: boolean;
  /** Whether the abort signal fired before completion. */
  aborted: boolean;
}

export interface DiscoveryResult {
  status:
    | "success"
    | "no_org_found"
    | "no_contacts_found"
    | "budget_exhausted"
    | "aborted";
  /** Output of resolveCompany (always present unless step 1 itself fails). */
  resolved: ResolvedCompany | null;
  /** Final org. */
  org: ApolloOrg | null;
  /** Final contacts. */
  contacts: ApolloContact[];
  /** Per-phase contact-collector phase log. */
  phasesRun: CollectContactsResult["phasesRun"];
  /** Cumulative rejection counters across all phases (incl. subsidiary expansion). */
  rejected: CollectContactsResult["rejected"];
  /** Decision trail for diagnostics + action_log. */
  audit: DiscoveryAudit;
  /** Anthropic token usage across resolveCompany + smart validation + opus rescue. */
  llmUsage: {
    resolveCompany?: ResolveCompanyUsage;
    smartValidator?: ResolveCompanyUsage;
    opusRescue?: ResolveCompanyUsage;
  };
}

export interface DiscoveryOptions {
  /** LLM caller for resolveCompany + llmValidator (Sonnet). Default real SDK. */
  sonnetLLMCaller?: LLMCaller;
  /** LLM caller for opusRescue (Opus + tools). Default real SDK. */
  opusLLMCaller?: OpusRescueLLMCaller;
}

// ─── Apollo call counter (per-request) ────────────────────────────────────

/**
 * Per-request Apollo call counter. The counter is per-request
 * (instance-scoped) so concurrent /discover requests don't share state.
 *
 * APO5: this is now an EXACT per-call meter, not an estimate. Every apolloPost
 * in the run — orchestrator-inline calls plus all findOrg/collectContacts
 * internals — self-counts via the ALS-scoped `apolloBudgetStore` and stops the
 * instant the limit is hit, so the budget is a real hard ceiling. (Previously
 * the orchestrator bumped by flat per-service estimates, which under-counted
 * the per-person-enrichment path and let a "capped" run blow past the limit.)
 */
class CallBudget {
  private consumed = 0;
  constructor(public readonly limit: number) {}
  bump(): void {
    this.consumed++;
  }
  bumpBy(n: number): void {
    this.consumed += Math.max(0, n);
  }
  exhausted(): boolean {
    return this.consumed >= this.limit;
  }
  remaining(): number {
    return Math.max(0, this.limit - this.consumed);
  }
  count(): number {
    return this.consumed;
  }
}

// APO5: the per-service call estimates that used to feed a coarse post-hoc
// budget bump are gone — findOrg / collectContacts now self-count every real
// apolloPost via the ALS-scoped budget (apolloBudgetStore), so the cap is an
// exact, hard per-call ceiling instead of an approximation that could overshoot.

// ─── Smart cascade (LLM-validated relaxed name search) ────────────────────

/**
 * Port of `find_org_smart` (Python lines 974-1099). Runs after the strict
 * cascade fails: relaxed name search across multiple search terms, then
 * Sonnet picks the right candidate from the union pool.
 */
async function findOrgSmart(
  resolved: ResolvedCompany,
  appName: string,
  storeCategory: string,
  storeDescription: string,
  developerHint: string,
  contactDomains: string[],
  signal: AbortSignal | undefined,
  budget: CallBudget,
  sonnetCaller: LLMCaller | undefined,
): Promise<{
  org: ApolloOrg | null;
  candidatesCollected: number;
  matched: boolean;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  usage?: ResolveCompanyUsage;
}> {
  const companyName = sanitizeStr(resolved.companyName);
  if (!companyName) {
    return { org: null, candidatesCollected: 0, matched: false, confidence: "low", reasoning: "no_company_name" };
  }

  // Build prioritized search-name list (port Python 1024-1048)
  const searchNames: string[] = [companyName];
  const seen = new Set<string>([companyName.toLowerCase()]);
  const addUnique = (n: string) => {
    if (!n) return;
    const lower = n.toLowerCase();
    if (seen.has(lower)) return;
    seen.add(lower);
    searchNames.push(n);
  };

  const legalName = sanitizeStr((resolved as { legalName?: string }).legalName);
  if (legalName) {
    addUnique(legalName);
    addUnique(stripLegalSuffix(legalName));
  }

  const parentCompany = sanitizeStr(resolved.parentCompany);
  if (parentCompany && parentCompany !== companyName) addUnique(parentCompany);

  for (const q of resolved.searchQueries || []) {
    addUnique(sanitizeStr(q));
  }

  const brandRoot = stripGenericBrandSuffix(stripLegalSuffix(companyName));
  if (brandRoot && brandRoot !== companyName) addUnique(brandRoot);

  const firstWord = stripLegalSuffix(companyName).split(/\s+/)[0];
  if (firstWord && firstWord !== companyName) addUnique(firstWord);

  // Collect candidates across all searches
  const allCandidates: ApolloOrgCandidate[] = [];
  const seenIds = new Set<string>();

  for (const searchName of searchNames.slice(0, SMART_SEARCH_NAMES_CAP)) {
    if (signal?.aborted || budget.exhausted()) break;
    const cleanName = stripLegalSuffix(searchName);
    if (!cleanName || cleanName.startsWith("http")) continue;

    const data = await apolloPost({
      path: "/mixed_companies/search",
      body: {
        q_organization_name: cleanName,
        page: 1,
        per_page: SMART_SEARCH_PER_PAGE,
      },
      signal,
    });
    if (!data) continue;
    const orgs =
      (data.organizations as unknown[]) ||
      (data.companies as unknown[]) ||
      (data.accounts as unknown[]) ||
      [];
    if (!Array.isArray(orgs)) continue;
    for (const o of orgs) {
      if (!o || typeof o !== "object") continue;
      const orec = o as Record<string, unknown>;
      const oid = sanitizeStr(orec.id);
      const emp =
        typeof orec.estimated_num_employees === "number"
          ? orec.estimated_num_employees
          : 0;
      if (emp < 1) continue;
      if (oid && seenIds.has(oid)) continue;
      if (oid) seenIds.add(oid);
      allCandidates.push(orec as ApolloOrgCandidate);
    }
  }

  if (allCandidates.length === 0) {
    return { org: null, candidatesCollected: 0, matched: false, confidence: "low", reasoning: "no_candidates" };
  }

  // Ask Sonnet to pick
  const validation = await validateOrgCandidates(
    {
      appName: appName || companyName,
      companyName,
      candidates: allCandidates,
      storeCategory,
      storeDescription,
      developerHint,
      devUrl: developerHint, // dev URL flows through in same context slot
      contactDomains,
    },
    { llmCaller: sonnetCaller },
  );

  if (!validation.matched) {
    return {
      org: null,
      candidatesCollected: allCandidates.length,
      matched: false,
      confidence: validation.confidence,
      reasoning: validation.reasoning,
      usage: validation.usage,
    };
  }

  // Map matched candidate → ApolloOrg (use Apollo's primary_domain since
  // we deliberately bypassed our domain validation)
  const m = validation.matched;
  const country =
    sanitizeStr(m.country) ||
    (() => {
      const raw = sanitizeStr(m.raw_address);
      if (!raw) return "";
      const parts = raw.split(",").map((p) => p.trim());
      return parts.length >= 2 ? parts[parts.length - 1] : "";
    })();
  const org: ApolloOrg = {
    id: sanitizeStr(m.id),
    name: sanitizeStr(m.name),
    domain: sanitizeStr(m.primary_domain) || sanitizeStr(m.domain),
    industry: sanitizeStr(m.industry),
    estimatedNumEmployees:
      typeof m.estimated_num_employees === "number" ? m.estimated_num_employees : 0,
    country,
  };

  return {
    org,
    candidatesCollected: allCandidates.length,
    matched: true,
    confidence: validation.confidence,
    reasoning: validation.reasoning,
    usage: validation.usage,
  };
}

// ─── Apply Opus rescue strategies ─────────────────────────────────────────

/**
 * Iterate the strategies returned by Opus, calling findOrg on each. Apply
 * the post-rescue name-plausibility check. Returns the first plausible org
 * found, or null if all strategies exhaust.
 */
async function applyOpusStrategies(
  rescue: OpusRescueResult,
  originalCompanyName: string,
  signal: AbortSignal | undefined,
  budget: CallBudget,
): Promise<{
  org: ApolloOrg | null;
  strategySucceeded: number;
  rejectedReason?: string;
  refinedResolved?: ResolvedCompany;
}> {
  for (let i = 0; i < rescue.strategies.length; i++) {
    if (signal?.aborted || budget.exhausted()) break;
    const strat = rescue.strategies[i];
    if (!strat.companyName) continue;

    // Build a synthetic ResolvedCompany for this strategy
    const stratResolved: ResolvedCompany = {
      companyName: strat.companyName,
      parentCompany: rescue.parentCompany,
      corporateDomain: strat.corporateDomain,
      alternativeDomains: strat.corporateDomain ? [strat.corporateDomain] : [],
      searchQueries:
        strat.searchQueries.length > 0 ? strat.searchQueries : [strat.companyName],
      isMultinational: false,
      focusMarket: "",
      primaryMarket: "",
      reasoning: strat.reasoning,
    };

    // APO5: findOrg's internal apolloPost calls now self-count via the ALS
    // budget, so no post-hoc estimate is needed — the budget reflects real calls.
    const result = await findOrg(stratResolved, signal);

    if (!result.org) continue;

    // If strict path failed AND we had domain constraint that may have blocked,
    // retry without domain (port: Python lines 1467-1474). Skip in 2.2-BE-C
    // since findOrg above already includes the cascade including parent_direct
    // (Strategy 5) which doesn't validate domain.

    // Name-plausibility check (port: Python lines 1477-1496)
    if (!isOrgNamePlausible(result.org.name, originalCompanyName, strat.companyName)) {
      return {
        org: null,
        strategySucceeded: 0,
        rejectedReason: `Strategy ${i + 1}: found '${result.org.name}' but name implausible vs original '${originalCompanyName}' / strategy '${strat.companyName}'`,
      };
    }

    // Build the refined ResolvedCompany the orchestrator should use downstream
    const refinedResolved: ResolvedCompany = {
      companyName: strat.companyName,
      parentCompany: rescue.parentCompany || originalCompanyName,
      corporateDomain: strat.corporateDomain || result.org.domain,
      alternativeDomains: strat.corporateDomain ? [strat.corporateDomain] : [],
      searchQueries: strat.searchQueries,
      isMultinational: false,
      focusMarket: "",
      primaryMarket: "",
      reasoning: strat.reasoning,
    };

    return { org: result.org, strategySucceeded: i + 1, refinedResolved };
  }

  return { org: null, strategySucceeded: 0 };
}

// ─── Public: discover ─────────────────────────────────────────────────────

/**
 * Run the full discovery chain. The /discover route handler wraps this with
 * its outer 300s timeout, action_log persistence, and HTTP error mapping.
 *
 * Throws ONLY when:
 *   - resolveCompany fails (ANTHROPIC_API_KEY missing or LLM unrecoverable)
 *   - apolloPost throws ApolloMissingApiKeyError or ApolloRateLimitError
 *
 * All other failures (no org, no contacts, budget exhausted, abort) return
 * a `DiscoveryResult` with the appropriate `status` so the caller can surface
 * the partial result without losing the audit trail.
 */
export async function discover(
  input: DiscoveryInput,
  opts: DiscoveryOptions = {},
): Promise<DiscoveryResult> {
  const budget = new CallBudget(input.apolloCallBudget ?? defaultApolloCallBudget());
  // APO5: scope the budget to this discovery run so EVERY apolloPost — in
  // findOrg/collectContacts and all their internals — self-counts and stops the
  // instant the true limit is hit (a real ceiling, not a post-hoc estimate).
  // enterWith (vs run) avoids re-indenting the whole body; the only reader of
  // this store is the discovery apolloPost, so there's nothing to leak into.
  apolloBudgetStore.enterWith(budget);
  const audit: DiscoveryAudit = {
    resolution: "no_org",
    strictAttempts: [],
    strictStrategy: "none",
    upgradedToParent: false,
    apolloCallsConsumed: 0,
    budgetExhausted: false,
    aborted: false,
  };
  const llmUsage: DiscoveryResult["llmUsage"] = {};

  /**
   * Write one ledger row for a discovery stage, at the point of spend.
   *
   * Called immediately after each LLM step so the row survives a later throw —
   * the Apollo contact-collection step below is what times out, and it runs
   * AFTER all three of these. Fire-and-forget: an accounting row must never add
   * latency to, or fail, a discovery (recordLlmCall swallows internally).
   *
   * Skips when a stage did not run — a $0 row for a call that never happened is
   * a lie in the opposite direction from the one this table exists to fix.
   */
  const ledgerStage = (
    task: string,
    model: string,
    usage: ResolveCompanyUsage | undefined,
    webSearchRequests = 0,
  ): void => {
    if (!usage) return;
    const base = computeCost(model, usage.inputTokens ?? 0, usage.outputTokens ?? 0);
    void recordLlmCall({
      ledger: input.ledger,
      task,
      model,
      provider: "anthropic",
      // The per-request web-search fee is NOT in the token counts and is most of
      // the cost when a stage searches hard — omitting it under-reported
      // opus_rescue by ~45% with cost_unpriced=false, i.e. wrong and unflagged.
      cost: { ...base, usd: base.usd + webSearchFeeUsd(webSearchRequests) },
    }).catch(() => {});
  };

  // ── Step 1: resolveCompany ────────────────────────────────────────────
  const resolveInput: ResolveCompanyInput = {
    brand: input.brand ?? null,
    appName: input.appName ?? null,
    domain: input.domain ?? null,
    country: input.country ?? null,
    description: input.description ?? null,
    developerEmail: input.developerEmail ?? null,
    developerLegalName: input.legalName ?? null,
    storeUrl: input.storeUrl ?? null,
    storeCategory: input.storeCategory ?? null,
    sourceType: input.sourceType ?? null,
  };
  const resolveResult: ResolveCompanyResult = await resolveCompany(resolveInput, {
    llmCaller: opts.sonnetLLMCaller,
  });
  llmUsage.resolveCompany = resolveResult.usage;
  ledgerStage("resolve_company", DEFAULT_SONNET_MODEL, resolveResult.usage);
  let resolved = resolveResult.resolved;

  // ── Step 2: strict findOrg (2.2-BE-B) ─────────────────────────────────
  let findResult: FindOrgResult = await findOrg(resolved, input.signal);
  // APO5: findOrg's Apollo calls self-count via the ALS budget (no estimate).
  audit.strictAttempts = findResult.attempts;
  audit.strictStrategy = findResult.strategy;
  audit.upgradedToParent = findResult.upgradedToParent;

  let org: ApolloOrg | null = findResult.org;
  if (org) {
    audit.resolution = "strict_cascade";
  }

  // ── Step 3: smart cascade (LLM-validated relaxed name search) ─────────
  if (!org && !input.signal?.aborted && !budget.exhausted()) {
    const smart = await findOrgSmart(
      resolved,
      sanitizeStr(input.appName),
      sanitizeStr(input.storeCategory),
      sanitizeStr(input.description),
      sanitizeStr(input.developerEmail) || sanitizeStr(input.domain),
      [resolved.corporateDomain, ...resolved.alternativeDomains].filter(Boolean),
      input.signal,
      budget,
      opts.sonnetLLMCaller,
    );
    audit.smartSearch = {
      candidatesCollected: smart.candidatesCollected,
      matchedCandidate: smart.matched,
      confidence: smart.confidence,
      reasoning: smart.reasoning,
    };
    if (smart.usage) llmUsage.smartValidator = smart.usage;
    ledgerStage("validate_orgs", VALIDATOR_MODEL, smart.usage);
    if (smart.org) {
      org = smart.org;
      audit.resolution = "smart_llm_validated";
      // Refresh `resolved` with the org's actual domain since smart bypassed validation
      resolved = { ...resolved, corporateDomain: smart.org.domain || resolved.corporateDomain };
    }
  }

  // ── Step 4: Opus rescue ────────────────────────────────────────────────
  if (
    !org &&
    !input.signal?.aborted &&
    !budget.exhausted() &&
    !input.skipOpusRescue
  ) {
    const triedAlready: string[] = [resolved.companyName];
    if (resolved.parentCompany) triedAlready.push(resolved.parentCompany);
    for (const q of resolved.searchQueries || []) triedAlready.push(q);

    const rescueInput: OpusRescueInput = {
      appName: sanitizeStr(input.appName),
      publisher: sanitizeStr(input.brand) || sanitizeStr(input.developerEmail),
      legalName: sanitizeStr(input.legalName),
      devUrl: sanitizeStr(input.domain),
      devEmail: sanitizeStr(input.developerEmail),
      storeUrl: sanitizeStr(input.storeUrl),
      storeCategory: sanitizeStr(input.storeCategory),
      description: sanitizeStr(input.description),
      originalCompanyName: resolved.companyName,
      originalCorporateDomain: resolved.corporateDomain,
      originalAlternativeDomains: resolved.alternativeDomains,
      originalSearchQueries: resolved.searchQueries,
      originalParentCompany: resolved.parentCompany,
      originalIsMultinational: resolved.isMultinational,
      originalFocusMarket: resolved.focusMarket,
      originalPrimaryMarket: resolved.primaryMarket,
      failureReason: "no_org_found",
      triedAlready,
      useWebSearch: !input.disableWebSearchInRescue,
    };
    const rescue = await opusRescue(rescueInput, { llmCaller: opts.opusLLMCaller });
    if (rescue.usage) llmUsage.opusRescue = rescue.usage;
    // webSearchRequests: opusRescue runs web_search by default, and its
    // per-request fee is real money the token cost cannot see. See ledgerStage.
    ledgerStage("opus_rescue", OPUS_MODEL, rescue.usage, rescue.webSearchRequests);

    audit.opusRescue = {
      ran: true,
      diagnosis: rescue.diagnosis,
      strategiesAttempted: rescue.strategies.length,
      strategySucceeded: 0,
      webSearchUsed: rescue.webSearchUsed,
    };

    if (rescue.strategies.length > 0) {
      const applied = await applyOpusStrategies(
        rescue,
        resolved.companyName,
        input.signal,
        budget,
      );
      audit.opusRescue.strategySucceeded = applied.strategySucceeded;
      if (applied.rejectedReason) {
        audit.opusRescue.rejectedDueToImplausibleName = applied.rejectedReason;
      }
      if (applied.org) {
        org = applied.org;
        audit.resolution = "opus_rescue";
        if (applied.refinedResolved) resolved = applied.refinedResolved;
      }
    }
  }

  if (!org) {
    audit.apolloCallsConsumed = budget.count();
    audit.budgetExhausted = budget.exhausted();
    audit.aborted = Boolean(input.signal?.aborted);
    return {
      status: input.signal?.aborted ? "aborted" : "no_org_found",
      resolved,
      org: null,
      contacts: [],
      phasesRun: [],
      rejected: { noEmail: 0, domainMismatch: 0, titleRejected: 0, duplicate: 0 },
      audit,
      llmUsage,
    };
  }

  // ── Step 5: collectContacts (2.2-BE-B) ─────────────────────────────────
  if (input.signal?.aborted || budget.exhausted()) {
    audit.apolloCallsConsumed = budget.count();
    audit.budgetExhausted = budget.exhausted();
    audit.aborted = Boolean(input.signal?.aborted);
    return {
      status: budget.exhausted() ? "budget_exhausted" : "aborted",
      resolved,
      org,
      contacts: [],
      phasesRun: [],
      rejected: { noEmail: 0, domainMismatch: 0, titleRejected: 0, duplicate: 0 },
      audit,
      llmUsage,
    };
  }

  const targetContacts = Math.max(input.targetContacts ?? 6, 6);
  const contactsResult = await collectContacts(org, resolved, { targetContacts }, input.signal);
  // APO5: collectContacts's Apollo calls self-count via the ALS budget (no estimate).

  // ── Step 6: Phase 3 subsidiary expansion ───────────────────────────────
  if (
    contactsResult.contacts.length < targetContacts &&
    !input.skipSubsidiaryExpansion &&
    !input.signal?.aborted &&
    !budget.exhausted()
  ) {
    // Build the acceptable-domain set the same way contactCollector does
    const accept = new Set<string>();
    if (resolved.corporateDomain) accept.add(resolved.corporateDomain.toLowerCase());
    for (const ad of resolved.alternativeDomains || []) {
      if (ad) accept.add(sanitizeStr(ad).toLowerCase());
    }
    if (org.domain) accept.add(org.domain.toLowerCase());

    const seenIds = new Set<string>();
    for (const c of contactsResult.contacts) {
      // No public ID surface from ApolloContact (port stripped it). The seen-set
      // here is best-effort; cross-org dedup may admit a duplicate person under
      // a different subsidiary org. Acceptable: rare in practice.
      void c;
    }

    // We need the contactCollector's processPeople / apolloPeopleSearch
    // internals. The cleanest decoupling: re-import them from the module.
    // contactCollector doesn't currently export these; we add lightweight
    // wrappers via a separate route that contactCollector exposes for this
    // purpose. Until that surface exists, we run a SIMPLIFIED Phase 3 here:
    // search subsidiary orgs and call collectContacts on each, merging
    // contacts. This costs more Apollo calls but uses only the public API.

    const expansionResult: SubsidiaryExpansionResult = {
      subsidiariesFound: 0,
      subsidiaryAttempts: [],
      ran: false,
    };

    // Strategy A: search subsidiary orgs by brand-root variants, then call
    // collectContacts on each. Cap at 5 subsidiaries to bound cost.
    const brandRoot = pickBrandRootForOrch(resolved.companyName);
    if (brandRoot && org.id) {
      expansionResult.ran = true;
      const variants = new Set<string>([brandRoot, stripLegalSuffix(resolved.companyName)]);
      if (resolved.parentCompany) variants.add(stripLegalSuffix(resolved.parentCompany));
      const seenSubIds = new Set<string>([org.id]);
      const subsidiaryOrgs: ApolloOrg[] = [];

      for (const variant of Array.from(variants).filter(Boolean).slice(0, 3)) {
        if (input.signal?.aborted || budget.exhausted()) break;
        const data = await apolloPost({
          path: "/mixed_companies/search",
          body: { q_organization_name: variant, page: 1, per_page: 10 },
          signal: input.signal,
        });
        if (!data) continue;
        const orgs =
          (data.organizations as unknown[]) ||
          (data.companies as unknown[]) ||
          [];
        if (!Array.isArray(orgs)) continue;
        for (const o of orgs) {
          if (!o || typeof o !== "object") continue;
          const orec = o as Record<string, unknown>;
          const oid = sanitizeStr(orec.id);
          if (!oid || seenSubIds.has(oid)) continue;
          const oname = sanitizeStr(orec.name).toLowerCase();
          const emp =
            typeof orec.estimated_num_employees === "number"
              ? orec.estimated_num_employees
              : 0;
          if (!oname.includes(brandRoot.toLowerCase()) || emp < 5) continue;
          seenSubIds.add(oid);
          // Map to ApolloOrg
          const country =
            sanitizeStr(orec.country) ||
            (() => {
              const raw = sanitizeStr(orec.raw_address);
              const parts = raw.split(",").map((p) => p.trim());
              return parts.length >= 2 ? parts[parts.length - 1] : "";
            })();
          subsidiaryOrgs.push({
            id: oid,
            name: sanitizeStr(orec.name),
            domain: sanitizeStr(orec.primary_domain) || sanitizeStr(orec.domain),
            industry: sanitizeStr(orec.industry),
            estimatedNumEmployees: emp,
            country,
          });
        }
      }

      expansionResult.subsidiariesFound = subsidiaryOrgs.length;

      // For each subsidiary, run a SHORT collectContacts (target 2 each, so we
      // don't overshoot the parent's targetContacts before merge).
      const remaining = targetContacts - contactsResult.contacts.length;
      const perSubTarget = Math.max(2, Math.ceil(remaining / Math.max(1, subsidiaryOrgs.length)));

      for (const subOrg of subsidiaryOrgs.slice(0, 5)) {
        if (input.signal?.aborted || budget.exhausted()) break;
        if (contactsResult.contacts.length >= targetContacts) break;
        const beforeCount = contactsResult.contacts.length;
        const subResult = await collectContacts(subOrg, resolved, {
          targetContacts: perSubTarget,
        }, input.signal);
        // APO5: subsidiary collectContacts calls self-count via the ALS budget.
        // Merge: add new contacts, dedup by email
        const existingEmails = new Set(
          contactsResult.contacts.map((c) => c.email.toLowerCase()),
        );
        for (const c of subResult.contacts) {
          if (contactsResult.contacts.length >= targetContacts) break;
          const emLower = c.email.toLowerCase();
          if (existingEmails.has(emLower)) continue;
          existingEmails.add(emLower);
          contactsResult.contacts.push(c);
        }
        // Merge rejection counters
        contactsResult.rejected.noEmail += subResult.rejected.noEmail;
        contactsResult.rejected.domainMismatch += subResult.rejected.domainMismatch;
        contactsResult.rejected.titleRejected += subResult.rejected.titleRejected;
        contactsResult.rejected.duplicate += subResult.rejected.duplicate;
        expansionResult.subsidiaryAttempts.push({
          orgName: subOrg.name,
          orgDomain: subOrg.domain,
          employees: subOrg.estimatedNumEmployees,
          contactsAdded: contactsResult.contacts.length - beforeCount,
        });
      }
    }

    audit.subsidiaryExpansion = expansionResult;
    void enrichOrgByDomain; // silence unused-import lint; available for future Phase 3 strategies
    void searchOrgByNameValidated;
    void expandToSubsidiaries;
  }

  audit.apolloCallsConsumed = budget.count();
  audit.budgetExhausted = budget.exhausted();
  audit.aborted = Boolean(input.signal?.aborted);

  const status: DiscoveryResult["status"] =
    contactsResult.contacts.length === 0
      ? input.signal?.aborted
        ? "aborted"
        : budget.exhausted()
          ? "budget_exhausted"
          : "no_contacts_found"
      : "success";

  return {
    status,
    resolved,
    org,
    contacts: contactsResult.contacts,
    phasesRun: contactsResult.phasesRun,
    rejected: contactsResult.rejected,
    audit,
    llmUsage,
  };
}

// ─── Local helper: brand-root extraction for orchestrator Phase 3 ─────────

const ORCH_GENERIC_PREFIX = new Set([
  "grupo",
  "group",
  "the",
  "pt",
  "bank",
  "holdings",
]);

function pickBrandRootForOrch(companyName: string): string {
  const stripped = stripLegalSuffix(sanitizeStr(companyName));
  if (!stripped) return "";
  const words = stripped.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  let root = words[0];
  if (ORCH_GENERIC_PREFIX.has(root.toLowerCase()) && words.length > 1) {
    root = words[1];
  }
  return root;
}
