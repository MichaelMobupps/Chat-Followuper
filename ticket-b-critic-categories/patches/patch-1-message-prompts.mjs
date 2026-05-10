#!/usr/bin/env node
/**
 * Ticket B-critic-categories — patch 1/2: services/messagePrompts.ts
 *
 * Four atomic edits:
 *   1a. Add CriticCategory + CriticIssue types after PreviousFollowup.
 *       Ported from email Prospector's CriticIssue dataclass; eight
 *       categories matching the email taxonomy.
 *   1b. Update critic system prompt OUTPUT FORMAT — replace the flat
 *       string array of issues with the structured object format,
 *       add CATEGORY DEFINITIONS and SEVERITY definitions block.
 *   1c. Update getRewriterUserPrompt signature — change `issues:
 *       string[]` to `issues: CriticIssue[]`.
 *   1d. Update getRewriterUserPrompt body — format issues with the
 *       email Prospector's numbered-block style (idx. [SEVERITY]
 *       category / Problem / Reason / Suggested).
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
// Edit 1a — Add CriticCategory + CriticIssue types
// ═════════════════════════════════════════════════════════════════
//
// Insertion point: right after PreviousFollowup interface (which is a
// stable location near the other shared types). Anchor on the entire
// PreviousFollowup interface declaration.

const E1A_OLD = `export interface PreviousFollowup {
  stage: number;
  body: string;
}`;

const E1A_NEW = `export interface PreviousFollowup {
  stage: number;
  body: string;
}

/**
 * The eight critic-issue categories. Ported from email Prospector's
 * s6_critic.py taxonomy. Every issue the critic emits MUST fall into
 * one of these eight buckets.
 */
export type CriticCategory =
  | "machine_artifact"
  | "term_leakage"
  | "event_mismatch"
  | "unnatural_phrasing"
  | "translation_artifact"
  | "vertical_incoherence"
  | "formatting_leak"
  | "why_structure_violation";

/**
 * A single critic finding. Replaces the prior free-text string in
 * CriticResult.issues so the rewriter (and downstream telemetry) can
 * prioritise by severity and category.
 */
export interface CriticIssue {
  /** Exact problematic text from the message, or a short description. */
  excerpt: string;
  /** What is wrong with this text. */
  reason: string;
  /** Which of the eight categories this falls into. */
  category: CriticCategory;
  /** "block" forces needs_rewrite=true; "warn" is nice-to-fix. */
  severity: "block" | "warn";
  /** Optional replacement text or rephrasing. */
  suggested_fix?: string;
}`;

const E1A_MARKER = `export type CriticCategory =`;

// ═════════════════════════════════════════════════════════════════
// Edit 1b — Update critic system prompt OUTPUT FORMAT
// ═════════════════════════════════════════════════════════════════
//
// Anchor: the issues / suggestions / needs_rewrite lines plus the
// closing }. Em-dash-free.

const E1B_OLD = `  "overall": 1-5,
  "issues": ["list of specific problems with quoted phrases from the message"],
  "suggestions": ["list of specific concrete rewrites"],
  "needs_rewrite": true/false
}`;

const E1B_NEW = `  "overall": 1-5,
  "issues": [
    {
      "excerpt": "exact problematic text from the message (or short description if not literal)",
      "reason": "what is wrong with this text",
      "category": "machine_artifact | term_leakage | event_mismatch | unnatural_phrasing | translation_artifact | vertical_incoherence | formatting_leak | why_structure_violation",
      "severity": "block | warn",
      "suggested_fix": "optional replacement text"
    }
  ],
  "suggestions": ["list of specific concrete rewrites for issues that need them"],
  "needs_rewrite": true/false
}

ISSUE CATEGORY DEFINITIONS:
- machine_artifact: underscore tokens (word_word), placeholders ([volume], [metric], {event}), raw config keys, meta-language verbs (citing, referencing, mentioning, noting, highlighting), bracketed editorial notes, hallucinated stats not traceable to the research brief
- term_leakage: wrong vertical jargon (subscription terms in non-subscription verticals, gaming terms in non-gaming, fintech terms in commerce)
- event_mismatch: wrong primary conversion event for the prospect's business model (e.g. "first deposit" used for an e-commerce app)
- unnatural_phrasing: LLM-isms (delve, leverage, seamless, synergy), robotic compound structure, hollow corporate phrasing
- translation_artifact: script-mixing in non-Latin languages (e.g. Latin word adjacent to CJK characters), English-derived word order in target language, inconsistent code-switching, translated-manifesto tone
- vertical_incoherence: mechanics described do not match the vertical, wrong competitor references for the market
- formatting_leak: markdown markers (** __), em dashes, bullets, spelled-out percentages (12 percent instead of 12%)
- why_structure_violation: prospector mode opens with self-referential We/Our/At MobUpps/I'm reaching out; followuper mode missing acknowledgment of the prior thread topic

