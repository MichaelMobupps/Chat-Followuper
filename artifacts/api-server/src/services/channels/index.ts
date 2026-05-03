import type { ChannelCode } from "../../lib/channelRegister";
import {
  generateLink as whatsappGenerateLink,
  GeoGateBlockedError,
} from "./whatsapp";
import { generateLink as telegramGenerateLink } from "./telegram";
import { generateLink as teamsGenerateLink } from "./teams";
import { generateLink as slackGenerateLink } from "./slack";

export { GeoGateBlockedError };

export interface ChannelAdapter {
  generateLink: (phone: string, body: string) => string;
}

const ADAPTERS: Record<ChannelCode, ChannelAdapter> = {
  whatsapp: { generateLink: whatsappGenerateLink },
  telegram: { generateLink: telegramGenerateLink },
  teams: { generateLink: teamsGenerateLink },
  slack: { generateLink: slackGenerateLink },
};

/**
 * Dispatcher. Returns the channel adapter for a ChannelCode. Always
 * returns a defined adapter; stub channels surface their own typed
 * "not yet implemented" error when called rather than failing here.
 */
export function getChannelAdapter(channel: ChannelCode): ChannelAdapter {
  return ADAPTERS[channel];
}