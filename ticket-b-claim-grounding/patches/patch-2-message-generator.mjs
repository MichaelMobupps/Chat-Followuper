#!/usr/bin/env node
/**
 * Ticket B-claim-grounding — patch 2/2: services/messageGenerator.ts
 *
 * Three atomic edits:
 *   4.  Add detectUngroundedClaims() function after detectMetaLanguage.
 *       Extracts percentages, large-number volume tokens, and bounded
 *       phrases ("above 12%", "under 200 daily", "more than 14%") from
 *       the message; flags any whose digit string does not appear in
 *       the research brief or prior conversation.
 *   5a. Add `const claimCheck = detectUngroundedClaims(...)` to the
 *       healing loop, mirroring the meta-language pattern.
 *   5b. After the meta-language injection block, append a parallel
 *       claim-grounding injection block that prepends issues, adds
 *       suggestions, sets needs_rewrite, and clamps overall score.
 *
 * Idempotent. All anchors em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/messageGenerator.ts",
);

// ═════════════════════════════════════════════════════════════════
// Edit 4 — Insert detectUngroundedClaims after detectMetaLanguage
// ═════════════════════════════════════════════════════════════════
//
// Anchor: the closing line of detectMetaLanguage. The exact return-
// statement is unique to that function (no other returns this shape).
// We insert the new function between detectMetaLanguage's closing
// brace and the next comment block.

const E4_OLD = `  return { found: matches.length > 0, matches: Array.from(new Set(matches)).slice(0, 5) };
}`;

const E4_NEW = `  return { found: matches.length > 0, matches: Array.from(new Set(matches)).slice(0, 5) };
}

// B-claim-grounding: deterministic post-check for hallucinated stats.
// Extracts percentages, bounded-volume claims, and large-number volume
// tokens from the message and flags any number whose digit string does
// not appear in the research brief (or, for followuper mode, in the
// prior conversation). Mirrors the detectMetaLanguage pattern: the
// healing loop runs this after the LLM critic and prepends any findings
// as critic issues, forcing a rewrite.
function detectUngroundedClaims(
  text: string,
  brief?: ProspectBrief,
  conversationText?: string,
): { found: boolean; matches: string[] } {
  // Build the universe of grounded numeric tokens. If both brief and
  // conversation are absent, ground-truth is empty and we cannot judge,
  // so we return no flags rather than flagging everything.
  const groundParts: string[] = [];
  if (brief) {
    if (brief.calibratedDailyVolume) groundParts.push(brief.calibratedDailyVolume);
    if (brief.primaryEvent) groundParts.push(brief.primaryEvent);
    if (brief.whyArgument) groundParts.push(brief.whyArgument);
    if (brief.validationArgument) groundParts.push(brief.validationArgument);
    if (brief.howArgument) groundParts.push(brief.howArgument);
    if (Array.isArray(brief.tangibleReasons)) groundParts.push(...brief.tangibleReasons);
    if (brief.marketContext) groundParts.push(brief.marketContext);
    if (brief.prospectSpecificHook) groundParts.push(brief.prospectSpecificHook);
  }
  if (conversationText) groundParts.push(conversationText);

  const groundText = groundParts.join(" ");
  if (!groundText.trim()) return { found: false, matches: [] };

  const matches: string[] = [];

  // 1. Percentages: "12%", "12.5%", "0.7%". Most common hallucination
  // surface ("14% first-order completion" with no 14% in brief).
  const percentRe = /\\d+(?:\\.\\d+)?%/g;
  for (const m of text.match(percentRe) ?? []) {
    if (!groundText.includes(m)) matches.push(\`Percentage \\\`\${m}\\\` not in brief or conversation\`);
  }

  // 2. Large-number volume tokens: "400+", "5000 daily", "1200 installs".
  // We restrict to >=3 digits to avoid false positives on day numbers
  // ("Day 7"), stage numbers ("Stage 1"), and conventional figures.
  const largeNumRe = /\\b\\d{3,}(?:\\+|k|K|M)?\\b/g;
  const seenLargeNum = new Set();
  for (const m of text.match(largeNumRe) ?? []) {
    if (seenLargeNum.has(m)) continue;
    seenLargeNum.add(m);
    // Strip trailing modifiers for substring check (so "400" matches
    // brief saying "400 daily").
    const bareNum = m.replace(/[+kKM]+$/, "");
    if (!groundText.includes(bareNum)) {
      matches.push(\`Large number \\\`\${m}\\\` not in brief or conversation\`);
    }
  }

  // 3. Bounded claims: "above 12%", "under 200 daily", "more than 14%".
  // These are claim-shapes that imply specific numeric grounding. Even
  // if the bare number is in the brief, the BOUND ("above") may be a
  // hallucination, but for now we just check the number matches.
  const boundedRe = /(?:above|over|under|below|less than|more than|around|approximately|roughly)\\s+\\d+(?:\\.\\d+)?(?:%|\\+)?/gi;
  for (const m of text.match(boundedRe) ?? []) {
    const numMatch = m.match(/\\d+(?:\\.\\d+)?/);
    if (numMatch && !groundText.includes(numMatch[0])) {
      matches.push(\`Bounded claim \\\`\${m}\\\` with number not in brief or conversation\`);
    }
  }

  // Dedupe and cap.
  const unique = Array.from(new Set(matches));
  return { found: unique.length > 0, matches: unique.slice(0, 5) };
}`;

const E4_MARKER = `function detectUngroundedClaims(`;

// ═════════════════════════════════════════════════════════════════
// Edit 5a — Add claimCheck variable in healing loop
// ═════════════════════════════════════════════════════════════════

const E5A_OLD = `    const metaCheck = detectMetaLanguage(current.message);

    logger.info(
      {
        prospect: ctx.prospect_name,
        iteration,
        metaFound: metaCheck.found,
        metaMatches: metaCheck.matches,
      },`;

const E5A_NEW = `    const metaCheck = detectMetaLanguage(current.message);

    // B-claim-grounding: deterministic post-check for hallucinated stats.
    const conversationFlat = (ctx.conversation ?? [])
      .map((row) => row.body ?? "")
      .join(" ");
    const claimCheck = detectUngroundedClaims(
      current.message,
      ctx.research_brief,
      conversationFlat,
    );

    logger.info(
      {
        prospect: ctx.prospect_name,
        iteration,
        metaFound: metaCheck.found,
        metaMatches: metaCheck.matches,
        claimFound: claimCheck.found,
        claimMatches: claimCheck.matches,
      },`;

const E5A_MARKER = `// B-claim-grounding: deterministic post-check for hallucinated stats.
    const conversationFlat`;

// ═════════════════════════════════════════════════════════════════
// Edit 5b — Append claim-grounding injection after meta-language injection
// ═════════════════════════════════════════════════════════════════

const E5B_OLD = `      critique.needs_rewrite = true;
      critique.overall = Math.min(critique.overall, 2);
    }

    // Track the best draft so we always have something to ship.`;

const E5B_NEW = `      critique.needs_rewrite = true;
      critique.overall = Math.min(critique.overall, 2);
    }

    // B-claim-grounding: inject deterministic claim-grounding findings
    // into the critique. Mirrors the meta-language injection above.
    if (claimCheck.found) {
      const briefVolume = ctx.research_brief?.calibratedDailyVolume ?? "(no brief volume)";
      const briefProofs = ctx.research_brief?.tangibleReasons?.slice(0, 2).join(" | ") ?? "(no brief proofs)";
      const claimIssue = \`UNGROUNDED CLAIMS DETECTED: the message contains numbers or claims that do not trace to the research brief or prior conversation. Findings: \${claimCheck.matches.join(" | ")}. Replace with brief-grounded numbers (calibrated_daily_volume: \${briefVolume}) or remove the unsupported claim entirely.\`;
      critique.issues = [claimIssue, ...critique.issues];
      critique.suggestions = [
        \`Replace ungrounded numbers with the brief's calibrated_daily_volume (\${briefVolume}) or with figures pulled directly from the brief's WHY/VALIDATION/HOW arguments.\`,
        \`Use brief proof points: \${briefProofs}\`,
        "If a number is not in the brief and not in the prior conversation, do NOT include it. Cut the claim or replace with a qualitative one.",
        ...critique.suggestions,
      ];
      critique.needs_rewrite = true;
      critique.overall = Math.min(critique.overall, 2);
    }

    // Track the best draft so we always have something to ship.`;

const E5B_MARKER = `// B-claim-grounding: inject deterministic claim-grounding findings`;

// ═════════════════════════════════════════════════════════════════
// applyEdit
// ═════════════════════════════════════════════════════════════════

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) { count++; idx += needle.length; }
  return count;
}

function applyEdit(label, source, oldStr, newStr, marker) {
  const m = countOccurrences(source, marker);
  const o = countOccurrences(source, oldStr);
  if (m > 0) { console.log(`[${label}] SKIP — already applied`); return { source, ok: true }; }
  if (o === 0) { console.log(`[${label}] NOOP — anchor not found`); return { source, ok: false }; }
  if (o > 1) { console.log(`[${label}] FAIL — anchor matched ${o} times`); return { source, ok: false }; }
  console.log(`[${label}] APPLY`);
  return { source: source.replace(oldStr, newStr), ok: true };
}

let source;
try { source = readFileSync(FILE, "utf8"); }
catch (err) { console.error(`[FATAL] cannot read ${FILE}: ${err.message}`); process.exit(2); }

for (const [label, oldStr, newStr, marker] of [
  ["detect-ungrounded-claims", E4_OLD,  E4_NEW,  E4_MARKER],
  ["healing-loop-claimcheck",  E5A_OLD, E5A_NEW, E5A_MARKER],
  ["healing-loop-injection",   E5B_OLD, E5B_NEW, E5B_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  fnDeclared: source.includes("function detectUngroundedClaims("),
  fnSignature: source.includes("conversationText?: string"),
  percentRegex: source.includes("matches.push(`Percentage "),
  largeNumRegex: source.includes("matches.push(`Large number "),
  boundedRegex: source.includes("matches.push(`Bounded claim "),
  claimCheckCall: source.includes("const claimCheck = detectUngroundedClaims("),
  conversationFlat: source.includes("const conversationFlat = (ctx.conversation ?? [])"),
  injectionBlock: source.includes("UNGROUNDED CLAIMS DETECTED:"),
  injectionUsesBrief: source.includes("ctx.research_brief?.calibratedDailyVolume"),
  injectionForcesRewrite: /if \(claimCheck\.found\)[\s\S]+?needs_rewrite = true;[\s\S]+?Math\.min\(critique\.overall, 2\)/.test(source),
};
console.log("[message-generator] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[message-generator] FAIL"); process.exit(4);
}
console.log("[message-generator] DONE");
