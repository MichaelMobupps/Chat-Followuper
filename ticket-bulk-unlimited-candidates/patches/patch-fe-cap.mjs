#!/usr/bin/env node
/**
 * Ticket bulk-unlimited-candidates — FE cap removal
 *
 * artifacts/dashboard/src/components/whatsapp-bulk/CandidateGrid.tsx
 *
 * Four atomic edits to remove the FE-side 25-cap entirely:
 *   1. Delete the SOFT_CAP constant declaration
 *   2. Delete the overrideCap state hook
 *   3. Replace the overSoftCap-based canConfirm derivation with a
 *      simple "selectedCandidates.length > 0" check
 *   4. Delete the JSX block that rendered the "Over soft cap" badge +
 *      Override button
 *
 * Combined with the BE pagination patch (per_page=100, paginate to 500),
 * SDR can now select up to whatever Apollo returns for that company.
 *
 * Idempotency: each edit uses the marker callback approach, with the
 * marker being something present BEFORE the edit (for deletions) so
 * absent = applied.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/components/whatsapp-bulk/CandidateGrid.tsx",
);

// ──────────────────────────────────────────────────────────────────
// Edit 1 — delete SOFT_CAP constant declaration
// ──────────────────────────────────────────────────────────────────

const E1_OLD = `const SOFT_CAP = 25;
const REVEAL_COST_YES = 8;`;

const E1_NEW = `const REVEAL_COST_YES = 8;`;

// ──────────────────────────────────────────────────────────────────
// Edit 2 — delete overrideCap state hook
// ──────────────────────────────────────────────────────────────────

const E2_OLD = `  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [overrideCap, setOverrideCap] = useState(false);
  const [filters, setFilters] = useState<Filters>({`;

const E2_NEW = `  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>({`;

// ──────────────────────────────────────────────────────────────────
// Edit 3 — replace overSoftCap+canConfirm with simple canConfirm
// ──────────────────────────────────────────────────────────────────

const E3_OLD = `  const overSoftCap = selectedCandidates.length > SOFT_CAP;
  const canConfirm =
    selectedCandidates.length > 0 && (!overSoftCap || overrideCap);`;

const E3_NEW = `  const canConfirm = selectedCandidates.length > 0;`;

// ──────────────────────────────────────────────────────────────────
// Edit 4 — delete the JSX override badge+button block
//
// Includes surrounding </p> and </div> for anchor uniqueness.
// ──────────────────────────────────────────────────────────────────

const E4_OLD = `            </p>
            {overSoftCap && (
              <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                <Badge variant="outline" className="border-amber-500 text-amber-700">
                  Over soft cap of {SOFT_CAP}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setOverrideCap(true)}
                  disabled={overrideCap}
                  data-testid="button-override-cap"
                >
                  {overrideCap ? "Override active" : "Override"}
                </Button>
              </div>
            )}
          </div>`;

const E4_NEW = `            </p>
          </div>`;

// ──────────────────────────────────────────────────────────────────
// applyEdit — handles both additions (marker present = applied) and
// deletions (marker absent = applied) via isApplied callback.
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

function applyEdit(label, source, oldStr, newStr, isApplied) {
  if (isApplied(source)) {
    console.log(`[${label}] SKIP — already applied`);
    return { source, ok: true };
  }
  const o = countOccurrences(source, oldStr);
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

const r1 = applyEdit(
  "delete-soft-cap-const",
  source,
  E1_OLD,
  E1_NEW,
  (s) => !s.includes("const SOFT_CAP = 25"),
);
if (!r1.ok) process.exit(3);
source = r1.source;

const r2 = applyEdit(
  "delete-override-state",
  source,
  E2_OLD,
  E2_NEW,
  (s) => !s.includes("const [overrideCap, setOverrideCap]"),
);
if (!r2.ok) process.exit(3);
source = r2.source;

const r3 = applyEdit(
  "simplify-can-confirm",
  source,
  E3_OLD,
  E3_NEW,
  (s) => !s.includes("const overSoftCap"),
);
if (!r3.ok) process.exit(3);
source = r3.source;

const r4 = applyEdit(
  "delete-override-jsx",
  source,
  E4_OLD,
  E4_NEW,
  (s) => !s.includes("Over soft cap of"),
);
if (!r4.ok) process.exit(3);
source = r4.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  softCapGone: countOccurrences(source, "SOFT_CAP") === 0,
  overrideCapStateGone: countOccurrences(source, "overrideCap") === 0,
  setOverrideCapGone: countOccurrences(source, "setOverrideCap") === 0,
  overSoftCapGone: countOccurrences(source, "overSoftCap") === 0,
  overrideJsxGone: countOccurrences(source, "Over soft cap of") === 0,
  buttonOverrideTestidGone: countOccurrences(source, "button-override-cap") === 0,
  simpleCanConfirmPresent: countOccurrences(source, "const canConfirm = selectedCandidates.length > 0;") === 1,
};
console.log("[bulk-unlimited-candidates-fe] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[bulk-unlimited-candidates-fe] FAIL — evidence check failed");
  process.exit(4);
}
console.log("[bulk-unlimited-candidates-fe] DONE");
process.exit(0);
