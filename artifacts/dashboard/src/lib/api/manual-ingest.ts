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
 * Channels: WhatsApp (phone), Telegram (phone or @handle), and LinkedIn
 * (profile URL — clipboard-only, keyed off linkedin_url). The `phone` field
 * on the create/bulk shapes carries the identifier for every channel; the BE
 * routes it to the right storage column per channel.
 */
import { apiFetch } from "@/lib/api";
import { apiPath } from "@/lib/config";

export const MANUAL_INGEST_CHANNELS = [
  "whatsapp",
  "telegram",
  "linkedin",
] as const;
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
  /**
   * Claim a message written by postPreviewFirstMessage before this contact
   * existed. The BE pairs it with the server-side research brief and persists
   * both, or — if the draft is gone — creates a plain draft contact instead
   * (a message without its brief would break follow-ups).
   */
  draftId?: string;
  /** The SDR's edited version of the drafted message. Needs draftId. */
  firstMessageBody?: string;
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
  /**
   * Set when the create claimed a draft (the Add dialog's "Generate message"),
   * so the caller can tell an already-written contact from one that still needs
   * a run. The route returns the whole inserted row, so this was always on the
   * wire — the type just didn't say so.
   */
  firstMessageBody: string | null;
}

export function getManualIngestSettings(): Promise<ManualIngestSettings> {
  return apiFetch<ManualIngestSettings>(
    apiPath("/users/me/manual-ingest-settings"),
  );
}

export function patchManualIngestSettings(
  input: ManualIngestToggleInput,
): Promise<ManualIngestSettings> {
  return apiFetch<ManualIngestSettings>(
    apiPath("/users/me/manual-ingest-settings"),
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export function postManualIngest(
  input: ManualIngestCreateInput,
): Promise<ManualIngestProspect> {
  return apiFetch<ManualIngestProspect>(apiPath("/prospects/manual-ingest"), {
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
  | "duplicate_linkedin_url"
  | "missing_company_product"
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
  /**
   * Regenerate: re-run the writer even when a message is already cached.
   * Only the preview dialog's "Regenerate" sets this — every other caller
   * omits it and gets the cached (already-paid, zero-spend) message back.
   */
  force?: boolean;
}

export interface PrepareFirstMessageResult {
  status: "ready" | "research_complete" | "already_ready";
  prospectId: string;
  message: string | null;
  deepLinkUrl: string | null;
  researchCostUsd?: number;
  generationCostUsd?: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Preview: write a first message BEFORE the contact is created ("Generate
// message" in the Add dialog). The result is parked server-side under draftId;
// passing that draftId to postManualIngest persists it without re-generating.
// The research brief is deliberately NOT returned — it stays server-side so the
// follow-up writer's inputs can't be client-supplied.
// ─────────────────────────────────────────────────────────────────────────

export interface PreviewFirstMessageInput {
  draftId: string;
  channel: ManualIngestChannel;
  firstName: string;
  company: string;
  vertical: "web_cps" | "mobile";
  prePlatformContext?: string | null;
}

export interface PreviewFirstMessageResult {
  draftId: string;
  message: string;
  classified: {
    vertical: string;
    subVertical: string;
    country: string;
    language: string;
    product: string;
  };
}

/**
 * The dialog blocks Esc/outside-click/X while this is in flight (closing mid-run
 * desyncs the draft from its message), which makes a never-settling request an
 * inescapable modal — reload-only. apiFetch sets no timeout and the mutation no
 * retry, so bound it here. 4 minutes is far above the observed worst case
 * (classify + research + the writer chain run ~40-120s) and only exists so the
 * trap has a floor.
 */
const PREVIEW_TIMEOUT_MS = 240_000;

export function postPreviewFirstMessage(
  input: PreviewFirstMessageInput,
): Promise<PreviewFirstMessageResult> {
  return apiFetch<PreviewFirstMessageResult>(
    "/api/prospects/preview-first-message",
    {
      method: "POST",
      body: JSON.stringify(input),
      ...(typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
        ? { signal: AbortSignal.timeout(PREVIEW_TIMEOUT_MS) }
        : {}),
    },
  );
}

export function getPreviewProgress(draftId: string): Promise<PrepareProgress> {
  return apiFetch<PrepareProgress>(
    `/api/prospects/preview-progress/${encodeURIComponent(draftId)}`,
  );
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

// ─────────────────────────────────────────────────────────────────────────
// Phase H — prepare progress (staged progress bar on the Contacts page)
// ─────────────────────────────────────────────────────────────────────────
//
// GET /api/prospects/:id/prepare-progress — polled ~1.2s while a prepare
// run is in flight. Stages are REAL backend checkpoints (queued →
// researching → writing → finalizing → ready | error); "idle" means no
// (recent) run is known for this prospect.

export type PrepareProgressStage =
  | "idle"
  | "queued"
  | "researching"
  | "writing"
  | "finalizing"
  | "ready"
  | "error";

export interface PrepareProgress {
  stage: PrepareProgressStage;
  pct: number;
  startedAt?: number;
  updatedAt?: number;
  error?: string;
}

export function getPrepareProgress(
  prospectId: string,
): Promise<PrepareProgress> {
  return apiFetch<PrepareProgress>(
    `/api/prospects/${prospectId}/prepare-progress`,
  );
}

export function postManualIngestBulk(
  input: ManualIngestBulkInput,
): Promise<ManualIngestBulkResponse> {
  return apiFetch<ManualIngestBulkResponse>(
    apiPath("/prospects/manual-ingest/bulk"),
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Seed → classify (ask-less onboarding)
//
// POST /api/prospector/classify-seed
// Paste a company/brand NAME or a Google Play / App Store / website URL and the
// backend derives {company, vertical, subVertical, country, language, product}
// via web search. Any override field wins over the model's guess. Used by the
// Add-contact dialog to auto-fill the form so the SDR types the least possible.
// ─────────────────────────────────────────────────────────────────────────

export interface ClassifySeedInput {
  seed: string;
  company?: string;
  vertical?: "web_cps" | "mobile";
  subVertical?: string;
  country?: string;
  language?: string;
  product?: string;
}

export interface ClassifiedSeed {
  company: string;
  /** "web_cps" | "mobile" (coarse — maps to the Web/Mobile product type). */
  vertical: string;
  subVertical: string;
  country: string;
  language: string;
  product: string;
  seedType: string;
  appName: string | null;
  domain: string | null;
  webSearchUsed: boolean;
  notes: string;
  costUsd: number;
}

export function postClassifySeed(
  input: ClassifySeedInput,
): Promise<{ classified: ClassifiedSeed }> {
  return apiFetch<{ classified: ClassifiedSeed }>(
    "/api/prospector/classify-seed",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

/** Map the coarse classified vertical to the dialog's Web/Mobile ticker. */
export function verticalToTicker(vertical: string): Ticker {
  return vertical === "web_cps" ? "web" : "mobile";
}
