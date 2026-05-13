/**
 * Bulk Add Contacts dialog — Ticket 2.8-FE.
 *
 * Wraps BulkPreviewGrid with:
 *   1. A CSV/TSV paste area at the top (disclosure-style; expanded by
 *      default when grid is empty, collapsed once rows exist).
 *   2. A toolbar showing row count, "+ Add row", and "Clear all".
 *   3. A footer with submit gate ("Add N contacts" — only enabled when
 *      all non-blank rows are valid).
 *   4. Partial-success handling: after submit, accepted rows are
 *      removed from the grid; rejected rows stay with their server
 *      error attached and a summary banner is shown above the grid.
 *
 * Why filter-before-submit is the wrong design here, in case anyone
 * revisits: filtering invalid rows client-side and only submitting
 * "valid" rows complicates the rejected[].index mapping (BE indices
 * point into the filtered array, not the grid). Simpler model: gate
 * the submit button on "all non-blank rows valid"; the user fixes or
 * deletes invalid rows before submitting. This matches the single-row
 * dialog's UX (submit disabled until all fields good) so the bulk flow
 * doesn't introduce a new mental model.
 *
 * CSV parser is inline (no papaparse dep). Handles the 99% case:
 * comma- or tab-separated, quoted cells with embedded delimiters,
 * "" escaping. Does NOT handle embedded newlines inside quoted cells
 * — rare in spreadsheet exports for this use case; users fall back to
 * "+ Add row" for that.
 *
 * Header matching: case-insensitive, underscore/space-normalized.
 *   "firstName", "FirstName", "FIRST_NAME", "first name"  → firstName
 * No fuzzy aliases (e.g., "name" does NOT match firstName). Predictable
 * and debuggable. A template download is provided so SDRs don't have
 * to guess.
 *
 * Row limit 200 matches the BE's MANUAL_INGEST_BULK_MAX_ROWS. Paste of
 * >200 rows is truncated with an inline banner; "+ Add row" disables
 * at 200.
 */
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Loader2,
  Trash2,
  Download,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAddManualContactsBulk } from "@/hooks/use-manual-ingest";
import {
  TICKERS,
  type ManualIngestChannel,
  type Ticker,
} from "@/lib/api/manual-ingest";
import { ApiError } from "@/lib/api";
import {
  BulkPreviewGrid,
  validateBulkRow,
  makeBlankRow,
  type BulkRow,
  type BulkRowServerError,
} from "./BulkPreviewGrid";

const MAX_ROWS = 200;

const CHANNEL_NAME: Record<ManualIngestChannel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
};

// Header alias map. Key is the normalized header (lowercase, no spaces
// or underscores); value is the BulkRow field name. Extra headers in
// the CSV are ignored; missing required headers fail the parse.
const HEADER_ALIASES: Record<
  string,
  "firstName" | "phone" | "company" | "ticker"
> = {
  firstname: "firstName",
  phone: "phone",
  company: "company",
  ticker: "ticker",
};

function normalizeHeader(s: string): string {
  return s.toLowerCase().replace(/[_\s]+/g, "").trim();
}

interface ParseResult {
  rows: BulkRow[];
  truncated: boolean;
  errors: string[];
}

/**
 * Inline CSV/TSV parser. Auto-detects delimiter from the first line
 * (tab present and no comma → TSV; otherwise CSV). Quoted cells with
 * "" escaping supported. Embedded newlines inside quoted cells are NOT
 * supported and will misparse — rare for spreadsheet exports.
 */
