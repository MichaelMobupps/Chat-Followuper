#!/usr/bin/env node
/**
 * Ticket locale-tier3-ru-id, patch 1/3: lib/localeResolver.ts
 *
 * One atomic edit: append ru and id entries to LOCALE_TABLE.
 *
 * Routing:
 *   ru + RU -> ru-RU  (Russia is the primary Russian B2B adtech market;
 *                      Russian is also widely spoken in Belarus,
 *                      Kazakhstan, Kyrgyzstan, but those B2B contexts
 *                      use a Russian register similar enough to RU
 *                      that a single bucket suffices)
 *   id + ID -> id-ID  (Indonesia is the only major Indonesian B2B
 *                      adtech market; Bahasa Indonesia is also the
 *                      formal register; Indonesian diaspora communities
 *                      are not commercial B2B targets)
 *
 * Dependency: requires ticket-locale-tier3-it-pl to have landed (the
 * anchor expects the pl block at the end of LOCALE_TABLE).
 *
 * Idempotent. Anchor em-dash-free. Box-drawing chars in NEW are safe.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/lib/localeResolver.ts",
);

const E1_OLD = `  pl: {
    PL: "pl-PL",
  },
};`;

const E1_NEW = `  pl: {
    PL: "pl-PL",
  },

  // ── Russian ───────────────────────────────────────────────────
  // Russia is the primary Russian B2B adtech market. Russian is
  // widely spoken in Belarus, Kazakhstan, Kyrgyzstan, and other
  // post-Soviet states; B2B Russian in those markets is register-
  // adjacent enough to RU that a single bucket suffices for adtech.
  ru: {
    RU: "ru-RU",
  },

  // ── Indonesian ────────────────────────────────────────────────
  // Indonesia is the only major Indonesian B2B adtech market.
  // Bahasa Indonesia is the formal register; Malay (ms) is a
  // separate language with its own register and is routed
  // separately when present. Indonesian-speaking diaspora
  // communities are not commercial B2B adtech targets.
  id: {
    ID: "id-ID",
  },
};`;

const E1_MARKER = `ru: {
    RU: "ru-RU",
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

// Pre-flight: verify the it-pl tier-3 block landed first.
if (!source.includes(`pl: {\n    PL: "pl-PL",\n  },`)) {
  console.error("[FATAL] this patch requires ticket-locale-tier3-it-pl to have landed first");
  console.error("[FATAL] missing expected pl block in LOCALE_TABLE");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["locale-table-ru-id", E1_OLD, E1_NEW, E1_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  ruMappingAdded:      source.includes(`ru: {\n    RU: "ru-RU",\n  },`),
  idMappingAdded:      source.includes(`id: {\n    ID: "id-ID",\n  },`),
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
  ruCountryMapping:    source.includes(`russia: "RU",`),
  idCountryMapping:    source.includes(`indonesia: "ID",`),
};
console.log("[locale-resolver-ru-id] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[locale-resolver-ru-id] FAIL -", failing.join(", "));
  process.exit(4);
}
console.log("[locale-resolver-ru-id] DONE");
