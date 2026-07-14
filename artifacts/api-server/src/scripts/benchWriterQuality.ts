/**
 * Bench: writer quality on the tiered Gemini chain (2026-07-09).
 *
 * Run (pin the writer to the tier under test):
 *   FOLLOWUP_DIGEST_SCHEDULER=false LLM_GEMINI_MODEL=gemini-3-flash-preview \
 *     node ../../lib/db/node_modules/tsx/dist/cli.mjs src/scripts/benchWriterQuality.ts
 *
 * Goal: measure whether gemini-3-flash-preview writes doctrine-grade chat
 * messages across ALL major library languages, using the FULL production
 * chain — exemplar selection + competitor grounding + writer → Sonnet 5
 * critic → rewriter healing loop → deterministic lint/firewall — plus real
 * research for a subset of cases. The Sonnet 5 critic's finalOverallScore
 * and the healing-iteration count are the primary quality signals; the
 * report file carries every full message for human review.
 *
 * Output: godlike-audit/BENCH-WRITER-<model>.md (+ .json) at the repo root.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateChatMessage,
  type ProspectInput,
} from "../services/messageGenerator";
import { researchProspect, type ProspectBrief } from "../services/prospectResearch";
import { LoggingProgressEmitter } from "../services/progressEvents";
import type { ConversationRow, PreviousFollowup } from "../services/messagePrompts";
import { GEMINI_DEFAULT_MODEL } from "../lib/llm/router";
import type { ChannelCode } from "../lib/channelRegister";

// ─────────────────────────────────────────────────────────────────
// Case matrix
// ─────────────────────────────────────────────────────────────────

interface BenchCase {
  id: string;
  language: string;
  country: string;
  channel: ChannelCode;
  /** 0 = prospector (first message); >=1 = followuper. */
  stage: number;
  prospectName: string;
  company: string;
  vertical: string;
  subVertical: string;
  product: string;
  /** Peers that fit the market — feed the brief's finalCompetitors. */
  peers: string[];
  volume: string;
  event: string;
  /** "real" runs researchProspect first (full chain incl. research). */
  research?: "real";
  /** Expected Unicode script for automated language verification. */
  script?: RegExp;
}

