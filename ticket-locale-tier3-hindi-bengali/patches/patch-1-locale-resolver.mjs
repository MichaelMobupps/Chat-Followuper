#!/usr/bin/env node
/**
 * Ticket locale-tier3-hindi-bengali, patch 1/3: lib/localeResolver.ts
 *
 * One atomic edit: append hi and bn entries to LOCALE_TABLE.
 *
 * Routing:
 *   hi + IN  -> hi-IN  (India is the only major Hindi B2B adtech market)
 *   bn + BD  -> bn-BD  (Bangladesh Bengali)
 *   bn + IN  -> bn-IN  (India Bengali / West Bengal)
 *
 * Anchor: the closing of the de block at the end of LOCALE_TABLE. The
 * line LU: "de-DE" is unique to the de block, so anchoring on
 * (LU: "de-DE", close-brace, close-brace) is safe and em-dash-free.
 *
 * Idempotent. Anchor em-dash-free; box-drawing chars (U+2500) in NEW
 * are safe per the em-dash rule.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/lib/localeResolver.ts",
);

const E1_OLD = `    LU: "de-DE",
  },
};`;

const E1_NEW = `    LU: "de-DE",
  },

  // ── Hindi ─────────────────────────────────────────────────────
  // India is the only major Hindi B2B adtech market. Pakistan and
  // Nepal use Urdu and Nepali respectively in business contexts.
  hi: {
    IN: "hi-IN",
  },

  // ── Bengali ───────────────────────────────────────────────────
  // Two distinct markets that differ materially in vocabulary, peer
  // brands, and English code-mixing intensity: Bangladesh (bn-BD)
  // and India / West Bengal (bn-IN). Both default to the formal
  // আপনি (apni) verb form for B2B; bn-BD is somewhat less English-
  // heavy than bn-IN in everyday register.
  bn: {
    BD: "bn-BD",
    IN: "bn-IN",
  },
};`;

const E1_MARKER = `hi: {
    IN: "hi-IN",
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

for (const [label, oldStr, newStr, marker] of [
  ["locale-table-hi-bn", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  hiMappingAdded:      source.includes(`hi: {\n    IN: "hi-IN",\n  },`),
  bnMappingAdded:      source.includes(`bn: {\n    BD: "bn-BD",\n    IN: "bn-IN",\n  },`),
  deBlockUntouched:    source.includes(`de: {\n    DE: "de-DE",\n    AT: "de-AT",\n    CH: "de-CH",\n    LU: "de-DE",\n  },`),
  enBlockUntouched:    source.includes(`IN: "en-IN",`),
  resolveLocaleSig:    source.includes(`export function resolveLocale(`),
  closingBracePresent: source.endsWith("\n") || source.endsWith("}"),
};
console.log("[locale-resolver-tier3] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[locale-resolver-tier3] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[locale-resolver-tier3] DONE");
