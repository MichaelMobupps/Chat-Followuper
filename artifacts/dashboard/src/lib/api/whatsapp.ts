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

export interface SendIntentInput {
  followupId: number | null;
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
