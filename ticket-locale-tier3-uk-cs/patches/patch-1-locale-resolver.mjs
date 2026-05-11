#!/usr/bin/env node
/**
 * Ticket locale-tier3-uk-cs, patch 1/3: lib/localeResolver.ts
 *
 * One atomic edit: append uk and cs entries to LOCALE_TABLE.
 *
 * Routing:
 *   uk + UA -> uk-UA  (Ukraine is the only major Ukrainian B2B
 *                      adtech market; the Ukrainian diaspora in
 *                      Poland and elsewhere uses host-country
 *                      language for B2B)
 *   cs + CZ -> cs-CZ  (Czech Republic / Czechia is the only major
 *                      Czech B2B adtech market; Slovak (sk) is a
 *                      separate language and is not bundled with cs)
 *
 * Dependency: requires ticket-locale-tier3-ru-id to have landed (the
 * anchor expects the id block at the end of LOCALE_TABLE). This is
 * the first ticket of the CEE long-tail sweep, following the prior
 * tier-3 sweep tickets in chronological order.
 *
 * Idempotent. Anchor em-dash-free. Box-drawing chars in NEW are safe.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/lib/localeResolver.ts",
);

const E1_OLD = `  id: {
    ID: "id-ID",
  },
};`;

const E1_NEW = `  id: {
    ID: "id-ID",
  },

  // ── Ukrainian ─────────────────────────────────────────────────
  // Ukraine is the only major Ukrainian B2B adtech market. The
  // Ukrainian diaspora in Poland and elsewhere uses host-country
  // languages for B2B; Ukrainian B2B adtech is concentrated in
  // Ukraine itself plus a growing Lviv-IT remote-work footprint.
  uk: {
    UA: "uk-UA",
  },

  // ── Czech ─────────────────────────────────────────────────────
  // Czech Republic / Czechia is the only major Czech B2B adtech
  // market. Czech is a separate language from Slovak (sk) and the
  // two should not be bundled despite mutual intelligibility; B2B
  // norms differ meaningfully.
  cs: {
    CZ: "cs-CZ",
  },
};`;

const E1_MARKER = `uk: {
    UA: "uk-UA",
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

// Pre-flight: verify the ru-id tier-3 block landed first.
if (!source.includes(`id: {\n    ID: "id-ID",\n  },`)) {
  console.error("[FATAL] this patch requires ticket-locale-tier3-ru-id to have landed first");
  console.error("[FATAL] missing expected id block in LOCALE_TABLE");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["locale-table-uk-cs", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  ukMappingAdded:      source.includes(`uk: {\n    UA: "uk-UA",\n  },`),
  csMappingAdded:      source.includes(`cs: {\n    CZ: "cs-CZ",\n  },`),
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
  ukraineCountryMapping: source.includes(`ukraine: "UA",`),
  czechRepublicMapping: source.includes(`"czech republic": "CZ",`),
};
console.log("[locale-resolver-uk-cs] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[locale-resolver-uk-cs] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[locale-resolver-uk-cs] DONE");
