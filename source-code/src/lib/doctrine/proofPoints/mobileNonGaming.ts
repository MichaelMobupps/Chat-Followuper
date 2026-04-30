/**
 * Tangible proof points for mobile non-gaming sub-verticals.
 *
 * Same shape as mobileGaming.ts. Used by the research stage to populate
 * ProspectBrief.tangibleReasons, then surfaced in the writer's prompt for
 * VALIDATION + HOW sections.
 *
 * These are sub-vertical agnostic within mobile non-gaming — the writer
 * picks the most-relevant 2-3 based on the prospect's specific context.
 */

import type { ProofPoint } from "./mobileGaming";

export type { ProofPoint };

export const MOBILE_NON_GAMING_PROOF_POINTS: ProofPoint[] = [
  // Supply
  {
    category: "supply",
    text: "Direct relationships with 150+ non-gaming mobile inventory sources, including high-intent in-app placements that don't run on standard DSPs.",
  },
  {
    category: "supply",
    text: "Geo-segmented mobile-app supply across tier-1, tier-2, and tier-3 markets, scoped to the prospect's actual launch geography.",
  },
  {
    category: "supply",
    text: "Vertical-specific supply curation (fintech-aware in fintech campaigns, ecom-aware in ecom, etc.) — placements vetted by category compliance.",
  },

  // Quality
  {
    category: "quality",
    text: "Per-publisher fraud filtering at the conversion event, with cohort lookalike modeling layered on confirmed converters.",
  },
  {
    category: "quality",
    text: "Conversion-cohort analysis at the source-publisher level, automatically suppressing supply that delivers installs but no primary conversion event.",
  },
  {
    category: "quality",
    text: "Day-7 conversion-aware bidding that suppresses installs from publishers whose cohorts don't generate the primary conversion event within the first week.",
  },

  // MAFO (MobUpps' proprietary AI optimization engine)
  {
    category: "mafo",
    text: "MAFO's conversion-cohort optimization engine reweights bidding in real time toward sources that deliver the prospect's primary conversion event, not vanity install volume.",
  },
  {
    category: "mafo",
    text: "MAFO's creative-rotation engine A/B-tests video and static creatives at scale, surfacing the top performer per geo within the first 48 hours.",
  },
  {
    category: "mafo",
    text: "MAFO's lookalike modeling on conversion cohorts (not install cohorts) means the optimization curve compounds faster than standard DSP lookalike.",
  },
  {
    category: "mafo",
    text: "MAFO's incrementality-aware bidding suppresses placements that show high conversion attribution but no incremental lift on holdout cohorts.",
  },

  // Operational
  {
    category: "operational",
    text: "Tier-2 market test playbook for new launches, validated across 100+ non-gaming mobile launches in the past 18 months.",
  },
  {
    category: "operational",
    text: "Funnel-aware suppression: users who reach KYC step but drop off get re-engaged through different placements, raising the funded-account rate.",
  },
  {
    category: "operational",
    text: "Subscription-paywall variant testing on a per-cohort basis, surfacing the highest-LTV variant per source publisher.",
  },
  {
    category: "operational",
    text: "Compliant-creative library for regulated verticals (fintech, healthcare, gambling) — placements only run on inventory cleared for the category.",
  },
];