// Long-tail language table — one prospector case per supported language
// (union of GREETING_TABLE + exemplar-library languages). Script regexes
// verify the message is actually written in the target writing system.
const LANGS: Array<{ lang: string; country: string; name: string; company: string; peers: [string, string]; script?: RegExp }> = [
  { lang: "en", country: "United States", name: "Dana", company: "MarketCo", peers: ["Amazon", "Walmart"] },
  { lang: "es", country: "Mexico", name: "Valeria", company: "MercadoHogar", peers: ["Mercado Libre", "Amazon México"] },
  { lang: "pt", country: "Brazil", name: "Rafael", company: "LojaViva", peers: ["Magazine Luiza", "Shopee Brasil"] },
  { lang: "fr", country: "France", name: "Camille", company: "ModeRapide", peers: ["Vinted", "La Redoute"] },
  { lang: "de", country: "Germany", name: "Katrin", company: "KaufFlink", peers: ["Otto", "Zalando"] },
  { lang: "it", country: "Italy", name: "Marco", company: "MercatoVia", peers: ["Subito", "ePrice"] },
  { lang: "nl", country: "Netherlands", name: "Sanne", company: "KoopSnel", peers: ["Bol.com", "Marktplaats"] },
  { lang: "pl", country: "Poland", name: "Kasia", company: "SzybkiRynek", peers: ["Allegro", "Empik"] },
  { lang: "ru", country: "Kazakhstan", name: "Айгерим", company: "StepMarket", peers: ["Kaspi.kz", "Wildberries"], script: /[Ѐ-ӿ]/ },
  { lang: "uk", country: "Ukraine", name: "Оксана", company: "ShvydkoShop", peers: ["Rozetka", "Prom.ua"], script: /[Ѐ-ӿ]/ },
  { lang: "he", country: "Israel", name: "נועה", company: "קניון אונליין", peers: ["Wolt Market", "KSP"], script: /[֐-׿]/ },
  { lang: "ar", country: "United Arab Emirates", name: "خالد", company: "سوق الخليج", peers: ["Noon", "Amazon.ae"], script: /[؀-ۿ]/ },
  { lang: "fa", country: "Tajikistan", name: "Roya", company: "BazarTez", peers: ["Somon.tj", "Alif Shop"], script: /[؀-ۿ]/ },
  { lang: "tr", country: "Turkey", name: "Emre", company: "HızlıPazar", peers: ["Hepsiburada", "Trendyol"] },
  { lang: "hi", country: "India", name: "Priya", company: "BazaarPlus", peers: ["Flipkart", "Meesho"], script: /[ऀ-ॿ]/ },
  { lang: "bn", country: "Bangladesh", name: "Anika", company: "DhakaBazar", peers: ["Daraz", "Chaldal"], script: new RegExp("[\u0980-\u09FF]") },
  { lang: "ur", country: "Pakistan", name: "Ayesha", company: "TezBazaar", peers: ["Daraz.pk", "PriceOye"], script: /[؀-ۿ]/ },
  { lang: "th", country: "Thailand", name: "Nan", company: "TaladFast", peers: ["Shopee Thailand", "Lazada"], script: /[฀-๿]/ },
  { lang: "vi", country: "Vietnam", name: "Linh", company: "ChoNhanh", peers: ["Shopee Vietnam", "Tiki"] },
  { lang: "id", country: "Indonesia", name: "Putri", company: "TokoCepat", peers: ["Tokopedia", "Shopee Indonesia"] },
  { lang: "ms", country: "Malaysia", name: "Aisyah", company: "PasarLaju", peers: ["Shopee Malaysia", "Lazada Malaysia"] },
  { lang: "tl", country: "Philippines", name: "Maria", company: "TindahanGo", peers: ["Shopee Philippines", "Lazada Philippines"] },
  { lang: "ja", country: "Japan", name: "Yuki", company: "KaimonoGo", peers: ["Rakuten", "Mercari"], script: /[぀-ヿ一-鿿]/ },
  { lang: "ko", country: "South Korea", name: "Minjun", company: "MarketOn", peers: ["Coupang", "Gmarket"], script: /[가-힯]/ },
  { lang: "zh", country: "Taiwan", name: "Wei", company: "GoBuy", peers: ["Shopee Taiwan", "momo"], script: /[一-鿿]/ },
  { lang: "sv", country: "Sweden", name: "Elsa", company: "SnabbKöp", peers: ["Blocket", "CDON"] },
  { lang: "no", country: "Norway", name: "Ingrid", company: "RaskHandel", peers: ["Finn.no", "Komplett"] },
  { lang: "da", country: "Denmark", name: "Freja", company: "HurtigKøb", peers: ["DBA", "Proshop"] },
  { lang: "fi", country: "Finland", name: "Aino", company: "NopeaKauppa", peers: ["Tori.fi", "Verkkokauppa"] },
  { lang: "cs", country: "Czech Republic", name: "Petra", company: "RychlyTrh", peers: ["Alza", "Heureka"] },
  { lang: "ro", country: "Romania", name: "Ana", company: "PiataRapida", peers: ["eMAG", "OLX Romania"] },
  { lang: "hu", country: "Hungary", name: "Eszter", company: "GyorsPiac", peers: ["Jófogás", "eMAG Hungary"] },
  { lang: "el", country: "Greece", name: "Eleni", company: "AgoraFast", peers: ["Skroutz", "Public.gr"], script: /[Ͱ-Ͽ]/ },
  { lang: "bg", country: "Bulgaria", name: "Elena", company: "BurzPazar", peers: ["eMAG Bulgaria", "OLX Bulgaria"], script: /[Ѐ-ӿ]/ },
  { lang: "sw", country: "Kenya", name: "Amani", company: "SokoHaraka", peers: ["Jumia", "Kilimall"] },
  { lang: "am", country: "Ethiopia", name: "Selam", company: "FetanGebeya", peers: ["Jumia Ethiopia", "Sheger Market"], script: new RegExp("[\u1200-\u137F]") },
  { lang: "az", country: "Azerbaijan", name: "Leyla", company: "TezBazar", peers: ["Tap.az", "Umico"] },
  { lang: "et", country: "Estonia", name: "Kadri", company: "KiireTurg", peers: ["Osta.ee", "Kaup24"] },
  { lang: "hr", country: "Croatia", name: "Ivana", company: "BrziTrg", peers: ["Njuškalo", "eKupi"] },
  { lang: "ka", country: "Georgia", name: "Nino", company: "SwrafiMarket", peers: ["MyMarket.ge", "Extra.ge"], script: /[ა-ჿ]/ },
  { lang: "km", country: "Cambodia", name: "Sreyneang", company: "PsarLoeun", peers: ["Khmer24", "L192"], script: new RegExp("[\u1780-\u17FF]") },
  { lang: "lt", country: "Lithuania", name: "Ruta", company: "GreitasTurgus", peers: ["Pigu.lt", "Skelbiu"] },
  { lang: "lv", country: "Latvia", name: "Liga", company: "AtrsTirgus", peers: ["SS.lv", "220.lv"] },
  { lang: "my", country: "Myanmar", name: "Thiri", company: "MyanZay", peers: ["Shop.com.mm", "OneKyat"], script: new RegExp("[\u1000-\u109F]") },
  { lang: "si", country: "Sri Lanka", name: "Nimali", company: "WeleFast", peers: ["Daraz.lk", "ikman"], script: new RegExp("[\u0D80-\u0DFF]") },
  { lang: "sl", country: "Slovenia", name: "Nina", company: "HitriTrg", peers: ["Bolha", "Mimovrste"] },
  { lang: "sr", country: "Serbia", name: "Milica", company: "BrzaPijaca", peers: ["KupujemProdajem", "Gigatron"] },
];

