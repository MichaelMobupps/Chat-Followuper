#!/usr/bin/env node
/**
 * Ticket locale-tier3-he-tr, patch 1/3: lib/localeResolver.ts
 *
 * One atomic edit: append he and tr entries to LOCALE_TABLE.
 *
 * Routing:
 *   he + IL -> he-IL  (Israel is the only major Hebrew B2B adtech market)
 *   tr + TR -> tr-TR  (Turkey is the primary Turkish B2B adtech market;
 *                      Cyprus tr-CY exists linguistically but is not a
 *                      commercial B2B target for adtech)
 *
 * Dependency: requires ticket-locale-tier3-ja-ko to have landed (the
 * anchor expects the ko block at the end of LOCALE_TABLE).
 *
 * Idempotent. Anchor em-dash-free. Box-drawing chars in NEW are safe.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/lib/localeResolver.ts",
);

const E1_OLD = `  ko: {
    KR: "ko-KR",
  },
};`;

const E1_NEW = `  ko: {
    KR: "ko-KR",
  },

  // ── Hebrew ────────────────────────────────────────────────────
  // Israel is the only major Hebrew B2B adtech market. Hebrew is
  // not used in business contexts outside Israel; diaspora Jewish
  // communities communicate in their host-country language for B2B.
  he: {
    IL: "he-IL",
  },

  // ── Turkish ───────────────────────────────────────────────────
  // Turkey is the primary Turkish B2B adtech market. Turkish is
  // also spoken in Cyprus and parts of the Balkans, but those are
  // not commercial B2B targets for mobile adtech.
  tr: {
    TR: "tr-TR",
  },
};`;

const E1_MARKER = `he: {
    IL: "he-IL",
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

// Pre-flight: verify the tier-3 ja/ko block landed first.
if (!source.includes(`ko: {\n    KR: "ko-KR",\n  },`)) {
  console.error("[FATAL] this patch requires ticket-locale-tier3-ja-ko to have landed first");
  console.error("[FATAL] missing expected ko block in LOCALE_TABLE");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["locale-table-he-tr", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  heMappingAdded:      source.includes(`he: {\n    IL: "he-IL",\n  },`),
  trMappingAdded:      source.includes(`tr: {\n    TR: "tr-TR",\n  },`),
  jaBlockUntouched:    source.includes(`ja: {\n    JP: "ja-JP",\n  },`),
  koBlockUntouched:    source.includes(`ko: {\n    KR: "ko-KR",\n  },`),
  hiBlockUntouched:    source.includes(`hi: {\n    IN: "hi-IN",\n  },`),
  bnBlockUntouched:    source.includes(`bn: {\n    BD: "bn-BD",\n    IN: "bn-IN",\n  },`),
  deBlockUntouched:    source.includes(`de: {\n    DE: "de-DE",\n    AT: "de-AT",\n    CH: "de-CH",\n    LU: "de-DE",\n  },`),
  resolveLocaleSig:    source.includes(`export function resolveLocale(`),
  ilCountryMapping:    source.includes(`israel: "IL",`),
  trCountryMapping:    source.includes(`turkey: "TR",`),
};
console.log("[locale-resolver-he-tr] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[locale-resolver-he-tr] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[locale-resolver-he-tr] DONE");
