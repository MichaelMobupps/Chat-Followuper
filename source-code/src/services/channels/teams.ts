/**
 * Teams Mode A adapter stub. Phase 2 will implement this; for now it
 * throws so the dispatcher can still route ChannelCode "teams" without
 * silently producing a broken link.
 */
export function generateLink(_phone: string, _body: string): string {
  throw new Error("Teams Mode A is not yet implemented");
}