const CHANNELS: ChannelCode[] = ["whatsapp", "telegram", "linkedin"];

const CASES: BenchCase[] = [
  // Real-research cases (full chain incl. research). subVertical must be a
  // VALID taxonomy code — researchProspect validates it (run 2 threw on
  // "general_marketplace").
  { id: "en-US-research", language: "en", country: "United States", channel: "whatsapp", stage: 0, prospectName: "Dana", company: "Instacart", vertical: "web_cps", subVertical: "cps_web_ecom_marketplace", product: "CPS / performance marketing", peers: [], volume: "", event: "", research: "real" },
  { id: "tr-TR-research", language: "tr", country: "Turkey", channel: "telegram", stage: 0, prospectName: "Emre", company: "Trendyol", vertical: "web_cps", subVertical: "cps_web_ecom_marketplace", product: "CPS / performance marketing", peers: [], volume: "", event: "", research: "real" },

  // One prospector case per supported language (channel rotates).
  ...LANGS.map((l, i): BenchCase => ({
    id: `${l.lang}-${l.country.replace(/\s+/g, "")}`,
    language: l.lang,
    country: l.country,
    channel: CHANNELS[i % CHANNELS.length]!,
    stage: 0,
    prospectName: l.name,
    company: l.company,
    vertical: "ecommerce",
    subVertical: "general_marketplace",
    product: i % 2 === 0 ? "CPS / performance marketing" : "mobile user acquisition",
    peers: l.peers,
    volume: `${600 + (i * 37) % 900} confirmed purchases`,
    event: i % 2 === 0 ? "confirmed purchase" : "first purchase",
    script: l.script,
  })),

  // Followuper cases (stages 1-3) in three languages.
  { id: "tr-TR-followup", language: "tr", country: "Turkey", channel: "telegram", stage: 2, prospectName: "Baran", company: "HızlıPazar", vertical: "ecommerce", subVertical: "general_marketplace", product: "CPS / performance marketing", peers: ["Hepsiburada", "Trendyol"], volume: "1,200 onaylı satın alma", event: "confirmed purchase" },
  { id: "en-GB-followup", language: "en", country: "United Kingdom", channel: "whatsapp", stage: 1, prospectName: "Oliver", company: "SwiftCart", vertical: "ecommerce", subVertical: "general_marketplace", product: "CPS / performance marketing", peers: ["ASOS", "Argos"], volume: "1,400 confirmed purchases", event: "confirmed purchase" },
  { id: "es-AR-followup", language: "es", country: "Argentina", channel: "whatsapp", stage: 3, prospectName: "Sofía", company: "TiendaSur", vertical: "ecommerce", subVertical: "general_marketplace", product: "mobile user acquisition", peers: ["Mercado Libre", "Frávega"], volume: "650 primeras compras", event: "first purchase" },
];

