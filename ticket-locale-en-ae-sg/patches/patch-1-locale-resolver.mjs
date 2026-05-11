#!/usr/bin/env node
/**
 * Ticket locale-en-ae-sg, patch 1/3: lib/localeResolver.ts
 *
 * One atomic edit: extend the existing en block to route UAE and
 * Singapore prospects to new en-AE and en-SG regional variants.
 *
 * Routing rationale:
 *   en + AE -> en-AE  (UAE B2B in mobile adtech and most enterprise
 *                      contexts defaults to English; ar-SA mapping
 *                      remains for Arabic-language prospects via the
 *                      existing ar block at AE -> ar-SA)
 *   en + SG -> en-SG  (Singapore is Asia's primary B2B / tech hub;
 *                      English is the official business language;
 *                      zh-Hans mapping remains for Chinese-language
 *                      prospects via the existing zh block at SG ->
 *                      zh-Hans)
 *
 * Dependency: requires ticket-locale-tier3-th-vi to have landed.
 * Idempotent. Anchor em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/lib/localeResolver.ts",
);

const E1_OLD = `    BE: "en-BE", // Belgium: English as neutral lingua franca in B2B tech (BE-Flemish vs BE-Walloon split)
    NL: "en-NL", // Netherlands: tech B2B defaults to English; bare nl remains fallback for explicit Dutch contexts
  },`;

const E1_NEW = `    BE: "en-BE", // Belgium: English as neutral lingua franca in B2B tech (BE-Flemish vs BE-Walloon split)
    NL: "en-NL", // Netherlands: tech B2B defaults to English; bare nl remains fallback for explicit Dutch contexts
    AE: "en-AE", // UAE: English-default B2B; ar-SA via ar block remains for Arabic-language prospects
    SG: "en-SG", // Singapore: English official business language; zh-Hans via zh block remains for Chinese-language prospects
  },`;

const E1_MARKER = `AE: "en-AE", // UAE: English-default B2B`;

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
  const idx = source.indexOf(oldStr);
  const newSource = source.substring(0, idx) + newStr + source.substring(idx + oldStr.length);
  return { source: newSource, ok: true };
}

let source;
try { source = readFileSync(FILE, "utf8"); }
catch (err) { console.error(`[FATAL] cannot read ${FILE}: ${err.message}`); process.exit(2); }

// Pre-flight: require prior tickets
if (!source.includes(`th: {\n    TH: "th-TH",\n  },`) ||
    !source.includes(`vi: {\n    VN: "vi-VN",\n  },`)) {
  console.error("[FATAL] this patch requires ticket-locale-tier3-th-vi to have landed first");
  console.error("[FATAL] missing expected th or vi block in LOCALE_TABLE");
  process.exit(5);
}
if (!source.includes(`BE: "en-BE"`) || !source.includes(`NL: "en-NL"`)) {
  console.error("[FATAL] missing en-BE / en-NL mappings (precondition: ticket-locale-en-be-nl)");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["en-table-ae-sg", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  aeMappingAdded:       source.includes(`AE: "en-AE"`),
  sgMappingAdded:       source.includes(`SG: "en-SG"`),
  enBlockExtended:      source.includes(`AE: "en-AE", // UAE: English-default B2B`) &&
                        source.includes(`SG: "en-SG", // Singapore: English official business language`),
  // Prior en-* mappings untouched
  gbMappingUntouched:   source.includes(`GB: "en-GB",`),
  beMappingUntouched:   source.includes(`BE: "en-BE"`),
  nlMappingUntouched:   source.includes(`NL: "en-NL"`),
  usMappingUntouched:   source.includes(`US: "en-US",`),
  inMappingUntouched:   source.includes(`IN: "en-IN",`),
  // Existing zh/SG and ar/AE mappings should still exist (untouched, separate blocks)
  zhSGMappingUntouched: source.includes(`SG: "zh-Hans"`),
  arAEMappingUntouched: source.includes(`AE: "ar-SA"`),
  // Prior tier-3 untouched
  thBlockUntouched:    source.includes(`th: {\n    TH: "th-TH",\n  },`),
  viBlockUntouched:    source.includes(`vi: {\n    VN: "vi-VN",\n  },`),
  bgBlockUntouched:    source.includes(`bg: {\n    BG: "bg-BG",\n  },`),
  elBlockUntouched:    source.includes(`el: {\n    GR: "el-GR",\n  },`),
  huBlockUntouched:    source.includes(`hu: {\n    HU: "hu-HU",\n  },`),
  roBlockUntouched:    source.includes(`ro: {\n    RO: "ro-RO",\n  },`),
  csBlockUntouched:    source.includes(`cs: {\n    CZ: "cs-CZ",\n  },`),
  ukBlockUntouched:    source.includes(`uk: {\n    UA: "uk-UA",\n  },`),
  ruBlockUntouched:    source.includes(`ru: {\n    RU: "ru-RU",\n  },`),
  idBlockUntouched:    source.includes(`id: {\n    ID: "id-ID",\n  },`),
  itBlockUntouched:    source.includes(`it: {\n    IT: "it-IT",\n  },`),
  jaBlockUntouched:    source.includes(`ja: {\n    JP: "ja-JP",\n  },`),
  hiBlockUntouched:    source.includes(`hi: {\n    IN: "hi-IN",\n  },`),
  resolveLocaleSig:    source.includes(`export function resolveLocale(`),
  uaeCountryMapping:   source.includes(`uae: "AE",`),
  singaporeCountryMapping: source.includes(`singapore: "SG",`),
};
console.log("[locale-resolver-en-ae-sg] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[locale-resolver-en-ae-sg] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[locale-resolver-en-ae-sg] DONE");
