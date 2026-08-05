/**
 * Smoke: research search-directive contract. Zero LLM spend.
 *
 * Locks the invariants behind lib/doctrine/researchPrompts/searchDirective.ts.
 * The one-shot proof that opus's prompt was unchanged (a byte-diff of all 378
 * subVertical x web-mode renders against git HEAD) cannot live here — HEAD
 * moves. So instead we lock the properties that made that diff come out clean,
 * which is what actually protects the production baseline:
 *
 *   1. The block is OFF unless explicitly asked for  -> opus prompt unchanged.
 *   2. Asking for it with no web access is a no-op   -> the knowledge-only
 *      fallback never claims it can search.
 *   3. The nudge predicate tracks the thinking-disabled predicate exactly
 *      -> the two lists cannot drift apart.
 *   4. Turning it off is byte-clean, not "off by a newline" -> this is the
 *      exact bug the HEAD diff caught: `\n${searchBlock}` added a stray
 *      newline to all 378 opus renders while the block itself was empty.
 */

import { getResearchSystemPrompt } from "../lib/doctrine/researchPrompts";
import { buildSearchDirectiveBlock } from "../lib/doctrine/researchPrompts/searchDirective";
import {
  modelDefaultsAdaptiveThinking,
  modelNeedsExplicitToolNudge,
} from "../lib/llm/thinking";
import { ALL_SUB_VERTICALS, getDoctrineDomain, type SubVertical } from "../lib/doctrine/taxonomy";

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const base = (extra: Record<string, unknown> = {}) => ({
  brand: "Acme",
  country: "US",
  language: "en",
  product: "UA",
  subVertical: "cps_web_ecom_marketplace" as SubVertical,
  webSearchEnabled: true,
  ...extra,
});

console.log("\n1. block gating");
check("off when aggressiveSearch omitted", buildSearchDirectiveBlock({ webSearchEnabled: true, aggressiveSearch: false, brand: "Acme" }) === "");
check("off when no web access even if requested", buildSearchDirectiveBlock({ webSearchEnabled: false, aggressiveSearch: true, brand: "Acme" }) === "");
const on = buildSearchDirectiveBlock({ webSearchEnabled: true, aggressiveSearch: true, brand: "Acme" });
check("on when requested + web access", on.includes("SEARCH PROTOCOL"));
check("names concrete queries, not vague encouragement", on.includes('"Acme" funding OR raise OR round') && on.includes("Google Ads Transparency Center"));
check("forbids answering fresh fields from memory", /never from memory/i.test(on));
check('keeps the "empty beats fabricated" rule', on.includes('set fresh_hook to ""'));

console.log("\n2. prompt integration — every doctrine family");
const seen = new Set<string>();
const families: SubVertical[] = [];
for (const sv of ALL_SUB_VERTICALS as readonly SubVertical[]) {
  const d = getDoctrineDomain(sv);
  if (!seen.has(d)) { seen.add(d); families.push(sv); }
}
check("all 3 doctrine families covered by this test", families.length === 3, `got ${families.length}: ${[...seen].join(",")}`);
for (const sv of families) {
  const d = getDoctrineDomain(sv);
  const off = getResearchSystemPrompt(base({ subVertical: sv }) as any);
  const onP = getResearchSystemPrompt(base({ subVertical: sv, aggressiveSearch: true }) as any);
  const noWeb = getResearchSystemPrompt(base({ subVertical: sv, aggressiveSearch: true, webSearchEnabled: false }) as any);
  check(`${d}: no protocol by default`, !off.includes("SEARCH PROTOCOL"));
  check(`${d}: protocol when asked`, onP.includes("SEARCH PROTOCOL"));
  check(`${d}: no protocol without web access`, !noWeb.includes("SEARCH PROTOCOL"));
  // The stray-newline regression: disabling the block must leave the template
  // byte-clean, not one character longer than it was.
  const reOff = getResearchSystemPrompt(base({ subVertical: sv, aggressiveSearch: false }) as any);
  check(`${d}: omitted === explicit false (no whitespace artifact)`, off === reOff);
  check(`${d}: disabled block leaves no blank-line artifact`, !/claim in\.\n\n\n/.test(off), "extra newline where the block renders empty");
}

console.log("\n3. predicate coupling (the two lists must not drift)");
for (const m of ["claude-sonnet-5", "claude-opus-4-7", "claude-opus-4-8", "claude-fable-5", "claude-sonnet-4-6", "claude-haiku-4-5"]) {
  check(`${m}: nudge iff thinking-disabled-by-us`, modelNeedsExplicitToolNudge(m) === modelDefaultsAdaptiveThinking(m));
}
check("sonnet-5 gets the nudge", modelNeedsExplicitToolNudge("claude-sonnet-5"));
check("opus-4-7 (today's RESEARCH_MODEL default) does NOT", !modelNeedsExplicitToolNudge("claude-opus-4-7"));

console.log(`\n${fail === 0 ? "ALL GREEN" : "FAILURES"}: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
