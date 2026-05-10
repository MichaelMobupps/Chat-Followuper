#!/usr/bin/env node
/**
 * Ticket 2.3-FE hotfix — TS2339 in BulkResults.tsx
 *
 * The original code had `err instanceof ApiError ? ... : err.message` in
 * useWhatsappLink's onError. Since useWhatsappLink declares TError =
 * ApiError, the else branch is `never` and TS rejects err.message access.
 *
 * Fix: drop the unreachable narrowing and access err.code / err.message
 * directly. This matches the convention used elsewhere in the codebase
 * (mutations declare ApiError as TError and consumers trust the type).
 *
 * One anchored edit; idempotent via marker check (APPEND-style logic
 * from Defect #9).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/components/whatsapp-bulk/BulkResults.tsx",
);

const EDIT_OLD = `      onError: (err) => {
        const msg =
          err instanceof ApiError
            ? \`\${err.code ?? err.message}\`
            : err.message;
        toast({
          title: "Could not open WhatsApp link",
          description: msg,
          variant: "destructive",
        });
      },`;

const EDIT_NEW = `      onError: (err) => {
        // useWhatsappLink declares TError = ApiError so err is typed
        // accordingly. err.code may be undefined for non-API errors
        // (network failures still surface as ApiError but with no code);
        // err.message is always present on ApiError.
        const msg = err.code ?? err.message;
        toast({
          title: "Could not open WhatsApp link",
          description: msg,
          variant: "destructive",
        });
      },`;

const EDIT_MARKER = `// useWhatsappLink declares TError = ApiError so err is typed`;

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count += 1;
    idx += needle.length;
  }
  return count;
}

let source;
try {
  source = readFileSync(FILE, "utf8");
} catch (err) {
  console.error(`[FATAL] cannot read ${FILE}: ${err.message}`);
  process.exit(2);
}

const m = countOccurrences(source, EDIT_MARKER);
const o = countOccurrences(source, EDIT_OLD);

if (m > 0) {
  console.log("[bulk-results-narrowing] SKIP — already applied");
  process.exit(0);
}
if (o === 0) {
  console.log("[bulk-results-narrowing] NOOP — anchor not found; file in unexpected state");
  process.exit(3);
}
if (o > 1) {
  console.log(`[bulk-results-narrowing] FAIL — anchor matched ${o} times`);
  process.exit(3);
}

writeFileSync(FILE, source.replace(EDIT_OLD, EDIT_NEW), "utf8");

const next = readFileSync(FILE, "utf8");
const evidence = {
  unreachableNarrowingGone: countOccurrences(next, "err instanceof ApiError") === 0,
  simplifiedAccessPresent: countOccurrences(next, "const msg = err.code ?? err.message;") === 1,
  marker: countOccurrences(next, EDIT_MARKER) === 1,
};
console.log("[bulk-results-narrowing] APPLY — patch applied");
console.log("[bulk-results-narrowing] [evidence]", JSON.stringify(evidence));

if (Object.values(evidence).some((v) => !v)) {
  console.log("[bulk-results-narrowing] FAIL — evidence check failed");
  process.exit(4);
}
process.exit(0);
