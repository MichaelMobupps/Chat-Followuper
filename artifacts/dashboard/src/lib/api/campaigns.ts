import { apiFetch } from "../api";

/**
 * Channel enum mirrors the api-server's accepted values.
 * Teams and Slack were removed (never built past a 501 stub); do not add
 * them here.
 */
export const CAMPAIGN_CHANNELS = [
  "whatsapp",
  "telegram",
  "email",
] as const;

export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

export interface Campaign {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  defaultChannel: CampaignChannel | null;
  defaultSubVertical: string | null;
  defaultLanguage: string | null;
  defaultCountry: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignDetail extends Campaign {
  prospectCount: number;
}

export interface CreateCampaignInput {
  name: string;
  description?: string;
  defaultChannel?: CampaignChannel;
  defaultSubVertical?: string;
  defaultLanguage?: string;
  defaultCountry?: string;
}

export type UpdateCampaignInput = Partial<CreateCampaignInput>;

// The api-server wraps every campaign response in an envelope
// (`{ campaigns }`, `{ campaign }`), matching the house convention used by
// prospects/followups. These helpers unwrap it so callers receive the bare
// `Campaign` / `Campaign[]` shape their types promise. (Returning the raw
// envelope is what made `campaigns?.map(...)` throw "n?.map is not a function"
// and blank the whole app.)
export function listCampaigns(
  opts: { includeArchived?: boolean } = {},
): Promise<Campaign[]> {
  const qs = opts.includeArchived ? "?includeArchived=true" : "";
  return apiFetch<{ campaigns: Campaign[] }>(`/api/campaigns${qs}`).then(
    (r) => r.campaigns,
  );
}

export function getCampaign(id: string): Promise<CampaignDetail> {
  return apiFetch<{ campaign: Campaign; prospectCount: number }>(
    `/api/campaigns/${id}`,
  ).then((r) => ({ ...r.campaign, prospectCount: r.prospectCount }));
}

export function createCampaign(
  input: CreateCampaignInput,
): Promise<Campaign> {
  return apiFetch<{ campaign: Campaign }>("/api/campaigns", {
    method: "POST",
    body: JSON.stringify(input),
  }).then((r) => r.campaign);
}

export function updateCampaign(
  id: string,
  input: UpdateCampaignInput,
): Promise<Campaign> {
  return apiFetch<{ campaign: Campaign }>(`/api/campaigns/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }).then((r) => r.campaign);
}

export function archiveCampaign(id: string): Promise<Campaign> {
  return apiFetch<{ campaign: Campaign }>(`/api/campaigns/${id}/archive`, {
    method: "POST",
  }).then((r) => r.campaign);
}

export function unarchiveCampaign(id: string): Promise<Campaign> {
  return apiFetch<{ campaign: Campaign }>(`/api/campaigns/${id}/unarchive`, {
    method: "POST",
  }).then((r) => r.campaign);
}

export function deleteCampaign(id: string): Promise<void> {
  return apiFetch<void>(`/api/campaigns/${id}`, {
    method: "DELETE",
  });
}
