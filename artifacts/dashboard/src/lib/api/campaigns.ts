import { apiFetch } from "../api";
import { apiPath } from "../config";

/**
 * Channel enum mirrors the api-server's accepted values.
 * Slack was explicitly dropped from the master plan (decision log #5);
 * do not add it here.
 */
export const CAMPAIGN_CHANNELS = [
  "whatsapp",
  "telegram",
  "teams",
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

export function listCampaigns(
  opts: { includeArchived?: boolean } = {},
): Promise<Campaign[]> {
  const qs = opts.includeArchived ? "?includeArchived=true" : "";
  return apiFetch<Campaign[]>(apiPath(`/campaigns${qs}`));
}

export function getCampaign(id: string): Promise<CampaignDetail> {
  return apiFetch<CampaignDetail>(apiPath(`/campaigns/${id}`));
}

export function createCampaign(
  input: CreateCampaignInput,
): Promise<Campaign> {
  return apiFetch<Campaign>(apiPath("/campaigns"), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCampaign(
  id: string,
  input: UpdateCampaignInput,
): Promise<Campaign> {
  return apiFetch<Campaign>(apiPath(`/campaigns/${id}`), {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function archiveCampaign(id: string): Promise<Campaign> {
  return apiFetch<Campaign>(apiPath(`/campaigns/${id}/archive`), {
    method: "POST",
  });
}

export function unarchiveCampaign(id: string): Promise<Campaign> {
  return apiFetch<Campaign>(apiPath(`/campaigns/${id}/unarchive`), {
    method: "POST",
  });
}

export function deleteCampaign(id: string): Promise<void> {
  return apiFetch<void>(apiPath(`/campaigns/${id}`), {
    method: "DELETE",
  });
}
