/**
 * Volume calibration benchmarks.
 *
 * For each top-level vertical, provides scale-tier-aware daily-volume ranges
 * the research stage anchors `calibrated_daily_volume` to. The research LLM
 * is told to pick ONE specific number from the tier range based on prospect
 * scale signals (downloads, monthly visits, employee count).
 *
 * Volume here means "daily delivered events of the primary conversion type
 * MobUpps could reasonably commit to at this scale tier." Numbers reflect
 * MobUpps internal capacity benchmarks for serious campaigns.
 *
 * Ported and updated from the Email Prospector's s4_research.py volume
 * anchoring rules.
 */

import { getTopLevelVertical, type TopLevelVertical } from "../taxonomy";

export type ScaleTier = "small" | "mid" | "large" | "mega";

export interface VolumeBenchmark {
  /** Range of plausible daily volumes for this scale tier (lower bound). */
  min: number;
  /** Range of plausible daily volumes for this scale tier (upper bound). */
  max: number;
  /** Plain-language description of the scale tier. */
  scaleDescription: string;
}

type VerticalBenchmarks = Record<ScaleTier, VolumeBenchmark>;

const BENCHMARKS: Record<TopLevelVertical, VerticalBenchmarks> = {
  gaming: {
    // Hyper-casual / casual gaming has very different volume profile from
    // mid-core / hardcore; this table assumes sub-vertical context will guide.
    // For mega-scale hyper-casual publishers (Voodoo / SayGames / Supercent
    // tier), volumes hit 1500-5000 daily.
    small: { min: 50, max: 150, scaleDescription: "indie / startup, <1M downloads" },
    mid: { min: 150, max: 500, scaleDescription: "mid-tier publisher, 1M-10M downloads" },
    large: { min: 400, max: 1200, scaleDescription: "major publisher, 10M-100M downloads" },
    mega: { min: 1500, max: 5000, scaleDescription: "top-grossing global publisher, 100M+ downloads" },
  },
  non_gaming_ua: {
    small: { min: 30, max: 100, scaleDescription: "indie / startup app, <1M downloads" },
    mid: { min: 100, max: 300, scaleDescription: "established app, 1M-10M downloads" },
    large: { min: 300, max: 800, scaleDescription: "major app, 10M-50M downloads" },
    mega: { min: 800, max: 2500, scaleDescription: "top-tier global utility, 50M+ downloads" },
  },
  fintech: {
    small: { min: 30, max: 100, scaleDescription: "early-stage fintech, <500K users" },
    mid: { min: 100, max: 300, scaleDescription: "growth-stage fintech, 500K-5M users" },
    large: { min: 200, max: 800, scaleDescription: "established fintech, 5M-30M users" },
    mega: { min: 700, max: 2000, scaleDescription: "tier-1 neobank or exchange, 30M+ users" },
  },
  ecommerce: {
    small: { min: 50, max: 150, scaleDescription: "small shop / DTC brand" },
    mid: { min: 150, max: 400, scaleDescription: "established ecom, 100K-1M monthly visits" },
    large: { min: 300, max: 1000, scaleDescription: "major ecom, 1M-10M monthly visits" },
    mega: { min: 1000, max: 3500, scaleDescription: "regional or global marketplace, 10M+ monthly visits" },
  },
  food_qsr: {
    small: { min: 50, max: 150, scaleDescription: "regional / single-city operator" },
    mid: { min: 150, max: 500, scaleDescription: "multi-city operator" },
    large: { min: 400, max: 1200, scaleDescription: "national operator" },
    mega: { min: 1200, max: 4000, scaleDescription: "regional aggregator (UberEats / Swiggy / Rappi tier)" },
  },
  travel: {
    small: { min: 30, max: 100, scaleDescription: "niche / regional operator" },
    mid: { min: 100, max: 300, scaleDescription: "established mid-tier" },
    large: { min: 250, max: 700, scaleDescription: "major regional player" },
    mega: { min: 700, max: 2500, scaleDescription: "global OTA (Booking / Expedia / Agoda tier)" },
  },
  subscription_media: {
    small: { min: 50, max: 150, scaleDescription: "early-stage subscription app" },
    mid: { min: 150, max: 400, scaleDescription: "growing subscription, 1M-10M users" },
    large: { min: 300, max: 800, scaleDescription: "established service, 10M-50M users" },
    mega: { min: 800, max: 2500, scaleDescription: "global streaming (Netflix / Spotify / Disney+ tier)" },
  },
  health_wellness: {
    small: { min: 30, max: 100, scaleDescription: "early-stage health app" },
    mid: { min: 100, max: 300, scaleDescription: "established health app, 500K-5M users" },
    large: { min: 250, max: 700, scaleDescription: "major health app, 5M-30M users" },
    mega: { min: 700, max: 2000, scaleDescription: "global wellness brand (Calm / MyFitnessPal tier)" },
  },
  education: {
    small: { min: 30, max: 100, scaleDescription: "early-stage edtech" },
    mid: { min: 100, max: 300, scaleDescription: "growing edtech, 500K-5M users" },
    large: { min: 250, max: 700, scaleDescription: "major edtech, 5M-30M users" },
    mega: { min: 700, max: 2000, scaleDescription: "global edtech (Duolingo / Coursera tier)" },
  },
  dating_social: {
    small: { min: 50, max: 150, scaleDescription: "niche / regional dating app" },
    mid: { min: 150, max: 400, scaleDescription: "established dating app" },
    large: { min: 300, max: 800, scaleDescription: "major dating brand" },
    mega: { min: 800, max: 2500, scaleDescription: "global dating (Tinder / Bumble / Hinge tier)" },
  },
  sports_news: {
    small: { min: 30, max: 100, scaleDescription: "regional sports app" },
    mid: { min: 100, max: 300, scaleDescription: "national sports brand" },
    large: { min: 250, max: 700, scaleDescription: "major sports media" },
    mega: { min: 700, max: 2000, scaleDescription: "global sports media (ESPN / Sky Sports tier)" },
  },
  sports_betting: {
    small: { min: 30, max: 100, scaleDescription: "regional / single-state operator" },
    mid: { min: 100, max: 300, scaleDescription: "multi-state operator" },
    large: { min: 250, max: 700, scaleDescription: "national operator" },
    mega: { min: 700, max: 2000, scaleDescription: "tier-1 sportsbook (DraftKings / FanDuel / Bet365 / Stake tier)" },
  },
  gambling: {
    small: { min: 30, max: 100, scaleDescription: "regional operator" },
    mid: { min: 100, max: 300, scaleDescription: "established casino" },
    large: { min: 250, max: 700, scaleDescription: "major casino brand" },
    mega: { min: 700, max: 2000, scaleDescription: "tier-1 casino (Stake / Bet365 / 1xBet tier)" },
  },
  real_estate: {
    small: { min: 20, max: 80, scaleDescription: "regional broker / local platform" },
    mid: { min: 80, max: 250, scaleDescription: "national platform" },
    large: { min: 200, max: 600, scaleDescription: "major property portal" },
    mega: { min: 600, max: 2000, scaleDescription: "tier-1 portal (Zillow / Rightmove / 99acres tier)" },
  },
  automotive: {
    small: { min: 20, max: 80, scaleDescription: "regional auto platform" },
    mid: { min: 80, max: 250, scaleDescription: "national platform" },
    large: { min: 200, max: 600, scaleDescription: "major auto marketplace" },
    mega: { min: 600, max: 1500, scaleDescription: "tier-1 auto platform (CarMax / AutoTrader / Cars.com tier)" },
  },
  classifieds: {
    small: { min: 30, max: 100, scaleDescription: "niche / regional classifieds" },
    mid: { min: 100, max: 300, scaleDescription: "national classifieds" },
    large: { min: 300, max: 800, scaleDescription: "major classifieds platform" },
    mega: { min: 800, max: 2500, scaleDescription: "tier-1 classifieds (Craigslist / OLX / Indeed tier)" },
  },
  telco_utilities: {
    small: { min: 30, max: 100, scaleDescription: "regional MVNO / utility" },
    mid: { min: 100, max: 300, scaleDescription: "mid-tier carrier / utility" },
    large: { min: 250, max: 700, scaleDescription: "major national carrier / utility" },
    mega: { min: 700, max: 2000, scaleDescription: "tier-1 carrier (T-Mobile / Vodafone / Jio tier)" },
  },
  b2b_saas: {
    small: { min: 20, max: 80, scaleDescription: "early-stage SaaS, <10K paid seats" },
    mid: { min: 80, max: 250, scaleDescription: "growth-stage SaaS, 10K-100K paid seats" },
    large: { min: 200, max: 600, scaleDescription: "established SaaS, 100K-500K paid seats" },
    mega: { min: 600, max: 1500, scaleDescription: "enterprise SaaS (Salesforce / Slack / HubSpot tier)" },
  },
  charity_civic: {
    small: { min: 20, max: 80, scaleDescription: "small charity / civic org" },
    mid: { min: 80, max: 250, scaleDescription: "mid-size charity" },
    large: { min: 200, max: 600, scaleDescription: "major charity brand" },
    mega: { min: 600, max: 1500, scaleDescription: "global charity (Red Cross / UNICEF tier)" },
  },
  religion: {
    small: { min: 20, max: 80, scaleDescription: "small religious app" },
    mid: { min: 80, max: 250, scaleDescription: "mid-size religious brand" },
    large: { min: 200, max: 600, scaleDescription: "major religious app" },
    mega: { min: 600, max: 1500, scaleDescription: "tier-1 religious app (Hallow / Bible.com tier)" },
  },
  kids_family: {
    small: { min: 30, max: 100, scaleDescription: "early-stage kids app" },
    mid: { min: 100, max: 300, scaleDescription: "established kids brand" },
    large: { min: 250, max: 700, scaleDescription: "major kids platform" },
    mega: { min: 700, max: 2000, scaleDescription: "tier-1 kids brand (ABCmouse / Khan Academy Kids tier)" },
  },
  generative_ai: {
    small: { min: 50, max: 200, scaleDescription: "early-stage AI app" },
    mid: { min: 200, max: 600, scaleDescription: "growth-stage AI app" },
    large: { min: 500, max: 1500, scaleDescription: "established AI brand" },
    mega: { min: 1500, max: 5000, scaleDescription: "tier-1 AI brand (ChatGPT / Midjourney tier)" },
  },
  adult: {
    small: { min: 20, max: 80, scaleDescription: "regional adult platform" },
    mid: { min: 80, max: 250, scaleDescription: "established adult brand" },
    large: { min: 200, max: 600, scaleDescription: "major adult platform" },
    mega: { min: 600, max: 1500, scaleDescription: "tier-1 adult platform" },
  },
  cps_web: {
    // Web CPS volume is denominated in confirmed sales / leads per day,
    // similar to mobile but anchored to monthly web visits not installs.
    small: { min: 50, max: 150, scaleDescription: "<100K monthly visits" },
    mid: { min: 150, max: 500, scaleDescription: "100K-1M monthly visits" },
    large: { min: 400, max: 1200, scaleDescription: "1M-10M monthly visits" },
    mega: { min: 1200, max: 4000, scaleDescription: "10M+ monthly visits, tier-1 web property" },
  },
  other: {
    // Catch-all uses a conservative middle range
    small: { min: 30, max: 100, scaleDescription: "small operator" },
    mid: { min: 100, max: 300, scaleDescription: "mid-tier operator" },
    large: { min: 300, max: 800, scaleDescription: "major operator" },
    mega: { min: 800, max: 2000, scaleDescription: "tier-1 operator" },
  },
};

