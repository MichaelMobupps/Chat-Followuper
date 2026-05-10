#!/usr/bin/env node
/**
 * Ticket B-locale-tier1 — patch 2/2: services/messagePrompts.ts
 *
 * Adds 11 regional-locale entries to the GREETING_TABLE map:
 *   pt-BR, pt-PT
 *   es-MX, es-AR, es-CO, es-ES
 *   zh-Hans, zh-Hant
 *   ar-EG, ar-SA, ar-MA
 *
 * Each entry follows the existing GREETING_TABLE format (single-line
 * object literal with withName, withoutName, note). The lookup at
 * buildGreetingBlock tries the full tag first (e.g. "pt-BR") and falls
 * back to the primary subtag ("pt") if no region-specific entry exists.
 *
 * Anchor: the closing of the GREETING_TABLE block (after am entry,
 * before }). No em-dashes in the anchor.
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/services/messagePrompts.ts",
);

// ─────────────────────────────────────────────────────────────────
// New regional-locale greeting entries
// ─────────────────────────────────────────────────────────────────

const NEW_ENTRIES = `
  // ── REGIONAL LOCALES (B-locale-tier1) ──────────────────────────
  // Region-aware overrides for languages that vary materially across
  // markets. The lookup at buildGreetingBlock tries the full tag first
  // (e.g. "pt-BR") and falls back to the primary subtag ("pt").

  "pt-BR": { withName: "Olá {NAME},", withoutName: "Olá,", note: "Brazilian Portuguese, casual-professional B2B WhatsApp register; use 'voce' verb forms throughout. Avoid Iberian formality ('Prezado'). BR-localized vocabulary only (celular, tela, arquivo, mouse, onibus)." },
  "pt-PT": { withName: "Olá {NAME},", withoutName: "Olá,", note: "European Portuguese, more formal than BR; use 'voce' or 'o senhor / a senhora' verb forms. PT-localized vocabulary only (telemovel, ecra, ficheiro, rato, autocarro)." },
  "es-MX": { withName: "Hola {NAME},", withoutName: "Hola,", note: "Mexican Spanish, 'usted' for cold outreach; 'Buen dia' / 'Buenos dias' also acceptable. Use computadora, celular, carro." },
  "es-AR": { withName: "Hola {NAME},", withoutName: "Hola,", note: "Argentinian / Southern Cone Spanish, 'usted' for cold; voseo (vos) is informal, fine once warm. Avoid 'che' for B2B. Use computadora, celular, auto." },
  "es-CO": { withName: "Hola {NAME},", withoutName: "Cordial saludo,", note: "Colombian / Northern LATAM Spanish, high politeness register; 'usted' throughout. 'Cordial saludo {NAME},' also acceptable as opener. Use computador (masculine), celular." },
  "es-ES": { withName: "Hola {NAME},", withoutName: "Hola,", note: "Iberian Spanish, 'usted' (formal) or 'tu' (modern tech B2B). Use ordenador, movil, coche. 'Vosotros' for plural informal (Spain only)." },
  "zh-Hans": { withName: "您好，{NAME}：", withoutName: "您好，", note: "Simplified Chinese (Mainland China + Singapore). EVERY character must be Simplified, never mix Traditional. 您 register only, never 你 alone." },
  "zh-Hant": { withName: "您好，{NAME}：", withoutName: "您好，", note: "Traditional Chinese (Taiwan, Hong Kong, Macau). EVERY character must be Traditional, never mix Simplified. 您 register only." },
  "ar-EG": { withName: "مرحبا {NAME}،", withoutName: "مرحبا،", note: "Egyptian Arabic, write body in MSA (not عامية). 'السلام عليكم' acceptable for visibly Muslim contexts; 'مرحبا' is the secular default for unknown recipients." },
  "ar-SA": { withName: "السلام عليكم {NAME}،", withoutName: "السلام عليكم،", note: "Gulf Arabic, most formal MSA register. 'السلام عليكم' is the standard cold-B2B opener across SA, AE, QA, KW, BH, OM." },
  "ar-MA": { withName: "مرحبا {NAME}،", withoutName: "مرحبا،", note: "Maghrebi Arabic, French loanwords are standard in B2B. 'Bonjour {NAME},' as French opener is also acceptable in MA, DZ, TN where French is the working language." },
`;

// ─── Edit — insert new entries before closing }; of GREETING_TABLE ──
const E_OLD = `  am: { withName: "ሰላም {NAME},", withoutName: "ሰላም,", note: "" },
};`;

const E_NEW = `  am: { withName: "ሰላም {NAME},", withoutName: "ሰላም,", note: "" },
${NEW_ENTRIES}};`;

const E_MARKER = `// ── REGIONAL LOCALES (B-locale-tier1)`;

// ─── applyEdit ───────────────────────────────────────────────────

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) { count++; idx += needle.length; }
  return count;
}

function applyEdit(label, source, oldStr, newStr, marker) {
  const m = countOccurrences(source, marker);
  const o = countOccurrences(source, oldStr);
  if (m > 0) { console.log(`[${label}] SKIP — already applied`); return { source, ok: true }; }
  if (o === 0) { console.log(`[${label}] NOOP — anchor not found`); return { source, ok: false }; }
  if (o > 1) { console.log(`[${label}] FAIL — anchor matched ${o} times`); return { source, ok: false }; }
  console.log(`[${label}] APPLY`);
  return { source: source.replace(oldStr, newStr), ok: true };
}

let source;
try { source = readFileSync(FILE, "utf8"); }
catch (err) { console.error(`[FATAL] cannot read ${FILE}: ${err.message}`); process.exit(2); }

const r = applyEdit("greeting-tier1", source, E_OLD, E_NEW, E_MARKER);
if (!r.ok) process.exit(3);
source = r.source;

writeFileSync(FILE, source, "utf8");

const evidence = {
  markerPresent: countOccurrences(source, "// ── REGIONAL LOCALES (B-locale-tier1)") === 1,
  ptBR: countOccurrences(source, `"pt-BR": { withName: "Olá`) === 1,
  ptPT: countOccurrences(source, `"pt-PT": { withName: "Olá`) === 1,
  esMX: countOccurrences(source, `"es-MX": { withName: "Hola`) === 1,
  esAR: countOccurrences(source, `"es-AR": { withName: "Hola`) === 1,
  esCO: countOccurrences(source, `"es-CO": { withName: "Hola`) === 1,
  esES: countOccurrences(source, `"es-ES": { withName: "Hola`) === 1,
  zhHans: countOccurrences(source, `"zh-Hans": { withName: "您好`) === 1,
  zhHant: countOccurrences(source, `"zh-Hant": { withName: "您好`) === 1,
  arEG: countOccurrences(source, `"ar-EG": { withName: "مرحبا`) === 1,
  arSA: countOccurrences(source, `"ar-SA": { withName: "السلام عليكم`) === 1,
  arMA: countOccurrences(source, `"ar-MA": { withName: "مرحبا`) === 1,
  ptOriginalIntact: countOccurrences(source, `pt: { withName: "Olá {NAME},"`) === 1,
  esOriginalIntact: countOccurrences(source, `es: { withName: "Hola {NAME},"`) === 1,
  zhOriginalIntact: countOccurrences(source, `zh: { withName: "您好，{NAME}："`) === 1,
  arOriginalIntact: countOccurrences(source, `ar: { withName: "مرحبا {NAME},"`) === 1,
};
console.log("[greeting-tier1] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[greeting-tier1] FAIL"); process.exit(4);
}
console.log("[greeting-tier1] DONE");
