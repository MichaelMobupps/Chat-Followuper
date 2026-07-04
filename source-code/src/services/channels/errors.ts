/**
 * Typed channel errors, in their own module so the stub adapters
 * (teams.ts, slack.ts) and the app-level error handler can import them
 * without creating a cycle through channels/index.ts (which imports the
 * adapters).
 */

/**
 * Thrown by a channel adapter that is registered but not yet implemented
 * (currently Teams and Slack Mode A). The terminal error handler maps this
 * to HTTP 501 so callers get a stable, typed signal instead of a generic
 * 500 from an untyped `throw new Error(...)`.
 */
export class ChannelNotImplementedError extends Error {
  public readonly channel: string;

  constructor(channel: string) {
    super(`Channel "${channel}" is registered but not yet implemented`);
    this.name = "ChannelNotImplementedError";
    this.channel = channel;
  }
}
