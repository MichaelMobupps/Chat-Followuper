/**
 * WIRING PATCHES for messageGenerator.ts and messagePrompts.ts
 *
 * These patches connect the new doctrine matrix and research stage to the
 * existing Group B message generator. After applying:
 *   - Message draft model upgrades from Sonnet 4.6 to Opus 4.7
 *     (matching Email Prospector pattern: Opus draft + Opus critic + Sonnet rewrite)
 *   - System prompt receives the per-sub-vertical vocabulary block
 *   - System prompt receives the ProspectBrief (peers, market context,
 *     proof points, native-language argument variants) when available
 *   - After generation, the firewall pass runs to catch wrong-vertical
 *     terminology leaks
 *
 * APPLY ORDER:
 *   1. Apply patch A (messagePrompts.ts) — adds the brief fields to
 *      MessageContext, injects vocabulary block + brief into system prompt
 *   2. Apply patch B (messageGenerator.ts) — switches draft model to Opus,
 *      consumes ProspectBrief, runs firewall pass after final cleanup
 *
 * After applying both: typecheck the workspace.
 */

// ═══════════════════════════════════════════════════════════════════════
// PATCH A — artifacts/api-server/src/services/messagePrompts.ts
// ═══════════════════════════════════════════════════════════════════════

export const PATCH_A_MESSAGE_PROMPTS = `
# Patch A: messagePrompts.ts

## A.1 — Add imports at the top of the file (after existing imports)

\`\`\`ts
import { buildVocabularyBlock } from "../lib/doctrine/eventCatalog";
import { isValidSubVertical } from "../lib/doctrine/taxonomy";
import type { ProspectBrief } from "./prospectResearch";
\`\`\`

## A.2 — Extend the MessageContext interface

Add these optional fields to the existing MessageContext interface:

\`\`\`ts
  /**
   * The structured research brief produced by the research stage at
   * seed time. When present, the writer system prompt is enriched with
   * peers, market context, proof points, and (for non-English) native-
   * language argument variants. When absent, the writer falls back to
   * the basic prompt — but this should never happen in production
   * because seed flow REQUIRES research to succeed.
   */
  research_brief?: ProspectBrief;
\`\`\`

## A.3 — Build a research-brief block helper

Add this helper function near the top of the file (after the GREETING_TABLE
section but before the Helpers section):

\`\`\`ts
/**
 * Builds the prospect-research block injected into the system prompt.
 * Lists the researched peers, market context, proof points, and primary
 * event the writer should ground every claim in.
 *
 * Returns empty string if no brief is provided (writer falls back to basic
 * prompt; this case should not happen in production).
 */
function buildResearchBriefBlock(brief: ProspectBrief | undefined, language: string): string {
  if (!brief) return "";

  const isNonEnglish = (language || "").toLowerCase() !== "en";
  const peers = brief.finalCompetitors.join(", ");
  const proofs = brief.tangibleReasons.map((r, i) => \`  \${i + 1}. \${r}\`).join("\\n");

  let block = \`PROSPECT RESEARCH BRIEF (the writer must ground every claim in this brief; do NOT introduce facts, peer brands, volumes, or events not listed here):

- Determined market: \${brief.determinedCountry}
- Determined scale tier: \${brief.determinedScaleTier} (\${brief.scaleRationale})
- Calibrated daily volume MobUpps can deliver: \${brief.calibratedDailyVolume} per day
- Primary conversion event: \${brief.primaryEvent}
- Alternative events that may be referenced: \${brief.alternativeEvents.join(", ")}
- Peer brands in the same market (use ONE if natural — these are the ONLY peers you may name): \${peers}
- Subsidiary check: \${brief.subsidiaryCheckNote}
- Market context: \${brief.marketContext}
- Prospect-specific hook: \${brief.prospectSpecificHook}
- Likely growth challenge for this prospect: \${brief.prospectPrimaryGrowthProblem}

- WHY argument seed: \${brief.whyArgument}
- VALIDATION argument seed: \${brief.validationArgument}
- HOW argument seed: \${brief.howArgument}

- Available proof points (pick 1-2 to weave in naturally; do NOT list more than 2):
\${proofs}\`;

  if (isNonEnglish && (brief.whyArgumentNative || brief.validationArgumentNative || brief.howArgumentNative)) {
    block += \`\\n\\nNATIVE-LANGUAGE ARGUMENT VARIANTS (use these as the basis for composing the message; they were already drafted in \${language}):\`;
    if (brief.whyArgumentNative) block += \`\\n- WHY (\${language}): \${brief.whyArgumentNative}\`;
    if (brief.validationArgumentNative) block += \`\\n- VALIDATION (\${language}): \${brief.validationArgumentNative}\`;
    if (brief.howArgumentNative) block += \`\\n- HOW (\${language}): \${brief.howArgumentNative}\`;
  }

  return block;
}
\`\`\`

## A.4 — Wire the vocabulary + brief blocks into the system prompts

In \`getProspectorSystemPrompt(ctx)\`:

Add this block after the channelRules variable and before the existing return statement:

\`\`\`ts
  const vocabularyBlock = ctx.sub_vertical && isValidSubVertical(ctx.sub_vertical)
    ? buildVocabularyBlock(ctx.sub_vertical)
    : "";
  const researchBlock = buildResearchBriefBlock(ctx.research_brief, ctx.language);
\`\`\`

Then modify the returned template string. Find this line in the prompt:

\`\`\`
\${channelRules}
\`\`\`

And add the new blocks immediately after it:

\`\`\`
\${channelRules}

\${vocabularyBlock ? \`\\n\${vocabularyBlock}\\n\` : ""}\${researchBlock ? \`\\n\${researchBlock}\\n\` : ""}
\`\`\`

Apply the same change to \`getFollowuperSystemPrompt(ctx)\` — same vocabularyBlock + researchBlock injection in the same position.

## A.5 — That's it for patch A. Run typecheck.
`;

