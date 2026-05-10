#!/usr/bin/env node
/**
 * Ticket prospect-multi-format-upload — patch 2/2:
 *   update artifacts/dashboard/src/components/whatsapp-bulk/UrlInput.tsx
 *
 * Four atomic edits:
 *   2a. Imports — add parseUploadedUrls helper import and useToast.
 *   2b. Component body — add `const { toast } = useToast();` after
 *       existing useState hooks.
 *   2c. handleFileUpload — replace the synchronous text-only reader
 *       with an async dispatcher that calls parseUploadedUrls and
 *       surfaces warnings via toast.
 *   2d. Button label + accept attribute — change "Upload .txt" to
 *       "Upload file" and broaden accept to all supported types.
 *
 * Idempotent. All anchors em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/components/whatsapp-bulk/UrlInput.tsx",
);

// ═════════════════════════════════════════════════════════════════
// Edit 2a — add imports
// ═════════════════════════════════════════════════════════════════

const E2A_OLD = `import { useState, useMemo } from "react";
import { Upload, Trash2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";`;

const E2A_NEW = `import { useState, useMemo } from "react";
import { Upload, Trash2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { parseUploadedUrls } from "@/lib/parse-uploaded-urls";`;

const E2A_MARKER = `import { parseUploadedUrls } from "@/lib/parse-uploaded-urls";`;

// ═════════════════════════════════════════════════════════════════
// Edit 2b — add useToast hook in component body
// ═════════════════════════════════════════════════════════════════

const E2B_OLD = `export function UrlInput({ onSubmit }: Props) {
  const [text, setText] = useState("");
  const [titles, setTitles] = useState(DEFAULT_TITLES);
  const [country, setCountry] = useState("");`;

const E2B_NEW = `export function UrlInput({ onSubmit }: Props) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [titles, setTitles] = useState(DEFAULT_TITLES);
  const [country, setCountry] = useState("");`;

const E2B_MARKER = `const { toast } = useToast();
  const [text, setText] = useState("");`;

// ═════════════════════════════════════════════════════════════════
// Edit 2c — replace handleFileUpload with async dispatcher
// ═════════════════════════════════════════════════════════════════

const E2C_OLD = `  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = String(ev.target?.result ?? "");
      setText(content);
    };
    reader.readAsText(file);
  }`;

const E2C_NEW = `  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so the same file can be re-selected after editing.
    e.target.value = "";
    if (!file) return;

    let result: { urls: string[]; warnings: string[] };
    try {
      result = await parseUploadedUrls(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({
        title: "Could not read file",
        description: msg,
        variant: "destructive",
      });
      return;
    }

    for (const w of result.warnings) {
      toast({
        title: result.urls.length === 0 ? "No URLs found" : "Heads up",
        description: w,
        variant: result.urls.length === 0 ? "destructive" : "default",
      });
    }

    if (result.urls.length === 0) return;
    setText(result.urls.join("\\n"));
  }`;

const E2C_MARKER = `async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {`;

// ═════════════════════════════════════════════════════════════════
// Edit 2d — button label + accept attribute
// ═════════════════════════════════════════════════════════════════

const E2D_OLD = `              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById("bulk-url-file")?.click()}
                data-testid="button-upload"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload .txt
              </Button>
              <input
                id="bulk-url-file"
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                onChange={handleFileUpload}
              />`;

const E2D_NEW = `              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById("bulk-url-file")?.click()}
                data-testid="button-upload"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload file
              </Button>
              <input
                id="bulk-url-file"
                type="file"
                accept=".txt,.csv,.tsv,.xlsx,.xls,text/plain,text/csv,text/tab-separated-values,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={handleFileUpload}
              />`;

const E2D_MARKER = `accept=".txt,.csv,.tsv,.xlsx,.xls,`;

// ═════════════════════════════════════════════════════════════════
// applyEdit
// ═════════════════════════════════════════════════════════════════

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

for (const [label, oldStr, newStr, marker] of [
  ["url-input-imports",       E2A_OLD, E2A_NEW, E2A_MARKER],
  ["url-input-toast-hook",    E2B_OLD, E2B_NEW, E2B_MARKER],
  ["url-input-handler-async", E2C_OLD, E2C_NEW, E2C_MARKER],
  ["url-input-button-accept", E2D_OLD, E2D_NEW, E2D_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  importsParser: source.includes(`import { parseUploadedUrls } from "@/lib/parse-uploaded-urls";`),
  importsToast: source.includes(`import { useToast } from "@/hooks/use-toast";`),
  toastHook: source.includes("const { toast } = useToast();"),
  asyncHandler: source.includes("async function handleFileUpload("),
  callsParser: source.includes("await parseUploadedUrls(file)"),
  resetsInputValue: source.includes(`e.target.value = "";`),
  buttonLabel: source.includes("Upload file"),
  buttonLabelGone: !source.includes("Upload .txt"),
  acceptCsv: source.includes(".csv"),
  acceptXlsx: source.includes(".xlsx"),
  acceptXls: source.includes(".xls,"),
  oldHandlerGone: !source.includes("reader.readAsText(file);"),
};
console.log("[url-input] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[url-input] FAIL"); process.exit(4);
}
console.log("[url-input] DONE");
