/**
 * Smoke: LLM cost-reframe chain (exemplars + router + caching).
 *
 * Run:  node ../../lib/db/node_modules/tsx/dist/cli.mjs src/scripts/smokeLlmChain.ts
 *
 * OFFLINE section (always runs, no API keys): exemplar adaptation sweep,
 * selection determinism, grey-vertical routing decision, competitor lookup,
 * cache-aware pricing math.
 *
 * LIVE section (runs when ANTHROPIC_API_KEY is set): full generateChatMessage
 * for a normal vertical and a grey vertical, asserting the actual model
 * metadata and Anthropic prompt-cache behavior. GEMINI_FORCE_503 exercises
 * the capacity → Sonnet-4-6 fallback deterministically.
 *
 * Exit code is non-zero if any assertion fails.
 */
import {
  getExemplarLibrary,
  getExemplarStats,
  adaptEmailBodyToChat,
} from "../lib/exemplars/loader";
import { selectExemplars, buildExemplarBlock } from "../lib/exemplars/select";
import { lookupCompetitors, buildCompetitorBlock } from "../lib/exemplars/competitors";
import { isGreyAreaVertical, callLLMRole, GEMINI_DEFAULT_MODEL, GEMINI_FALLBACK_MODEL, ANTHROPIC_FALLBACK_MODEL, CRITIC_MODEL } from "../lib/llm/router";
import { geminiGenerate, isGeminiConfigured } from "../lib/llm/gemini";
import { computeCost } from "../lib/pricing";
import { generateChatMessage } from "../services/messageGenerator";
import {
  getProspectorSystemPrompt,
  getProspectorUserPrompt,
  getFollowuperSystemPrompt,
} from "../services/messagePrompts";
import type { ProspectBrief } from "../services/prospectResearch";

