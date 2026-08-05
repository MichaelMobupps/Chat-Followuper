/** WhatsApp compose-box practical limit (chars). */
export const WA_MESSAGE_CHAR_LIMIT = 1500;

export interface MessageLintResult {
  length: number;
  limit: number;
  overLimit: boolean;
  /** Null when within limit. */
  warning: string | null;
}

/**
 * Length-only lint for outbound chat messages. Surfaces a WA limit hint
 * before the SDR opens a deep link with an overlong body.
 */
export function lintMessageLength(message: string): MessageLintResult {
  const length = message.length;
  const overLimit = length > WA_MESSAGE_CHAR_LIMIT;
  return {
    length,
    limit: WA_MESSAGE_CHAR_LIMIT,
    overLimit,
    warning: overLimit
      ? `${length} chars — over WhatsApp's ~${WA_MESSAGE_CHAR_LIMIT} char hint. Trim before opening or the app may truncate.`
      : null,
  };
}