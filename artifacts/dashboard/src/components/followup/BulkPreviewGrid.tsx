/**
 * Bulk Preview Grid — Ticket 2.8-FE.
 *
 * Inline-editable table of 1..200 prospect rows for bulk manual ingest.
 * Sits inside BulkAddDialog. Stateless — receives rows + onChange from
 * the parent dialog; emits row-level changes back up. Server errors from
 * a prior failed submit attempt are attached per row via `rejectedById`
 * and take visual priority over client-side validation hints.
 *
 * Column layout (5 cols + a 6th delete-action col):
 *   1. First name        — Input, 1..100 chars
 *   2. Phone / handle    — Input. Per-channel validation:
 *                            whatsapp: E.164 only (+...)
 *                            telegram: E.164 OR @handle (5..32 chars)
 *   3. Company           — Input, 1..200 chars
 *   4. Product           — two-button toggle, web | mobile
 *   5. Status            — small badge: blank / valid / invalid / server-rejected
 *   6. Delete            — × button
 *
 * Sticky header. Body scrolls. Row height fixed at h-12 for predictable
 * scroll math at 200 rows. Empty rows (never-touched, all blank) get a
 * muted treatment so a freshly-added row doesn't scream red until the
 * user has actually typed something into it.
 *
 * Tokens mirror the Beacon Ignite palette used elsewhere in the manual
 * ingest surface (Section + Dialog). When the dashboard adopts the
 * full Beacon token set in :root these can collapse to var() refs.
 */
import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { X, AlertCircle } from "lucide-react";
import {
  TICKERS,
  TICKER_LABELS,
  type ManualIngestChannel,
  type Ticker,
} from "@/lib/api/manual-ingest";
import { cn } from "@/lib/utils";

// BE validates with this same regex (PHONE_RE in routes/prospects.ts).
// Mirrored here for client-side hint-only validation. Duplicated from
// AddManualContactDialog (existing tech debt; deduplication is a future
// cleanup ticket, not this one's scope).
const PHONE_RE = /^\+[1-9]\d{6,14}$/;
// C1: Telegram usernames must start with a letter (mirror BE TELEGRAM_HANDLE_RE)
// — the old all-alphanumeric class let a bare number (no "+") read as a valid
// handle, so a phone-only paste showed "Ready" then stored a dead handle.
const HANDLE_RE = /^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/;
// LinkedIn: profile URL, "/in/<slug>" path, or a bare slug/handle. Mirrors
// normalizeLinkedinIdentifier in routes/prospects.ts (BE is authoritative).
const LINKEDIN_URL_RE = /^(https?:\/\/)?([\w-]+\.)*linkedin\.com\//i;
const LINKEDIN_PATH_RE = /^\/?in\/[\w%-]+\/?$/i;
const LINKEDIN_SLUG_RE = /^@?[a-zA-Z0-9][\w-]{2,99}$/;
export function linkedinLooksValid(id: string): boolean {
  return (
    LINKEDIN_URL_RE.test(id) ||
    LINKEDIN_PATH_RE.test(id) ||
    LINKEDIN_SLUG_RE.test(id)
  );
}
// Stricter check for CSV headerless-paste detection: only a URL/path shape (NOT
// a bare slug). A bare slug matches almost any word, so using linkedinLooksValid
// there caused a header row like "Person,Link,Org" to be consumed as data.
export function linkedinLooksLikeUrl(id: string): boolean {
  return LINKEDIN_URL_RE.test(id.trim()) || LINKEDIN_PATH_RE.test(id.trim());
}

// Beacon Ignite tokens — local copy of the values in ManualContactsSection
// so the grid renders with consistent glow accents.
const IGNITE_BORDER_ACTIVE = "#00F5D4";
const IGNITE_BG_ACTIVE = "rgba(0,245,212,0.08)";
const IGNITE_TEXT_ACTIVE = "#4FFFE3";
const IGNITE_GLOW_BUTTON =
  "0 0 0 1px rgba(0,245,212,.35), 0 0 18px rgba(0,245,212,.25)";

export interface BulkRow {
  // Stable client-side ID. Required for React keys and for mapping BE
  // rejected[].index back to the row that owns the error after submit.
  id: string;
  firstName: string;
  phone: string;
  company: string;
  ticker: Ticker | null;
}

