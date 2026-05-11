#!/usr/bin/env node
/**
 * Ticket locale-tier3-bg-el, patch 1/3: lib/localeResolver.ts
 *
 * One atomic edit: append bg and el entries to LOCALE_TABLE.
 *
 * Routing:
 *   bg + BG -> bg-BG  (Bulgaria is the only major Bulgarian B2B
 *                      adtech market)
 *   el + GR -> el-GR  (Greece is the primary Greek B2B adtech
 *                      market; Cyprus el-CY exists linguistically
 *                      but is much smaller and falls to bare el)
 *
 * Dependency: requires ticket-locale-tier3-ro-hu to have landed (anchor
 * expects hu block at end of LOCALE_TABLE).
 *
 * Idempotent. Anchor em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/lib/localeResolver.ts",
);

const E1_OLD = `  hu: {
    HU: "hu-HU",
  },
};`;

const E1_NEW = `  hu: {
    HU: "hu-HU",
  },

  // ── Bulgarian ─────────────────────────────────────────────────
  // Bulgaria is the only major Bulgarian B2B adtech market.
  // Bulgarian-speaking minorities exist in Greece, North Macedonia,
  // Serbia, and Romania, but those use the host-country language
  // for B2B.
  bg: {
    BG: "bg-BG",
  },

  // ── Greek ─────────────────────────────────────────────────────
  // Greece is the primary Greek B2B adtech market. Cyprus (el-CY)
  // is technically Greek-speaking but the adtech market is too
  // small for a separate bucket; falls back to bare el for non-GR
  // contexts.
  el: {
    GR: "el-GR",
  },
};`;

const E1_MARKER = `bg: {
    BG: "bg-BG",
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

if (!source.includes(`hu: {\n    HU: "hu-HU",\n  },`)) {
  console.error("[FATAL] this patch requires ticket-locale-tier3-ro-hu to have landed first");
  console.error("[FATAL] missing expected hu block in LOCALE_TABLE");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["locale-table-bg-el", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  bgMappingAdded:      source.includes(`bg: {\n    BG: "bg-BG",\n  },`),
  elMappingAdded:      source.includes(`el: {\n    GR: "el-GR",\n  },`),
  huBlockUntouched:    source.includes(`hu: {\n    HU: "hu-HU",\n  },`),
  roBlockUntouched:    source.includes(`ro: {\n    RO: "ro-RO",\n  },`),
  csBlockUntouched:    source.includes(`cs: {\n    CZ: "cs-CZ",\n  },`),
  ukBlockUntouched:    source.includes(`uk: {\n    UA: "uk-UA",\n  },`),
  idBlockUntouched:    source.includes(`id: {\n    ID: "id-ID",\n  },`),
  ruBlockUntouched:    source.includes(`ru: {\n    RU: "ru-RU",\n  },`),
  itBlockUntouched:    source.includes(`it: {\n    IT: "it-IT",\n  },`),
  plBlockUntouched:    source.includes(`pl: {\n    PL: "pl-PL",\n  },`),
  heBlockUntouched:    source.includes(`he: {\n    IL: "he-IL",\n  },`),
  trBlockUntouched:    source.includes(`tr: {\n    TR: "tr-TR",\n  },`),
  jaBlockUntouched:    source.includes(`ja: {\n    JP: "ja-JP",\n  },`),
  koBlockUntouched:    source.includes(`ko: {\n    KR: "ko-KR",\n  },`),
  hiBlockUntouched:    source.includes(`hi: {\n    IN: "hi-IN",\n  },`),
  bnBlockUntouched:    source.includes(`bn: {\n    BD: "bn-BD",\n    IN: "bn-IN",\n  },`),
  deBlockUntouched:    source.includes(`de: {\n    DE: "de-DE",\n    AT: "de-AT",\n    CH: "de-CH",\n    LU: "de-DE",\n  },`),
  resolveLocaleSig:    source.includes(`export function resolveLocale(`),
  bulgariaCountryMapping: source.includes(`bulgaria: "BG",`),
  greeceCountryMapping: source.includes(`greece: "GR",`),
};
console.log("[locale-resolver-bg-el] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[locale-resolver-bg-el] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[locale-resolver-bg-el] DONE");
