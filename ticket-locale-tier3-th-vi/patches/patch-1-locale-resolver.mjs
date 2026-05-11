#!/usr/bin/env node
/**
 * Ticket locale-tier3-th-vi, patch 1/3: lib/localeResolver.ts
 *
 * One atomic edit: append th and vi entries to LOCALE_TABLE.
 *
 * Routing:
 *   th + TH -> th-TH  (Thailand is the only major Thai B2B adtech
 *                      market; Thai-speaking minorities in northern
 *                      Malaysia and Cambodia are not significant for
 *                      B2B routing)
 *   vi + VN -> vi-VN  (Vietnam is the only major Vietnamese B2B
 *                      market; overseas Vietnamese communities use
 *                      host-country language for B2B)
 *
 * Dependency: requires ticket-locale-en-be-nl to have landed.
 * Idempotent. Anchor em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/lib/localeResolver.ts",
);

const E1_OLD = `  el: {
    GR: "el-GR",
  },
};`;

const E1_NEW = `  el: {
    GR: "el-GR",
  },

  // ── Thai ──────────────────────────────────────────────────────
  // Thailand is the only major Thai B2B adtech market.
  th: {
    TH: "th-TH",
  },

  // ── Vietnamese ────────────────────────────────────────────────
  // Vietnam is the only major Vietnamese B2B market. Overseas
  // Vietnamese communities (US, Australia, Canada) use host-country
  // language for B2B.
  vi: {
    VN: "vi-VN",
  },
};`;

const E1_MARKER = `th: {
    TH: "th-TH",
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

if (!source.includes(`BE: "en-BE"`) || !source.includes(`NL: "en-NL"`)) {
  console.error("[FATAL] this patch requires ticket-locale-en-be-nl to have landed first");
  console.error("[FATAL] missing expected BE/NL mappings in en block");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["locale-table-th-vi", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  thMappingAdded:      source.includes(`th: {\n    TH: "th-TH",\n  },`),
  viMappingAdded:      source.includes(`vi: {\n    VN: "vi-VN",\n  },`),
  // Prior unaffected
  enBEMappingUntouched: source.includes(`BE: "en-BE"`),
  enNLMappingUntouched: source.includes(`NL: "en-NL"`),
  elBlockUntouched:    source.includes(`el: {\n    GR: "el-GR",\n  },`),
  bgBlockUntouched:    source.includes(`bg: {\n    BG: "bg-BG",\n  },`),
  huBlockUntouched:    source.includes(`hu: {\n    HU: "hu-HU",\n  },`),
  roBlockUntouched:    source.includes(`ro: {\n    RO: "ro-RO",\n  },`),
  csBlockUntouched:    source.includes(`cs: {\n    CZ: "cs-CZ",\n  },`),
  ukBlockUntouched:    source.includes(`uk: {\n    UA: "uk-UA",\n  },`),
  ruBlockUntouched:    source.includes(`ru: {\n    RU: "ru-RU",\n  },`),
  idBlockUntouched:    source.includes(`id: {\n    ID: "id-ID",\n  },`),
  itBlockUntouched:    source.includes(`it: {\n    IT: "it-IT",\n  },`),
  plBlockUntouched:    source.includes(`pl: {\n    PL: "pl-PL",\n  },`),
  heBlockUntouched:    source.includes(`he: {\n    IL: "he-IL",\n  },`),
  trBlockUntouched:    source.includes(`tr: {\n    TR: "tr-TR",\n  },`),
  jaBlockUntouched:    source.includes(`ja: {\n    JP: "ja-JP",\n  },`),
  koBlockUntouched:    source.includes(`ko: {\n    KR: "ko-KR",\n  },`),
  hiBlockUntouched:    source.includes(`hi: {\n    IN: "hi-IN",\n  },`),
  bnBlockUntouched:    source.includes(`bn: {\n    BD: "bn-BD",\n    IN: "bn-IN",\n  },`),
  resolveLocaleSig:    source.includes(`export function resolveLocale(`),
  thailandCountryMapping: source.includes(`thailand: "TH",`),
  vietnamCountryMapping: source.includes(`vietnam: "VN",`),
};
console.log("[locale-resolver-th-vi] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[locale-resolver-th-vi] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[locale-resolver-th-vi] DONE");
