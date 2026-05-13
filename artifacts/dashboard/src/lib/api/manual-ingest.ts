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
