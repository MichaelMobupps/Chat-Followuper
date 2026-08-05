import { apiFetch } from "@/lib/api";
import { apiPath } from "@/lib/config";

export type TestChannel = "whatsapp" | "telegram" | "linkedin";

export interface TestChannelLinkInput {
  channel: TestChannel;
  identifier: string;
  message?: string;
}

export interface TestChannelLinkResponse {
  channel: TestChannel;
  deepLinkUrl: string;
  message: string;
  target: string;
}

export function postTestChannelLink(
  input: TestChannelLinkInput,
): Promise<TestChannelLinkResponse> {
  return apiFetch<TestChannelLinkResponse>(apiPath("/users/me/test-channel-link"), {
    method: "POST",
    body: JSON.stringify(input),
  });
}