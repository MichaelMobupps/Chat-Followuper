/**
 * Vertical firewall dispatcher.
 *
 * Picks the correct firewall map for the prospect's doctrine domain and
 * applies it to the message text. Returns both the cleaned text and the
 * list of replacements made (used for audit logging).
 */

import { getDoctrineDomain } from "../taxonomy";
import { MOBILE_GAMING_FIREWALL } from "./mobileGaming";
import { MOBILE_NON_GAMING_FIREWALL } from "./mobileNonGaming";
import { WEB_CPS_FIREWALL } from "./webCps";
import type { FirewallEntry } from "./mobileGaming";

export type { FirewallEntry };

export interface FirewallReplacement {
  blocked: string;
  replacement: string;
  reason: string;
  occurrences: number;
}

/**
 * A blocked term that is also a common English word (or a recognizable
 * brand name in a non-blocked context) requires case-sensitive matching
 * to avoid corrupting legitimate prose.
 *
 * Examples that MUST be case-sensitive:
 *   - "install" (verb in general English)
 *   - "Adjust" (common verb when lowercased)
 *   - "Singular" (common adjective when lowercased)
 *   - "AppsFlyer" / "MMP" (brand or abbreviation that has no lowercase usage)
 *
 * Examples that are SAFE for case-insensitive matching:
 *   - "ARPDAU" / "DAU" / "MAU" / "ROAS" (no lowercase English use)
 *   - "funded account" (compound noun phrase, no other meaning)
 *   - "battle pass" (compound noun phrase)
 *   - "rewarded video" (compound noun phrase)
 */
const CASE_SENSITIVE_TERMS = new Set<string>([
  "install",
  "installs",
  "Adjust",
  "Singular",
  "AppsFlyer",
  "App Store",
  "Play Store",
  "MMP",
  "ASO",
  "deep link",
  "deep-link",
  "push notification",
  "push notifications",
  "monthly visits",
  "browser session",
  "publisher curation",
  "affiliate flow",
  "affiliate funnel",
  "via affiliate",
]);

/**
 * Returns the firewall map for a sub-vertical's doctrine domain.
 */
export function getFirewallMap(subVertical: string): FirewallEntry[] {
  const domain = getDoctrineDomain(subVertical);
  if (domain === "mobileGaming") return MOBILE_GAMING_FIREWALL;
  if (domain === "mobileNonGaming") return MOBILE_NON_GAMING_FIREWALL;
  if (domain === "webCps") return WEB_CPS_FIREWALL;
  throw new Error(`No firewall mapped for doctrine domain: ${domain}`);
}

/**
 * Escapes a string for safe use inside a regular expression.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Applies the firewall pass to a message body. Replaces each blocked term
 * (whole-word match — case-sensitive for common-word and brand-name terms,
 * case-insensitive for distinctive ad-tech jargon) with its correct
 * replacement for the sub-vertical's doctrine domain.
 *
 * Preserves capitalization style of the original where applicable.
 *
 * Returns the cleaned text and the list of replacements made.
 */
export function applyFirewall(
  text: string,
  subVertical: string,
): { cleaned: string; replacements: FirewallReplacement[] } {
  const firewall = getFirewallMap(subVertical);
  let cleaned = text;
  const replacements: FirewallReplacement[] = [];

  for (const entry of firewall) {
    // Choose case-sensitivity based on whether the blocked term is in the
    // case-sensitive set (common words, brand names that have other
    // meanings when cased differently).
    const caseSensitive = CASE_SENSITIVE_TERMS.has(entry.blocked);
    // Whole-word match. Word boundaries are loose because some terms
    // contain punctuation (e.g., "ROAS day-7"), so we use \b only when
    // the term starts/ends with a word character.
    const startsWordChar = /^\w/.test(entry.blocked);
    const endsWordChar = /\w$/.test(entry.blocked);
    const escaped = escapeRegex(entry.blocked);
    const pattern = `${startsWordChar ? "\\b" : ""}${escaped}${endsWordChar ? "\\b" : ""}`;
    const flags = caseSensitive ? "g" : "gi";
    const re = new RegExp(pattern, flags);

    let occurrences = 0;
    cleaned = cleaned.replace(re, (matched) => {
      occurrences += 1;
      return matchCasing(matched, entry.replacement);
    });

    if (occurrences > 0) {
      replacements.push({
        blocked: entry.blocked,
        replacement: entry.replacement,
        reason: entry.reason,
        occurrences,
      });
    }
  }

  return { cleaned, replacements };
}

/**
 * Preserves the casing style of the original match in the replacement.
 *   - ALL CAPS → ALL CAPS replacement
 *   - Title Case Of Multiple Words → Title Case Of Multiple Words
 *   - First Word Capitalized only → First word capitalized only
 *   - lowercase → lowercase
 *   - mIxEd → mixed (preserved as lowercase replacement; we don't try to
 *     replicate arbitrary mixed casing because the result would be uglier
 *     than just normalizing)
 */
function matchCasing(original: string, replacement: string): string {
  // ALL CAPS: every letter is uppercase and at least one letter exists.
  if (/[A-Z]/.test(original) && original === original.toUpperCase()) {
    return replacement.toUpperCase();
  }

  const originalWords = original.split(/\s+/);
  const replacementWords = replacement.split(/\s+/);

  // Title Case Multi-Word: every word that starts with a letter starts
  // with uppercase. Only meaningful if original has 2+ words; otherwise
  // it falls into the "first word capitalized" case below.
  if (originalWords.length >= 2) {
    const allTitleCase = originalWords.every((w) => !/^[a-zA-Z]/.test(w) || /^[A-Z]/.test(w));
    if (allTitleCase) {
      return replacementWords
        .map((word) => (word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
        .join(" ");
    }
  }

  // First Word Capitalized only (e.g., "Funded account" or single word "Funded"):
  // the first word starts uppercase, subsequent words are not all-Title-Case.
  if (/^[A-Z]/.test(original)) {
    return replacementWords
      .map((word, idx) =>
        idx === 0 && word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word,
      )
      .join(" ");
  }

  // Default: lowercase replacement as-written.
  return replacement;
}