// ─────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────

function fixtureBrief(c: BenchCase): ProspectBrief {
  return {
    determinedCountry: c.country,
    determinedScaleTier: "mid",
    scaleRationale: "bench fixture",
    calibratedDailyVolume: c.volume,
    primaryEvent: c.event,
    alternativeEvents: ["add to cart"],
    finalCompetitors: c.peers,
    subsidiaryCheckNote: "",
    marketContext: `${c.country} ${c.vertical} competition is intensifying`,
    prospectSpecificHook: "seasonal demand spike",
    prospectPrimaryGrowthProblem: "rising CAC on paid social",
    freshHook: "opened three growth / UA roles this month",
    hookType: "hiring",
    hookSource: "LinkedIn job post",
    hookDateOrRecency: "last 3 weeks",
    runsYoutubeAds: true,
    runsMetaAds: true,
    ctvAngle: "scaling video creative into CTV / YouTube inventory",
    acquisitionModel: c.vertical === "web_cps" ? "CPS" : "CPA",
    whyArgument: `${c.company} faces rising acquisition costs in ${c.country}.`,
    validationArgument: `We optimize to ${c.event} at ${c.volume}/day for similar ${c.vertical} accounts.`,
    howArgument: `${c.event}-level optimization with fraud screening.`,
    tangibleReasons: [`${c.volume}/day at similar accounts`, "fraud-screened traffic"],
    whyArgumentNative: "",
    validationArgumentNative: "",
    howArgumentNative: "",
    generatedAt: new Date().toISOString(),
    generatorModel: "bench-fixture",
    generatorCostUsd: 0,
  };
}

function followupContext(c: BenchCase): {
  conversation: ConversationRow[];
  previousFollowups: PreviousFollowup[];
  daysSinceFirst: number;
} {
  const first = `Hi ${c.prospectName}, ${c.company} caught my eye — we drive ${c.volume} a day for ${c.vertical} accounts in ${c.country}, optimized to ${c.event}. Worth a quick look?`;
  const conversation: ConversationRow[] = [
    { direction: "outbound", body: first, timestamp: new Date(Date.now() - 6 * 864e5).toISOString(), channel: c.channel },
  ];
  const previousFollowups: PreviousFollowup[] = [];
  if (c.stage >= 2) {
    conversation.push({
      direction: "outbound",
      body: `Quick nudge — ${c.peers[0] ?? "a peer"} in your market moved to ${c.event}-based buying this quarter. Happy to share what that looked like.`,
      timestamp: new Date(Date.now() - 3 * 864e5).toISOString(),
      channel: c.channel,
    });
    previousFollowups.push({ stage: 1, body: conversation[1]!.body });
  }
  if (c.stage >= 3) {
    conversation.push({
      direction: "outbound",
      body: `Sharing one number: similar accounts see payback inside 6 weeks on ${c.event} optimization. If timing is off, tell me and I'll close the loop.`,
      timestamp: new Date(Date.now() - 1 * 864e5).toISOString(),
      channel: c.channel,
    });
    previousFollowups.push({ stage: 2, body: conversation[2]!.body });
  }
  return { conversation, previousFollowups, daysSinceFirst: 6 };
}