const results: string[] = [];
function assert(name: string, ok: boolean, detail = ""): void {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

// Email-ism detectors — must NOT appear in any adapted exemplar body.
const EMAIL_ISMS = [
  /e-?mail/i, /\binbox\b/i, /subject\s*line/i, /unsubscribe/i,
  // Native "email" across the library's scripts (audit 2026-07-09 found
  // th/hi/bn/fa/ur leaks the original 8-language list missed).
  /메일|邮件|メール|بريد|[إا]?يميل|ایمیل|ईमेल|ইমেইল|อีเมล/,
];

function fixtureBrief(): ProspectBrief {
  return {
    determinedCountry: "United States",
    determinedScaleTier: "mid",
    scaleRationale: "smoke fixture",
    calibratedDailyVolume: "1,200 confirmed purchases",
    primaryEvent: "confirmed purchase",
    alternativeEvents: ["add to cart"],
    finalCompetitors: ["Amazon", "Walmart"],
    subsidiaryCheckNote: "",
    marketContext: "US marketplace competition is high",
    prospectSpecificHook: "seasonal demand spike",
    prospectPrimaryGrowthProblem: "post-install ROAS",
    whyArgument: "Your US marketplace faces rising CAC.",
    validationArgument: "We optimize to confirmed purchase at 1,200/day.",
    howArgument: "Confirmed-purchase optimization with returns-window screening.",
    tangibleReasons: ["1,200 confirmed purchases/day", "returns-window adjusted"],
    whyArgumentNative: "",
    validationArgumentNative: "",
    howArgumentNative: "",
    generatedAt: new Date().toISOString(),
    generatorModel: "fixture",
    generatorCostUsd: 0,
  };
}

async function main(): Promise<void> {
  // ── 1. Exemplar library load + adaptation sweep ──────────────────────────
  const lib = getExemplarLibrary();
  const stats = getExemplarStats();
  assert("exemplar library loaded", lib.length > 0, `${lib.length} adapted, ${stats.excluded} excluded, dir=${stats.dir}`);

  let emailIsmHits = 0;
  for (const ex of lib) {
    if (EMAIL_ISMS.some((re) => re.test(ex.body))) {
      emailIsmHits += 1;
      if (emailIsmHits <= 3) results.push(`   leaked email-ism in ${ex.id}: ${ex.body.slice(0, 80)}`);
    }
  }
  assert("0 email-isms in adapted bodies", emailIsmHits === 0, `${emailIsmHits} hits across ${lib.length} bodies`);

  // Direct adapter unit checks.
  assert("adapter rewrites EN 'my email' → 'my message'",
    (adaptEmailBodyToChat("Following up on my email about pricing.", "en") ?? "").includes("my message"));
  assert("adapter drops a leaked Subject line",
    !(adaptEmailBodyToChat("Subject: Re: hi\nHello there.", "en") ?? "").toLowerCase().includes("subject:"));
  assert("adapter excludes residual German E-Mail body",
    adaptEmailBodyToChat("Ich melde mich per E-Mail bezüglich Ihres Kontos.", "de") === null);

  // ── 2. Selection determinism + coverage ──────────────────────────────────
  const q = { language: "en", stage: 1, vertical: "ecommerce", subVertical: "general_marketplace", product: "CPS / performance marketing", country: "United States" };
  const selA = selectExemplars(q, 2);
  const selB = selectExemplars(q, 2);
  assert("selection is deterministic", JSON.stringify(selA.map((e) => e.id)) === JSON.stringify(selB.map((e) => e.id)),
    selA.map((e) => e.id).join(", "));
  assert("selection returns English exemplars", selA.length > 0 && selA.every((e) => e.language === "en"));
  assert("exemplar block renders with anti-copy framing",
    /do NOT copy/i.test(buildExemplarBlock(selA)) || selA.length === 0);

  // Language fallback: a language with (likely) no exemplars falls back to en.
  const selZu = selectExemplars({ ...q, language: "zu" }, 2);
  assert("unknown language falls back to English exemplars (or empty)",
    selZu.length === 0 || selZu.every((e) => e.language === "en"));

  // ── 3. Competitor grounding ──────────────────────────────────────────────
  const comp = lookupCompetitors("United States", "ecommerce", "general_marketplace");
  assert("competitor lookup finds US ecommerce entry", comp !== null, comp ? comp.core.join(", ") : "null");
  if (comp) {
    const block = buildCompetitorBlock(comp);
    assert("competitor block names core peers", block.includes("CORE PEERS"));
    assert("competitor block honors avoid list", comp.avoid.length === 0 || block.includes("NEVER mention"));
  }

  // ── 4. Grey-vertical routing decision (pure) ─────────────────────────────
  assert("sports_betting is grey", isGreyAreaVertical("sports_betting", null));
  assert("crypto_exchange is grey", isGreyAreaVertical("crypto", "crypto_exchange"));
  assert("forex is grey", isGreyAreaVertical("forex", "forex_cfd"));
  assert("ecommerce is NOT grey", !isGreyAreaVertical("ecommerce", "general_marketplace"));
  assert("mobile gaming is NOT grey (no bare 'gaming' match)", !isGreyAreaVertical("mobile", "mobile_gaming_ua"));

  // ── 5. Cache-aware pricing math ──────────────────────────────────────────
  const noCacheUsd = computeCost("claude-sonnet-4-6", 1_000_000, 0).usd;
  const cachedUsd = computeCost("claude-sonnet-4-6", 0, 0, { cachedInputTokens: 1_000_000 }).usd;
  assert("Anthropic cache read ≈ 0.1× input", Math.abs(cachedUsd - noCacheUsd * 0.1) < 1e-6, `${cachedUsd} vs ${noCacheUsd}`);
  const gemUncached = computeCost("gemini-3.5-flash", 1_000_000, 0).usd; // $1.50
  const gemCached = computeCost("gemini-3.5-flash", 0, 0, { cachedInputTokens: 1_000_000 }).usd; // $0.15
  assert("Gemini cached input priced at $0.15/M", Math.abs(gemCached - 0.15) < 1e-6 && Math.abs(gemUncached - 1.5) < 1e-6);

  // ── 5b. Writer system prompts are byte-stable across prospects ──────────
  // Audit F1: the per-prospect research brief used to live in the writer
  // SYSTEM prompt, so the cache_control breakpoint never prefix-hit across
  // prospects (every call paid the 1.25× cache-WRITE premium, read never
  // fired). It now lives in the USER prompt; lock the invariant in.
  const ctxBase = {
    prospect_name: "Dana", company: "MarketCo", vertical: "ecommerce",
    sub_vertical: "general_marketplace", product: "CPS / performance marketing",
    country: "United States", language: "en", sender_name: "Alex",
    channel: "whatsapp" as const,
  };
  const briefA = fixtureBrief();
  const briefB = { ...fixtureBrief(), prospectSpecificHook: "totally different hook", finalCompetitors: ["Zalando"] };
  const sysA = getProspectorSystemPrompt({ ...ctxBase, mode: "prospector", research_brief: briefA });
  const sysB = getProspectorSystemPrompt({ ...ctxBase, mode: "prospector", prospect_name: "Sam", company: "OtherCo", research_brief: briefB });
  assert("prospector system prompt is byte-stable across prospects", sysA === sysB, `lenA=${sysA.length} lenB=${sysB.length}`);
  const fSysA = getFollowuperSystemPrompt({ ...ctxBase, mode: "followuper", stage: 2, research_brief: briefA });
  const fSysB = getFollowuperSystemPrompt({ ...ctxBase, mode: "followuper", stage: 3, prospect_name: "Sam", research_brief: briefB });
  assert("followuper system prompt is byte-stable across prospects", fSysA === fSysB, `lenA=${fSysA.length} lenB=${fSysB.length}`);
  // …and the brief itself must still reach the model — via the USER prompt.
  const userA = getProspectorUserPrompt({ ...ctxBase, mode: "prospector", research_brief: briefA });
  assert("research brief moved into the prospector USER prompt", userA.includes("PROSPECT RESEARCH BRIEF"), `len=${userA.length}`);

  console.log("[smoke] config:", {
    geminiConfigured: isGeminiConfigured(),
    writerChain: [GEMINI_DEFAULT_MODEL, GEMINI_FALLBACK_MODEL, ANTHROPIC_FALLBACK_MODEL],
    critic: CRITIC_MODEL,
  });

  // ── 6. LIVE generation (requires ANTHROPIC_API_KEY) ──────────────────────
  if (process.env.ANTHROPIC_API_KEY) {
    const brief = fixtureBrief();

    // Normal vertical — writer is gemini if a key exists, else sonnet-4-6 fallback.
    const normal = await generateChatMessage({
      prospect: { prospectName: "Dana", company: "MarketCo", vertical: "ecommerce", subVertical: "general_marketplace", product: "CPS / performance marketing", country: "United States", language: "en" },
      channel: "whatsapp", stage: 0, senderName: "Alex", researchBrief: brief,
    });
    assert("normal-vertical generation produced a message", normal.message.trim().length > 0, `len=${normal.message.length}`);
    assert("critic model is sonnet-5", normal.modelMetadata.criticModel === "claude-sonnet-5", normal.modelMetadata.criticModel);

    // The policy is a tiered chain: GEMINI_DEFAULT_MODEL →
    // GEMINI_FALLBACK_MODEL → Anthropic. Whether the writer SHOULD be a given
    // tier depends on live conditions, not just key presence: a model can 503
    // when not provisioned for this key's tier (observed 2026-07-09 for
    // gemini-3.5-flash). Probe each Gemini tier once and assert the outcome
    // the policy REQUIRES given those probes — a correct fallback is a PASS,
    // not a failure — while loudly flagging when the pricier Anthropic tier
    // is doing writer duty.
    const probeNotes: string[] = [];
    let expectedWriter = ANTHROPIC_FALLBACK_MODEL;
    if (isGeminiConfigured()) {
      const tiers = GEMINI_FALLBACK_MODEL && GEMINI_FALLBACK_MODEL !== GEMINI_DEFAULT_MODEL
        ? [GEMINI_DEFAULT_MODEL, GEMINI_FALLBACK_MODEL]
        : [GEMINI_DEFAULT_MODEL];
      for (const tier of tiers) {
        try {
          // maxTokens must be generous: Gemini 3.x models think by default in
          // some configs and can return empty text at tiny budgets — a false
          // "unusable" signal. The real chain roles run at 2048.
          await geminiGenerate({ model: tier, system: "Reply with the word ok.", user: "ok", maxTokens: 256, json: false, label: "preflight" });
          probeNotes.push(`${tier} live (HTTP 200)`);
          if (expectedWriter === ANTHROPIC_FALLBACK_MODEL) expectedWriter = tier;
          break; // first servable tier is where the chain lands
        } catch (err) {
          probeNotes.push(`${tier} unusable → ${String(err).slice(0, 100)}`);
        }
      }
    } else {
      probeNotes.push("gemini not configured");
    }
    const geminiProbeNote = probeNotes.join(" | ");
    // Valid outcomes = the expected tier or anything DOWNSTREAM of it in the
    // chain. The generation and the probe sample live Gemini weather at
    // different moments — a tier that probes healthy can transiently fail
    // during the run (observed for 3-flash-preview), and that fallback is
    // correct policy behavior, not a routing bug. Only an off-chain model
    // (or one UPSTREAM of a tier the probe says is dead) fails.
    // Gemini weather varies BETWEEN the generation and the probe, in both
    // directions (a tier can fail the probe yet serve the run, and vice
    // versa). The only assertion that is stable under live weather is CHAIN
    // MEMBERSHIP: the writer must be one of the three configured tiers.
    // Which tier it landed on (vs the probe's prediction) is reported as a
    // note, not a failure.
    const fullChain = [GEMINI_DEFAULT_MODEL, GEMINI_FALLBACK_MODEL, ANTHROPIC_FALLBACK_MODEL];
    const draftModel = normal.modelMetadata.draftModel;
    assert("normal writer model is a configured chain tier", fullChain.includes(draftModel),
      `got ${draftModel}, chain [${fullChain.join(", ")}] — ${geminiProbeNote}`);
    if (draftModel !== expectedWriter) {
      results.push(`   ℹ writer landed on ${draftModel}; probe predicted ${expectedWriter} (live weather differed between samples)`);
    }
    if (isGeminiConfigured() && expectedWriter === ANTHROPIC_FALLBACK_MODEL) {
      results.push(`   ⚠ COST-SAVINGS INACTIVE: no Gemini tier servable (${geminiProbeNote}). Writer/lint run on ${ANTHROPIC_FALLBACK_MODEL} (pricier).`);
    } else if (isGeminiConfigured() && expectedWriter !== GEMINI_DEFAULT_MODEL) {
      results.push(`   ℹ chain landed on the Gemini fallback tier: ${geminiProbeNote}`);
    }
    console.log("[smoke] normal metadata:", normal.modelMetadata, "cost=$" + normal.costEstimate.usd.toFixed(4), "| gemini:", geminiProbeNote);

    // Grey vertical — writer MUST be sonnet-4-6 regardless of Gemini key.
    const grey = await generateChatMessage({
      prospect: { prospectName: "Sam", company: "BetCo", vertical: "sports_betting", subVertical: "sports_betting", product: "mobile user acquisition", country: "United States", language: "en" },
      channel: "whatsapp", stage: 0, senderName: "Alex", researchBrief: { ...brief, primaryEvent: "first-time deposit", calibratedDailyVolume: "800 FTDs" },
    });
    assert("grey-vertical generation produced a message", grey.message.trim().length > 0, `len=${grey.message.length}`);
    assert("grey-vertical writer routed to sonnet-4-6", grey.modelMetadata.draftModel === ANTHROPIC_FALLBACK_MODEL,
      grey.modelMetadata.draftModel);
    console.log("[smoke] grey metadata:", grey.modelMetadata);

    // Prompt-cache: two back-to-back critic-role calls on the same system
    // prefix — the second should read from cache.
    const sys = "You are a strict JSON critic. Return {\"overall\":5,\"needs_rewrite\":false}. " + "PADDING ".repeat(600);
    await callLLMRole("critic", { system: sys, user: "score: hi", maxTokens: 64, label: "cache-warm" });
    const second = await callLLMRole("critic", { system: sys, user: "score: hello", maxTokens: 64, label: "cache-read" });
    // second.cost.inputTokens is TOTAL input (uncached+cached); a cache hit
    // means cached tokens > 0, which we detect by the discounted cost being
    // below the full-price cost of the same token count.
    const fullPrice = computeCost(second.model, second.cost.inputTokens, 0).usd;
    assert("Anthropic prompt cache engaged on repeat prefix", second.cost.usd < fullPrice,
      `discounted=$${second.cost.usd.toFixed(5)} full=$${fullPrice.toFixed(5)}`);

    // GEMINI_FORCE_503 → capacity fallback to sonnet-4-6 on the writer role.
    process.env.GEMINI_FORCE_503 = "1";
    const forced = await callLLMRole("writer", {
      system: "Return the JSON {\"subject\":\"t\",\"message\":\"hi\"}.", user: "go", maxTokens: 64, label: "force503",
      vertical: "ecommerce", subVertical: "general_marketplace",
    });
    delete process.env.GEMINI_FORCE_503;
    assert("GEMINI_FORCE_503 → Anthropic fallback", forced.provider === "anthropic" && forced.fallback === true,
      `provider=${forced.provider} fallback=${forced.fallback} model=${forced.model}`);
  } else {
    results.push("SKIP  live generation (ANTHROPIC_API_KEY not set)");
  }

  console.log("\n" + results.join("\n"));
  console.log(process.exitCode ? "\n❌ SMOKE FAILED" : "\n✅ SMOKE PASSED");
}

main().catch((err) => {
  console.error("smoke crashed:", err);
  process.exit(1);
});
