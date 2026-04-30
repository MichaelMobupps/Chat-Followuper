/**
 * Proof points dispatcher.
 *
 * Returns the proof point pool for a sub-vertical's doctrine domain.
 * The research stage picks 2-3 from the pool based on context.
 */

import { getDoctrineDomain } from "../taxonomy";
import { MOBILE_GAMING_PROOF_POINTS } from "./mobileGaming";
import { MOBILE_NON_GAMING_PROOF_POINTS } from "./mobileNonGaming";
import { WEB_CPS_PROOF_POINTS } from "./webCps";
import type { ProofPoint } from "./mobileGaming";

export type { ProofPoint };

export function getProofPointPool(subVertical: string): ProofPoint[] {
  const domain = getDoctrineDomain(subVertical);
  if (domain === "mobileGaming") return MOBILE_GAMING_PROOF_POINTS;
  if (domain === "mobileNonGaming") return MOBILE_NON_GAMING_PROOF_POINTS;
  if (domain === "webCps") return WEB_CPS_PROOF_POINTS;
  throw new Error(`No proof point pool for doctrine domain: ${domain}`);
}

/**
 * Builds the proof points block for the research prompt. Lists the available
 * proof points by category so the LLM picks contextually-relevant ones for
 * the prospect's specific brief.
 */
export function buildProofPointsBlock(subVertical: string): string {
  const pool = getProofPointPool(subVertical);
  const byCategory: Record<string, ProofPoint[]> = {};
  for (const p of pool) {
    if (!byCategory[p.category]) byCategory[p.category] = [];
    byCategory[p.category].push(p);
  }

  let block = `AVAILABLE PROOF POINTS for ${subVertical} (pick 2-3 most relevant for this prospect's specific context, listed by category):\n\n`;
  for (const [category, items] of Object.entries(byCategory)) {
    block += `[${category.toUpperCase()}]\n`;
    items.forEach((p, i) => {
      block += `  ${i + 1}. ${p.text}\n`;
    });
    block += "\n";
  }
  block += `Pick proof points that match the prospect's actual scale, vertical, and likely growth challenge. Don't list more than 3 — picking 2-3 sharp ones beats listing many generic ones.`;
  return block;
}