// ─────────────────────────────────────────────────────────────────
// Automated quality checks
// ─────────────────────────────────────────────────────────────────

const QUALITY_CHECKS: Array<{ name: string; bad: RegExp }> = [
  { name: "subject-line artifact", bad: /^\s*(subject|Re)\s*:/im },
  { name: "email vocabulary", bad: /\b(e-?mail|inbox|unsubscribe)\b|メール|بريد الإلكتروني|correo electr/i },
  { name: "markdown formatting", bad: /\*\*|__|^#{1,3}\s|\[.+\]\(.+\)/m },
  { name: "template placeholder", bad: /\{\{|\}\}|\{[A-Za-z_]+\}|\[(?:Verify|Check|TODO|insert)[^\]]*\]|NOT AVAILABLE/i },
  { name: "snake_case leak", bad: /\b[a-z]+_[a-z]+_[a-z]+\b|\b(?:first_purchase|confirmed_purchase|user_acquisition)\b/ },
  { name: "meta-language", bad: /\b(as an AI|language model|I was asked to|citing|referencing benchmarks)\b/i },
];

interface CaseResult {
  id: string;
  ok: boolean;
  draftModel?: string;
  iterations?: number;
  score?: number;
  usd?: number;
  ms?: number;
  researchUsd?: number;
  flags: string[];
  message?: string;
  error?: string;
}

async function runCase(c: BenchCase): Promise<CaseResult> {
  const flags: string[] = [];
  const start = Date.now();
  try {
    let brief: ProspectBrief;
    let researchUsd = 0;
    if (c.research === "real") {
      const r = await researchProspect(
        { brand: c.company, country: c.country, language: c.language, subVertical: c.subVertical, product: c.product },
        new LoggingProgressEmitter(),
      );
      brief = r.brief;
      researchUsd = r.cost.usd;
    } else {
      brief = fixtureBrief(c);
    }

    const prospect: ProspectInput = {
      prospectName: c.prospectName,
      company: c.company,
      vertical: c.vertical,
      subVertical: c.subVertical,
      product: c.product,
      country: c.country,
      language: c.language,
    };

    const extra = c.stage >= 1 ? followupContext(c) : {};
    const generated = await generateChatMessage({
      prospect,
      channel: c.channel,
      stage: c.stage,
      senderName: "Alex",
      researchBrief: brief,
      ...extra,
    });

    const msg = generated.message;
    if (!msg.trim()) flags.push("EMPTY MESSAGE");
    if (c.script && !c.script.test(msg)) flags.push(`WRONG SCRIPT (expected ${c.language})`);
    for (const check of QUALITY_CHECKS) {
      if (check.bad.test(msg)) flags.push(check.name);
    }
    if (generated.modelMetadata.draftModel !== GEMINI_DEFAULT_MODEL) {
      flags.push(`writer fell back to ${generated.modelMetadata.draftModel}`);
    }
    if ((generated.modelMetadata.finalOverallScore ?? 0) < 4) {
      flags.push(`LOW SCORE ${generated.modelMetadata.finalOverallScore}`);
    }

    return {
      id: c.id,
      ok: flags.length === 0,
      draftModel: generated.modelMetadata.draftModel,
      iterations: generated.modelMetadata.iterations,
      score: generated.modelMetadata.finalOverallScore,
      usd: generated.costEstimate.usd,
      researchUsd,
      ms: Date.now() - start,
      flags,
      message: msg,
    };
  } catch (err) {
    return { id: c.id, ok: false, flags: ["THREW"], error: String(err), ms: Date.now() - start };
  }
}