function parseCsv(
  text: string,
  channel: ManualIngestChannel,
): ParseResult {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    errors.push("Empty input.");
    return { rows: [], truncated: false, errors };
  }
  if (lines.length === 1) {
    errors.push(
      "Need a header row plus at least one data row. Download the template for the expected format.",
    );
    return { rows: [], truncated: false, errors };
  }

  const headerLine = lines[0]!;
  const delimiter =
    headerLine.includes("\t") && !headerLine.includes(",") ? "\t" : ",";

  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i]!;
      if (inQuote) {
        if (c === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuote = false;
          }
        } else {
          cur += c;
        }
      } else {
        if (c === '"') {
          inQuote = true;
        } else if (c === delimiter) {
          cells.push(cur);
          cur = "";
        } else {
          cur += c;
        }
      }
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  };

  const rawHeaders = parseLine(headerLine);
  const headerToField: (keyof BulkRow | undefined)[] = rawHeaders.map(
    (h) => HEADER_ALIASES[normalizeHeader(h)],
  );

  const required: Array<keyof BulkRow> = [
    "firstName",
    "phone",
    "company",
    "ticker",
  ];
  const missing = required.filter((f) => !headerToField.includes(f));
  if (missing.length > 0) {
    errors.push(
      `Missing required column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}. Download the template for the expected format.`,
    );
    return { rows: [], truncated: false, errors };
  }

  const dataLines = lines.slice(1);
  const truncated = dataLines.length > MAX_ROWS;
  const slice = truncated ? dataLines.slice(0, MAX_ROWS) : dataLines;

  const rows: BulkRow[] = [];
  for (let li = 0; li < slice.length; li++) {
    const cells = parseLine(slice[li]!);
    const row = makeBlankRow();
    for (let ci = 0; ci < cells.length; ci++) {
      const field = headerToField[ci];
      if (!field) continue;
      const value = cells[ci] ?? "";
      if (field === "ticker") {
        const t = value.toLowerCase().trim();
        if (t === "web" || t === "mobile") {
          row.ticker = t as Ticker;
        }
        // Unrecognized ticker stays null → row flagged invalid by the
        // grid until the user picks one. We don't reject the import.
      } else {
        row[field] = value;
      }
    }
    rows.push(row);
  }

  // Silently swallow channel — included in the signature so future
  // per-channel parse logic (e.g., dropping the leading @ on Telegram
  // handles up front) has somewhere to land. Currently unused.
  void channel;

  return { rows, truncated, errors };
}