// One entry per BE-rejected row, keyed by the row's client id. The
// dialog builds this map after submit response (see BulkAddDialog
// handleSubmit) and threads it through to the grid for inline error
// rendering.
export interface BulkRowServerError {
  error:
    | "invalid_identifier"
    | "duplicate_phone"
    | "duplicate_telegram_handle"
    | "duplicate_linkedin_url"
    | "missing_company_product"
    | "insert_failed";
  detail?: string;
}

export interface BulkRowValidation {
  // "blank" rows are entirely empty — used as the "add row" landing
  // state. We don't badge them red; we don't badge them green; we
  // just leave them muted so they don't scream at the user.
  state: "blank" | "valid" | "invalid";
  // Per-field hint, surfaced on focus or hover. The first invalid
  // field's reason is also rolled up to the row status badge.
  reasons: {
    firstName?: string;
    phone?: string;
    company?: string;
    ticker?: string;
  };
}

interface Props {
  channel: ManualIngestChannel;
  rows: BulkRow[];
  onRowsChange: (rows: BulkRow[]) => void;
  // Map of row.id → server error from the prior submit. Server errors
  // override the client-side state badge.
  rejectedById?: Map<string, BulkRowServerError>;
  // Disable all inputs while the parent's submit mutation is in flight.
  disabled?: boolean;
  // F-E: batch-level Company + Product. A row that omits its own inherits
  // these; passed here so validation + placeholders reflect the inheritance.
  batchCompany?: string;
  batchTicker?: Ticker | null;
}

