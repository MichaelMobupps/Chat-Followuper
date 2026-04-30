/**
 * Event terminology catalog for web CPS sub-verticals.
 *
 * CPS (Cost Per Sale) web verticals use a different vocabulary from mobile:
 * "checkout completion" instead of "in-app purchase", "browser session"
 * instead of "DAU", "monthly visits" instead of "installs", "ROAS day-7"
 * referring to web ad spend not install-based ROAS, etc.
 *
 * The writer prompt and critic both consume this. Coverage rule: every
 * web CPS sub-vertical from `taxonomy.ts` must have an entry.
 */

import type { SubVertical } from "../taxonomy";
import type { VerticalVocabulary } from "./types";

type WebCpsSubVertical = Extract<SubVertical, `cps_web_${string}`>;

export const WEB_CPS_VOCABULARY: Record<WebCpsSubVertical, VerticalVocabulary> = {
  // ── Web ecommerce ───────────────────────────────────────────
  cps_web_ecom_marketplace: {
    primaryEvent: "confirmed purchase",
    alternativeEvents: ["checkout completion", "first purchase", "high-AOV purchase"],
    kpiTerms: ["ROAS day-7", "AOV", "first-purchase rate", "cancellation rate", "monthly visits"],
    mechanicTerms: ["category-level publisher curation", "abandoned-cart re-engagement via affiliate", "fraud filtering on confirmed-sale events", "incrementality testing"],
  },
  cps_web_ecom_retail: {
    primaryEvent: "confirmed purchase",
    alternativeEvents: ["checkout completion", "first purchase", "loyalty signup"],
    kpiTerms: ["ROAS day-7", "AOV", "loyalty attach rate", "cancellation rate"],
    mechanicTerms: ["category-level publisher curation", "loyalty-driven re-engagement", "fraud filtering on confirmed sales"],
  },
  cps_web_ecom_fashion: {
    primaryEvent: "confirmed purchase",
    alternativeEvents: ["checkout completion", "first purchase", "wishlist add"],
    kpiTerms: ["ROAS day-7", "AOV", "return rate", "season-level repeat rate"],
    mechanicTerms: ["seasonal-collection campaigns", "publisher curation by audience tier", "fraud filtering on confirmed sales"],
  },
  cps_web_ecom_beauty: {
    primaryEvent: "confirmed purchase",
    alternativeEvents: ["checkout completion", "first purchase", "subscription start"],
    kpiTerms: ["ROAS day-7", "AOV", "subscription attach rate", "repeat-purchase rate"],
    mechanicTerms: ["subscription upsell at first purchase", "publisher curation", "fraud filtering on confirmed sales"],
  },
  cps_web_ecom_electronics: {
    primaryEvent: "confirmed purchase",
    alternativeEvents: ["checkout completion", "first purchase", "high-value purchase"],
    kpiTerms: ["ROAS day-7", "AOV", "high-value-purchase rate", "warranty attach rate"],
    mechanicTerms: ["price-comparison aware publisher curation", "high-AOV lookalike", "fraud filtering on confirmed sales"],
  },
  cps_web_ecom_groceries: {
    primaryEvent: "confirmed purchase",
    alternativeEvents: ["first order", "subscription / auto-delivery", "second order"],
    kpiTerms: ["first-order conversion rate", "AOV", "weekly retention", "subscription attach rate"],
    mechanicTerms: ["first-order delivery promo via affiliate", "subscription upsell at second purchase", "publisher curation"],
  },

  // ── Web travel ──────────────────────────────────────────────
  cps_web_travel_ota: {
    primaryEvent: "completed booking",
    alternativeEvents: ["first booking", "high-value booking", "ancillary added"],
    kpiTerms: ["booking ROAS", "AOV per booking", "ancillary attach rate", "cancellation rate"],
    mechanicTerms: ["destination-level publisher curation", "abandoned-search re-engagement via affiliate", "fraud filtering on confirmed bookings"],
  },
  cps_web_travel_flights: {
    primaryEvent: "completed booking",
    alternativeEvents: ["first booking", "price alert set", "ancillary added"],
    kpiTerms: ["search-to-booking rate", "AOV per booking", "ancillary attach rate"],
    mechanicTerms: ["price-alert affiliate flows", "destination-aware publisher curation", "abandoned-search retargeting"],
  },
  cps_web_travel_hotels: {
    primaryEvent: "completed booking",
    alternativeEvents: ["first booking", "loyalty signup", "stay completed"],
    kpiTerms: ["booking ROAS", "AOV per booking", "loyalty attach rate"],
    mechanicTerms: ["destination-aware publisher curation", "loyalty-driven affiliate flows", "lookalike on premium-tier guests"],
  },
  cps_web_travel_vacation_rental: {
    primaryEvent: "completed booking",
    alternativeEvents: ["first booking", "host inquiry", "wishlist save"],
    kpiTerms: ["booking ROAS", "AOV per booking", "host-side acquisition cost"],
    mechanicTerms: ["destination-level publisher curation", "host onboarding affiliate flows", "abandoned-search retargeting"],
  },
  cps_web_travel_tours: {
    primaryEvent: "completed booking",
    alternativeEvents: ["first booking", "high-value tour booked", "wishlist save"],
    kpiTerms: ["booking ROAS", "AOV per tour", "destination-coverage split"],
    mechanicTerms: ["destination-aware publisher curation", "abandoned-search retargeting", "lookalike on high-AOV bookers"],
  },

  // ── Web fintech ─────────────────────────────────────────────
  cps_web_fintech_banking: {
    primaryEvent: "funded account",
    alternativeEvents: ["account opening completed", "first deposit", "card activation"],
    kpiTerms: ["funded-account rate", "first-deposit value", "30-day active rate"],
    mechanicTerms: ["KYC-funnel optimization", "first-deposit incentive testing", "compliant banking creative"],
  },
  cps_web_fintech_brokerage: {
    primaryEvent: "funded account",
    alternativeEvents: ["account opening completed", "first deposit", "first trade"],
    kpiTerms: ["funded-account rate", "first-deposit value", "AUC per user"],
    mechanicTerms: ["KYC funnel optimization", "first-deposit promo testing", "lookalike on active traders"],
  },
  cps_web_fintech_insurance_comparison: {
    primaryEvent: "completed policy purchase",
    alternativeEvents: ["quote requested", "policy bound", "first premium paid"],
    kpiTerms: ["quote-to-bind rate", "premium per policy", "30-day cancellation rate"],
    mechanicTerms: ["risk-tier aware publisher curation", "quote-flow optimization", "compliant insurance creative"],
  },
  cps_web_fintech_lending: {
    primaryEvent: "approved loan",
    alternativeEvents: ["loan disbursement", "first repayment", "credit-line activation"],
    kpiTerms: ["approval rate", "disbursement rate", "default rate"],
    mechanicTerms: ["pre-approval workflow optimization", "credit-score-aware publisher curation", "fraud filtering on application"],
  },
  cps_web_fintech_crypto: {
    primaryEvent: "funded account",
    alternativeEvents: ["KYC completed", "first deposit", "first trade"],
    kpiTerms: ["funded-account rate", "first-deposit value", "first-trade rate"],
    mechanicTerms: ["KYC-funnel optimization", "first-deposit promo testing", "compliance-aware creative"],
  },

  // ── Web classifieds ─────────────────────────────────────────
  cps_web_classifieds_general: {
    primaryEvent: "listing submission",
    alternativeEvents: ["first inquiry", "first sale", "premium-listing purchase"],
    kpiTerms: ["seller-onboarding rate", "listing-completion rate", "premium-attach rate"],
    mechanicTerms: ["dual-side acquisition", "category-level publisher curation", "premium-listing upsell"],
  },
  cps_web_classifieds_jobs: {
    primaryEvent: "application submission",
    alternativeEvents: ["job apply", "saved search", "subscription start"],
    kpiTerms: ["application-conversion rate", "subscription attach rate", "saved-search rate"],
    mechanicTerms: ["industry-level publisher curation", "saved-search re-engagement", "subscription upsell"],
  },
  cps_web_classifieds_realestate: {
    primaryEvent: "lead submitted",
    alternativeEvents: ["property inquiry", "saved search", "agent contact"],
    kpiTerms: ["lead-conversion rate", "lead-quality score", "agent-attach rate"],
    mechanicTerms: ["geo-fenced publisher curation", "lookalike on closed-deal leads", "saved-search re-engagement"],
  },
  cps_web_classifieds_auto: {
    primaryEvent: "lead submitted",
    alternativeEvents: ["vehicle inquiry", "saved search", "dealer contact"],
    kpiTerms: ["lead-conversion rate", "saved-search rate", "geo-coverage split"],
    mechanicTerms: ["geo-fenced publisher curation", "saved-search re-engagement", "lookalike on closed-deal buyers"],
  },

  // ── Web subscription ────────────────────────────────────────
  cps_web_subscription_saas: {
    primaryEvent: "paid plan activation",
    alternativeEvents: ["trial-to-paid conversion", "team seat purchase", "annual-plan upgrade"],
    kpiTerms: ["trial-conversion rate", "team-expansion rate", "subscription LTV"],
    mechanicTerms: ["product-led publisher curation", "team-expansion upsell", "annual-plan upsell"],
  },
  cps_web_subscription_streaming: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "annual-plan upgrade", "first stream"],
    kpiTerms: ["trial-conversion rate", "monthly retention", "subscription LTV"],
    mechanicTerms: ["free-trial paywall optimization", "annual-plan upsell", "compliant content-aware creative"],
  },
  cps_web_subscription_news: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "annual-plan upgrade", "first paywall hit"],
    kpiTerms: ["trial-conversion rate", "monthly retention", "subscription LTV"],
    mechanicTerms: ["paywall A/B testing", "annual-plan upsell", "publisher curation"],
  },

  // ── Web gambling ────────────────────────────────────────────
  cps_web_gambling_casino: {
    primaryEvent: "first time depositor",
    alternativeEvents: ["first deposit", "first wager", "second deposit"],
    kpiTerms: ["FTD rate", "first-deposit value", "regulated geo split", "monthly retention"],
    mechanicTerms: ["regulated-geo publisher curation", "first-deposit promo testing", "compliant casino creative"],
  },
  cps_web_gambling_sportsbook: {
    primaryEvent: "first time depositor",
    alternativeEvents: ["first deposit", "first bet placed", "second bet"],
    kpiTerms: ["FTD rate", "first-deposit value", "regulated geo split", "monthly retention"],
    mechanicTerms: ["regulated-geo publisher curation", "first-deposit promo testing", "compliant sportsbook creative"],
  },
  cps_web_gambling_poker: {
    primaryEvent: "first time depositor",
    alternativeEvents: ["first deposit", "first hand played", "second deposit"],
    kpiTerms: ["FTD rate", "first-deposit value", "regulated geo split"],
    mechanicTerms: ["regulated-geo publisher curation", "first-deposit promo testing", "compliant poker creative"],
  },
  cps_web_lottery: {
    primaryEvent: "first ticket purchase",
    alternativeEvents: ["account creation", "subscription / auto-buy", "second purchase"],
    kpiTerms: ["first-purchase rate", "subscription attach rate", "regulated geo split"],
    mechanicTerms: ["jackpot-aligned publisher curation", "subscription upsell", "compliant lottery creative"],
  },

  // ── Web lead generation ─────────────────────────────────────
  cps_web_leadgen_insurance: {
    primaryEvent: "qualified lead submission",
    alternativeEvents: ["quote requested", "callback requested", "policy bound"],
    kpiTerms: ["lead-quality score", "quote-to-bind rate", "lead-to-call rate"],
    mechanicTerms: ["risk-tier publisher curation", "quote-form optimization", "compliant insurance creative"],
  },
  cps_web_leadgen_mortgage: {
    primaryEvent: "qualified lead submission",
    alternativeEvents: ["pre-approval requested", "callback requested", "loan disbursement"],
    kpiTerms: ["lead-quality score", "pre-approval rate", "loan-disbursement rate"],
    mechanicTerms: ["credit-tier publisher curation", "pre-approval flow optimization", "compliant mortgage creative"],
  },
  cps_web_leadgen_auto: {
    primaryEvent: "qualified lead submission",
    alternativeEvents: ["test-drive booked", "dealer contact", "configurator completed"],
    kpiTerms: ["lead-quality score", "test-drive rate", "dealer-attach rate"],
    mechanicTerms: ["geo-fenced publisher curation", "configurator-flow optimization", "lookalike on test-drive bookers"],
  },
  cps_web_leadgen_education: {
    primaryEvent: "qualified lead submission",
    alternativeEvents: ["course inquiry", "callback requested", "course enrollment"],
    kpiTerms: ["lead-quality score", "enrollment rate", "callback rate"],
    mechanicTerms: ["program-vertical publisher curation", "lead-quality scoring", "compliant education creative"],
  },

  // ── Web education ───────────────────────────────────────────
  cps_web_education_courses: {
    primaryEvent: "course purchase",
    alternativeEvents: ["course enrollment", "subscription start", "course-bundle purchase"],
    kpiTerms: ["purchase-conversion rate", "course-completion rate", "subscription LTV"],
    mechanicTerms: ["course-preview creative", "subscription upsell", "publisher curation"],
  },
  cps_web_education_certification: {
    primaryEvent: "certification purchase",
    alternativeEvents: ["course enrollment", "subscription start", "exam scheduled"],
    kpiTerms: ["purchase-conversion rate", "completion rate", "subscription LTV"],
    mechanicTerms: ["career-outcome creative", "publisher curation by industry", "compliant certification creative"],
  },

  // ── Web health ──────────────────────────────────────────────
  cps_web_health_telehealth: {
    primaryEvent: "consultation booking",
    alternativeEvents: ["first appointment", "subscription / membership", "prescription fulfilled"],
    kpiTerms: ["consultation-conversion rate", "subscription attach rate", "30-day retention"],
    mechanicTerms: ["compliant healthcare creative", "subscription upsell", "publisher curation"],
  },
  cps_web_health_pharmacy: {
    primaryEvent: "prescription fulfilled",
    alternativeEvents: ["first refill", "subscription / auto-refill", "OTC purchase"],
    kpiTerms: ["first-fill rate", "auto-refill attach rate", "30-day retention", "AOV"],
    mechanicTerms: ["auto-refill upsell", "compliant pharmacy creative", "publisher curation"],
  },
  cps_web_health_supplement: {
    primaryEvent: "confirmed purchase",
    alternativeEvents: ["subscription start", "first purchase", "second purchase"],
    kpiTerms: ["purchase-conversion rate", "subscription attach rate", "AOV", "monthly retention"],
    mechanicTerms: ["subscription upsell at first purchase", "compliant supplement creative", "publisher curation"],
  },

  // ── Web food ────────────────────────────────────────────────
  cps_web_food_delivery: {
    primaryEvent: "completed order",
    alternativeEvents: ["first order", "second order", "subscription start"],
    kpiTerms: ["first-order rate", "AOV", "weekly retention", "subscription attach rate"],
    mechanicTerms: ["first-order promo via affiliate", "second-order push", "publisher curation"],
  },
  cps_web_food_grocery: {
    primaryEvent: "completed order",
    alternativeEvents: ["first order", "weekly basket", "subscription / membership"],
    kpiTerms: ["first-order rate", "AOV", "weekly retention", "subscription attach rate"],
    mechanicTerms: ["first-order delivery promo", "subscription upsell", "publisher curation"],
  },

  // ── Web other ───────────────────────────────────────────────
  cps_web_dating: {
    primaryEvent: "premium subscription start",
    alternativeEvents: ["account creation", "first match", "first message sent"],
    kpiTerms: ["premium-subscription rate", "30-day retention", "ARPPU"],
    mechanicTerms: ["compliant dating creative", "premium-feature upsell", "publisher curation"],
  },
  cps_web_pet: {
    primaryEvent: "confirmed purchase",
    alternativeEvents: ["subscription start", "first purchase", "second purchase"],
    kpiTerms: ["purchase-conversion rate", "subscription attach rate", "AOV"],
    mechanicTerms: ["subscription upsell at first purchase", "publisher curation", "creative testing with pet samples"],
  },
  cps_web_legal_services: {
    primaryEvent: "qualified lead submission",
    alternativeEvents: ["consultation booked", "callback requested", "service purchase"],
    kpiTerms: ["lead-quality score", "consultation rate", "service-attach rate"],
    mechanicTerms: ["service-vertical publisher curation", "lead-quality scoring", "compliant legal creative"],
  },
  cps_web_other: {
    primaryEvent: "confirmed conversion",
    alternativeEvents: ["lead submission", "purchase", "subscription start"],
    kpiTerms: ["conversion rate", "AOV / ACV", "30-day retention"],
    mechanicTerms: ["publisher curation", "lookalike on converted users", "fraud filtering on confirmed conversions"],
  },
};

/**
 * Returns the vocabulary block for a web CPS sub-vertical.
 */
export function getWebCpsVocabulary(subVertical: WebCpsSubVertical): VerticalVocabulary {
  const v = WEB_CPS_VOCABULARY[subVertical];
  if (!v) {
    throw new Error(`Missing web CPS vocabulary for sub-vertical: ${subVertical}`);
  }
  return v;
}