// Simple concurrency pool.
async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main(): Promise<void> {
  // Targeted mode: BENCH_ONLY="id1,id2" runs a subset (round-3 re-tests).
  const only = (process.env.BENCH_ONLY || "").split(",").map((x) => x.trim()).filter(Boolean);
  const cases = only.length ? CASES.filter((c) => only.includes(c.id)) : CASES;
  console.log(`[bench] writer model under test: ${GEMINI_DEFAULT_MODEL}`);
  console.log(`[bench] ${cases.length} cases, concurrency 3`);

  const results = await pool(cases, 3, runCase);

  const done = results.filter((r) => !r.error);
  const avgScore = done.reduce((a, r) => a + (r.score ?? 0), 0) / Math.max(1, done.length);
  const avgIter = done.reduce((a, r) => a + (r.iterations ?? 0), 0) / Math.max(1, done.length);
  const totalUsd = results.reduce((a, r) => a + (r.usd ?? 0) + (r.researchUsd ?? 0), 0);
  const geminiServed = done.filter((r) => r.draftModel === GEMINI_DEFAULT_MODEL).length;

  const lines: string[] = [];
  lines.push(`# Writer quality bench — ${GEMINI_DEFAULT_MODEL}`);
  lines.push("");
  lines.push(`Cases: ${results.length} · errors: ${results.length - done.length} · writer served by ${GEMINI_DEFAULT_MODEL}: ${geminiServed}/${done.length}`);
  lines.push(`Avg critic score: ${avgScore.toFixed(2)} · avg healing iterations: ${avgIter.toFixed(2)} · total spend: $${totalUsd.toFixed(3)}`);
  lines.push("");
  lines.push("| case | score | iters | writer | cost | ms | flags |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const r of results) {
    lines.push(`| ${r.id} | ${r.score ?? "-"} | ${r.iterations ?? "-"} | ${r.draftModel ?? "-"} | $${((r.usd ?? 0) + (r.researchUsd ?? 0)).toFixed(3)} | ${r.ms} | ${r.flags.join("; ") || "✓"} |`);
  }
  lines.push("");
  for (const r of results) {
    lines.push(`## ${r.id}`);
    lines.push("");
    if (r.error) {
      lines.push("ERROR: " + r.error);
    } else {
      lines.push("```");
      lines.push(r.message ?? "");
      lines.push("```");
    }
    lines.push("");
  }

  // ESM-safe (no __dirname under tsx ESM — run 1 crashed on this after all
  // 19 generations completed; results were salvaged from the log).
  const here = path.dirname(fileURLToPath(import.meta.url));
  const outBase = path.resolve(here, "../../../..", "godlike-audit");
  // Report name.
  //
  // Keyed by model ALONE, a 10-case BENCH_ONLY run silently overwrote the
  // committed 52-case baseline for the same model — destroying the reference
  // data mid-comparison (recovered from git, 2026-07-14). A partial run is not
  // the same artifact as a full run and must not claim its filename. BENCH_TAG
  // additionally separates arms of an A/B on the same model.
  const suffix = [
    process.env.BENCH_TAG?.trim().replace(/[^A-Za-z0-9_-]/g, ""),
    cases.length < CASES.length ? `subset${cases.length}` : "",
  ]
    .filter(Boolean)
    .join("-");
  const stem = `BENCH-WRITER-${GEMINI_DEFAULT_MODEL}${suffix ? `-${suffix}` : ""}`;
  const mdPath = path.join(outBase, `${stem}.md`);
  fs.writeFileSync(mdPath, lines.join("\n"));
  fs.writeFileSync(
    path.join(outBase, `${stem}.json`),
    JSON.stringify(results, null, 2),
  );

  console.log(`\n[bench] report → ${mdPath}`);
  console.log(`[bench] avg score ${avgScore.toFixed(2)}, avg iterations ${avgIter.toFixed(2)}, gemini-served ${geminiServed}/${done.length}, total $${totalUsd.toFixed(3)}`);
  const flagged = results.filter((r) => !r.ok);
  console.log(`[bench] flagged cases: ${flagged.length ? flagged.map((r) => r.id).join(", ") : "none"}`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("bench crashed:", err);
  process.exit(1);
});
