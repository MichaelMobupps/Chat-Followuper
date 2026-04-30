/**
 * Event catalog dispatcher.
 *
 * Routes a sub-vertical to the correct platform-family vocabulary file,
 * returns a unified VerticalVocabulary object.
 *
 * Pattern: import { getEventVocabulary } from "../doctrine/eventCatalog";
 */

import {
  getDoctrineDomain,
  isValidSubVertical,
  type SubVertical,
  type DoctrineDomain,
} from "../taxonomy";
import { getMobileGamingVocabulary } from "./mobileGaming";
import { getMobileNonGamingVocabulary } from "./mobileNonGaming";
import { getWebCpsVocabulary } from "./webCps";
import type { VerticalVocabulary } from "./types";

export type { VerticalVocabulary };

/**
 * Returns the vocabulary block for a sub-vertical, routing through
 * the correct platform-family file. Throws on unknown sub-vertical
 * to surface gaps rather than silently degrading.
 */
export function getEventVocabulary(subVertical: string): VerticalVocabulary {
  if (!isValidSubVertical(subVertical)) {
    throw new Error(`Unknown sub-vertical for event catalog lookup: ${subVertical}`);
  }
  const domain: DoctrineDomain = getDoctrineDomain(subVertical);
  if (domain === "mobileGaming") {
    return getMobileGamingVocabulary(subVertical as Parameters<typeof getMobileGamingVocabulary>[0]);
  }
  if (domain === "mobileNonGaming") {
    return getMobileNonGamingVocabulary(subVertical as Parameters<typeof getMobileNonGamingVocabulary>[0]);
  }
  if (domain === "webCps") {
    return getWebCpsVocabulary(subVertical as Parameters<typeof getWebCpsVocabulary>[0]);
  }
  throw new Error(`No event catalog mapped for doctrine domain: ${domain}`);
}

/**
 * Builds the vocabulary block as injected text for the system prompt.
 * Lists the sub-vertical's primary event, alternatives, KPIs, and mechanics
 * the LLM is allowed to reach for. The fallback line at the end gives the
 * LLM permission to use ADJACENT native vocabulary where the static block
 * doesn't cover an edge case — this is the layered hybrid we agreed on.
 */
export function buildVocabularyBlock(subVertical: SubVertical): string {
  const vocab = getEventVocabulary(subVertical);
  return `SUB-VERTICAL VOCABULARY for ${subVertical}:
- Primary conversion event (use this exact phrase or a natural variant): ${vocab.primaryEvent}
- Alternative events you may reference: ${vocab.alternativeEvents.join(", ")}
- Native ad-tech KPI terms for this sub-vertical: ${vocab.kpiTerms.join(", ")}
- Operational mechanic terms (use these in HOW context): ${vocab.mechanicTerms.join(", ")}

VOCABULARY FALLBACK: If a concept arises mid-message that the list above does not explicitly cover, default to the natural ad-tech convention for ${subVertical} as a native sales professional in this sub-vertical would phrase it. NEVER reach for adjacent-vertical jargon (e.g., do not pull subscription terminology into a marketplace ecommerce message, do not pull gaming terminology into a fintech message).`;
}
