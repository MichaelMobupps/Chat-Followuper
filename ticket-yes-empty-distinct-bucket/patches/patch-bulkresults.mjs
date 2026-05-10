#!/usr/bin/env node
/**
 * Ticket yes-empty-distinct-bucket — split BulkResults pending bucket.
 *
 * Three atomic edits in BulkResults.tsx:
 *   1. const declarations: pending → pendingAll, then split into
 *      pendingAsync (maybe-tagged, real webhook coming) and
 *      pendingManual (yes-tagged but Apollo returned nothing — needs
 *      manual sourcing)
 *   2. Header summary line: show both counts separately
 *   3. Replace single pending ResultGroup with two — different copy
 *      per bucket (async keeps "webhook will fire", manual gets
 *      "Apollo lied, source manually")
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/components/whatsapp-bulk/BulkResults.tsx",
);

// ─── Edit 1 — split const declarations ────────────────────────────
const E1_OLD = `  const ready = states.filter((s) => s.stage === "ready");
  const pending = states.filter((s) => s.stage === "ready-pending-phone");
  const failed = states.filter((s) => s.stage === "failed");`;

const E1_NEW = `  const ready = states.filter((s) => s.stage === "ready");
  const pendingAll = states.filter((s) => s.stage === "ready-pending-phone");
  // Split pending by Apollo's directPhoneStatus at search time:
  //   "maybe" → bulk_match webhook will fire — real async pending.
  //   "yes"   → Apollo claimed to have a phone but reveal returned
  //             nothing. No webhook will fire. SDR must source the
  //             phone manually (LinkedIn, company website).
  // The "Apollo's webhook will deliver in minutes" copy is misleading
  // for the yes-empty case (Ticket yes-empty-distinct-bucket).
  const pendingAsync = pendingAll.filter(
    (s) => s.candidate.person.directPhoneStatus === "maybe",
  );
  const pendingManual = pendingAll.filter(
    (s) => s.candidate.person.directPhoneStatus === "yes",
  );
  const failed = states.filter((s) => s.stage === "failed");`;

const E1_MARKER = `pendingManual = pendingAll.filter`;

// ─── Edit 2 — header summary line ─────────────────────────────────
const E2_OLD = `          {ready.length} ready to send · {pending.length} phone reveal pending ·{" "}
          {failed.length} failed`;

const E2_NEW = `          {ready.length} ready to send · {pendingAsync.length} async pending ·{" "}
          {pendingManual.length} need manual phone · {failed.length} failed`;

const E2_MARKER = `need manual phone`;

// ─── Edit 3 — replace single ResultGroup with two ─────────────────
const E3_OLD = `      {pending.length > 0 && (
        <ResultGroup
          title={\`Phone reveal pending (\${pending.length})\`}
          tone="warning"
          description="Apollo's webhook will deliver the phone in minutes. The message is already drafted; you'll get a Mailgun email when these are ready to send."
        >
          {pending.map((s) => (
            <PendingRow key={s.prospectId} state={s} />
          ))}
        </ResultGroup>
      )}`;

const E3_NEW = `      {pendingAsync.length > 0 && (
        <ResultGroup
          title={\`Phone reveal pending — async (\${pendingAsync.length})\`}
          tone="warning"
          description="Apollo's webhook will deliver the phone in minutes. The message is already drafted; you'll get a Mailgun email when these are ready to send."
        >
          {pendingAsync.map((s) => (
            <PendingRow key={s.prospectId} state={s} />
          ))}
        </ResultGroup>
      )}

      {pendingManual.length > 0 && (
        <ResultGroup
          title={\`Manual phone sourcing needed (\${pendingManual.length})\`}
          tone="warning"
          description="Apollo claimed to have a phone for these but the reveal returned nothing — no webhook will fire. The message is already drafted; source the phone manually (LinkedIn, company website) and add it via the prospect detail page."
        >
          {pendingManual.map((s) => (
            <PendingRow key={s.prospectId} state={s} />
          ))}
        </ResultGroup>
      )}`;

const E3_MARKER = `Manual phone sourcing needed`;

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

for (const [label, oldStr, newStr, marker] of [
  ["split-consts", E1_OLD, E1_NEW, E1_MARKER],
  ["header-summary", E2_OLD, E2_NEW, E2_MARKER],
  ["split-result-groups", E3_OLD, E3_NEW, E3_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  pendingAllPresent: countOccurrences(source, "const pendingAll = states.filter") === 1,
  pendingAsyncDefined: countOccurrences(source, "const pendingAsync = pendingAll.filter") === 1,
  pendingManualDefined: countOccurrences(source, "const pendingManual = pendingAll.filter") === 1,
  // Old single `pending` reference fully gone.
  oldPendingGone:
    countOccurrences(source, "const pending = states.filter") === 0 &&
    countOccurrences(source, "{pending.length} phone reveal pending") === 0,
  twoResultGroups:
    countOccurrences(source, "Phone reveal pending — async") === 1 &&
    countOccurrences(source, "Manual phone sourcing needed") === 1,
};
console.log("[yes-empty-distinct-bucket] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[yes-empty-distinct-bucket] FAIL"); process.exit(4);
}
console.log("[yes-empty-distinct-bucket] DONE");
