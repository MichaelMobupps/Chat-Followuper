#!/usr/bin/env node
/**
 * Ticket B-critic-categories — patch 2/2: services/messageGenerator.ts
 *
 * Six atomic edits:
 *   2a. Add CriticIssue + CriticCategory to the messagePrompts import.
 *   2b. Add CRITIC_CATEGORIES const + normalizeCriticIssue helper +
 *       issueToString helper. Inserted after the existing sanitizers.
 *   2c. Change CriticResult.issues from string[] to CriticIssue[].
 *   2d. Update critic JSON parsing to call normalizeCriticIssue per
 *       issue. Defensive: handles old-format strings as fallback.
 *   2e. Update meta-language injection to construct a CriticIssue
 *       object (machine_artifact / block).
 *   2f. Update claim-grounding injection to construct a CriticIssue
 *       object (machine_artifact / block).
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
// Edit 2a — Import CriticIssue + CriticCategory from messagePrompts
// ═════════════════════════════════════════════════════════════════

const E2A_OLD = `  type MessageContext,
  type ConversationRow,
  type PreviousFollowup,
} from "./messagePrompts";`;

const E2A_NEW = `  type MessageContext,
  type ConversationRow,
  type PreviousFollowup,
  type CriticIssue,
  type CriticCategory,
} from "./messagePrompts";`;

const E2A_MARKER = `  type CriticIssue,
  type CriticCategory,`;

// ═════════════════════════════════════════════════════════════════
// Edit 2b — Add CRITIC_CATEGORIES + helpers right after runChatLint
// ═════════════════════════════════════════════════════════════════
//
// Anchor: the closing `}` of runChatLint plus the trailing blank line.
// runChatLint ends with `return { score: Math.max(0, score), violations };`
// which is unique to that function. Em-dash-free.

const E2B_OLD = `  return { score: Math.max(0, score), violations };
}

`;

const E2B_NEW = `  return { score: Math.max(0, score), violations };
}

// ─────────────────────────────────────────────────────────────────
// Sanitizer 9: critic-issue normalisation + formatting helpers
// ─────────────────────────────────────────────────────────────────
//
// The critic returns issues as structured objects of shape CriticIssue.
// normalizeCriticIssue is defensive: it accepts both the new object
// format and legacy free-text strings (so prompts that backslide do
// not crash the pipeline). issueToString renders an issue for log
// lines and any place that wants a single-line summary.

const CRITIC_CATEGORIES: readonly CriticCategory[] = [
  "machine_artifact",
  "term_leakage",
  "event_mismatch",
  "unnatural_phrasing",
  "translation_artifact",
  "vertical_incoherence",
  "formatting_leak",
  "why_structure_violation",
];

function isCriticCategory(value: unknown): value is CriticCategory {
  return typeof value === "string" && (CRITIC_CATEGORIES as readonly string[]).includes(value);
}

function normalizeCriticIssue(raw: unknown): CriticIssue {
  // Legacy fallback: a bare string. Wrap as machine_artifact / warn.
  if (typeof raw === "string") {
    return {
      excerpt: "",
      reason: raw,
      category: "machine_artifact",
      severity: "warn",
    };
  }
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    return {
      excerpt: typeof obj.excerpt === "string" ? obj.excerpt : "",
      reason: typeof obj.reason === "string" ? obj.reason : "",
      category: isCriticCategory(obj.category) ? obj.category : "machine_artifact",
      severity: obj.severity === "block" ? "block" : "warn",
      suggested_fix: typeof obj.suggested_fix === "string" && obj.suggested_fix.length > 0
        ? obj.suggested_fix
        : undefined,
    };
  }
  return {
    excerpt: "",
    reason: String(raw),
    category: "machine_artifact",
    severity: "warn",
  };
}

function issueToString(issue: CriticIssue): string {
  const parts = [\`[\${issue.severity}/\${issue.category}]\`];
  if (issue.excerpt) parts.push(\`"\${issue.excerpt}"\`);
  parts.push(issue.reason);
  if (issue.suggested_fix) parts.push(\`(suggested: "\${issue.suggested_fix}")\`);
  return parts.join(" ");
}

`;

const E2B_MARKER = `function normalizeCriticIssue(raw: unknown): CriticIssue {`;

// ═════════════════════════════════════════════════════════════════
// Edit 2c — Update CriticResult.issues type
// ═════════════════════════════════════════════════════════════════

const E2C_OLD = `interface CriticResult {
  scores: Record<string, number>;
  overall: number;
  issues: string[];
  suggestions: string[];
  needs_rewrite: boolean;
}`;

const E2C_NEW = `interface CriticResult {
  scores: Record<string, number>;
  overall: number;
  issues: CriticIssue[];
  suggestions: string[];
  needs_rewrite: boolean;
}`;

const E2C_MARKER = `interface CriticResult {
  scores: Record<string, number>;
  overall: number;
  issues: CriticIssue[];`;

// ═════════════════════════════════════════════════════════════════
// Edit 2d — Update critic JSON parsing
// ═════════════════════════════════════════════════════════════════

const E2D_OLD = `  const parsed = parseJsonResponse(textBlock.text) as {
    scores?: Record<string, number>;
    overall?: number;
    issues?: string[];
    suggestions?: string[];
    needs_rewrite?: boolean;
  };
  return {
    critique: {
      scores: parsed.scores || {},
      overall: parsed.overall ?? 5,
      issues: parsed.issues || [],`;

const E2D_NEW = `  const parsed = parseJsonResponse(textBlock.text) as {
    scores?: Record<string, number>;
    overall?: number;
    issues?: unknown[];
    suggestions?: string[];
    needs_rewrite?: boolean;
  };
  return {
    critique: {
      scores: parsed.scores || {},
      overall: parsed.overall ?? 5,
      issues: (parsed.issues || []).map(normalizeCriticIssue),`;

const E2D_MARKER = `issues: (parsed.issues || []).map(normalizeCriticIssue),`;

// ═════════════════════════════════════════════════════════════════
// Edit 2e — Update meta-language injection to produce CriticIssue
// ═════════════════════════════════════════════════════════════════

const E2E_OLD = `    if (metaCheck.found) {
      const metaIssue = \`META-LANGUAGE DETECTED — the message is describing what it does instead of writing literal content. Offending phrases: \${metaCheck.matches.join(" | ")}. Rewrite to use concrete, literal statements (real numbers, real competitor names, real outcomes), not descriptions of message tactics.\`;
      critique.issues = [metaIssue, ...critique.issues];`;

const E2E_NEW = `    if (metaCheck.found) {
      const metaIssue: CriticIssue = {
        excerpt: metaCheck.matches.slice(0, 3).join(" | "),
        reason: \`Message describes what it does instead of writing literal content. Offending phrases: \${metaCheck.matches.join(" | ")}. Rewrite to use concrete, literal statements (real numbers, real competitor names, real outcomes), not descriptions of message tactics.\`,
        category: "machine_artifact",
        severity: "block",
      };
      critique.issues = [metaIssue, ...critique.issues];`;

const E2E_MARKER = `const metaIssue: CriticIssue = {`;

// ═════════════════════════════════════════════════════════════════
// Edit 2f — Update claim-grounding injection to produce CriticIssue
// ═════════════════════════════════════════════════════════════════

const E2F_OLD = `    if (claimCheck.found) {
      const briefVolume = ctx.research_brief?.calibratedDailyVolume ?? "(no brief volume)";
      const briefProofs = ctx.research_brief?.tangibleReasons?.slice(0, 2).join(" | ") ?? "(no brief proofs)";
      const claimIssue = \`UNGROUNDED CLAIMS DETECTED: the message contains numbers or claims that do not trace to the research brief or prior conversation. Findings: \${claimCheck.matches.join(" | ")}. Replace with brief-grounded numbers (calibrated_daily_volume: \${briefVolume}) or remove the unsupported claim entirely.\`;
      critique.issues = [claimIssue, ...critique.issues];`;

const E2F_NEW = `    if (claimCheck.found) {
      const briefVolume = ctx.research_brief?.calibratedDailyVolume ?? "(no brief volume)";
      const briefProofs = ctx.research_brief?.tangibleReasons?.slice(0, 2).join(" | ") ?? "(no brief proofs)";
      const claimIssue: CriticIssue = {
        excerpt: claimCheck.matches.slice(0, 3).join(" | "),
        reason: \`Message contains numbers or claims that do not trace to the research brief or prior conversation. Findings: \${claimCheck.matches.join(" | ")}. Replace with brief-grounded numbers (calibrated_daily_volume: \${briefVolume}) or remove the unsupported claim entirely.\`,
        category: "machine_artifact",
        severity: "block",
      };
      critique.issues = [claimIssue, ...critique.issues];`;

const E2F_MARKER = `const claimIssue: CriticIssue = {`;

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
  ["import-critic-issue",   E2A_OLD, E2A_NEW, E2A_MARKER],
  ["normalize-helpers",     E2B_OLD, E2B_NEW, E2B_MARKER],
  ["critic-result-type",    E2C_OLD, E2C_NEW, E2C_MARKER],
  ["critic-json-parsing",   E2D_OLD, E2D_NEW, E2D_MARKER],
  ["meta-injection-typed",  E2E_OLD, E2E_NEW, E2E_MARKER],
  ["claim-injection-typed", E2F_OLD, E2F_NEW, E2F_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  importCriticIssue: source.includes("type CriticIssue,"),
  importCriticCategory: source.includes("type CriticCategory,"),
  categoriesConst: source.includes("const CRITIC_CATEGORIES: readonly CriticCategory[]"),
  isCategoryGuard: source.includes("function isCriticCategory(value: unknown)"),
  normalizeFn: source.includes("function normalizeCriticIssue(raw: unknown): CriticIssue {"),
  issueToStringFn: source.includes("function issueToString(issue: CriticIssue): string {"),
  resultIssuesTyped: source.includes("issues: CriticIssue[];"),
  parseUnknownArray: source.includes("issues?: unknown[];"),
  parseUsesNormalize: source.includes("(parsed.issues || []).map(normalizeCriticIssue)"),
  metaInjectionTyped: source.includes(`const metaIssue: CriticIssue = {`),
  claimInjectionTyped: source.includes(`const claimIssue: CriticIssue = {`),
  oldMetaStringGone: !source.includes(`const metaIssue = \`META-LANGUAGE DETECTED`),
  oldClaimStringGone: !source.includes(`const claimIssue = \`UNGROUNDED CLAIMS DETECTED:`),
  oldIssueStringTypeGone: !source.includes("issues: string[];\n  suggestions: string[];\n  needs_rewrite: boolean;\n}"),
};
console.log("[message-generator-categories] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[message-generator-categories] FAIL"); process.exit(4);
}
console.log("[message-generator-categories] DONE");
