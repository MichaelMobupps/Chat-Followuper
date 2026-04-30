/**
 * Event terminology catalog for mobile gaming sub-verticals.
 *
 * For each sub-vertical, defines:
 *   - primaryEvent: the canonical revenue/conversion event name to use in messages
 *     (always natural human language, never snake_case)
 *   - alternativeEvents: synonyms or sub-events the LLM may also reference
 *   - kpiTerms: native ad-tech metrics for this sub-vertical
 *   - mechanicTerms: vertical-native mechanics the LLM should use in HOW sections
 *
 * The writer prompt receives this block to ground vocabulary choice. The
 * critic uses it to flag wrong-vertical terminology.
 *
 * Reference points used to populate this:
 *   - Sensor Tower Game IQ taxonomy (~70 sub-genres + monetization profiles)
 *   - AppsFlyer mobile app trends 2024-2026 reports
 *   - MobUpps internal vertical playbooks
 */

import type { SubVertical } from "../taxonomy";
import type { VerticalVocabulary } from "./types";

export type { VerticalVocabulary };

type GamingSubVertical = Extract<SubVertical, `gaming_${string}_mobile`>;

export const MOBILE_GAMING_VOCABULARY: Record<GamingSubVertical, VerticalVocabulary> = {
  gaming_casual_mobile: {
    primaryEvent: "in-app purchase",
    alternativeEvents: ["first IAP", "level 20 reached", "level 30 reached", "D7 retained user"],
    kpiTerms: ["ARPDAU", "D1 retention", "D7 retention", "D30 retention", "ROAS day-7", "payer rate", "session length"],
    mechanicTerms: ["soft launch", "live-ops events", "rewarded video integration", "playable ad creative", "lookalike modeling on payer cohorts", "store optimization push"],
  },
  gaming_hyper_casual_mobile: {
    primaryEvent: "ad impression milestone",
    alternativeEvents: ["session 5 completion", "level 10 reached", "first rewarded video view"],
    kpiTerms: ["ARPDAU", "session count per user", "ad impressions per DAU", "D1 retention", "CPI", "IPM"],
    mechanicTerms: ["mediation waterfall optimization", "interstitial pacing", "rewarded video placement testing", "creative A/B testing at scale", "broad-volume CPI buying"],
  },
  gaming_match3_mobile: {
    primaryEvent: "in-app purchase",
    alternativeEvents: ["first IAP", "level 50 reached", "level 100 reached", "booster purchase"],
    kpiTerms: ["ARPDAU", "ARPPU", "D7 retention", "D30 retention", "ROAS day-30", "payer conversion rate", "level completion rate"],
    mechanicTerms: ["soft launch in tier-2 markets", "live-ops events around themed content", "playable ads previewing levels", "lookalike modeling on whales", "creative testing with gameplay clips"],
  },
  gaming_puzzle_mobile: {
    primaryEvent: "in-app purchase",
    alternativeEvents: ["first IAP", "level pack unlock", "hint purchase", "D7 retained user"],
    kpiTerms: ["ARPDAU", "D7 retention", "ROAS day-7", "session length", "level completion rate"],
    mechanicTerms: ["live-ops puzzle packs", "rewarded video for hints", "playable ads showing puzzles", "lookalike on level-30+ retained users"],
  },
  gaming_word_mobile: {
    primaryEvent: "in-app purchase",
    alternativeEvents: ["first IAP", "premium hint pack", "subscription start"],
    kpiTerms: ["ARPDAU", "D7 retention", "subscription rate", "daily session count"],
    mechanicTerms: ["daily challenge live-ops", "subscription paywall optimization", "rewarded video for hints", "tournament mechanic"],
  },
  gaming_simulation_mobile: {
    primaryEvent: "in-app purchase",
    alternativeEvents: ["first IAP", "premium currency pack", "expansion pack purchase"],
    kpiTerms: ["ARPDAU", "ARPPU", "D7 retention", "D30 retention", "ROAS day-30", "session length", "build-time skip events"],
    mechanicTerms: ["seasonal live-ops content", "themed limited-time events", "creative testing with sim gameplay", "lookalike on payer cohorts"],
  },
  gaming_idle_mobile: {
    primaryEvent: "in-app purchase",
    alternativeEvents: ["first IAP", "prestige unlock", "ad skip purchase", "D7 retained user"],
    kpiTerms: ["ARPDAU", "session count per user", "ad impressions per DAU", "ROAS day-7", "rewarded video opt-in rate"],
    mechanicTerms: ["rewarded video for offline gains", "interstitial pacing tuning", "live-ops prestige events", "playable ad creative"],
  },
  gaming_midcore_rpg_mobile: {
    primaryEvent: "in-app purchase",
    alternativeEvents: ["first IAP", "first 10-pull gacha", "guild join", "D7 retained user", "battle pass purchase"],
    kpiTerms: ["ARPDAU", "ARPPU", "payer conversion rate", "D7 retention", "D30 retention", "ROAS day-30", "ROAS day-90", "whale rate"],
    mechanicTerms: ["soft launch in tier-2 markets", "guild-based live-ops", "battle pass cycles", "limited-time gacha banners", "lookalike modeling on whales", "creative testing with character showcases"],
  },
  gaming_midcore_strategy_mobile: {
    primaryEvent: "in-app purchase",
    alternativeEvents: ["first IAP", "alliance join", "first base upgrade purchase", "kingdom event participation"],
    kpiTerms: ["ARPDAU", "ARPPU", "D7 retention", "D30 retention", "ROAS day-30", "ROAS day-90", "whale rate", "alliance retention"],
    mechanicTerms: ["alliance-based live-ops", "kingdom war events", "VIP tier progression", "creative testing with battle clips", "lookalike on alliance leaders"],
  },
  gaming_midcore_moba_mobile: {
    primaryEvent: "in-app purchase",
    alternativeEvents: ["first IAP", "first hero purchase", "skin purchase", "battle pass start"],
    kpiTerms: ["ARPDAU", "matches per user", "D7 retention", "ROAS day-30", "skin attach rate"],
    mechanicTerms: ["seasonal battle pass", "themed skin drops", "tournament events", "creative testing with hero gameplay"],
  },
  gaming_midcore_card_mobile: {
    primaryEvent: "in-app purchase",
    alternativeEvents: ["first IAP", "first pack purchase", "deck slot unlock", "battle pass start"],
    kpiTerms: ["ARPDAU", "ARPPU", "D7 retention", "D30 retention", "ROAS day-30", "matches per user"],
    mechanicTerms: ["expansion releases as live-ops anchor", "limited-time game modes", "tournament ladders", "creative testing with deck reveals"],
  },
  gaming_midcore_action_mobile: {
    primaryEvent: "in-app purchase",
    alternativeEvents: ["first IAP", "first gear pack", "battle pass start", "guild join"],
    kpiTerms: ["ARPDAU", "ARPPU", "D7 retention", "D30 retention", "ROAS day-30"],
    mechanicTerms: ["seasonal events", "guild raids", "limited-time bosses", "creative testing with combat clips"],
  },
  gaming_hardcore_mmo_mobile: {
    primaryEvent: "in-app purchase",
    alternativeEvents: ["first IAP", "first gear pack", "guild join", "VIP subscription start"],
    kpiTerms: ["ARPPU", "ARPDAU", "D30 retention", "D90 retention", "ROAS day-90", "whale rate", "subscription LTV"],
    mechanicTerms: ["server merges as live-ops anchor", "guild war events", "VIP subscription tiers", "lookalike on long-tail whales"],
  },
  gaming_hardcore_shooter_mobile: {
    primaryEvent: "in-app purchase",
    alternativeEvents: ["first IAP", "first weapon skin", "battle pass start", "ranked match win"],
    kpiTerms: ["ARPDAU", "matches per user", "D7 retention", "ROAS day-30", "skin attach rate"],
    mechanicTerms: ["seasonal battle pass", "limited-time game modes", "tournament events", "creative testing with gunplay clips"],
  },
  gaming_social_casino_mobile: {
    primaryEvent: "in-app purchase",
    alternativeEvents: ["first virtual coin pack purchase", "level milestone reached", "loyalty club tier"],
    kpiTerms: ["ARPDAU", "ARPPU", "D7 retention", "D30 retention", "spin frequency", "session length"],
    mechanicTerms: ["loyalty club mechanics", "limited-time slot themes", "creative testing with slot reels", "lookalike on payer cohorts"],
  },
  gaming_sports_sim_mobile: {
    primaryEvent: "in-app purchase",
    alternativeEvents: ["first IAP", "first card pack", "season pass start", "league join"],
    kpiTerms: ["ARPDAU", "D7 retention", "ROAS day-30", "matches per user"],
    mechanicTerms: ["live-ops aligned to real-world sports calendar", "card pack drops around real tournaments", "creative testing with star-player highlights"],
  },
  gaming_racing_mobile: {
    primaryEvent: "in-app purchase",
    alternativeEvents: ["first IAP", "first car unlock", "battle pass start"],
    kpiTerms: ["ARPDAU", "D7 retention", "ROAS day-30"],
    mechanicTerms: ["seasonal events", "limited-time car drops", "tournament ladders", "creative testing with race clips"],
  },
  gaming_kids_edu_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "first lesson completion", "monthly plan activation"],
    kpiTerms: ["trial conversion rate", "subscription LTV", "monthly retention", "session count per user"],
    mechanicTerms: ["free-trial paywall optimization", "parent-targeted creative", "compliant for kids advertising rules", "lookalike on subscriber parents"],
  },
};

/**
 * Returns the vocabulary block for a gaming sub-vertical.
 */
export function getMobileGamingVocabulary(subVertical: GamingSubVertical): VerticalVocabulary {
  return MOBILE_GAMING_VOCABULARY[subVertical];
}
