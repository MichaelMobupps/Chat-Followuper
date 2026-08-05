import type { ChannelCode } from "../../lib/channelRegister";
import {
  generateLink as whatsappGenerateLink,
  GeoGateBlockedError,
} from "./whatsapp";
import { generateLink as telegramGenerateLink } from "./telegram";
import { generateLink as linkedinGenerateLink } from "./linkedin";

export { GeoGateBlockedError };

export interface ChannelAdapter {
  generateLink: (phone: string, body: string) => string;
}

const ADAPTERS: Record<ChannelCode, ChannelAdapter> = {
  whatsapp: { generateLink: whatsappGenerateLink },
  telegram: { generateLink: telegramGenerateLink },
  linkedin: { generateLink: linkedinGenerateLink },
};

/**
 * Dispatcher. Returns the channel adapter for a ChannelCode.
 */
export function getChannelAdapter(channel: ChannelCode): ChannelAdapter {
  return ADAPTERS[channel];
}
