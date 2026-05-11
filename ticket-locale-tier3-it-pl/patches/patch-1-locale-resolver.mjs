#!/usr/bin/env node
/**
 * Ticket locale-tier3-it-pl, patch 1/3: lib/localeResolver.ts
 *
 * One atomic edit: append it and pl entries to LOCALE_TABLE.
 *
 * Routing:
 *   it + IT -> it-IT  (Italy is the primary Italian B2B adtech market;
 *                      Italian-Switzerland and San Marino are too small
 *                      to warrant separate buckets for adtech)
 *   pl + PL -> pl-PL  (Poland is the only major Polish B2B market)
 *
 * Dependency: requires ticket-locale-tier3-he-tr to have landed (the
 * anchor expects the tr block at the end of LOCALE_TABLE).
 *
 * Idempotent. Anchor em-dash-free. Box-drawing chars in NEW are safe.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/lib/localeResolver.ts",
);

const E1_OLD = `  tr: {
    TR: "tr-TR",
  },
};`;

const E1_NEW = `  tr: {
    TR: "tr-TR",
  },

  // ── Italian ───────────────────────────────────────────────────
  // Italy is the primary Italian B2B adtech market. Italian-speaking
  // Switzerland (Ticino) and San Marino are too small to warrant
  // separate adtech buckets; Italian-speakers in those markets
  // resolve to it-IT by default which is correct for B2B register.
  it: {
    IT: "it-IT",
  },

  // ── Polish ────────────────────────────────────────────────────
  // Poland is the only major Polish B2B adtech market. Polish is
  // spoken in diaspora communities but those are not commercial
  // B2B adtech targets.
  pl: {
    PL: "pl-PL",
  },
};`;

const E1_MARKER = `it: {
    IT: "it-IT",
  },`;

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) { count++; idx += needle.length; }
  return count;
}

function applyEdit(label, source, oldStr, newStr, marker) {
  const m = countOccurrences(source, marker);
  const o = countOccurrences(source, oldStr);
  if (m > 0) { console.log(`[${label}] SKIP - already applied`); return { source, ok: true }; }
  if (o === 0) { console.log(`[${label}] NOOP - anchor not found`); return { source, ok: false }; }
  if (o > 1) { console.log(`[${label}] FAIL - anchor matched ${o} times`); return { source, ok: false }; }
  console.log(`[${label}] APPLY`);
  return { source: source.replace(oldStr, newStr), ok: true };
}

let source;
try { source = readFileSync(FILE, "utf8"); }
catch (err) { console.error(`[FATAL] cannot read ${FILE}: ${err.message}`); process.exit(2); }

// Pre-flight: verify the he-tr tier-3 block landed first.
if (!source.includes(`tr: {\n    TR: "tr-TR",\n  },`)) {
  console.error("[FATAL] this patch requires ticket-locale-tier3-he-tr to have landed first");
  console.error("[FATAL] missing expected tr block in LOCALE_TABLE");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["locale-table-it-pl", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  itMappingAdded:      source.includes(`it: {\n    IT: "it-IT",\n  },`),
  plMappingAdded:      source.includes(`pl: {\n    PL: "pl-PL",\n  },`),
  heBlockUntouched:    source.includes(`he: {\n    IL: "he-IL",\n  },`),
  trBlockUntouched:    source.includes(`tr: {\n    TR: "tr-TR",\n  },`),
  jaBlockUntouched:    source.includes(`ja: {\n    JP: "ja-JP",\n  },`),
  koBlockUntouched:    source.includes(`ko: {\n    KR: "ko-KR",\n  },`),
  hiBlockUntouched:    source.includes(`hi: {\n    IN: "hi-IN",\n  },`),
  bnBlockUntouched:    source.includes(`bn: {\n    BD: "bn-BD",\n    IN: "bn-IN",\n  },`),
  deBlockUntouched:    source.includes(`de: {\n    DE: "de-DE",\n    AT: "de-AT",\n    CH: "de-CH",\n    LU: "de-DE",\n  },`),
  resolveLocaleSig:    source.includes(`export function resolveLocale(`),
  itCountryMapping:    source.includes(`italy: "IT",`),
  plCountryMapping:    source.includes(`poland: "PL",`),
};
console.log("[locale-resolver-it-pl] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[locale-resolver-it-pl] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[locale-resolver-it-pl] DONE");
