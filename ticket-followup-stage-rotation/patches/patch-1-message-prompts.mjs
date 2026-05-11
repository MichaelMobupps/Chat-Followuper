#!/usr/bin/env node
/**
 * Ticket followup-stage-rotation, patch 1/1: services/messagePrompts.ts
 *
 * Five atomic edits adding stage-rotation enforcement to the critic:
 *
 *   E1. modeSpecificScores: add "angle_freshness": 1-5 to the followuper
 *       critic score schema.
 *
 *   E2. additionalRule: add a hard rule that needs_rewrite MUST be true
 *       if angle_freshness < 3 AND stage >= 2. Stage 1 is exempt because
 *       there are no prior followups to compare against.
 *
 *   E3. Critic system prompt body: add rule 12 (ANGLE FRESHNESS / STAGE
 *       ROTATION) to the followuper branch of the rule list. Defines how
 *       the critic should score angle_freshness by comparing against the
 *       PREVIOUS FOLLOWUPS BY STAGE block.
 *
 *   E4a. getCriticUserPrompt: declare a previousFollowupsBlock that
 *       surfaces prior followups labeled by stage. The data already
 *       flowed into ctx.previous_followups (set in messageGenerator at
 *       line 989), but was not exposed to the critic prompt; the critic
 *       only saw flattenConversation output which mixes outbound +
 *       inbound and is not labeled by stage.
 *
 *   E4b. getCriticUserPrompt return template: inject the new block
 *       between briefBlock and nativenessCriticBlock.
 *
 * Background: the writer's user prompt has rotation guidance
 * (stage 1 = new insight, stage 2 = competitor move, stage 3 = direct
 * + easy out, stage 4+ = fresh angles) but the critic could not enforce
 * it because it did not have visibility into what prior stages had
 * already said. This ticket closes that loop.
 *
 * Files modified: messagePrompts.ts only. No messageGenerator changes
 * required because previous_followups already flows into ctx; the gap
 * was purely on the prompt-surfacing side.
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
// Edit 1 - modeSpecificScores: add angle_freshness
// ═════════════════════════════════════════════════════════════════

const E1_OLD = `  const modeSpecificScores = mode === "followuper"
    ? \`"channel_register_match": 1-5, "context_grounding": 1-5, "followup_ack": 1-5,\``;

const E1_NEW = `  const modeSpecificScores = mode === "followuper"
    ? \`"channel_register_match": 1-5, "context_grounding": 1-5, "followup_ack": 1-5, "angle_freshness": 1-5,\``;

const E1_MARKER = `"followup_ack": 1-5, "angle_freshness": 1-5`;

// ═════════════════════════════════════════════════════════════════
// Edit 2 - additionalRule: add hard rule for angle_freshness
// ═════════════════════════════════════════════════════════════════

const E2_OLD = `  const additionalRule = mode === "followuper"
    ? \`- needs_rewrite MUST be true if context_grounding < 4 (any unsupported claim must be cut). This is the single most important check in followuper mode.\``;

const E2_NEW = `  const additionalRule = mode === "followuper"
    ? \`- needs_rewrite MUST be true if context_grounding < 4 (any unsupported claim must be cut). This is the single most important check in followuper mode.
- needs_rewrite MUST be true if angle_freshness < 3 AND stage >= 2 (the message must bring a fresh angle relative to prior followups in the thread; stage 1 is exempt because there are no prior followups to compare against).\``;

const E2_MARKER = `needs_rewrite MUST be true if angle_freshness < 3 AND stage >= 2`;

// ═════════════════════════════════════════════════════════════════
// Edit 3 - Critic system prompt: add rule 12 in followuper branch
// ═════════════════════════════════════════════════════════════════

const E3_OLD = `11. FOLLOWUP ACKNOWLEDGMENT. Within sentence 1, does the message explicitly reference the prior thread by a SPECIFIC topic name? Vague "following up" is not enough; specific "following up on the Lazada CPS angle" is what we want.\` : \`10. NO SELF-REFERENTIAL WHY.`;

const E3_NEW = `11. FOLLOWUP ACKNOWLEDGMENT. Within sentence 1, does the message explicitly reference the prior thread by a SPECIFIC topic name? Vague "following up" is not enough; specific "following up on the Lazada CPS angle" is what we want.

12. ANGLE FRESHNESS / STAGE ROTATION (followuper-only, evaluated when STAGE is 2 or higher). The current followup must bring a fresh angle relative to prior followups in the same thread. Stage strategy rotation: stage 1 = new insight or data point, stage 2 = competitor or market move (shift angle), stage 3 = direct and easy out, stage 4+ = continue rotating fresh angles. Compare the current draft's main value point, hook, and competitor reference against the PREVIOUS FOLLOWUPS BY STAGE block in the user prompt. If the draft repeats a prior stage's angle, hook, value-point construction, or competitor reference, score angle_freshness 1-2 and demand rewrite. Stage 1 has no prior followups so angle_freshness defaults to 5.\` : \`10. NO SELF-REFERENTIAL WHY.`;

const E3_MARKER = `12. ANGLE FRESHNESS / STAGE ROTATION`;

// ═════════════════════════════════════════════════════════════════
// Edit 4a - getCriticUserPrompt: declare previousFollowupsBlock
// ═════════════════════════════════════════════════════════════════
//
// Anchor: the nativenessCriticBlock declaration line. This line is
// UNIQUE in the file (nativenessCriticBlock is critic-only;
// rewriter uses nativenessBlock from buildNativenessBlock). The
// declaration is also stable across releases.

const E4A_OLD = `  const nativenessCriticBlock = buildCriticNativenessBlock(ctx.language);`;

const E4A_NEW = `  const nativenessCriticBlock = buildCriticNativenessBlock(ctx.language);

  // B-followup-stage-rotation: surface prior followups by stage so the
  // critic can score angle_freshness without having to reverse-engineer
  // stage boundaries from the flattened conversation (which mixes
  // outbound + inbound and is not stage-labeled).
  const previousFollowupsBlock = (ctx.mode === "followuper" && ctx.previous_followups && ctx.previous_followups.length > 0)
    ? \`\\nPREVIOUS FOLLOWUPS BY STAGE (the current draft must bring a fresh angle vs these):\\n---BEGIN PREVIOUS FOLLOWUPS---\\n\${ctx.previous_followups.map((pf) => \`--- Stage \${pf.stage} ---\\n\${pf.body}\`).join("\\n\\n")}\\n---END PREVIOUS FOLLOWUPS---\\n\`
    : "";`;

const E4A_MARKER = `// B-followup-stage-rotation: surface prior followups by stage`;

// ═════════════════════════════════════════════════════════════════
// Edit 4b - getCriticUserPrompt return template: inject the block
// ═════════════════════════════════════════════════════════════════
//
// Anchor: the unique triple of conversationBlock + briefBlock +
// nativenessCriticBlock injection in the return template. The
// `nativenessCriticBlock` variable name disambiguates this from the
// rewriter's similar block (which uses `nativenessBlock`).

const E4B_OLD = `\${conversationBlock}
\${briefBlock}
\${nativenessCriticBlock ? \`\\n\${nativenessCriticBlock}\\n\` : ""}`;

const E4B_NEW = `\${conversationBlock}
\${briefBlock}
\${previousFollowupsBlock}
\${nativenessCriticBlock ? \`\\n\${nativenessCriticBlock}\\n\` : ""}`;

const E4B_MARKER = `\${previousFollowupsBlock}`;

// ═════════════════════════════════════════════════════════════════
// applyEdit helper
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
  if (m > 0) { console.log(`[${label}] SKIP - already applied`); return { source, ok: true }; }
  if (o === 0) { console.log(`[${label}] NOOP - anchor not found`); return { source, ok: false }; }
  if (o > 1) { console.log(`[${label}] FAIL - anchor matched ${o} times`); return { source, ok: false }; }
  console.log(`[${label}] APPLY`);
  return { source: source.replace(oldStr, newStr), ok: true };
}

let source;
try { source = readFileSync(FILE, "utf8"); }
catch (err) { console.error(`[FATAL] cannot read ${FILE}: ${err.message}`); process.exit(2); }

for (const [label, oldStr, newStr, marker] of [
  ["mode-scores-add-axis",       E1_OLD, E1_NEW, E1_MARKER],
  ["mode-rule-add-hard",          E2_OLD, E2_NEW, E2_MARKER],
  ["critic-rules-add-12",        E3_OLD, E3_NEW, E3_MARKER],
  ["critic-prompt-declare-block",E4A_OLD, E4A_NEW, E4A_MARKER],
  ["critic-prompt-inject-block", E4B_OLD, E4B_NEW, E4B_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  // Edit 1: score axis added
  angleFreshnessAxisAdded:    source.includes(`"followup_ack": 1-5, "angle_freshness": 1-5,`),

  // Edit 2: hard rule added
  hardRuleAdded:              source.includes(`needs_rewrite MUST be true if angle_freshness < 3 AND stage >= 2`),
  stage1ExemptNoted:          source.includes(`stage 1 is exempt because there are no prior followups`),

  // Edit 3: rule 12 added
  rule12HeaderPresent:        source.includes(`12. ANGLE FRESHNESS / STAGE ROTATION`),
  rule12StageRotationStrat:   source.includes(`stage 1 = new insight or data point, stage 2 = competitor or market move`),
  rule12RefsPreviousBlock:    source.includes(`PREVIOUS FOLLOWUPS BY STAGE block in the user prompt`),
  rule12Stage1Default:        source.includes(`Stage 1 has no prior followups so angle_freshness defaults to 5`),

  // Edit 4a: declaration added
  previousBlockDeclared:      source.includes(`const previousFollowupsBlock = (ctx.mode === "followuper" && ctx.previous_followups && ctx.previous_followups.length > 0)`),
  blockCommentPresent:        source.includes(`// B-followup-stage-rotation: surface prior followups by stage`),
  blockUsesStageBody:         source.includes(`--- Stage \${pf.stage} ---`),

  // Edit 4b: injected into template
  previousBlockInjected:      source.includes(`\${conversationBlock}\n\${briefBlock}\n\${previousFollowupsBlock}\n\${nativenessCriticBlock`),

  // Untouched checks
  prospectorRulesUntouched:   source.includes(`10. NO SELF-REFERENTIAL WHY.`),
  prospectorRule12Untouched:  source.includes(`12. VERTICAL-NATIVE TERMINOLOGY`),
  rule10ContextGrounding:     source.includes(`10. CONTEXT GROUNDING (followuper-only, critical)`),
  rule11FollowupAck:          source.includes(`11. FOLLOWUP ACKNOWLEDGMENT`),
  briefBlockUntouched:        source.includes(`Calibrated daily volume: \${ctx.research_brief.calibratedDailyVolume}`),
  nativenessCriticUntouched:  source.includes(`buildCriticNativenessBlock(ctx.language)`),
  previousFollowupTypeIntact: source.includes(`previous_followups?: PreviousFollowup[];`),
  criticIssueTypeIntact:      source.includes(`export interface CriticIssue {`),

  // Old prospector branch still intact (Edit 3 should not have touched it)
  prospector10Intact:         source.includes(`The first content sentence after the greeting must NOT start with`),
  prospector11Intact:         source.includes(`11. COUNTRY-MATCHED REFERENCES`),

  // The rewriter prompt (different function) should be untouched
  rewriterPromptIntact:       source.includes(`export function getRewriterSystemPrompt`),
  rewriterUserIntact:         source.includes(`export function getRewriterUserPrompt`),
};
console.log("[message-prompts-stage-rotation] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[message-prompts-stage-rotation] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[message-prompts-stage-rotation] DONE");
