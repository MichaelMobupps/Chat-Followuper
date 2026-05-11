#!/usr/bin/env node
/**
 * Ticket locale-tier3-ja-ko, patch 1/3: lib/localeResolver.ts
 *
 * One atomic edit: append ja and ko entries to LOCALE_TABLE.
 *
 * Routing:
 *   ja + JP -> ja-JP  (Japan is the only major Japanese B2B adtech market)
 *   ko + KR -> ko-KR  (South Korea is the only major Korean B2B adtech market;
 *                      North Korea has no B2B market access)
 *
 * Dependency: requires ticket-locale-tier3-hindi-bengali to have landed
 * (Edit 1 anchor expects the hi/bn block to be present just before
 * the closing brace of LOCALE_TABLE).
 *
 * Idempotent. Anchor em-dash-free. Box-drawing chars (U+2500) in NEW
 * are safe.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/lib/localeResolver.ts",
);

const E1_OLD = `  bn: {
    BD: "bn-BD",
    IN: "bn-IN",
  },
};`;

const E1_NEW = `  bn: {
    BD: "bn-BD",
    IN: "bn-IN",
  },

  // ── Japanese ──────────────────────────────────────────────────
  // Japan is the only major Japanese B2B adtech market. No other
  // country has commercial Japanese-language B2B volume.
  ja: {
    JP: "ja-JP",
  },

  // ── Korean ────────────────────────────────────────────────────
  // South Korea is the only major Korean B2B adtech market. North
  // Korea has no commercial B2B market access. Korean diaspora
  // markets (Korean-speakers in US, Japan, China) communicate in
  // their host-country language for B2B, not Korean.
  ko: {
    KR: "ko-KR",
  },
};`;

const E1_MARKER = `ja: {
    JP: "ja-JP",
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

// Pre-flight: verify the tier-3 hi/bn block landed first.
if (!source.includes(`bn: {\n    BD: "bn-BD",\n    IN: "bn-IN",\n  },`)) {
  console.error("[FATAL] this patch requires ticket-locale-tier3-hindi-bengali to have landed first");
  console.error("[FATAL] missing expected tier-3 hi/bn entries in LOCALE_TABLE");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["locale-table-ja-ko", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  jaMappingAdded:      source.includes(`ja: {\n    JP: "ja-JP",\n  },`),
  koMappingAdded:      source.includes(`ko: {\n    KR: "ko-KR",\n  },`),
  hiBlockUntouched:    source.includes(`hi: {\n    IN: "hi-IN",\n  },`),
  bnBlockUntouched:    source.includes(`bn: {\n    BD: "bn-BD",\n    IN: "bn-IN",\n  },`),
  deBlockUntouched:    source.includes(`de: {\n    DE: "de-DE",\n    AT: "de-AT",\n    CH: "de-CH",\n    LU: "de-DE",\n  },`),
  enINUntouched:       source.includes(`IN: "en-IN",`),
  resolveLocaleSig:    source.includes(`export function resolveLocale(`),
  jpCountryMapping:    source.includes(`japan: "JP",`),
  krCountryMapping:    source.includes(`"south korea": "KR",`),
};
console.log("[locale-resolver-ja-ko] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[locale-resolver-ja-ko] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[locale-resolver-ja-ko] DONE");
