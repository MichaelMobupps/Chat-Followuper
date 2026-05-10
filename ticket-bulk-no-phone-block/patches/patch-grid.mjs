#!/usr/bin/env node
/**
 * Ticket bulk-no-phone-block — CandidateGrid patches
 *
 * artifacts/dashboard/src/components/whatsapp-bulk/CandidateGrid.tsx
 *
 * Four atomic edits — prevent SDR from selecting "no phone" candidates,
 * eliminating the 8-credit waste path when hideNoPhone toggle is OFF:
 *
 *   1. Add `selectable` useMemo — filtered minus no-phone candidates
 *   2. toggleAllVisible uses `selectable` (only toggles selectable rows)
 *   3. Select-all checkbox + count display uses `selectable`
 *   4. CandidateRow — disable checkbox + row-click + visually fade when
 *      directPhoneStatus === "no"
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
// Edit 1 — add `selectable` useMemo right after `filtered`
//
// Anchor on the closing of the filtered useMemo + start of toggleOne.
// ──────────────────────────────────────────────────────────────────

const E1_OLD = `  }, [candidates, filters]);

  function toggleOne(id: string) {`;

const E1_NEW = `  }, [candidates, filters]);

  // Selectable = filtered rows that aren't no-phone. Apollo charges 8c
  // per reveal regardless, so revealing a "no" candidate is pure waste —
  // they're rendered for visibility (when hideNoPhone toggle is OFF) but
  // not selectable.
  const selectable = useMemo(
    () => filtered.filter((c) => c.person.directPhoneStatus !== "no"),
    [filtered],
  );

  function toggleOne(id: string) {`;

const E1_MARKER = `const selectable = useMemo(
    () => filtered.filter((c) => c.person.directPhoneStatus !== "no"),`;

// ──────────────────────────────────────────────────────────────────
// Edit 2 — toggleAllVisible uses `selectable`
// ──────────────────────────────────────────────────────────────────

const E2_OLD = `  function toggleAllVisible() {
    setSelected((prev) => {
      const allVisibleSelected = filtered.every((c) => prev.has(c.person.id));
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const c of filtered) next.delete(c.person.id);
      } else {
        for (const c of filtered) next.add(c.person.id);
      }
      return next;
    });
  }`;

const E2_NEW = `  function toggleAllVisible() {
    setSelected((prev) => {
      const allSelectableSelected = selectable.every((c) => prev.has(c.person.id));
      const next = new Set(prev);
      if (allSelectableSelected) {
        for (const c of selectable) next.delete(c.person.id);
      } else {
        for (const c of selectable) next.add(c.person.id);
      }
      return next;
    });
  }`;

const E2_MARKER = `const allSelectableSelected = selectable.every`;

// ──────────────────────────────────────────────────────────────────
// Edit 3 — Select-all UI uses `selectable`
//
// When all visible are selectable, count shows as "(N)". When some are
// no-phone, count shows as "(N of M)" so SDR sees the explicit gap.
// ──────────────────────────────────────────────────────────────────

const E3_OLD = `            <Checkbox
              checked={
                filtered.length > 0 &&
                filtered.every((c) => selected.has(c.person.id))
              }
              onCheckedChange={toggleAllVisible}
              data-testid="checkbox-select-all"
            />
            <span className="text-muted-foreground">
              Select all visible ({filtered.length})
            </span>`;

const E3_NEW = `            <Checkbox
              checked={
                selectable.length > 0 &&
                selectable.every((c) => selected.has(c.person.id))
              }
              onCheckedChange={toggleAllVisible}
              disabled={selectable.length === 0}
              data-testid="checkbox-select-all"
            />
            <span className="text-muted-foreground">
              Select all selectable ({selectable.length}
              {selectable.length !== filtered.length
                ? \` of \${filtered.length}, \${filtered.length - selectable.length} no-phone skipped\`
                : ""}
              )
            </span>`;

const E3_MARKER = `Select all selectable ({selectable.length}`;

// ──────────────────────────────────────────────────────────────────
// Edit 4 — CandidateRow disables when no-phone
//
// Anchor includes the function declaration through end of Checkbox so
// the match is unique within the file.
// ──────────────────────────────────────────────────────────────────

const E4_OLD = `function CandidateRow({
  candidate,
  selected,
  onToggle,
}: {
  candidate: Candidate;
  selected: boolean;
  onToggle: () => void;
}) {
  const { person, org } = candidate;
  const displayName =
    [person.firstName, person.lastNameObfuscated].filter(Boolean).join(" ") ||
    person.name ||
    "(no name)";
  return (
    <div
      className={\`flex items-start gap-3 px-4 py-2.5 border-b last:border-b-0 hover-elevate cursor-pointer \${
        selected ? "bg-accent/40" : ""
      }\`}
      onClick={onToggle}
      data-testid={\`candidate-row-\${person.id}\`}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        className="mt-1"
        data-testid={\`checkbox-\${person.id}\`}
      />`;

const E4_NEW = `function CandidateRow({
  candidate,
  selected,
  onToggle,
}: {
  candidate: Candidate;
  selected: boolean;
  onToggle: () => void;
}) {
  const { person, org } = candidate;
  const noPhone = person.directPhoneStatus === "no";
  const displayName =
    [person.firstName, person.lastNameObfuscated].filter(Boolean).join(" ") ||
    person.name ||
    "(no name)";
  return (
    <div
      className={
        noPhone
          ? "flex items-start gap-3 px-4 py-2.5 border-b last:border-b-0 opacity-60 cursor-not-allowed"
          : \`flex items-start gap-3 px-4 py-2.5 border-b last:border-b-0 hover-elevate cursor-pointer \${
              selected ? "bg-accent/40" : ""
            }\`
      }
      onClick={noPhone ? undefined : onToggle}
      data-testid={\`candidate-row-\${person.id}\`}
      title={noPhone ? "Apollo has no phone for this person — not selectable" : undefined}
    >
      <Checkbox
        checked={selected && !noPhone}
        onCheckedChange={noPhone ? undefined : onToggle}
        onClick={(e) => e.stopPropagation()}
        className="mt-1"
        disabled={noPhone}
        data-testid={\`checkbox-\${person.id}\`}
      />`;

const E4_MARKER = `const noPhone = person.directPhoneStatus === "no";`;

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

const r1 = applyEdit("selectable-memo", source, E1_OLD, E1_NEW, E1_MARKER);
if (!r1.ok) process.exit(3);
source = r1.source;

const r2 = applyEdit("toggle-all-uses-selectable", source, E2_OLD, E2_NEW, E2_MARKER);
if (!r2.ok) process.exit(3);
source = r2.source;

const r3 = applyEdit("select-all-ui", source, E3_OLD, E3_NEW, E3_MARKER);
if (!r3.ok) process.exit(3);
source = r3.source;

const r4 = applyEdit("row-disable-no-phone", source, E4_OLD, E4_NEW, E4_MARKER);
if (!r4.ok) process.exit(3);
source = r4.source;

// ──────────────────────────────────────────────────────────────────
// Edit 5 — selectedCandidates also excludes no-phone (defense in depth)
//
// If any no-phone IDs end up in `selected` (e.g., legacy state from
// before this patch, or a future bug bypassing the UI), the cost
// summary, dialog count, and processOne loop should all skip them.
// This closes the consistency loop so dialog counts === actual reveals.
// ──────────────────────────────────────────────────────────────────

const E5_OLD = `  const selectedCandidates = useMemo(
    () => candidates.filter((c) => selected.has(c.person.id)),
    [candidates, selected],
  );`;

const E5_NEW = `  const selectedCandidates = useMemo(
    () =>
      candidates.filter(
        (c) =>
          selected.has(c.person.id) && c.person.directPhoneStatus !== "no",
      ),
    [candidates, selected],
  );`;

const E5_MARKER = `c.person.directPhoneStatus !== "no",
      ),
    [candidates, selected],`;

const r5 = applyEdit("selected-excludes-no-phone", source, E5_OLD, E5_NEW, E5_MARKER);
if (!r5.ok) process.exit(3);
source = r5.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  selectableMemo: countOccurrences(source, E1_MARKER) === 1,
  toggleAllSelectable: countOccurrences(source, E2_MARKER) === 1,
  selectAllUiUpdated: countOccurrences(source, E3_MARKER) === 1,
  rowDisableLogic: countOccurrences(source, E4_MARKER) === 1,
  selectedExcludesNoPhone: countOccurrences(source, E5_MARKER) === 1,
  oldFilteredEveryGone: countOccurrences(source, "filtered.every((c) => selected.has(c.person.id))") === 0,
  oldToggleAllGone: countOccurrences(source, "for (const c of filtered) next.delete(c.person.id)") === 0,
};
console.log("[bulk-no-phone-block-grid] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[bulk-no-phone-block-grid] FAIL — evidence check failed");
  process.exit(4);
}
console.log("[bulk-no-phone-block-grid] DONE");
process.exit(0);
