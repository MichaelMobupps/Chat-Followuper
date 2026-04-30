/**
 * Tangible proof points for mobile gaming sub-verticals.
 *
 * Each proof point is a one-sentence reason MobUpps can credibly commit to a
 * conversion event at the calibrated daily volume. The research stage picks
 * 2-3 of these and includes them in the ProspectBrief; the writer uses them
 * in the VALIDATION + HOW sections of the message.
 *
 * Categories:
 *   - supply: why MobUpps has the inventory to deliver the volume
 *   - quality: why the users delivered convert (not vanity)
 *   - mafo: how MobUpps' MAFO AI optimization engine drives the result
 *   - operational: why the operational mechanics fit this sub-vertical
 */

export interface ProofPoint {
  category: "supply" | "quality" | "mafo" | "operational";
  text: string;
}

export const MOBILE_GAMING_PROOF_POINTS: ProofPoint[] = [
  // Supply
  {
    category: "supply",
    text: "Direct integrations with 200+ semi-exclusive mobile gaming inventory sources, including hyper-casual publisher portfolios that don't run on standard DSPs.",
  },
  {
    category: "supply",
    text: "Geo-segmented gaming-DSP supply across tier-1, tier-2, and tier-3 markets, sized to the prospect's actual launch geography.",
  },
  {
    category: "supply",
    text: "Direct ad-network relationships in tier-2 mobile markets (LATAM, SEA, MENA) where install volume is highest and CPI is lowest.",
  },

  // Quality
  {
    category: "quality",
    text: "Per-publisher fraud filtering at the install event, with payer-cohort lookalike modeling layered on top.",
  },
  {
    category: "quality",
    text: "Payer-conversion cohort analysis at the source-publisher level, automatically suppressing supply that delivers installs but no IAP.",
  },
  {
    category: "quality",
    text: "Day-7 ROAS-aware bidding that suppresses installs from publishers whose cohorts don't generate revenue events within the first week.",
  },

  // MAFO (MobUpps' proprietary AI optimization engine)
  {
    category: "mafo",
    text: "MAFO's payer-cohort optimization engine reweights bidding in real time toward sources that deliver the prospect's primary monetization event, not vanity install volume.",
  },
  {
    category: "mafo",
    text: "MAFO's creative-rotation engine A/B-tests playable and rewarded-video creatives at scale, surfacing the top performer per geo within the first 48 hours.",
  },
  {
    category: "mafo",
    text: "MAFO's lookalike modeling on payer cohorts (not install cohorts) means the optimization curve compounds faster than standard DSP lookalike.",
  },

  // Operational
  {
    category: "operational",
    text: "Soft-launch geo-rotation playbook tested across 50+ mid-core RPG launches in the past 18 months.",
  },
  {
    category: "operational",
    text: "Live-ops campaign cycling synchronized to in-game event calendars (themed banners, battle pass cycles), aligned with the prospect's roadmap.",
  },
  {
    category: "operational",
    text: "Battle-pass and gacha-banner timing aligned with media-buying cycles, reducing creative-fatigue penalty by 30-40%.",
  },
];
