#!/usr/bin/env node
/**
 * Ticket bulk-tag-tooltips — clarify yes/maybe/no semantics in UI
 *
 * artifacts/dashboard/src/components/whatsapp-bulk/CandidateGrid.tsx
 *
 * Four atomic edits, all to CandidateGrid.tsx:
 *   1. Add native `title` tooltip to the yes badge
 *   2. Add native `title` tooltip to the maybe badge
 *   3. Add native `title` tooltip to the no badge
 *   4. Add explanatory line below filter card explaining what tags mean
 *
 * Native HTML `title` attribute works on hover, no extra deps. Badge
 * (shadcn) spreads props to the underlying element so this propagates.
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
// Edit 1 — yes badge tooltip
// ──────────────────────────────────────────────────────────────────

const E1_OLD = `      <Badge
        variant="outline"
        className="gap-1 text-[10px] border-green-500 text-green-700 dark:text-green-400"
      >
        <Phone className="h-3 w-3" />
        yes ({REVEAL_COST_YES}c)
      </Badge>`;

const E1_NEW = `      <Badge
        variant="outline"
        className="gap-1 text-[10px] border-green-500 text-green-700 dark:text-green-400"
        title="Apollo has this phone in their DB — high success rate on reveal"
      >
        <Phone className="h-3 w-3" />
        yes ({REVEAL_COST_YES}c)
      </Badge>`;

const E1_MARKER = `title="Apollo has this phone in their DB`;

// ──────────────────────────────────────────────────────────────────
// Edit 2 — maybe badge tooltip
// ──────────────────────────────────────────────────────────────────

const E2_OLD = `      <Badge
        variant="outline"
        className="gap-1 text-[10px] border-amber-500 text-amber-700 dark:text-amber-400"
      >
        <Phone className="h-3 w-3" />
        maybe ({REVEAL_COST_MAYBE}c)
      </Badge>`;

const E2_NEW = `      <Badge
        variant="outline"
        className="gap-1 text-[10px] border-amber-500 text-amber-700 dark:text-amber-400"
        title="Apollo doesn't have this phone — will search async, lower success rate, same 8c cost"
      >
        <Phone className="h-3 w-3" />
        maybe ({REVEAL_COST_MAYBE}c)
      </Badge>`;

const E2_MARKER = `title="Apollo doesn't have this phone`;

// ──────────────────────────────────────────────────────────────────
// Edit 3 — no badge tooltip
// ──────────────────────────────────────────────────────────────────

const E3_OLD = `    <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
      <Phone className="h-3 w-3" />
      no
    </Badge>`;

const E3_NEW = `    <Badge
      variant="outline"
      className="gap-1 text-[10px] text-muted-foreground"
      title="Apollo has no phone for this person and will not search"
    >
      <Phone className="h-3 w-3" />
      no
    </Badge>`;

const E3_MARKER = `title="Apollo has no phone for this person`;

// ──────────────────────────────────────────────────────────────────
// Edit 4 — explanatory tip line below the filter grid
//
// Anchored on the closing of the toggles column + grid + CardContent,
// which is a unique multi-line slice (only one such structure in the
// file).
// ──────────────────────────────────────────────────────────────────

const E4_OLD = `                  data-testid="switch-has-email"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>`;

const E4_NEW = `                  data-testid="switch-has-email"
                />
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground border-t pt-2 leading-relaxed">
            <span className="font-medium text-green-700 dark:text-green-400">yes</span>{" "}
            = Apollo has this phone (high success on reveal).{" "}
            <span className="font-medium text-amber-700 dark:text-amber-400">maybe</span>{" "}
            = Apollo will search async (lower success, same 8c cost). Both
            non-refundable. Hover badges for detail.
          </p>
        </CardContent>
      </Card>`;

const E4_MARKER = `Hover badges for detail.`;

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

const r1 = applyEdit("yes-tooltip", source, E1_OLD, E1_NEW, E1_MARKER);
if (!r1.ok) process.exit(3);
source = r1.source;

const r2 = applyEdit("maybe-tooltip", source, E2_OLD, E2_NEW, E2_MARKER);
if (!r2.ok) process.exit(3);
source = r2.source;

const r3 = applyEdit("no-tooltip", source, E3_OLD, E3_NEW, E3_MARKER);
if (!r3.ok) process.exit(3);
source = r3.source;

const r4 = applyEdit("explainer-line", source, E4_OLD, E4_NEW, E4_MARKER);
if (!r4.ok) process.exit(3);
source = r4.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  yesTooltip: countOccurrences(source, E1_MARKER) === 1,
  maybeTooltip: countOccurrences(source, E2_MARKER) === 1,
  noTooltip: countOccurrences(source, E3_MARKER) === 1,
  explainerLine: countOccurrences(source, E4_MARKER) === 1,
};
console.log("[bulk-tag-tooltips] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[bulk-tag-tooltips] FAIL — evidence check failed");
  process.exit(4);
}
console.log("[bulk-tag-tooltips] DONE");
process.exit(0);