// Build a blank row with a stable id. Date.now()+random suffix is fine
// here — the id never crosses a process boundary; we only need
// within-session uniqueness for React keys and the rejected-map lookup.
export function makeBlankRow(): BulkRow {
  return {
    id: `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    firstName: "",
    phone: "",
    company: "",
    ticker: null,
  };
}

// F-E: batch-level Company + Product, captured once for a phone-only paste
// and applied to any row that omits its own. Passed into validation so a
// phone-only row counts as valid when the batch defaults cover company/ticker.
export interface BatchDefaults {
  company?: string;
  ticker?: Ticker | null;
}

// Pure validation function. Exposed because BulkAddDialog also needs to
// compute the "all rows valid" submit-gate state without re-mounting the
// grid.
export function validateBulkRow(
  row: BulkRow,
  channel: ManualIngestChannel,
  batch?: BatchDefaults,
): BulkRowValidation {
  const fn = row.firstName.trim();
  const ph = row.phone.trim();
  const co = row.company.trim();
  const isAllBlank = !fn && !ph && !co && row.ticker === null;
  if (isAllBlank) {
    return { state: "blank", reasons: {} };
  }

  const reasons: BulkRowValidation["reasons"] = {};

  // F-E: first name is optional (phone-only seed). Only cap its length.
  if (fn.length > 100) {
    reasons.firstName = "Max 100 characters.";
  }

  if (ph.length === 0) {
    reasons.phone =
      channel === "whatsapp"
        ? "Phone required."
        : channel === "linkedin"
          ? "LinkedIn profile URL required."
          : "Phone or @handle required.";
  } else {
    const looksValid =
      channel === "whatsapp"
        ? PHONE_RE.test(ph)
        : channel === "linkedin"
          ? linkedinLooksValid(ph)
          : PHONE_RE.test(ph) || HANDLE_RE.test(ph);
    if (!looksValid) {
      reasons.phone =
        channel === "whatsapp"
          ? "Start with + and country code, e.g. +972501234567."
          : channel === "linkedin"
            ? "Use a LinkedIn profile URL (linkedin.com/in/…) or handle."
            : "Use +country-code phone OR @handle (5-32 chars).";
    }
  }

  // F-E: company/ticker are satisfied by the row value OR the batch default.
  const batchCompany = batch?.company?.trim() ?? "";
  if (co.length === 0 && batchCompany.length === 0) {
    reasons.company = "Company required (or set one for the batch).";
  } else if (co.length > 200) {
    reasons.company = "Max 200 characters.";
  }

  const effectiveTicker = row.ticker ?? batch?.ticker ?? null;
  if (effectiveTicker === null) {
    reasons.ticker = "Pick web or mobile (or set one for the batch).";
  }

  const state =
    Object.keys(reasons).length === 0 ? "valid" : "invalid";
  return { state, reasons };
}

// Map BE error codes → SDR-readable copy. Keeps the grid file
// independent of the (server-side) wire-error vocabulary.
function serverErrorCopy(err: BulkRowServerError): string {
  switch (err.error) {
    case "invalid_identifier":
      return err.detail ?? "Invalid phone or handle.";
    case "duplicate_phone":
      return "Already exists with this phone.";
    case "duplicate_telegram_handle":
      return "Already exists with this Telegram handle.";
    case "duplicate_linkedin_url":
      return "Already exists with this LinkedIn profile.";
    case "missing_company_product":
      return err.detail ?? "Company and product are required.";
    case "insert_failed":
      return err.detail ?? "Save failed. Try again.";
    default:
      return "Could not add this contact.";
  }
}

export function BulkPreviewGrid({
  channel,
  rows,
  onRowsChange,
  rejectedById,
  disabled,
  batchCompany,
  batchTicker,
}: Props) {
  // Per-row validation memoized on rows + channel + batch defaults. Cheap
  // to recompute (validateBulkRow is pure and O(1) per row) but worth
  // caching so unrelated re-renders don't recompute for 200 rows.
  const validations = useMemo(
    () =>
      rows.map((r) =>
        validateBulkRow(r, channel, {
          company: batchCompany,
          ticker: batchTicker,
        }),
      ),
    [rows, channel, batchCompany, batchTicker],
  );

  function updateRow(id: string, patch: Partial<BulkRow>) {
    onRowsChange(
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }

  function deleteRow(id: string) {
    onRowsChange(rows.filter((r) => r.id !== id));
  }

  const identifierPlaceholder =
    channel === "whatsapp"
      ? "+972501234567"
      : channel === "linkedin"
        ? "linkedin.com/in/yaronk"
        : "+972... or @yaronk";
  const identifierHeader =
    channel === "whatsapp"
      ? "Phone"
      : channel === "linkedin"
        ? "LinkedIn URL"
        : "Phone or @handle";

  return (
    <div
      className="rounded-md border border-border bg-card"
      data-testid="bulk-preview-grid"
    >
      {/* Sticky header. The grid uses a 12-column layout so cells can
          share consistent widths across header and body rows. */}
      <div
        className={cn(
          "sticky top-0 z-10 grid grid-cols-[1.5fr_2fr_2fr_1.5fr_2fr_auto] gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground",
        )}
      >
        <div>First name</div>
        <div>{identifierHeader}</div>
        <div>Company</div>
        <div>Product</div>
        <div>Status</div>
        <div className="w-8" aria-hidden />
      </div>

      {/* Body. No virtualization in v1; 200 rows × ~50px = 10 000px,
          inside a scrollable dialog body, is acceptable on modern
          machines. If usage shows lag at 200 rows on slow hardware,
          react-window is the next step. */}
      <div className="max-h-[60vh] overflow-y-auto">
        {rows.map((row, idx) => {
          const v = validations[idx]!;
          const serverErr = rejectedById?.get(row.id);
          // Server error takes display priority over client state.
          const effectiveState: "blank" | "valid" | "invalid" | "server" =
            serverErr ? "server" : v.state;

          const rowBorder =
            effectiveState === "server" || effectiveState === "invalid"
              ? "border-l-2 border-l-destructive/70"
              : effectiveState === "valid"
                ? "border-l-2 border-l-[rgba(0,245,212,0.35)]"
                : "border-l-2 border-l-transparent";

          return (
            <div
              key={row.id}
              data-testid={`bulk-row-${idx}`}
              data-row-state={effectiveState}
              className={cn(
                "grid grid-cols-[1.5fr_2fr_2fr_1.5fr_2fr_auto] gap-2 border-b border-border/40 px-3 py-2 transition-colors",
                rowBorder,
                serverErr && "bg-destructive/5",
              )}
            >
              {/* First name */}
              <Input
                value={row.firstName}
                onChange={(e) =>
                  updateRow(row.id, { firstName: e.target.value })
                }
                placeholder="Yaron (optional)"
                maxLength={100}
                disabled={disabled}
                aria-invalid={!!v.reasons.firstName}
                className={cn(
                  "h-9",
                  v.reasons.firstName &&
                    "border-destructive/50 focus-visible:ring-destructive/30",
                )}
                data-testid={`bulk-row-${idx}-firstName`}
              />

              {/* Phone / handle */}
              <Input
                value={row.phone}
                onChange={(e) =>
                  updateRow(row.id, { phone: e.target.value })
                }
                placeholder={identifierPlaceholder}
                maxLength={300}
                disabled={disabled}
                aria-invalid={!!v.reasons.phone}
                className={cn(
                  "h-9 font-mono text-xs",
                  v.reasons.phone &&
                    "border-destructive/50 focus-visible:ring-destructive/30",
                )}
                data-testid={`bulk-row-${idx}-phone`}
              />

              {/* Company */}
              <Input
                value={row.company}
                onChange={(e) =>
                  updateRow(row.id, { company: e.target.value })
                }
                placeholder={
                  batchCompany && !row.company ? batchCompany : "MobUpps"
                }
                maxLength={200}
                disabled={disabled}
                aria-invalid={!!v.reasons.company}
                className={cn(
                  "h-9",
                  v.reasons.company &&
                    "border-destructive/50 focus-visible:ring-destructive/30",
                )}
                data-testid={`bulk-row-${idx}-company`}
              />

              {/* Product toggle — two-button radio group */}
              <div
                role="radiogroup"
                aria-label="Product type"
                className="grid grid-cols-2 gap-1"
              >
                {TICKERS.map((t) => {
                  const active = row.ticker === t;
                  // F-E: when the row hasn't picked a product, show the batch
                  // default faintly so the SDR sees what it'll inherit.
                  const inherited = row.ticker === null && batchTicker === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={disabled}
                      onClick={() => updateRow(row.id, { ticker: t })}
                      data-testid={`bulk-row-${idx}-ticker-${t}`}
                      className={cn(
                        "flex h-9 items-center justify-center rounded-md border text-xs font-medium transition-all",
                        // FE11: the active brand colors are applied via inline
                        // `style` below — Tailwind arbitrary values built by
                        // runtime interpolation (`border-[${VAR}]`) are never
                        // seen by the JIT scanner, so they don't compile and the
                        // selected ticker was rendered with no highlight.
                        active
                          ? ""
                          : "border-input bg-background text-foreground",
                        inherited && "border-dashed",
                        !active && !disabled && "hover:border-ring",
                      )}
                      style={
                        active
                          ? {
                              borderColor: IGNITE_BORDER_ACTIVE,
                              backgroundColor: IGNITE_BG_ACTIVE,
                              color: IGNITE_TEXT_ACTIVE,
                              boxShadow: IGNITE_GLOW_BUTTON,
                            }
                          : inherited
                            ? {
                                borderColor: IGNITE_BORDER_ACTIVE,
                                color: IGNITE_TEXT_ACTIVE,
                                opacity: 0.5,
                              }
                            : undefined
                      }
                    >
                      {TICKER_LABELS[t]}
                    </button>
                  );
                })}
              </div>

              {/* Status badge + error text */}
              <div className="flex items-center min-w-0">
                {serverErr ? (
                  <div
                    className="flex items-center gap-1.5 text-xs text-destructive min-w-0"
                    title={serverErr.detail}
                  >
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {serverErrorCopy(serverErr)}
                    </span>
                  </div>
                ) : effectiveState === "invalid" ? (
                  <div
                    className="flex items-center gap-1.5 text-xs text-destructive min-w-0"
                    title={Object.values(v.reasons).filter(Boolean).join(" ")}
                  >
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {v.reasons.firstName ??
                        v.reasons.phone ??
                        v.reasons.company ??
                        v.reasons.ticker ??
                        "Incomplete"}
                    </span>
                  </div>
                ) : effectiveState === "valid" ? (
                  <span className="text-xs text-[#4FFFE3]">Ready</span>
                ) : (
                  <span className="text-xs text-muted-foreground/60">
                    Empty
                  </span>
                )}
              </div>

              {/* Delete */}
              <button
                type="button"
                onClick={() => deleteRow(row.id)}
                disabled={disabled}
                aria-label="Remove row"
                data-testid={`bulk-row-${idx}-delete`}
                className={cn(
                  "flex h-9 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors",
                  !disabled && "hover:bg-destructive/10 hover:text-destructive",
                )}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
