#!/usr/bin/env node
/**
 * Ticket locale-en-be-nl, patch 1/3: lib/localeResolver.ts
 *
 * One atomic edit: extend the existing en block to route Belgium and
 * Netherlands prospects to new en-BE and en-NL regional variants.
 *
 * Routing rationale:
 *   en + BE -> en-BE  (Belgian B2B in mobile adtech contexts defaults
 *                      to English as the neutral lingua franca between
 *                      Flemish (Dutch) and Walloon (French) speakers;
 *                      international firms also operate in English)
 *   en + NL -> en-NL  (Dutch B2B in tech / mobile adtech overwhelmingly
 *                      uses English internally and externally; ~one-in-
 *                      four enterprises have English as primary working
 *                      language; bare nl is still the fallback for
 *                      explicitly Dutch-language contexts)
 *
 * Dependency: requires ticket-locale-tier3-bg-el to have landed.
 * Idempotent. Anchor em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/lib/localeResolver.ts",
);

const E1_OLD = `  en: {
    GB: "en-GB",
    IE: "en-GB", // Ireland: GB-aligned in B2B register
    AU: "en-GB", // Australia: closer to en-GB than en-US in B2B
    NZ: "en-GB",
    ZA: "en-GB",
    IN: "en-IN",
    PK: "en-IN",
    BD: "en-IN",
    LK: "en-IN",
    US: "en-US",
    CA: "en-US", // Canadian B2B largely en-US in adtech
  },`;

const E1_NEW = `  en: {
    GB: "en-GB",
    IE: "en-GB", // Ireland: GB-aligned in B2B register
    AU: "en-GB", // Australia: closer to en-GB than en-US in B2B
    NZ: "en-GB",
    ZA: "en-GB",
    IN: "en-IN",
    PK: "en-IN",
    BD: "en-IN",
    LK: "en-IN",
    US: "en-US",
    CA: "en-US", // Canadian B2B largely en-US in adtech
    BE: "en-BE", // Belgium: English as neutral lingua franca in B2B tech (BE-Flemish vs BE-Walloon split)
    NL: "en-NL", // Netherlands: tech B2B defaults to English; bare nl remains fallback for explicit Dutch contexts
  },`;

const E1_MARKER = `BE: "en-BE", // Belgium: English as neutral lingua franca`;

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

// Pre-flight: ensure bg-el ticket has landed (the prior CEE sweep close)
if (!source.includes(`bg: {\n    BG: "bg-BG",\n  },`) ||
    !source.includes(`el: {\n    GR: "el-GR",\n  },`)) {
  console.error("[FATAL] this patch requires ticket-locale-tier3-bg-el to have landed first");
  console.error("[FATAL] missing expected bg or el block in LOCALE_TABLE");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["en-table-be-nl", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  beMappingAdded:      source.includes(`BE: "en-BE"`),
  nlMappingAdded:      source.includes(`NL: "en-NL"`),
  enBlockExtended:     source.includes(`BE: "en-BE", // Belgium`) &&
                       source.includes(`NL: "en-NL", // Netherlands`),
  gbMappingUntouched:  source.includes(`GB: "en-GB",`),
  ieMappingUntouched:  source.includes(`IE: "en-GB",`),
  auMappingUntouched:  source.includes(`AU: "en-GB",`),
  nzMappingUntouched:  source.includes(`NZ: "en-GB",`),
  zaMappingUntouched:  source.includes(`ZA: "en-GB",`),
  inMappingUntouched:  source.includes(`IN: "en-IN",`),
  pkMappingUntouched:  source.includes(`PK: "en-IN",`),
  usMappingUntouched:  source.includes(`US: "en-US",`),
  caMappingUntouched:  source.includes(`CA: "en-US"`),
  // Prior tier-3 untouched
  bgBlockUntouched:    source.includes(`bg: {\n    BG: "bg-BG",\n  },`),
  elBlockUntouched:    source.includes(`el: {\n    GR: "el-GR",\n  },`),
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
  deBlockUntouched:    source.includes(`de: {\n    DE: "de-DE",\n    AT: "de-AT",\n    CH: "de-CH",\n    LU: "de-DE",\n  },`),
  resolveLocaleSig:    source.includes(`export function resolveLocale(`),
  belgiumCountryMapping: source.includes(`belgium: "BE",`),
  netherlandsCountryMapping: source.includes(`netherlands: "NL",`),
};
console.log("[locale-resolver-en-be-nl] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[locale-resolver-en-be-nl] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[locale-resolver-en-be-nl] DONE");
