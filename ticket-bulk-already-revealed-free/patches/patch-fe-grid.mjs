#!/usr/bin/env node
/**
 * Ticket bulk-already-revealed-free — FE CandidateGrid.tsx
 *
 * Four atomic edits:
 *   1. cost useMemo: track freeCount alongside yes/maybe; total still
 *      excludes free
 *   2. selection summary text: append " · {N} already revealed (free)"
 *      when free count > 0
 *   3. PhoneBadge component: accept existingPhone prop, render new
 *      emerald "ready (free)" variant when set (takes precedence over
 *      yes/maybe/no)
 *   4. PhoneBadge call site: pass existingPhone={person.existingPhone}
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/components/whatsapp-bulk/CandidateGrid.tsx",
);

// ──────────────────────────────────────────────────────────────────
// Edit 4.1 — cost useMemo tracks freeCount
// ──────────────────────────────────────────────────────────────────

const E1_OLD = `  const cost = useMemo(() => {
    let yesCount = 0,
      maybeCount = 0;
    for (const c of selectedCandidates) {
      if (c.person.directPhoneStatus === "yes") yesCount++;
      else if (c.person.directPhoneStatus === "maybe") maybeCount++;
    }
    return {
      yes: yesCount,
      maybe: maybeCount,
      total: yesCount * REVEAL_COST_YES + maybeCount * REVEAL_COST_MAYBE,
    };
  }, [selectedCandidates]);`;

const E1_NEW = `  const cost = useMemo(() => {
    let yesCount = 0,
      maybeCount = 0,
      freeCount = 0;
    for (const c of selectedCandidates) {
      // existingPhone takes precedence — these candidates skip reveal
      // paths in processOne, contributing zero to credit cost.
      if (c.person.existingPhone) freeCount++;
      else if (c.person.directPhoneStatus === "yes") yesCount++;
      else if (c.person.directPhoneStatus === "maybe") maybeCount++;
    }
    return {
      yes: yesCount,
      maybe: maybeCount,
      free: freeCount,
      total: yesCount * REVEAL_COST_YES + maybeCount * REVEAL_COST_MAYBE,
    };
  }, [selectedCandidates]);`;

const E1_MARKER = `freeCount = 0`;

// ──────────────────────────────────────────────────────────────────
// Edit 4.2 — selection summary text mentions free count
// ──────────────────────────────────────────────────────────────────

const E2_OLD = `                  <span className="text-muted-foreground font-normal">
                    Est. {cost.total} credits ({cost.yes + cost.maybe}{" "}
                    × {REVEAL_COST_YES}c, non-refundable)
                  </span>`;

const E2_NEW = `                  <span className="text-muted-foreground font-normal">
                    Est. {cost.total} credits ({cost.yes + cost.maybe}{" "}
                    × {REVEAL_COST_YES}c, non-refundable
                    {cost.free > 0
                      ? \` · \${cost.free} already revealed (free)\`
                      : ""}
                    )
                  </span>`;

const E2_MARKER = `already revealed (free)`;

// ──────────────────────────────────────────────────────────────────
// Edit 4.3 — PhoneBadge component: accept existingPhone, render new
// "ready (free)" variant
// ──────────────────────────────────────────────────────────────────

const E3_OLD = `function PhoneBadge({ status }: { status: "yes" | "maybe" | "no" }) {
  if (status === "yes") {
    return (
      <Badge
        variant="outline"
        className="gap-1 text-[10px] border-green-500 text-green-700 dark:text-green-400"
        title="Apollo has this phone in their DB — high success rate on reveal"
      >`;

const E3_NEW = `function PhoneBadge({
  status,
  existingPhone,
}: {
  status: "yes" | "maybe" | "no";
  existingPhone: string | null;
}) {
  // existingPhone takes precedence over status — Apollo already revealed
  // this contact in our account, no credit cost on use.
  if (existingPhone) {
    return (
      <Badge
        variant="outline"
        className="gap-1 text-[10px] border-emerald-500 text-emerald-700 dark:text-emerald-400"
        title="Apollo has this phone already revealed in your account — free to use, no credit charge"
      >
        <Phone className="h-3 w-3" />
        ready (free)
      </Badge>
    );
  }
  if (status === "yes") {
    return (
      <Badge
        variant="outline"
        className="gap-1 text-[10px] border-green-500 text-green-700 dark:text-green-400"
        title="Apollo has this phone in their DB — high success rate on reveal"
      >`;

const E3_MARKER = `existingPhone takes precedence over status`;

// ──────────────────────────────────────────────────────────────────
// Edit 4.4 — PhoneBadge call site passes existingPhone prop
// ──────────────────────────────────────────────────────────────────

const E4_OLD = `          <PhoneBadge status={person.directPhoneStatus} />`;

const E4_NEW = `          <PhoneBadge
            status={person.directPhoneStatus}
            existingPhone={person.existingPhone}
          />`;

const E4_MARKER = `existingPhone={person.existingPhone}`;

// ──────────────────────────────────────────────────────────────────
// applyEdit
// ──────────────────────────────────────────────────────────────────

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
  if (m > 0) {
    console.log(`[${label}] SKIP — already applied`);
    return { source, ok: true };
  }
  if (o === 0) {
    console.log(`[${label}] NOOP — anchor not found`);
    return { source, ok: false };
  }
  if (o > 1) {
    console.log(`[${label}] FAIL — anchor matched ${o} times`);
    return { source, ok: false };
  }
  console.log(`[${label}] APPLY`);
  return { source: source.replace(oldStr, newStr), ok: true };
}

let source;
try {
  source = readFileSync(FILE, "utf8");
} catch (err) {
  console.error(`[FATAL] cannot read ${FILE}: ${err.message}`);
  process.exit(2);
}

const r1 = applyEdit("cost-with-free", source, E1_OLD, E1_NEW, E1_MARKER);
if (!r1.ok) process.exit(3);
source = r1.source;

const r2 = applyEdit("summary-text", source, E2_OLD, E2_NEW, E2_MARKER);
if (!r2.ok) process.exit(3);
source = r2.source;

const r3 = applyEdit("badge-variant", source, E3_OLD, E3_NEW, E3_MARKER);
if (!r3.ok) process.exit(3);
source = r3.source;

const r4 = applyEdit("badge-call-site", source, E4_OLD, E4_NEW, E4_MARKER);
if (!r4.ok) process.exit(3);
source = r4.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  freeCountTracked: countOccurrences(source, "freeCount = 0") === 1,
  costFreeReturned: countOccurrences(source, "free: freeCount,") === 1,
  summaryMentionsFree: countOccurrences(source, "already revealed (free)") >= 1,
  badgePropAdded: countOccurrences(source, "existingPhone: string | null;") === 1,
  badgeVariantPresent: countOccurrences(source, "ready (free)") === 1,
  callSiteUpdated: countOccurrences(source, "existingPhone={person.existingPhone}") === 1,
};
console.log("[bulk-already-revealed-free-grid] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[bulk-already-revealed-free-grid] FAIL — evidence check failed");
  process.exit(4);
}
console.log("[bulk-already-revealed-free-grid] DONE");
process.exit(0);
