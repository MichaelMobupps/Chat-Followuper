#!/usr/bin/env node
/**
 * Ticket message-visibility-bulk — extend CandidateProcessing
 *
 * Single edit: add optional firstMessageBody field. Backward-compatible
 * (existing callers leave it undefined).
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/components/whatsapp-bulk/BulkSavingProgress.tsx",
);

const OLD = `export interface CandidateProcessing {
  candidate: Candidate;
  stage: ProcessingStage;
  prospectId?: string;
  error?: string;
}`;

const NEW = `export interface CandidateProcessing {
  candidate: Candidate;
  stage: ProcessingStage;
  prospectId?: string;
  error?: string;
  /** Generated first message body, captured from generateMessage's
   *  return value during processOne. Used by BulkResults to render
   *  the message inline in Ready/Pending rows. Optional —
   *  pre-generation slots have no message yet. Added in Ticket
   *  message-visibility-bulk. */
  firstMessageBody?: string;
}`;

const MARKER = `message-visibility-bulk`;

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count += 1;
    idx += needle.length;
  }
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

const r = applyEdit("type-extend", source, OLD, NEW, MARKER);
if (!r.ok) process.exit(3);
writeFileSync(FILE, r.source, "utf8");

const evidence = {
  fieldPresent: countOccurrences(r.source, "firstMessageBody?: string;") === 1,
  ticketMarker: countOccurrences(r.source, "message-visibility-bulk") === 1,
};
console.log("[type-extend] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[type-extend] FAIL"); process.exit(4);
}
console.log("[type-extend] DONE");
