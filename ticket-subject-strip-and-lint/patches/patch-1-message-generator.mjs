#!/usr/bin/env node
/**
 * Ticket subject-strip-and-lint — patch 1/1: services/messageGenerator.ts
 *
 * Two new sanitizers + finalizeMessage wiring:
 *
 *   Sanitizer 7. stripSubjectFromBody — ports email Prospector's
 *     strip_subject_from_body. Catches "Subject: ..." or "Re: ..."
 *     lines that LLMs sometimes re-inject into the body, even though
 *     they are told to return separate subject + message JSON fields.
 *
 *   Sanitizer 8. runChatLint — telemetry-only quality scorer adapted
 *     from email Prospector's s7_lint.LintStage.run_lint. Runs after
 *     all other sanitizers; every violation it finds is by definition
 *     something an earlier sanitizer should have caught. Logs as a
 *     warning so we can debug regressions without changing what ships
 *     to the user.
 *
 * finalizeMessage is updated to:
 *   1. Call stripSubjectFromBody FIRST (before bracketed-note strip).
 *   2. Call runChatLint LAST (after humanize), log violations as warn.
 *
 * No prompt changes. No public API changes. No new external behavior
 * beyond the subject-strip; the lint is purely observational.
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
// Edit 1 — Insert stripSubjectFromBody + runChatLint after
// detectUngroundedClaims, before the JSON parser block.
// ═════════════════════════════════════════════════════════════════
//
// Anchor: the closing of detectUngroundedClaims. The "Dedupe and cap"
// comment and the `Array.from(new Set(matches))` line are unique to
// that function. Em-dash-free.

const E1_OLD = `  // Dedupe and cap.
  const unique = Array.from(new Set(matches));
  return { found: unique.length > 0, matches: unique.slice(0, 5) };
}

`;

const E1_NEW = `  // Dedupe and cap.
  const unique = Array.from(new Set(matches));
  return { found: unique.length > 0, matches: unique.slice(0, 5) };
}

// ─────────────────────────────────────────────────────────────────
// Sanitizer 7: subject-line strip
// ─────────────────────────────────────────────────────────────────
//
// Ported from email Prospector's strip_subject_from_body. The writer
// returns JSON with separate subject and message fields, but it
// occasionally re-injects "Subject: ..." or "Re: ..." into the body.
// Same with rewriter output. We strip these so the body is body-only.

function stripSubjectFromBody(body: string): string {
  let text = body.replace(/^\\s+/, "");

  // Pattern 1: "Subject: ..." line at the start (case-insensitive).
  const subjectMatch = text.match(/^Subject\\s*:\\s*[^\\n]+\\s*\\n+/i);
  if (subjectMatch) text = text.slice(subjectMatch[0].length).replace(/^\\s+/, "");

  // Pattern 2: "Re: ..." line at the start (followup leakage).
  const reMatch = text.match(/^Re\\s*:\\s*[^\\n]+\\s*\\n+/i);
  if (reMatch) text = text.slice(reMatch[0].length).replace(/^\\s+/, "");

  return text;
}

// ─────────────────────────────────────────────────────────────────
// Sanitizer 8: hard lint (telemetry only, does not gate output)
// ─────────────────────────────────────────────────────────────────
//
// Ported from email Prospector's s7_lint.LintStage.run_lint, adapted
// for chat context (no subject/CTA structure, shorter expected length).
// Runs after all other sanitizers as a safety net; every violation it
// surfaces is by definition something an earlier sanitizer should have
// caught. Logs as warning so we can debug sanitizer regressions in
// production without changing what ships.

interface ChatLintViolation {
  rule: string;
  message: string;
  severity: "error" | "warning";
}

interface ChatLintResult {
  score: number;
  violations: ChatLintViolation[];
}

const SUBJECT_LEAK_RE = /^(?:Subject|Re)\\s*:/im;
const SNAKE_TOKEN_RE = /\\b[a-z]+(?:_[a-z]+){1,}\\b/g;
const PLACEHOLDER_LEAK_RE = /\\[(?:volume|metric|event)\\]|\\{[a-z_]+\\}|\\bNOT AVAILABLE\\b|\\bundefined\\b/gi;
const PERCENT_WORD_RE = /\\d+\\s*(?:percento|percent|prozent|процент(?:ов|а)?|por\\s*ciento|pour\\s*cent|procent|persen|เปอร์เซ็นต์|パーセント|퍼센트|phần\\s*trăm)\\b/gi;

function runChatLint(message: string): ChatLintResult {
  const violations: ChatLintViolation[] = [];
  let score = 100;

  // Em dash leak (Sanitizer 1+2 should have caught this).
  if (message.includes("\\u2014")) {
    violations.push({
      rule: "em_dash_present",
      message: "em dash survived sanitizers",
      severity: "error",
    });
    score -= 10;
  }

  // Bold markdown (Sanitizer 2 should have caught this).
  if (/\\*\\*|__/.test(message)) {
    violations.push({
      rule: "bold_markdown",
      message: "bold markdown (** or __) survived sanitizers",
      severity: "error",
    });
    score -= 10;
  }

  // Snake_case tokens (Sanitizer 2 should have caught this).
  const snakeMatches = message.match(SNAKE_TOKEN_RE);
  if (snakeMatches && snakeMatches.length > 0) {
    violations.push({
      rule: "snake_case_tokens",
      message: \`snake_case tokens survived: \${snakeMatches.slice(0, 5).join(", ")}\`,
      severity: "error",
    });
    score -= 15;
  }

  // Unresolved placeholders.
  const placeholderMatches = message.match(PLACEHOLDER_LEAK_RE);
  if (placeholderMatches && placeholderMatches.length > 0) {
    violations.push({
      rule: "unresolved_placeholders",
      message: \`unresolved placeholders survived: \${placeholderMatches.slice(0, 5).join(", ")}\`,
      severity: "error",
    });
    score -= 20;
  }

  // Spelled-out percent across 14 languages (Sanitizer 2 should have caught this).
  const percentMatches = message.match(PERCENT_WORD_RE);
  if (percentMatches && percentMatches.length > 0) {
    violations.push({
      rule: "spelled_out_percent",
      message: \`spelled-out percent survived: \${percentMatches.slice(0, 3).join(", ")}\`,
      severity: "error",
    });
    score -= 10;
  }

  // Subject/Re leak (Sanitizer 7 should have caught this).
  if (SUBJECT_LEAK_RE.test(message)) {
    violations.push({
      rule: "subject_leak",
      message: "Subject: or Re: line survived in body",
      severity: "error",
    });
    score -= 15;
  }

  // Length checks. Chat messages should be 30-1000 chars.
  const trimmedLen = message.trim().length;
  if (trimmedLen < 30) {
    violations.push({
      rule: "too_short",
      message: \`message body only \${trimmedLen} chars (expected at least 30)\`,
      severity: "error",
    });
    score -= 25;
  } else if (trimmedLen > 1000) {
    violations.push({
      rule: "too_long",
      message: \`message body \${trimmedLen} chars (chat should be under 1000)\`,
      severity: "warning",
    });
    score -= 5;
  }

  // Self-referential opener (deterministic complement to critic rule #10).
  // Strip leading greeting if present, then check the first 150 chars of
  // what follows for "we / our / At MobUpps / I'm reaching out / I wanted to".
  const trimmed = message.trim();
  let bodyAfterGreeting = trimmed;
  const firstSep = trimmed.search(/[,\\n]/);
  if (firstSep > 0 && firstSep < 50) {
    const greeting = trimmed.slice(0, firstSep).trim();
    if (/^(?:hi|hello|hey|olá|hola|您好|مرحبا|שלום|merhaba|salut|ciao|привет|namaste|hej|halo|chào|cześć|szia|dear)\\b/i.test(greeting)) {
      bodyAfterGreeting = trimmed.slice(firstSep + 1).trim();
    }
  }
  if (/^(?:we\\b|our\\b|at\\s+mobupps|i'?m\\s+reaching\\s+out|i\\s+wanted\\s+to)/i.test(bodyAfterGreeting.slice(0, 150))) {
    violations.push({
      rule: "self_referential_opener",
      message: "first content line opens with self-referential we/our/MobUpps/I'm reaching out (rule #10)",
      severity: "warning",
    });
    score -= 10;
  }

  return { score: Math.max(0, score), violations };
}

`;

const E1_MARKER = `function stripSubjectFromBody(body: string): string {`;

// ═════════════════════════════════════════════════════════════════
// Edit 2 — Wire stripSubjectFromBody + runChatLint into finalizeMessage
// ═════════════════════════════════════════════════════════════════
//
// Anchor: the entire current finalizeMessage body. Replace with the
// updated body that calls stripSubjectFromBody first and runChatLint
// last (with a warn log on violations).

const E2_OLD = `function finalizeMessage(
  msg: { subject: string; message: string },
  subVertical: string | null,
): { subject: string; message: string } {
  let message = stripBracketedNotes(msg.message);
  message = applyDeterministicFixes(message);

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
}`;

const E2_NEW = `function finalizeMessage(
  msg: { subject: string; message: string },
  subVertical: string | null,
): { subject: string; message: string } {
  // Subject-strip runs FIRST so any "Subject:" or "Re:" line that
  // leaked into the body is removed before downstream sanitizers
  // see it (they would otherwise treat it as content).
  let message = stripSubjectFromBody(msg.message);
  message = stripBracketedNotes(message);
  message = applyDeterministicFixes(message);

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

  // Telemetry-only lint pass. Every violation is by definition a
  // sanitizer regression (something a prior step should have caught).
  // We log but ship the message anyway since these are post-healing.
  const lint = runChatLint(humanized.message);
  if (lint.violations.length > 0) {
    logger.warn(
      {
        score: lint.score,
        violations: lint.violations,
        preview: humanized.message.slice(0, 200),
      },
      \`[chat-lint] message shipped with \${lint.violations.length} surviving violation(s); score=\${lint.score}\`,
    );
  }

  return humanized;
}`;

const E2_MARKER = `let message = stripSubjectFromBody(msg.message);`;

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
  ["sanitizers-7-and-8",   E1_OLD, E1_NEW, E1_MARKER],
  ["finalize-message-wire", E2_OLD, E2_NEW, E2_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  stripSubjectFn: source.includes("function stripSubjectFromBody(body: string): string {"),
  stripSubjectPattern1: source.includes("Pattern 1: \"Subject: ...\" line"),
  stripSubjectPattern2: source.includes("Pattern 2: \"Re: ...\" line"),
  runChatLintFn: source.includes("function runChatLint(message: string): ChatLintResult {"),
  lintViolationType: source.includes("interface ChatLintViolation {"),
  lintResultType: source.includes("interface ChatLintResult {"),
  emDashCheck: source.includes(`message.includes("\\u2014")`),
  boldCheck: source.includes(`/\\*\\*|__/.test(message)`),
  snakeCheck: source.includes("const snakeMatches = message.match(SNAKE_TOKEN_RE);"),
  placeholderCheck: source.includes("const placeholderMatches = message.match(PLACEHOLDER_LEAK_RE);"),
  percentCheck: source.includes("const percentMatches = message.match(PERCENT_WORD_RE);"),
  subjectLeakCheck: source.includes("if (SUBJECT_LEAK_RE.test(message))"),
  lengthCheck: source.includes(`if (trimmedLen < 30)`),
  selfRefCheck: source.includes(`rule: "self_referential_opener"`),
  finalizeWiredStrip: source.includes("let message = stripSubjectFromBody(msg.message);"),
  finalizeWiredLint: source.includes("const lint = runChatLint(humanized.message);"),
  finalizeLintLog: source.includes("[chat-lint] message shipped with"),
};
console.log("[message-generator-lint] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[message-generator-lint] FAIL"); process.exit(4);
}
console.log("[message-generator-lint] DONE");
