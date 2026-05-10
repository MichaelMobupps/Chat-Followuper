#!/usr/bin/env node
/**
 * Ticket search-time-annotation — FE CandidateGrid.tsx
 *
 * Four atomic edits:
 *   1. selectedCandidates filter — exclude existing-prospect candidates
 *   2. CandidateRow declarations — add isAlreadyProspect, notSelectable,
 *      notSelectableReason
 *   3. CandidateRow row decoration — replace 6 noPhone refs with
 *      notSelectable + use notSelectableReason for tooltip
 *   4. Badge area — show "Already a prospect" amber badge instead of
 *      PhoneBadge when isAlreadyProspect
 *
 * Note: `selectable` definition (used by Select-All) is NOT edited.
 * Existing-prospect candidates may end up in the selected Set when
 * Select-All fires, but the row's checkbox display gates on
 * notSelectable (renders unchecked) and selectedCandidates filter
 * excludes them, so cost calc and processing are correct. Cosmetic
 * edge case only.
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/components/whatsapp-bulk/CandidateGrid.tsx",
);

// ─── Edit 1 — selectedCandidates filter ───────────────────────────
const E1_OLD = `  const selectedCandidates = useMemo(
    () =>
      candidates.filter(
        (c) =>
          selected.has(c.person.id) && c.person.directPhoneStatus !== "no",
      ),
    [candidates, selected],
  );`;

const E1_NEW = `  const selectedCandidates = useMemo(
    () =>
      candidates.filter(
        (c) =>
          selected.has(c.person.id) &&
          c.person.directPhoneStatus !== "no" &&
          c.person.existingProspectId == null,
      ),
    [candidates, selected],
  );`;

const E1_MARKER = `c.person.existingProspectId == null,`;

// ─── Edit 2 — CandidateRow const declarations ─────────────────────
const E2_OLD = `  const noPhone = person.directPhoneStatus === "no";`;

const E2_NEW = `  const noPhone = person.directPhoneStatus === "no";
  const isAlreadyProspect = person.existingProspectId != null;
  const notSelectable = noPhone || isAlreadyProspect;
  const notSelectableReason = isAlreadyProspect
    ? "Already a prospect — already in your list"
    : noPhone
    ? "Apollo has no phone for this person — not selectable"
    : undefined;`;

const E2_MARKER = `isAlreadyProspect = person.existingProspectId != null`;

// ─── Edit 3 — CandidateRow row decoration ─────────────────────────
// Single big anchor covering the className/onClick/title/Checkbox
// block. Replaces 6 noPhone refs and the inline title string.
const E3_OLD = `  return (
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

const E3_NEW = `  return (
    <div
      className={
        notSelectable
          ? "flex items-start gap-3 px-4 py-2.5 border-b last:border-b-0 opacity-60 cursor-not-allowed"
          : \`flex items-start gap-3 px-4 py-2.5 border-b last:border-b-0 hover-elevate cursor-pointer \${
              selected ? "bg-accent/40" : ""
            }\`
      }
      onClick={notSelectable ? undefined : onToggle}
      data-testid={\`candidate-row-\${person.id}\`}
      title={notSelectableReason}
    >
      <Checkbox
        checked={selected && !notSelectable}
        onCheckedChange={notSelectable ? undefined : onToggle}
        onClick={(e) => e.stopPropagation()}
        className="mt-1"
        disabled={notSelectable}
        data-testid={\`checkbox-\${person.id}\`}
      />`;

const E3_MARKER = `disabled={notSelectable}`;

// ─── Edit 4 — Badge area ──────────────────────────────────────────
const E4_OLD = `        <div className="flex items-center gap-1.5 flex-wrap">
          <PhoneBadge
            status={person.directPhoneStatus}
            existingPhone={person.existingPhone}
          />`;

const E4_NEW = `        <div className="flex items-center gap-1.5 flex-wrap">
          {isAlreadyProspect ? (
            <Badge
              variant="outline"
              className="gap-1 text-[10px] border-amber-500 text-amber-700 dark:text-amber-400"
              title="This person is already in your prospects list — re-adding is blocked"
            >
              Already a prospect
            </Badge>
          ) : (
            <PhoneBadge
              status={person.directPhoneStatus}
              existingPhone={person.existingPhone}
            />
          )}`;

const E4_MARKER = `border-amber-500 text-amber-700`;

// ─── applyEdit ────────────────────────────────────────────────────

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

for (const edit of [
  ["selected-filter", E1_OLD, E1_NEW, E1_MARKER],
  ["row-declarations", E2_OLD, E2_NEW, E2_MARKER],
  ["row-decoration", E3_OLD, E3_NEW, E3_MARKER],
  ["badge-area", E4_OLD, E4_NEW, E4_MARKER],
]) {
  const [label, oldStr, newStr, marker] = edit;
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  selectedCandidatesFiltered:
    countOccurrences(source, "c.person.existingProspectId == null,") === 1,
  rowDeclarations:
    countOccurrences(source, "isAlreadyProspect = person.existingProspectId != null") === 1,
  rowNotSelectableUsed: countOccurrences(source, "disabled={notSelectable}") === 1,
  noPhoneRefsRemoved:
    countOccurrences(source, "disabled={noPhone}") === 0 &&
    countOccurrences(source, "checked={selected && !noPhone}") === 0,
  alreadyProspectBadge:
    countOccurrences(source, "border-amber-500 text-amber-700") === 1,
};
console.log("[fe-grid] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[fe-grid] FAIL — evidence check failed");
  process.exit(4);
}
console.log("[fe-grid] DONE");
process.exit(0);
