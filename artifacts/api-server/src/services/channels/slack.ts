/**
 * Slack Mode A adapter stub. Phase 2 will implement this; for now it
 * throws a typed ChannelNotImplementedError so the dispatcher can still
 * route ChannelCode "slack" without silently producing a broken link, and
 * the error handler maps it to 501 rather than a generic 500.
 */
import { ChannelNotImplementedError } from "./errors";

export function generateLink(_phone: string, _body: string): string {
  throw new ChannelNotImplementedError("slack");
}
