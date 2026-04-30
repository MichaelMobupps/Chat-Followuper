/**
 * Tangible proof points for web CPS sub-verticals.
 *
 * Web CPS proof points emphasize publisher curation, affiliate-network
 * mechanics, fraud filtering on confirmed sales, and incrementality
 * testing — not the mobile-app-style supply / quality framing.
 */

import type { ProofPoint } from "./mobileGaming";

export type { ProofPoint };

export const WEB_CPS_PROOF_POINTS: ProofPoint[] = [
  // Supply
  {
    category: "supply",
    text: "Curated network of 500+ vetted web publishers across content, comparison, coupon, and review verticals — with category-specific allowlists per advertiser.",
  },
  {
    category: "supply",
    text: "Direct relationships with high-intent comparison-site publishers in regulated verticals (insurance, mortgage, fintech), where lead quality is highest.",
  },
  {
    category: "supply",
    text: "Geo-segmented publisher coverage across tier-1, tier-2, and tier-3 web markets, sized to the prospect's actual conversion geography.",
  },

  // Quality
  {
    category: "quality",
    text: "Confirmed-sale validation pass on every conversion event before invoicing, suppressing publishers whose cohorts cancel within 30 days.",
  },
  {
    category: "quality",
    text: "Fraud filtering on the affiliate event chain: cookie-stuffing, click-injection, and forced-redirect detection at the publisher-level.",
  },
  {
    category: "quality",
    text: "Per-publisher conversion-quality scoring on cancellation rate, return rate, and chargeback rate — not just gross conversion volume.",
  },

  // MAFO
  {
    category: "mafo",
    text: "MAFO's publisher-curation engine reweights publisher allocation in real time toward sources that deliver confirmed sales (post-cancellation), not gross conversions.",
  },
  {
    category: "mafo",
    text: "MAFO's creative-rotation engine tests landing-page variants and creative formats at scale, surfacing the top performer per geo within the first 7 days.",
  },
  {
    category: "mafo",
    text: "MAFO's incrementality-aware allocation suppresses publishers showing high last-click attribution but no incremental lift on holdout cohorts.",
  },

  // Operational
  {
    category: "operational",
    text: "Compliance-vetted publisher pool for regulated web verticals (gambling, fintech, lending, insurance) — placements only run on inventory cleared by category compliance.",
  },
  {
    category: "operational",
    text: "Multi-touch attribution model that credits publishers fairly across the conversion path, reducing publisher churn from last-click bias.",
  },
  {
    category: "operational",
    text: "Confirmed-sale invoicing model with 30-day cancellation window — advertisers only pay for sales that survive the return period.",
  },
];