// ═══════════════════════════════════════════════════════════════════════
// PATCH B — artifacts/api-server/src/services/messageGenerator.ts
// ═══════════════════════════════════════════════════════════════════════

export const PATCH_B_MESSAGE_GENERATOR = `
# Patch B: messageGenerator.ts

## B.1 — Add imports at the top of the file (after existing imports)

\`\`\`ts
import { applyFirewall } from "../lib/doctrine/firewall";
import type { ProspectBrief } from "./prospectResearch";
\`\`\`

## B.2 — Switch DRAFT_MODEL from Sonnet to Opus

Find this constant near the top:

\`\`\`ts
const DRAFT_MODEL = "claude-sonnet-4-6";
\`\`\`

Change to:

\`\`\`ts
const DRAFT_MODEL = "claude-opus-4-7";
\`\`\`

This matches the Email Prospector exactly: Opus draft + Opus critic +
Sonnet rewriter. Cost goes up; doctrine quality matches Prospector.

## B.3 — Add researchBrief to GenerateChatMessageOptions

Add this field to the existing \`GenerateChatMessageOptions\` interface:

\`\`\`ts
  /**
   * The structured research brief from the seed-time research stage. When
   * provided, the message generator gives the writer rich context (peers,
   * market context, proof points, native-language argument variants).
   * Should always be provided in production; absent only in test scenarios.
   */
  researchBrief?: ProspectBrief;
\`\`\`

## B.4 — Pass researchBrief into MessageContext

In the \`generateChatMessage\` function, where MessageContext is built, add
\`research_brief\` to the context object. Find the MessageContext build:

\`\`\`ts
  let ctx: MessageContext = {
    prospect_name: opts.prospect.prospectName || "",
    // ... existing fields ...
    previous_followups: opts.previousFollowups,
  };
\`\`\`

Add a new field at the end:

\`\`\`ts
    research_brief: opts.researchBrief,
\`\`\`

## B.5 — Wire the firewall pass into finalizeMessage

Find the \`finalizeMessage\` function:

\`\`\`ts
function finalizeMessage(msg: { subject: string; message: string }): { subject: string; message: string } {
  let message = stripBracketedNotes(msg.message);
  message = applyDeterministicFixes(message);
  const humanized = humanizeMessage({ subject: msg.subject, message });
  return humanized;
}
\`\`\`

Replace it with this version that takes a sub_vertical for firewall lookup:

\`\`\`ts
function finalizeMessage(
  msg: { subject: string; message: string },
  subVertical: string | null,
): { subject: string; message: string } {
  let message = stripBracketedNotes(msg.message);
  message = applyDeterministicFixes(message);

  // Vertical firewall — replace cross-vertical terminology leaks.
  if (subVertical) {
    try {
      const { cleaned, replacements } = applyFirewall(message, subVertical);
      if (replacements.length > 0) {
        logger.info(
          { subVertical, replacements: replacements.map((r) => \`\${r.blocked}→\${r.replacement} (×\${r.occurrences})\`) },
          "Firewall replaced cross-vertical terms",
        );
      }
      message = cleaned;
    } catch (err) {
      logger.warn({ err: String(err), subVertical }, "Firewall pass failed; skipping");
    }
  }

  const humanized = humanizeMessage({ subject: msg.subject, message });
  return humanized;
}
\`\`\`

## B.6 — Update every call site of finalizeMessage

Search the file for \`finalizeMessage(\`. There are 4-5 call sites in the
generator (in the iteration loop and in the bail-out paths). Each one
currently looks like:

\`\`\`ts
const finalized = finalizeMessage(current);
\`\`\`

or

\`\`\`ts
const finalized = finalizeMessage(best);
\`\`\`

Update each to pass \`ctx.sub_vertical\`:

\`\`\`ts
const finalized = finalizeMessage(current, ctx.sub_vertical);
\`\`\`

\`\`\`ts
const finalized = finalizeMessage(best, ctx.sub_vertical);
\`\`\`

## B.7 — Run typecheck.
`;
