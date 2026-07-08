/**
 * Manual ingest API client — Ticket 2.7-FE.
 *
 *   GET   /api/users/me/manual-ingest-settings   — read toggle state
 *   PATCH /api/users/me/manual-ingest-settings   — toggle channel on/off
 *   POST  /api/prospects/manual-ingest           — create a manual prospect
 *
 * The toggle state is a string array of channel slugs currently enabled
 * for manual ingest. Empty array means manual ingest is off everywhere.
 *
 * Channel scope this ticket: WhatsApp only. Telegram support lands in
 * ticket-2-9 once the t.me identifier-shape decision resolves.
 */
import { apiFetch } from "@/lib/api";

export const MANUAL_INGEST_CHANNELS = ["whatsapp", "telegram"] as const;
export type ManualIngestChannel = (typeof MANUAL_INGEST_CHANNELS)[number];

export const TICKERS = ["web", "mobile"] as const;
export type Ticker = (typeof TICKERS)[number];

export const TICKER_LABELS: Record<Ticker, string> = {
  web: "Web",
  mobile: "Mobile",
};

export interface ManualIngestSettings {
  manualIngestChannels: ManualIngestChannel[];
}

export interface ManualIngestToggleInput {
  channel: ManualIngestChannel;
  enabled: boolean;
}

export interface ManualIngestCreateInput {
  channel: ManualIngestChannel;
  firstName: string;
  phone: string;
  company: string;
  ticker: Ticker;
  prePlatformContext?: string | null;
}

/**
 * Minimal prospect shape returned by POST /api/prospects/manual-ingest.
 * The BE returns the full prospect row; we type only the fields the FE
 * actually consumes for the success toast and optimistic UI hint.
 */
export interface ManualIngestProspect {
  id: string;
  prospectName: string | null;
  company: string | null;
  phone: string | null;
  vertical: string | null;
  country: string | null;
  sourceMode: string;
}

export function getManualIngestSettings(): Promise<ManualIngestSettings> {
  return apiFetch<ManualIngestSettings>(
    "/api/users/me/manual-ingest-settings",
  );
}

export function patchManualIngestSettings(
  input: ManualIngestToggleInput,
): Promise<ManualIngestSettings> {
  return apiFetch<ManualIngestSettings>(
    "/api/users/me/manual-ingest-settings",
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export function postManualIngest(
  input: ManualIngestCreateInput,
): Promise<ManualIngestProspect> {
  return apiFetch<ManualIngestProspect>("/api/prospects/manual-ingest", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Ticket 2.8-FE — bulk client
// ─────────────────────────────────────────────────────────────────────────
//
// POST /api/prospects/manual-ingest/bulk
//
// 1..200 contacts per request. Partial-success response always 200 (unless
// the outer envelope is malformed), with accepted[] and rejected[] arrays.
// The rejected[].index field refers to the position in the request's
// contacts[] array — preserve order client-side so the index maps cleanly
// back to the source row.
//
// prePlatformContext is omitted from the bulk shape per Ticket 2.8-FE scope
// decision #6 (per-contact context paste doesn't fit a 200-row grid UX).
// Use the single-row dialog for context-seeded ingest.

export interface ManualIngestBulkContact {
  // F-E: name is optional (phone-only seed). company/ticker are optional
  // per row — omitted rows inherit the batch-level defaults below.
  firstName?: string;
  phone: string;
  company?: string;
  ticker?: Ticker;
}

export interface ManualIngestBulkInput {
  channel: ManualIngestChannel;
  // F-E: Company + Product captured ONCE for a phone-only paste, applied
  // to every row that doesn't carry its own.
  defaultCompany?: string;
  defaultTicker?: Ticker;
  contacts: ManualIngestBulkContact[];
}

export type ManualIngestBulkErrorCode =
  | "invalid_identifier"
  | "duplicate_phone"
  | "duplicate_telegram_handle"
  | "insert_failed";

export interface ManualIngestBulkRejectedRow {
  index: number;
  identifier: string;
  error: ManualIngestBulkErrorCode;
  detail?: string;
}

export interface ManualIngestBulkResponse {
  accepted: ManualIngestProspect[];
  rejected: ManualIngestBulkRejectedRow[];
}

export interface PrepareFirstMessageInput {
  channel?: ManualIngestChannel;
}

export interface PrepareFirstMessageResult {
  status: "ready" | "research_complete" | "already_ready";
  prospectId: string;
  message: string | null;
  deepLinkUrl: string | null;
  researchCostUsd?: number;
  generationCostUsd?: number;
}

export function postPrepareFirstMessage(
  prospectId: string,
  input: PrepareFirstMessageInput = {},
): Promise<PrepareFirstMessageResult> {
  return apiFetch<PrepareFirstMessageResult>(
    `/api/prospects/${prospectId}/prepare-first-message`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function postManualIngestBulk(
  input: ManualIngestBulkInput,
): Promise<ManualIngestBulkResponse> {
  return apiFetch<ManualIngestBulkResponse>(
    "/api/prospects/manual-ingest/bulk",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}
