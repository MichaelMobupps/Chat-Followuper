import { apiFetch } from "../api";
import { apiPath } from "../config";

/**
 * Wraps GET /api/prospects/:id/whatsapp-link and POST
 * /api/prospects/:id/send-intent (routes/whatsappLink.ts).
 *
 * getWhatsappLink response shape:
 *   - 200 { url, body }
 *   - 404 not_found / 409 no_message_generated / 409 phone_reveal_pending
 *     / 422 geo_blocked — surfaced as ApiError, FE handles per-error.
 */
export interface WhatsappLinkResponse {
  url: string;
  body: string;
}

export function getWhatsappLink(prospectId: string): Promise<WhatsappLinkResponse> {
  return apiFetch<WhatsappLinkResponse>(
    apiPath(`/prospects/${prospectId}/whatsapp-link`),
  );
}

export function getTelegramLink(prospectId: string): Promise<WhatsappLinkResponse> {
  return apiFetch<WhatsappLinkResponse>(
    `/api/prospects/${prospectId}/telegram-link`,
  );
}

export function getLinkedinLink(prospectId: string): Promise<WhatsappLinkResponse> {
  return apiFetch<WhatsappLinkResponse>(
    `/api/prospects/${prospectId}/linkedin-link`,
  );
}

export function getChannelLink(
  prospectId: string,
  channel: SendIntentChannel,
): Promise<WhatsappLinkResponse> {
  if (channel === "telegram") return getTelegramLink(prospectId);
  if (channel === "linkedin") return getLinkedinLink(prospectId);
  return getWhatsappLink(prospectId);
}

// F-A: LinkedIn added — clipboard-only send, same intent-recording flow.
export type SendIntentChannel = "whatsapp" | "telegram" | "linkedin";

export interface SendIntentInput {
  followupId: number | null;
  channel?: SendIntentChannel;
}

export function recordSendIntent(
  prospectId: string,
  input: SendIntentInput,
): Promise<{ ok: boolean }> {
  return apiFetch(apiPath(`/prospects/${prospectId}/send-intent`), {
    method: "POST",
    body: JSON.stringify(input),
  });
}
