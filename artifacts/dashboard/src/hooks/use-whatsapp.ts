import { useMutation } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import {
  getChannelLink,
  getWhatsappLink,
  recordSendIntent,
  type WhatsappLinkResponse,
  type SendIntentInput,
} from "@/lib/api/whatsapp";

/**
 * Treat as mutation rather than query: the click action triggers the
 * fetch on demand from the user clicking "Open WhatsApp", and the
 * response opens window.open in the click handler — no auto-refetch
 * desired.
 */
export function useWhatsappLink() {
  return useMutation<WhatsappLinkResponse, ApiError, string>({
    mutationFn: getWhatsappLink,
  });
}

export function useChannelLink() {
  return useMutation<
    WhatsappLinkResponse,
    ApiError,
    { prospectId: string; channel: "whatsapp" | "telegram" }
  >({
    mutationFn: ({ prospectId, channel }) => getChannelLink(prospectId, channel),
  });
}

export function useSendIntent() {
  return useMutation<
    { ok: boolean },
    ApiError,
    { prospectId: string; input: SendIntentInput }
  >({
    mutationFn: ({ prospectId, input }) => recordSendIntent(prospectId, input),
  });
}
