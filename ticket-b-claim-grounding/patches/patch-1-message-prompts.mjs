#!/usr/bin/env node
/**
 * Ticket B-claim-grounding — patch 1/2: services/messagePrompts.ts
 *
 * Five atomic edits:
 *   1a. Critic system prompt — insert CLAIM GROUNDING rule between the
 *       mode-specific block and channelCriticBlock. New axis is the
 *       highest-priority check (every numeric claim and competitor
 *       name in the draft must trace to the research brief).
 *   1b. Output scores schema — add "claim_grounding": 1-5.
 *   1c. needs_rewrite rules — add "claim_grounding < 4" forces rewrite.
 *   2.  getCriticUserPrompt — inject briefBlock so critic can verify
 *       grounding instead of guessing.
 *   3.  getRewriterUserPrompt — inject briefBlock so rewriter does not
 *       drift into new hallucinations while fixing other issues.
 *
 * Idempotent. All anchors em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/messagePrompts.ts",
);

// ═════════════════════════════════════════════════════════════════
// Edit 1a — Insert CLAIM GROUNDING rule before channelCriticBlock
// ═════════════════════════════════════════════════════════════════

const E1A_OLD = `revenue-event language.\`}

\${channelCriticBlock}`;

const E1A_NEW = `revenue-event language.\`}

CLAIM GROUNDING (CRITICAL, applies to both modes, evaluated AFTER all the above).
   Every concrete number, percentage, volume figure, and competitor name in the draft MUST appear in the RESEARCH BRIEF supplied in the user message. Hallucinations to flag:
   - Percentages not in the brief (e.g. "14% first-order completion" when no 14% appears in any brief field).
   - Volume claims that do not match the brief's calibrated daily volume.
   - Competitor names outside the brief's final_competitors list.
   - Specific industry benchmarks the brief does not supply.
   - Bounded ranges ("above 12%", "under 200 daily") whose numbers are not in the brief.
   If the draft is in followuper mode and the brief is partial, claims may also ground in the prior conversation; numbers that appear in NEITHER brief NOR conversation are hallucinations.
   If claim_grounding < 4, needs_rewrite MUST be true. This is a critical-tier check.

\${channelCriticBlock}`;

const E1A_MARKER = `CLAIM GROUNDING (CRITICAL, applies to both modes`;

// ═════════════════════════════════════════════════════════════════
// Edit 1b — Add "claim_grounding": 1-5 to scores schema
// ═════════════════════════════════════════════════════════════════

const E1B_OLD = `"no_meta_language": 1-5, "language_match"`;
const E1B_NEW = `"no_meta_language": 1-5, "claim_grounding": 1-5, "language_match"`;
const E1B_MARKER = `"claim_grounding": 1-5`;

// ═════════════════════════════════════════════════════════════════
// Edit 1c — Add needs_rewrite rule for claim_grounding
// ═════════════════════════════════════════════════════════════════

const E1C_OLD = `- needs_rewrite MUST be true if no_meta_language < 4.
- needs_rewrite MUST be true if language_match < 4.`;

const E1C_NEW = `- needs_rewrite MUST be true if no_meta_language < 4.
- needs_rewrite MUST be true if claim_grounding < 4.
- needs_rewrite MUST be true if language_match < 4.`;

const E1C_MARKER = `- needs_rewrite MUST be true if claim_grounding < 4.`;

// ═════════════════════════════════════════════════════════════════
// Edit 2 — Inject briefBlock in getCriticUserPrompt
// ═════════════════════════════════════════════════════════════════

const E2_OLD = `  const conversationBlock = flatConversation
    ? \`\\nPRIOR CONVERSATION (the message must be grounded in this):\\n---BEGIN CONVERSATION---\\n\${flatConversation}\\n---END CONVERSATION---\\n\`
    : "";

  const nativenessCriticBlock = buildCriticNativenessBlock(ctx.language);

  const verticalLine = ctx.sub_vertical
    ? \`\${ctx.vertical} / \${ctx.sub_vertical}\`
    : ctx.vertical;

  return \`Evaluate this \${ctx.channel} \${ctx.mode} message:

LANGUAGE: \${ctx.language} (the message must be entirely in this language)
PROSPECT: \${ctx.prospect_name || "(no name)"} at \${ctx.company || "(no company)"}
COUNTRY: \${ctx.country || "not specified"}
VERTICAL: \${verticalLine}
PRODUCT: \${ctx.product}
\${ctx.mode === "followuper" ? \`STAGE: \${ctx.stage ?? 1} (\${ctx.days_since_first ?? 0} days since first contact)\` : ""}
\${conversationBlock}
\${nativenessCriticBlock ? \`\\n\${nativenessCriticBlock}\\n\` : ""}
DRAFT TO EVALUATE:`;

const E2_NEW = `  const conversationBlock = flatConversation
    ? \`\\nPRIOR CONVERSATION (the message must be grounded in this):\\n---BEGIN CONVERSATION---\\n\${flatConversation}\\n---END CONVERSATION---\\n\`
    : "";

  const nativenessCriticBlock = buildCriticNativenessBlock(ctx.language);

  // B-claim-grounding: pass research brief into critic so it can
  // verify numeric claims and competitor names trace to brief contents
  // instead of guessing or trusting the writer.
  const briefBlock = ctx.research_brief
    ? \`\\nRESEARCH BRIEF (numeric claims and competitor names in the draft MUST trace to this):
- Calibrated daily volume: \${ctx.research_brief.calibratedDailyVolume}
- Primary conversion event: \${ctx.research_brief.primaryEvent}
- Peer brands the writer may name: \${ctx.research_brief.finalCompetitors.join(", ")}
- WHY argument seed: \${ctx.research_brief.whyArgument}
- VALIDATION argument seed: \${ctx.research_brief.validationArgument}
- HOW argument seed: \${ctx.research_brief.howArgument}
- Proof points pool: \${ctx.research_brief.tangibleReasons.join(" | ")}
- Market context: \${ctx.research_brief.marketContext}
- Prospect-specific hook: \${ctx.research_brief.prospectSpecificHook}
\`
    : "";

  const verticalLine = ctx.sub_vertical
    ? \`\${ctx.vertical} / \${ctx.sub_vertical}\`
    : ctx.vertical;

  return \`Evaluate this \${ctx.channel} \${ctx.mode} message:

LANGUAGE: \${ctx.language} (the message must be entirely in this language)
PROSPECT: \${ctx.prospect_name || "(no name)"} at \${ctx.company || "(no company)"}
COUNTRY: \${ctx.country || "not specified"}
VERTICAL: \${verticalLine}
PRODUCT: \${ctx.product}
\${ctx.mode === "followuper" ? \`STAGE: \${ctx.stage ?? 1} (\${ctx.days_since_first ?? 0} days since first contact)\` : ""}
\${conversationBlock}
\${briefBlock}
\${nativenessCriticBlock ? \`\\n\${nativenessCriticBlock}\\n\` : ""}
DRAFT TO EVALUATE:`;

const E2_MARKER = `// B-claim-grounding: pass research brief into critic`;

// ═════════════════════════════════════════════════════════════════
// Edit 3 — Inject briefBlock in getRewriterUserPrompt
// ═════════════════════════════════════════════════════════════════

const E3_OLD = `  const flatConversation = flattenConversation(ctx.conversation);
  const conversationBlock = flatConversation
    ? \`\\nPRIOR CONVERSATION (the rewrite must be grounded in this):\\n---BEGIN CONVERSATION---\\n\${flatConversation}\\n---END CONVERSATION---\\n\`
    : "";

  const nativenessBlock = buildNativenessBlock(ctx.language);
  const hasName = isUsableName(ctx.prospect_name);
  const greetingBlock = ctx.mode === "prospector" ? buildGreetingBlock(ctx.language, hasName) : "";

  const verticalLine = ctx.sub_vertical
    ? \`\${ctx.vertical} / \${ctx.sub_vertical}\`
    : ctx.vertical;

  return \`Rewrite this \${ctx.channel} \${ctx.mode} message based on critic feedback:`;

const E3_NEW = `  const flatConversation = flattenConversation(ctx.conversation);
  const conversationBlock = flatConversation
    ? \`\\nPRIOR CONVERSATION (the rewrite must be grounded in this):\\n---BEGIN CONVERSATION---\\n\${flatConversation}\\n---END CONVERSATION---\\n\`
    : "";

  const nativenessBlock = buildNativenessBlock(ctx.language);
  const hasName = isUsableName(ctx.prospect_name);
  const greetingBlock = ctx.mode === "prospector" ? buildGreetingBlock(ctx.language, hasName) : "";

  // B-claim-grounding: pass research brief into rewriter so the rewrite
  // does not drift into new hallucinations while fixing other issues.
  const briefBlock = ctx.research_brief
    ? \`\\nRESEARCH BRIEF (the rewrite MUST keep every numeric claim and competitor name grounded in this):
- Calibrated daily volume: \${ctx.research_brief.calibratedDailyVolume}
- Primary conversion event: \${ctx.research_brief.primaryEvent}
- Peer brands you may name: \${ctx.research_brief.finalCompetitors.join(", ")}
- WHY argument seed: \${ctx.research_brief.whyArgument}
- VALIDATION argument seed: \${ctx.research_brief.validationArgument}
- HOW argument seed: \${ctx.research_brief.howArgument}
- Proof points pool: \${ctx.research_brief.tangibleReasons.join(" | ")}
- Market context: \${ctx.research_brief.marketContext}
- Prospect-specific hook: \${ctx.research_brief.prospectSpecificHook}
\`
    : "";

  const verticalLine = ctx.sub_vertical
    ? \`\${ctx.vertical} / \${ctx.sub_vertical}\`
    : ctx.vertical;

  return \`Rewrite this \${ctx.channel} \${ctx.mode} message based on critic feedback:`;

const E3_MARKER = `// B-claim-grounding: pass research brief into rewriter`;

// ═════════════════════════════════════════════════════════════════
// Edit 3b — Reference briefBlock in the rewriter return template
// ═════════════════════════════════════════════════════════════════

const E3B_OLD = `\${conversationBlock}
\${greetingBlock ? \`\\n\${greetingBlock}\\n\` : ""}
\${nativenessBlock ? \`\\n\${nativenessBlock}\\n\` : ""}
CURRENT DRAFT:`;

const E3B_NEW = `\${conversationBlock}
\${briefBlock}
\${greetingBlock ? \`\\n\${greetingBlock}\\n\` : ""}
\${nativenessBlock ? \`\\n\${nativenessBlock}\\n\` : ""}
CURRENT DRAFT:`;

const E3B_MARKER = `\${briefBlock}
\${greetingBlock ? \`\\n\${greetingBlock}\\n\` : ""}`;

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
  ["claim-grounding-rule",  E1A_OLD, E1A_NEW, E1A_MARKER],
  ["scores-axis",           E1B_OLD, E1B_NEW, E1B_MARKER],
  ["needs-rewrite-rule",    E1C_OLD, E1C_NEW, E1C_MARKER],
  ["critic-brief-block",    E2_OLD,  E2_NEW,  E2_MARKER],
  ["rewriter-brief-block",  E3_OLD,  E3_NEW,  E3_MARKER],
  ["rewriter-template-ref", E3B_OLD, E3B_NEW, E3B_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  claimRule: source.includes("CLAIM GROUNDING (CRITICAL, applies to both modes"),
  scoresAxis: source.includes(`"claim_grounding": 1-5, "language_match"`),
  needsRewrite: source.includes(`- needs_rewrite MUST be true if claim_grounding < 4.`),
  criticBriefDef: source.includes(`// B-claim-grounding: pass research brief into critic`),
  criticBriefRef: /\$\{briefBlock\}\s*\n\$\{nativenessCriticBlock/.test(source),
  rewriterBriefDef: source.includes(`// B-claim-grounding: pass research brief into rewriter`),
  rewriterBriefRef: /\$\{briefBlock\}\s*\n\$\{greetingBlock/.test(source),
};
console.log("[message-prompts] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[message-prompts] FAIL"); process.exit(4);
}
console.log("[message-prompts] DONE");
