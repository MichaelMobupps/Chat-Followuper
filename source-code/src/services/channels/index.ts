import type { ChannelCode } from "../../lib/channelRegister";
import {
  generateLink as whatsappGenerateLink,
  GeoGateBlockedError,
} from "./whatsapp";
import { generateLink as telegramGenerateLink } from "./telegram";

export { GeoGateBlockedError };

export interface ChannelAdapter {
  generateLink: (phone: string, body: string) => string;
}

const ADAPTERS: Record<ChannelCode, ChannelAdapter> = {
  whatsapp: { generateLink: whatsappGenerateLink },
  telegram: { generateLink: telegramGenerateLink },
};

/**
 * Dispatcher. Returns the channel adapter for a ChannelCode.
 */
export function getChannelAdapter(channel: ChannelCode): ChannelAdapter {
  return ADAPTERS[channel];
}
