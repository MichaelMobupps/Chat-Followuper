#!/usr/bin/env node
/**
 * Ticket edit-message-capability v2 — FE prospect-detail.tsx
 *
 * Six atomic edits (was five in v1; v1 NOOPed on the card-body anchor
 * because it contained an em-dash inside the "No message yet…" copy
 * that didn't match byte-exactly. v2 splits that edit into two
 * smaller edits that don't span any em-dashes — the "No message yet"
 * paragraph stays untouched in the file).
 *
 *   1. Import Pencil  (idempotent — skipped if v1 already ran it)
 *   2. Import updateProspect  (skipped if v1 ran it)
 *   3. useState block (skipped if v1 ran it)
 *   4. editMessage mutation (skipped if v1 ran it)
 *   5a. Open outer ternary + insert editing branch
 *   5b. Wrap CopyButton in flex row + add Edit button
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/pages/prospect-detail.tsx",
);

// ─── Edit 1 — import Pencil ───────────────────────────────────────
const E1_OLD = `  ArrowLeft,
  Copy,
  Download,
  CheckCircle2,`;

const E1_NEW = `  ArrowLeft,
  Copy,
  Download,
  Pencil,
  CheckCircle2,`;

const E1_MARKER = `Pencil,`;

// ─── Edit 2 — import updateProspect ───────────────────────────────
const E2_OLD = `import {
  getProspect,
  deleteProspect,
  type Prospect,
  type ProspectStatus,
  type ProspectBrief,
} from "@/lib/api/prospects";`;

const E2_NEW = `import {
  getProspect,
  deleteProspect,
  updateProspect,
  type Prospect,
  type ProspectStatus,
  type ProspectBrief,
} from "@/lib/api/prospects";`;

const E2_MARKER = `updateProspect,
  type Prospect,`;

// ─── Edit 3 — useState block ──────────────────────────────────────
const E3_OLD = `  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [briefExpanded, setBriefExpanded] = useState(false);`;

const E3_NEW = `  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [briefExpanded, setBriefExpanded] = useState(false);
  const [editingMessage, setEditingMessage] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");`;

const E3_MARKER = `[editingMessage, setEditingMessage] = useState(false)`;

// ─── Edit 4 — editMessage mutation ────────────────────────────────
const E4_OLD = `  const remove = useMutation<unknown, ApiError, string>({`;

const E4_NEW = `  const editMessage = useMutation<unknown, ApiError, string>({
    mutationFn: (newBody) =>
      updateProspect(id!, { firstMessageBody: newBody }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospect", id] });
      queryClient.invalidateQueries({ queryKey: ["prospects-list"] });
      setEditingMessage(false);
      toast({ title: "Message updated" });
    },
    onError: (err) => {
      toast({
        title: "Could not update message",
        description: err.code ?? err.message,
        variant: "destructive",
      });
    },
  });

  const remove = useMutation<unknown, ApiError, string>({`;

const E4_MARKER = `const editMessage = useMutation<unknown, ApiError, string>({`;

// ─── Edit 5a — open outer ternary + insert editing branch ────────
// Anchors only on `{p.firstMessageBody ? (` — short, no em-dash.
// The original ternary close `)}` and its else-branch (the "No
// message yet" paragraph with the em-dash) stay untouched.
const E5A_OLD = `          {p.firstMessageBody ? (`;

const E5A_NEW = `          {editingMessage ? (
            <>
              <textarea
                value={messageDraft}
                onChange={(e) => setMessageDraft(e.target.value)}
                rows={Math.max(8, messageDraft.split("\\n").length + 1)}
                className="w-full rounded-md border bg-muted/30 p-3 text-sm font-sans resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                data-testid="textarea-message-edit"
                disabled={editMessage.isPending}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => editMessage.mutate(messageDraft.trim())}
                  disabled={
                    editMessage.isPending ||
                    messageDraft.trim().length === 0 ||
                    messageDraft.trim() === (p.firstMessageBody ?? "").trim()
                  }
                  data-testid="button-save-message"
                >
                  {editMessage.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : null}
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingMessage(false)}
                  disabled={editMessage.isPending}
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : p.firstMessageBody ? (`;

const E5A_MARKER = `data-testid="textarea-message-edit"`;

// ─── Edit 5b — wrap CopyButton with Copy+Edit row ─────────────────
// Anchors only on the CopyButton line — single line, no em-dash.
// Replaces with a flex row containing Copy + Edit.
const E5B_OLD = `              <CopyButton value={p.firstMessageBody} />`;

const E5B_NEW = `              <div className="flex gap-2">
                <CopyButton value={p.firstMessageBody} />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMessageDraft(p.firstMessageBody ?? "");
                    setEditingMessage(true);
                  }}
                  data-testid="button-edit-message"
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
              </div>`;

const E5B_MARKER = `data-testid="button-edit-message"`;

// ─── applyEdit ────────────────────────────────────────────────────

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
  ["import-pencil", E1_OLD, E1_NEW, E1_MARKER],
  ["import-updateProspect", E2_OLD, E2_NEW, E2_MARKER],
  ["state-vars", E3_OLD, E3_NEW, E3_MARKER],
  ["mutation-hook", E4_OLD, E4_NEW, E4_MARKER],
  ["card-body-editing-branch", E5A_OLD, E5A_NEW, E5A_MARKER],
  ["card-body-edit-button", E5B_OLD, E5B_NEW, E5B_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  pencilImport: countOccurrences(source, "Pencil,") === 1,
  updateProspectImport: countOccurrences(source, "updateProspect,") === 1,
  stateVars:
    countOccurrences(source, "[editingMessage, setEditingMessage] = useState(false)") === 1 &&
    countOccurrences(source, `[messageDraft, setMessageDraft] = useState("")`) === 1,
  mutationHook: countOccurrences(source, "const editMessage = useMutation") === 1,
  textareaPresent: countOccurrences(source, `data-testid="textarea-message-edit"`) === 1,
  saveButtonPresent: countOccurrences(source, `data-testid="button-save-message"`) === 1,
  editButtonPresent: countOccurrences(source, `data-testid="button-edit-message"`) === 1,
  outerTernaryWired: countOccurrences(source, "{editingMessage ? (") === 1,
  // The original "No message yet" paragraph stays intact (em-dash and all).
  emptyCopyPreserved:
    countOccurrences(source, "No message yet.") === 1,
};
console.log("[fe-detail-v2] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[fe-detail-v2] FAIL"); process.exit(4);
}
console.log("[fe-detail-v2] DONE");