/**
 * Returns the volume benchmark for a sub-vertical at a given scale tier.
 * Throws on unknown sub-vertical.
 */
export function getVolumeBenchmark(subVertical: string, tier: ScaleTier): VolumeBenchmark {
  const top = getTopLevelVertical(subVertical);
  const benchmarks = BENCHMARKS[top];
  if (!benchmarks) {
    throw new Error(`No volume benchmarks for top-level vertical: ${top}`);
  }
  return benchmarks[tier];
}

/**
 * Builds the volume calibration block as injected text for the research
 * prompt. Tells the LLM exactly which scale tier ranges are realistic for
 * MobUpps to commit to in this vertical, so it picks ONE specific number
 * (never a range) anchored to the prospect's actual scale.
 */
export function buildVolumeCalibrationBlock(subVertical: string): string {
  const top = getTopLevelVertical(subVertical);
  const tiers = BENCHMARKS[top];
  return `VOLUME CALIBRATION for ${top} (use prospect's actual scale signals to pick a tier, then pick ONE specific number from that tier's range):

  - small (${tiers.small.scaleDescription}): ${tiers.small.min}-${tiers.small.max} daily
  - mid (${tiers.mid.scaleDescription}): ${tiers.mid.min}-${tiers.mid.max} daily
  - large (${tiers.large.scaleDescription}): ${tiers.large.min}-${tiers.large.max} daily
  - mega (${tiers.mega.scaleDescription}): ${tiers.mega.min}-${tiers.mega.max} daily

CRITICAL: The "researched_daily_volume" field MUST be a SINGLE number (e.g. "450" or "1200"), never a range like "150-400". If the prospect's exact scale is uncertain, pick the most likely tier based on the brand's recognizability, market position, and any scale signals provided.`;
}