ISSUE SEVERITY:
- "block": must be fixed before shipping. A single block-severity issue forces needs_rewrite=true.
- "warn": should be fixed but does not by itself block shipping.

If ANY issue has severity="block", needs_rewrite MUST be true.`;

const E1B_MARKER = `ISSUE CATEGORY DEFINITIONS:`;

// ═════════════════════════════════════════════════════════════════
// Edit 1c — Update getRewriterUserPrompt signature
// ═════════════════════════════════════════════════════════════════

const E1C_OLD = `export function getRewriterUserPrompt(
  ctx: MessageContext,
  draft: { subject: string; message: string },
  critique: { issues: string[]; suggestions: string[] },
): string {`;

const E1C_NEW = `export function getRewriterUserPrompt(
  ctx: MessageContext,
  draft: { subject: string; message: string },
  critique: { issues: CriticIssue[]; suggestions: string[] },
): string {`;

const E1C_MARKER = `critique: { issues: CriticIssue[]; suggestions: string[] },`;

// ═════════════════════════════════════════════════════════════════
// Edit 1d — Update getRewriterUserPrompt body issue formatting
// ═════════════════════════════════════════════════════════════════
//
// Email Prospector's rewriter uses a numbered, multi-line block per
// issue. Mirroring that here.

const E1D_OLD = `CRITIC ISSUES:
\${critique.issues.map((i) => \`- \${i}\`).join("\\n")}`;

const E1D_NEW = `CRITIC ISSUES:
\${critique.issues.length === 0
    ? "(no critic issues recorded)"
    : critique.issues.map((i, idx) =>
        \`\${idx + 1}. [\${i.severity.toUpperCase()}] \${i.category}\\n\` +
        \`   Problem: "\${i.excerpt}"\\n\` +
        \`   Reason: \${i.reason}\` +
        (i.suggested_fix ? \`\\n   Suggested: "\${i.suggested_fix}"\` : "")
      ).join("\\n\\n")
}`;

const E1D_MARKER = `(no critic issues recorded)`;

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
  ["critic-types",          E1A_OLD, E1A_NEW, E1A_MARKER],
  ["critic-output-format",  E1B_OLD, E1B_NEW, E1B_MARKER],
  ["rewriter-signature",    E1C_OLD, E1C_NEW, E1C_MARKER],
  ["rewriter-body-format",  E1D_OLD, E1D_NEW, E1D_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  criticCategoryType: source.includes("export type CriticCategory ="),
  criticIssueType: source.includes("export interface CriticIssue {"),
  eightCategoriesPresent: [
    "machine_artifact", "term_leakage", "event_mismatch", "unnatural_phrasing",
    "translation_artifact", "vertical_incoherence", "formatting_leak", "why_structure_violation",
  ].every(c => source.includes(`"${c}"`)),
  schemaUpdated: source.includes(`"category": "machine_artifact | term_leakage`),
  categoryDefsBlock: source.includes("ISSUE CATEGORY DEFINITIONS:"),
  severityDefsBlock: source.includes("ISSUE SEVERITY:"),
  blockSeverityRule: source.includes(`If ANY issue has severity="block"`),
  rewriterSigUsesType: source.includes("issues: CriticIssue[]"),
  rewriterBodyNumbered: source.includes(`\${idx + 1}. [\${i.severity.toUpperCase()}]`),
  rewriterBodyEmptyCase: source.includes(`(no critic issues recorded)`),
  oldStringFormatGone: !source.includes(`critique.issues.map((i) => \`- \${i}\`).join`),
};
console.log("[message-prompts-categories] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[message-prompts-categories] FAIL"); process.exit(4);
}
console.log("[message-prompts-categories] DONE");