function downloadTemplate(channel: ManualIngestChannel) {
  const exampleId =
    channel === "whatsapp" ? "+972501234567" : "@yaronk";
  const csv = [
    "firstName,phone,company,ticker",
    `Yaron,${exampleId},MobUpps,mobile`,
    `Yaman,+972502345678,Acme,web`,
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `followuper-bulk-template-${channel}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface Props {
  channel: ManualIngestChannel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SubmitBanner {
  accepted: number;
  rejected: number;
}

export function BulkAddDialog({ channel, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const bulk = useAddManualContactsBulk();

  const [rows, setRows] = useState<BulkRow[]>([]);
  const [csvText, setCsvText] = useState("");
  const [csvOpen, setCsvOpen] = useState(true);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importTruncated, setImportTruncated] = useState(false);
  const [rejectedById, setRejectedById] = useState<
    Map<string, BulkRowServerError>
  >(new Map());
  const [banner, setBanner] = useState<SubmitBanner | null>(null);

  // Reset state when dialog closes. Defer the reset to the close
  // transition so the user doesn't see the grid empty out mid-animation.
  // Early-return when open=true so the effect has a single return path
  // (TS noImplicitReturns flags the conditional-cleanup pattern).
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      setRows([]);
      setCsvText("");
      setCsvOpen(true);
      setImportErrors([]);
      setImportTruncated(false);
      setRejectedById(new Map());
      setBanner(null);
    }, 150);
    return () => clearTimeout(t);
  }, [open]);

  // Auto-collapse the CSV paste area once the grid has rows. Users
  // can re-expand to import more.
  useEffect(() => {
    if (rows.length > 0 && csvText.length === 0) {
      setCsvOpen(false);
    }
  }, [rows.length, csvText.length]);

  function handleImport() {
    const result = parseCsv(csvText, channel);
    if (result.errors.length > 0) {
      setImportErrors(result.errors);
      setImportTruncated(false);
      return;
    }
    // Append imported rows to whatever's already in the grid, clamping
    // to MAX_ROWS total.
    const remaining = MAX_ROWS - rows.length;
    const toAppend = result.rows.slice(0, Math.max(0, remaining));
    const truncatedByCap =
      result.rows.length > toAppend.length || result.truncated;
    setRows([...rows, ...toAppend]);
    setCsvText("");
    setImportErrors([]);
    setImportTruncated(truncatedByCap);
    // Clear any prior server errors — fresh content invalidates them.
    setRejectedById(new Map());
    setBanner(null);
  }

  function handleAddRow() {
    if (rows.length >= MAX_ROWS) return;
    setRows([...rows, makeBlankRow()]);
  }

  function handleClearAll() {
    if (rows.length === 0) return;
    setRows([]);
    setRejectedById(new Map());
    setBanner(null);
    setCsvOpen(true);
  }

  // Wrap setRows so edits/deletes to a previously-rejected row clear its
  // server error. Without this, an SDR who fixes the duplicate-phone row
  // sees "Already exists with this phone" persist visually until they
  // re-submit, even though the underlying field has changed. The compare
  // is cheap (at most rejectedById.size lookups + a per-row field check)
  // and skips entirely when there are no rejections in play.
  function handleRowsChange(newRows: BulkRow[]) {
    if (rejectedById.size > 0) {
      const newRowIds = new Set(newRows.map((r) => r.id));
      const newRejected = new Map(rejectedById);
      let cleared = false;

      // Delete-case: the row is gone from the array. Its rejection
      // entry would otherwise leak in state (harmless but messy).
      for (const id of rejectedById.keys()) {
        if (!newRowIds.has(id)) {
          newRejected.delete(id);
          cleared = true;
        }
      }

      // Edit-case: any field on a rejected row has changed since the
      // server response.
      for (const newRow of newRows) {
        if (!rejectedById.has(newRow.id)) continue;
        const oldRow = rows.find((r) => r.id === newRow.id);
        if (!oldRow) continue;
        if (
          oldRow.firstName !== newRow.firstName ||
          oldRow.phone !== newRow.phone ||
          oldRow.company !== newRow.company ||
          oldRow.ticker !== newRow.ticker
        ) {
          newRejected.delete(newRow.id);
          cleared = true;
        }
      }

      if (cleared) setRejectedById(newRejected);
    }
    setRows(newRows);
  }

  // Submit gate. Filters blank rows (they stay in the grid as
  // scaffolding for manual entry) and requires every non-blank row to
  // be valid. Single-row dialog uses the same gate model (all required
  // fields must be set before submit enables).
  const submittableRows = rows.filter(
    (r) => validateBulkRow(r, channel).state !== "blank",
  );
  const invalidCount = submittableRows.filter(
    (r) => validateBulkRow(r, channel).state !== "valid",
  ).length;
  const canSubmit =
    submittableRows.length > 0 && invalidCount === 0 && !bulk.isPending;

  function handleSubmit() {
    if (!canSubmit) return;

    // Snapshot the submitted rows so we can map BE rejected[].index
    // back to row.id after the response. Critical: the BE's index
    // refers to position in THIS array, not the grid.
    const submitted = submittableRows;
    const contacts = submitted.map((r) => ({
      firstName: r.firstName.trim(),
      phone: r.phone.trim(),
      company: r.company.trim(),
      ticker: r.ticker!,
    }));

    bulk.mutate(
      { channel, contacts },
      {
        onSuccess: ({ accepted, rejected }) => {
          const errorsById = new Map<string, BulkRowServerError>();
          for (const rej of rejected) {
            const sourceRow = submitted[rej.index];
            if (sourceRow) {
              errorsById.set(sourceRow.id, {
                error: rej.error,
                detail: rej.detail,
              });
            }
          }

          // Accepted = submitted minus rejected. Remove accepted rows
          // from the grid; keep rejected rows with their error and
          // keep blank rows untouched.
          const rejectedIds = new Set(errorsById.keys());
          const newRows = rows.filter((r) => {
            const wasSubmitted = submitted.some((s) => s.id === r.id);
            if (!wasSubmitted) return true; // blank row, keep
            return rejectedIds.has(r.id);
          });

          setRows(newRows);
          setRejectedById(errorsById);

          if (rejected.length === 0) {
            toast({
              title: `Added ${accepted.length} contact${accepted.length === 1 ? "" : "s"}`,
              description: `They'll show up in your ${CHANNEL_NAME[channel]} queue shortly.`,
            });
            onOpenChange(false);
          } else {
            setBanner({
              accepted: accepted.length,
              rejected: rejected.length,
            });
          }
        },
        onError: (err) => {
          // Outer envelope error — 400 invalid_body, 401, 500. No
          // per-row mapping available, just surface and keep the grid.
          const description =
            err instanceof ApiError
              ? `${err.status} ${err.code ?? err.message}`
              : (err as Error).message;
          toast({
            title: "Could not add contacts",
            description,
          });
        },
      },
    );
  }

  function handleOpenChange(next: boolean) {
    if (bulk.isPending) return; // don't close mid-submit
    onOpenChange(next);
  }

  const rowCountLabel = `${rows.length} / ${MAX_ROWS}`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add many contacts</DialogTitle>
          <DialogDescription>
            Paste a CSV or add rows manually. Up to {MAX_ROWS} contacts
            per batch land in your {CHANNEL_NAME[channel]} queue.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 py-2">
          {/* CSV paste disclosure */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setCsvOpen((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              data-testid="bulk-csv-toggle"
            >
              {csvOpen ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              Paste CSV or TSV
            </button>

            {csvOpen && (
              <div className="space-y-2">
                <Textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder={
                    "firstName,phone,company,ticker\nYaron,+972501234567,MobUpps,mobile\nYaman,+972502345678,Acme,web"
                  }
                  rows={4}
                  className="font-mono text-xs"
                  disabled={bulk.isPending}
                  data-testid="bulk-csv-textarea"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleImport}
                    disabled={
                      csvText.trim().length === 0 ||
                      bulk.isPending ||
                      rows.length >= MAX_ROWS
                    }
                    data-testid="bulk-csv-import"
                  >
                    Import
                  </Button>
                  <button
                    type="button"
                    onClick={() => downloadTemplate(channel)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="bulk-template-download"
                  >
                    <Download className="h-3 w-3" />
                    Download template
                  </button>
                </div>

                {importErrors.length > 0 && (
                  <div
                    className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                    data-testid="bulk-import-errors"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      {importErrors.map((err, i) => (
                        <div key={i}>{err}</div>
                      ))}
                    </div>
                  </div>
                )}

                {importTruncated && (
                  <div
                    className="rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400"
                    data-testid="bulk-import-truncated"
                  >
                    Imported up to {MAX_ROWS} rows. Submit this batch
                    first, then come back for the rest.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Post-submit banner */}
          {banner && (
            <div
              className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-sm"
              data-testid="bulk-result-banner"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-[#4FFFE3]" />
              <div className="flex-1">
                <div className="font-medium">
                  {banner.accepted} added.{" "}
                  {banner.rejected > 0 && (
                    <span className="text-yellow-600 dark:text-yellow-400">
                      {banner.rejected} had issues. Review below.
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Fix or remove the rows with errors and submit again.
                </div>
              </div>
            </div>
          )}

          {/* Grid + toolbar (only when there are rows) */}
          {rows.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <div
                  className="text-xs text-muted-foreground"
                  data-testid="bulk-row-count"
                >
                  {rowCountLabel} rows
                  {invalidCount > 0 && (
                    <span className="ml-2 text-destructive">
                      ({invalidCount} {invalidCount === 1 ? "issue" : "issues"})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleAddRow}
                    disabled={rows.length >= MAX_ROWS || bulk.isPending}
                    data-testid="bulk-add-row"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add row
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleClearAll}
                    disabled={bulk.isPending}
                    data-testid="bulk-clear-all"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Clear all
                  </Button>
                </div>
              </div>

              <BulkPreviewGrid
                channel={channel}
                rows={rows}
                onRowsChange={handleRowsChange}
                rejectedById={rejectedById}
                disabled={bulk.isPending}
              />
            </>
          )}

          {/* Empty-state nudge when no rows AND CSV area is collapsed */}
          {rows.length === 0 && !csvOpen && (
            <div className="rounded-md border border-dashed border-border bg-card px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                No rows yet. Paste a CSV above or add rows manually.
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleAddRow}
                className="mt-2"
                data-testid="bulk-empty-add-row"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add row
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 sm:justify-between sm:items-center">
          {/* Hint about latency when batches are large. */}
          {submittableRows.length > 100 && (
            <p className="text-xs text-muted-foreground sm:mr-auto">
              This may take up to 30 seconds for large batches.
            </p>
          )}
          <div className="flex items-center gap-2 sm:ml-auto">
            <Button
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={bulk.isPending}
            >
              {banner ? "Done" : "Cancel"}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              data-testid="bulk-submit"
            >
              {bulk.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {submittableRows.length === 0
                ? "Add contacts"
                : `Add ${submittableRows.length} contact${submittableRows.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Re-export the TICKERS const so future consumers of this dialog can
// import everything from one place. (Currently used only internally.)
export { TICKERS };
