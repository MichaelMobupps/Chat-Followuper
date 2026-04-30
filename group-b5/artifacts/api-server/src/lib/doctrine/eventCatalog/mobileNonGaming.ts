/**
 * Event terminology catalog for mobile non-gaming sub-verticals.
 *
 * Same shape as mobileGaming.ts. Each sub-vertical defines its primary
 * conversion event, alternative events, native KPI terms, and operational
 * mechanic terms. The writer prompt and critic both consume this.
 *
 * Coverage rule: every mobile non-gaming sub-vertical from `taxonomy.ts`
 * must have an entry. Missing entries throw at lookup time so SDR seed
 * flow surfaces the gap rather than silently producing weak vocabulary.
 */

import type { SubVertical } from "../taxonomy";
import type { VerticalVocabulary } from "./types";

type MobileNonGamingSubVertical = Exclude<
  SubVertical,
  | `gaming_${string}_mobile`
  | `cps_web_${string}`
  | "other_uncategorized"
>;

export const MOBILE_NON_GAMING_VOCABULARY: Record<MobileNonGamingSubVertical, VerticalVocabulary> = {
  // ── Mobile utility & lifestyle ──────────────────────────────
  utility_productivity_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "premium feature unlock", "first export"],
    kpiTerms: ["trial conversion rate", "monthly retention", "subscription LTV", "MAU"],
    mechanicTerms: ["free-trial paywall optimization", "feature-gated upsell", "lookalike on paying users"],
  },
  utility_general_mobile: {
    primaryEvent: "ad impression milestone",
    alternativeEvents: ["pro upgrade", "first export", "subscription start"],
    kpiTerms: ["ARPDAU", "session count per user", "monthly retention"],
    mechanicTerms: ["interstitial pacing", "rewarded video integration", "pro upsell timing"],
  },
  photo_video_editor_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "premium asset purchase", "first export"],
    kpiTerms: ["trial conversion rate", "subscription LTV", "monthly retention", "session length"],
    mechanicTerms: ["free-trial paywall", "premium template gating", "creative testing with output samples"],
  },
  lifestyle_general_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["premium feature unlock", "first habit logged", "monthly plan activation"],
    kpiTerms: ["trial conversion rate", "D7 retention", "monthly retention", "subscription LTV"],
    mechanicTerms: ["habit-streak push notifications", "free-trial paywall optimization", "lookalike on engaged users"],
  },
  generative_ai_consumer_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["credit pack purchase", "first generation", "trial-to-paid conversion"],
    kpiTerms: ["trial conversion rate", "credits-per-user", "subscription LTV", "monthly retention"],
    mechanicTerms: ["credit-pack monetization", "free-trial paywall", "creative testing with generated outputs"],
  },

  // ── Mobile fintech ──────────────────────────────────────────
  fintech_neobank_mobile: {
    primaryEvent: "funded account",
    alternativeEvents: ["first deposit", "card issuance completed", "KYC completed", "first transaction"],
    kpiTerms: ["funded-account rate", "first-deposit value", "KYC completion rate", "30-day active rate", "AUC per user"],
    mechanicTerms: ["KYC-funnel optimization", "first-deposit incentive testing", "lookalike on funded users", "fraud filtering pre-KYC"],
  },
  fintech_traditional_bank_mobile: {
    primaryEvent: "account opening completed",
    alternativeEvents: ["first deposit", "card activation", "first bill payment"],
    kpiTerms: ["account-opening rate", "first-deposit value", "30-day active rate", "primary-account rate"],
    mechanicTerms: ["existing-customer cross-sell", "lookalike on premium tier", "branch handoff suppression"],
  },
  fintech_crypto_exchange_mobile: {
    primaryEvent: "funded account",
    alternativeEvents: ["first deposit", "first trade", "KYC completed"],
    kpiTerms: ["funded-account rate", "first-deposit value", "first-trade rate", "monthly trading volume"],
    mechanicTerms: ["KYC-funnel optimization", "first-deposit promo testing", "lookalike on active traders", "compliance-aware creative"],
  },
  fintech_crypto_wallet_defi_mobile: {
    primaryEvent: "wallet created",
    alternativeEvents: ["first transaction", "first swap", "first asset deposited"],
    kpiTerms: ["wallet creation rate", "first-transaction rate", "monthly active wallets", "TVL per user"],
    mechanicTerms: ["self-custody onboarding flows", "first-swap incentive testing", "lookalike on active wallets"],
  },
  fintech_brokerage_trading_mobile: {
    primaryEvent: "funded account",
    alternativeEvents: ["first deposit", "first trade", "KYC completed"],
    kpiTerms: ["funded-account rate", "first-deposit value", "trades per user", "AUC per user"],
    mechanicTerms: ["KYC funnel optimization", "first-deposit promo testing", "lookalike on active traders"],
  },
  fintech_forex_cfd_mobile: {
    primaryEvent: "funded account",
    alternativeEvents: ["first deposit", "first trade"],
    kpiTerms: ["funded-account rate", "first-deposit value", "trading volume per user", "regulated geo split"],
    mechanicTerms: ["regulated-geo targeting", "first-deposit promo testing", "lookalike on active traders"],
  },
  fintech_lending_mobile: {
    primaryEvent: "approved loan",
    alternativeEvents: ["loan disbursement", "first repayment", "credit-line activation"],
    kpiTerms: ["approval rate", "disbursement rate", "default rate", "loan-value per approved user"],
    mechanicTerms: ["pre-approval workflow optimization", "credit-score-aware lookalike", "fraud filtering on application"],
  },
  fintech_bnpl_mobile: {
    primaryEvent: "first BNPL transaction",
    alternativeEvents: ["account approval", "first repayment", "second purchase"],
    kpiTerms: ["approval rate", "first-transaction rate", "repeat-purchase rate", "default rate"],
    mechanicTerms: ["merchant integration push", "lookalike on repeat users", "creative testing at checkout point"],
  },
  fintech_payments_wallet_mobile: {
    primaryEvent: "first transaction",
    alternativeEvents: ["wallet funding", "P2P transfer", "merchant payment"],
    kpiTerms: ["activation rate", "first-transaction value", "monthly active users", "transaction frequency"],
    mechanicTerms: ["P2P viral mechanics", "merchant cashback campaigns", "lookalike on active payers"],
  },
  fintech_remittance_mobile: {
    primaryEvent: "first transfer",
    alternativeEvents: ["KYC completed", "wallet funding", "second transfer"],
    kpiTerms: ["first-transfer rate", "average-transfer-value", "corridor split", "repeat-sender rate"],
    mechanicTerms: ["corridor-specific creative testing", "diaspora targeting", "first-transfer fee promo"],
  },
  fintech_insurance_mobile: {
    primaryEvent: "completed policy purchase",
    alternativeEvents: ["quote requested", "policy bound", "first premium paid"],
    kpiTerms: ["quote-to-bind rate", "premium per policy", "30-day cancellation rate"],
    mechanicTerms: ["risk-tier aware lookalike", "quote-flow optimization", "compliant creative for insurance ads"],
  },
  fintech_robo_advisor_mobile: {
    primaryEvent: "funded account",
    alternativeEvents: ["first deposit", "auto-deposit setup", "portfolio activation"],
    kpiTerms: ["funded-account rate", "first-deposit value", "AUC per user", "auto-deposit attach rate"],
    mechanicTerms: ["risk-questionnaire optimization", "auto-deposit incentive", "lookalike on long-term holders"],
  },
  fintech_personal_finance_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["account aggregation completed", "first budget set", "trial-to-paid conversion"],
    kpiTerms: ["aggregation completion rate", "monthly retention", "subscription LTV"],
    mechanicTerms: ["account-linking funnel optimization", "free-trial paywall", "lookalike on long-term subscribers"],
  },
  fintech_micro_investing_mobile: {
    primaryEvent: "funded account",
    alternativeEvents: ["first deposit", "round-up enabled", "auto-deposit setup"],
    kpiTerms: ["funded-account rate", "first-deposit value", "AUC per user", "round-up attach rate"],
    mechanicTerms: ["round-up flow optimization", "auto-deposit incentive", "lookalike on consistent depositors"],
  },
  fintech_savings_mobile: {
    primaryEvent: "funded account",
    alternativeEvents: ["first deposit", "auto-deposit setup", "savings-goal created"],
    kpiTerms: ["funded-account rate", "first-deposit value", "auto-deposit attach rate", "AUC per user"],
    mechanicTerms: ["goal-based onboarding", "auto-deposit incentive", "lookalike on consistent savers"],
  },

  // ── Mobile ecommerce ────────────────────────────────────────
  ecom_marketplace_multi_seller_mobile: {
    primaryEvent: "confirmed purchase",
    alternativeEvents: ["first purchase", "add-to-cart", "checkout completion"],
    kpiTerms: ["purchase ROAS day-7", "AOV", "first-purchase rate", "repeat-purchase rate", "cancellation rate"],
    mechanicTerms: ["category-level lookalike", "abandoned-cart re-engagement", "first-purchase promo testing", "fraud filtering on checkout"],
  },
  ecom_retail_brand_mobile: {
    primaryEvent: "confirmed purchase",
    alternativeEvents: ["first purchase", "loyalty signup", "checkout completion"],
    kpiTerms: ["purchase ROAS", "AOV", "loyalty attach rate", "repeat-purchase rate"],
    mechanicTerms: ["loyalty-driven re-engagement", "first-purchase incentive", "lookalike on high-AOV customers"],
  },
  ecom_fashion_mobile: {
    primaryEvent: "confirmed purchase",
    alternativeEvents: ["first purchase", "wishlist add", "checkout completion"],
    kpiTerms: ["purchase ROAS", "AOV", "return rate", "season-level repeat rate"],
    mechanicTerms: ["seasonal collection drops", "lookalike on premium-tier buyers", "size-aware retargeting"],
  },
  ecom_beauty_mobile: {
    primaryEvent: "confirmed purchase",
    alternativeEvents: ["first purchase", "subscription start", "loyalty signup"],
    kpiTerms: ["purchase ROAS", "AOV", "subscription attach rate", "repeat-purchase rate"],
    mechanicTerms: ["subscription upsell at first purchase", "loyalty-driven re-engagement", "lookalike on subscribers"],
  },
  ecom_electronics_mobile: {
    primaryEvent: "confirmed purchase",
    alternativeEvents: ["first purchase", "high-value purchase", "warranty attach"],
    kpiTerms: ["purchase ROAS", "AOV", "high-value-purchase rate", "warranty attach rate"],
    mechanicTerms: ["price-comparison aware creative", "lookalike on high-AOV buyers", "abandoned-cart re-engagement"],
  },
  ecom_home_garden_mobile: {
    primaryEvent: "confirmed purchase",
    alternativeEvents: ["first purchase", "high-value purchase", "design consultation booked"],
    kpiTerms: ["purchase ROAS", "AOV", "design-consultation rate"],
    mechanicTerms: ["consultation-flow optimization", "lookalike on high-AOV buyers", "seasonal campaign cycling"],
  },
  ecom_groceries_mobile: {
    primaryEvent: "confirmed purchase",
    alternativeEvents: ["first order", "subscription / auto-delivery", "second order"],
    kpiTerms: ["first-order conversion rate", "AOV", "weekly retention", "subscription attach rate"],
    mechanicTerms: ["first-order delivery promo", "subscription upsell at second purchase", "lookalike on weekly orderers"],
  },
  ecom_secondhand_resale_mobile: {
    primaryEvent: "confirmed purchase",
    alternativeEvents: ["first listing", "first purchase", "saved search"],
    kpiTerms: ["buyer-conversion rate", "seller-onboarding rate", "AOV", "GMV per user"],
    mechanicTerms: ["dual-side acquisition (buyer + seller)", "category-level lookalike", "saved-search re-engagement"],
  },
  ecom_flash_sales_mobile: {
    primaryEvent: "confirmed purchase",
    alternativeEvents: ["first purchase", "deal browse", "wishlist add"],
    kpiTerms: ["purchase ROAS", "AOV", "session-to-purchase rate", "deal-browse rate"],
    mechanicTerms: ["urgency-driven creative", "lookalike on deal-hunters", "re-engagement on flash drops"],
  },
  ecom_subscription_box_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-box ordered", "second-month renewal", "annual-plan upgrade"],
    kpiTerms: ["trial-conversion rate", "second-month renewal rate", "subscription LTV"],
    mechanicTerms: ["trial-box promo testing", "annual-plan upsell", "lookalike on annual subscribers"],
  },
  ecom_quick_commerce_mobile: {
    primaryEvent: "confirmed purchase",
    alternativeEvents: ["first order", "second order in same week", "subscription / membership"],
    kpiTerms: ["first-order rate", "weekly retention", "AOV", "delivery-radius coverage"],
    mechanicTerms: ["geo-fenced first-order promo", "weekly retention push", "lookalike on weekly orderers"],
  },

  // ── Mobile food ─────────────────────────────────────────────
  food_delivery_aggregator_mobile: {
    primaryEvent: "completed order",
    alternativeEvents: ["first order", "second order", "subscription start"],
    kpiTerms: ["first-order rate", "AOV", "weekly retention", "subscription attach rate"],
    mechanicTerms: ["first-order promo", "second-order push", "lookalike on subscribers", "geo-fenced creative"],
  },
  food_grocery_delivery_mobile: {
    primaryEvent: "completed order",
    alternativeEvents: ["first order", "weekly basket", "subscription / membership"],
    kpiTerms: ["first-order rate", "AOV", "weekly retention", "subscription attach rate"],
    mechanicTerms: ["first-order delivery promo", "subscription upsell", "weekly retention push"],
  },
  food_restaurant_brand_mobile: {
    primaryEvent: "completed order",
    alternativeEvents: ["first order", "loyalty signup", "second order"],
    kpiTerms: ["first-order rate", "AOV", "loyalty attach rate", "monthly retention"],
    mechanicTerms: ["loyalty-driven re-engagement", "first-order promo", "geo-fenced creative around store locations"],
  },
  food_meal_kit_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["first box ordered", "second-week renewal", "annual-plan upgrade"],
    kpiTerms: ["trial-box conversion", "second-week renewal", "subscription LTV", "churn rate"],
    mechanicTerms: ["first-box promo testing", "renewal-push at week 2", "lookalike on long-term subscribers"],
  },
  food_cloud_kitchen_mobile: {
    primaryEvent: "completed order",
    alternativeEvents: ["first order", "second order", "subscription / membership"],
    kpiTerms: ["first-order rate", "AOV", "weekly retention"],
    mechanicTerms: ["geo-fenced creative around delivery zones", "first-order promo", "weekly retention push"],
  },
  food_reservation_mobile: {
    primaryEvent: "confirmed reservation",
    alternativeEvents: ["first reservation", "loyalty signup"],
    kpiTerms: ["reservation completion rate", "no-show rate", "loyalty attach rate"],
    mechanicTerms: ["geo-fenced creative", "loyalty-driven re-engagement", "no-show suppression"],
  },

  // ── Mobile travel ───────────────────────────────────────────
  travel_ota_booking_mobile: {
    primaryEvent: "completed booking",
    alternativeEvents: ["first booking", "high-value booking", "ancillary added"],
    kpiTerms: ["booking ROAS", "AOV per booking", "ancillary attach rate", "cancellation rate"],
    mechanicTerms: ["destination-level lookalike", "abandoned-search re-engagement", "ancillary upsell flows"],
  },
  travel_hotel_brand_mobile: {
    primaryEvent: "completed booking",
    alternativeEvents: ["first booking", "loyalty signup", "stay completed"],
    kpiTerms: ["booking ROAS", "loyalty attach rate", "AOV per booking", "repeat-stay rate"],
    mechanicTerms: ["loyalty-driven re-engagement", "destination-aware creative", "lookalike on premium-tier members"],
  },
  travel_flight_search_mobile: {
    primaryEvent: "completed booking",
    alternativeEvents: ["first booking", "price alert set", "saved search"],
    kpiTerms: ["search-to-booking rate", "AOV per booking", "alert opt-in rate"],
    mechanicTerms: ["price-alert re-engagement", "destination-aware creative", "abandoned-search retargeting"],
  },
  travel_airline_brand_mobile: {
    primaryEvent: "completed booking",
    alternativeEvents: ["first booking", "loyalty signup", "ancillary added"],
    kpiTerms: ["booking ROAS", "ancillary attach rate", "loyalty attach rate"],
    mechanicTerms: ["loyalty-driven re-engagement", "ancillary upsell flows", "lookalike on premium-tier flyers"],
  },
  travel_vacation_rental_mobile: {
    primaryEvent: "completed booking",
    alternativeEvents: ["first booking", "host inquiry", "wishlist save"],
    kpiTerms: ["booking ROAS", "AOV per booking", "host-side acquisition cost", "repeat-booker rate"],
    mechanicTerms: ["destination-level lookalike", "host onboarding (separate funnel)", "abandoned-search re-engagement"],
  },
  travel_tours_activities_mobile: {
    primaryEvent: "completed booking",
    alternativeEvents: ["first booking", "high-value tour booked", "wishlist save"],
    kpiTerms: ["booking ROAS", "AOV per tour", "destination-coverage split"],
    mechanicTerms: ["destination-aware creative", "abandoned-search retargeting", "lookalike on high-AOV bookers"],
  },
  travel_rideshare_mobile: {
    primaryEvent: "first ride completed",
    alternativeEvents: ["first ride booked", "second ride", "subscription / membership"],
    kpiTerms: ["first-ride rate", "weekly retention", "rides per user per month", "subscription attach rate"],
    mechanicTerms: ["geo-fenced first-ride promo", "weekly retention push", "subscription upsell"],
  },
  travel_transit_mobile: {
    primaryEvent: "first transit purchase",
    alternativeEvents: ["pass purchase", "first ride", "weekly pass"],
    kpiTerms: ["first-purchase rate", "monthly retention", "pass-attach rate"],
    mechanicTerms: ["pass upsell at first purchase", "geo-fenced creative", "monthly retention push"],
  },
  travel_loyalty_card_mobile: {
    primaryEvent: "card application approved",
    alternativeEvents: ["first card transaction", "loyalty enrollment"],
    kpiTerms: ["application-approval rate", "first-transaction rate", "loyalty-attach rate"],
    mechanicTerms: ["targeted application flows by spend tier", "lookalike on premium card holders"],
  },

  // ── Mobile subscription media ───────────────────────────────
  media_video_streaming_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "annual-plan upgrade", "first stream"],
    kpiTerms: ["trial-conversion rate", "monthly retention", "subscription LTV", "churn rate"],
    mechanicTerms: ["free-trial paywall optimization", "annual-plan upsell", "lookalike on long-term subscribers", "compliant content-aware creative"],
  },
  media_music_streaming_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "premium plan upgrade", "first listening session"],
    kpiTerms: ["trial-conversion rate", "monthly retention", "subscription LTV"],
    mechanicTerms: ["free-trial paywall", "lookalike on long-term subscribers", "creative testing with playlist hooks"],
  },
  media_podcast_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["premium feature unlock", "first listen", "follow-show event"],
    kpiTerms: ["trial-conversion rate", "monthly retention", "subscription LTV"],
    mechanicTerms: ["show-discovery flows", "premium-feature upsell", "lookalike on long-term listeners"],
  },
  media_audiobook_ebook_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "first book purchase", "annual-plan upgrade"],
    kpiTerms: ["trial-conversion rate", "monthly retention", "subscription LTV", "books-per-month"],
    mechanicTerms: ["free-trial paywall", "annual-plan upsell", "lookalike on heavy listeners"],
  },
  media_news_magazine_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "annual-plan upgrade", "first paywall hit"],
    kpiTerms: ["trial-conversion rate", "monthly retention", "subscription LTV"],
    mechanicTerms: ["paywall A/B testing", "annual-plan upsell", "lookalike on engaged readers"],
  },
  media_short_drama_mobile: {
    primaryEvent: "in-app purchase",
    alternativeEvents: ["first coin pack", "subscription start", "episode unlock"],
    kpiTerms: ["ARPDAU", "ARPPU", "D7 retention", "ROAS day-7", "coin-pack value"],
    mechanicTerms: ["episodic-cliffhanger creative", "coin-pack monetization optimization", "lookalike on payer cohorts"],
  },
  media_kids_content_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "annual-plan upgrade"],
    kpiTerms: ["trial-conversion rate", "monthly retention", "subscription LTV"],
    mechanicTerms: ["parent-targeted creative", "compliant for kids advertising rules", "annual-plan upsell"],
  },
  media_live_tv_sports_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "match-day signup", "annual-plan upgrade"],
    kpiTerms: ["trial-conversion rate", "match-day surge rate", "monthly retention", "subscription LTV"],
    mechanicTerms: ["match-calendar aligned creative", "annual-plan upsell", "lookalike on year-round subscribers"],
  },
  media_generative_ai_creative_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["credit-pack purchase", "first generation", "trial-to-paid conversion"],
    kpiTerms: ["trial-conversion rate", "credits-per-user", "subscription LTV"],
    mechanicTerms: ["credit-pack monetization", "free-trial paywall", "creative testing with output samples"],
  },

  // ── Mobile health ───────────────────────────────────────────
  health_telehealth_mobile: {
    primaryEvent: "consultation booking",
    alternativeEvents: ["first appointment", "subscription / membership", "prescription fulfilled"],
    kpiTerms: ["consultation-conversion rate", "subscription attach rate", "30-day retention"],
    mechanicTerms: ["compliant creative for healthcare ads", "subscription upsell at first booking", "lookalike on subscribers"],
  },
  health_pharmacy_mobile: {
    primaryEvent: "prescription fulfilled",
    alternativeEvents: ["first refill", "subscription / auto-refill", "OTC purchase"],
    kpiTerms: ["first-fill rate", "auto-refill attach rate", "30-day retention", "AOV"],
    mechanicTerms: ["auto-refill upsell", "compliant pharmacy creative", "lookalike on chronic-condition patients"],
  },
  health_mental_wellness_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["first session booked", "trial-to-paid conversion", "monthly plan activation"],
    kpiTerms: ["trial-conversion rate", "monthly retention", "subscription LTV"],
    mechanicTerms: ["compliant mental-health creative", "free-trial paywall", "lookalike on long-term subscribers"],
  },
  health_fitness_workout_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "first workout completed", "annual-plan upgrade"],
    kpiTerms: ["trial-conversion rate", "weekly retention", "monthly retention", "subscription LTV"],
    mechanicTerms: ["free-trial paywall", "weekly retention push", "lookalike on consistent users"],
  },
  health_nutrition_diet_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "first meal logged", "annual-plan upgrade"],
    kpiTerms: ["trial-conversion rate", "weekly retention", "subscription LTV"],
    mechanicTerms: ["free-trial paywall", "weekly retention push", "lookalike on long-term subscribers"],
  },
  health_women_pregnancy_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["account creation", "first cycle logged", "premium feature unlock"],
    kpiTerms: ["account-creation rate", "monthly retention", "subscription LTV"],
    mechanicTerms: ["compliant women's-health creative", "premium-feature upsell", "lookalike on subscribers"],
  },
  health_chronic_condition_mobile: {
    primaryEvent: "account creation",
    alternativeEvents: ["first reading logged", "subscription start", "device pairing"],
    kpiTerms: ["account-creation rate", "monthly retention", "subscription attach rate"],
    mechanicTerms: ["compliant creative for medical condition apps", "device-pairing flows", "lookalike on engaged users"],
  },
  health_meditation_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "first session completed", "annual-plan upgrade"],
    kpiTerms: ["trial-conversion rate", "weekly retention", "subscription LTV"],
    mechanicTerms: ["free-trial paywall", "weekly retention push", "lookalike on long-term subscribers"],
  },

  // ── Mobile education ────────────────────────────────────────
  edu_language_learning_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "first lesson completed", "annual-plan upgrade"],
    kpiTerms: ["trial-conversion rate", "weekly retention", "monthly retention", "subscription LTV"],
    mechanicTerms: ["free-trial paywall", "weekly retention push", "lookalike on long-term subscribers"],
  },
  edu_k12_tutoring_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["first session booked", "trial-to-paid conversion", "annual-plan upgrade"],
    kpiTerms: ["trial-conversion rate", "monthly retention", "subscription LTV"],
    mechanicTerms: ["parent-targeted creative", "compliant for kids advertising rules", "annual-plan upsell"],
  },
  edu_higher_ed_mobile: {
    primaryEvent: "course enrollment",
    alternativeEvents: ["first course started", "subscription start", "certification purchase"],
    kpiTerms: ["enrollment-conversion rate", "subscription LTV", "course-completion rate"],
    mechanicTerms: ["lookalike on certification buyers", "subscription upsell", "creative testing with course samples"],
  },
  edu_test_prep_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "first practice test", "course bundle purchase"],
    kpiTerms: ["trial-conversion rate", "test-cycle-aware retention", "subscription LTV"],
    mechanicTerms: ["test-calendar aligned creative", "free-trial paywall", "lookalike on test-takers"],
  },
  edu_kids_early_learning_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "first lesson completed", "annual-plan upgrade"],
    kpiTerms: ["trial-conversion rate", "weekly retention", "subscription LTV"],
    mechanicTerms: ["parent-targeted creative", "compliant for kids advertising rules", "annual-plan upsell"],
  },
  edu_skill_courses_mobile: {
    primaryEvent: "course purchase",
    alternativeEvents: ["subscription start", "first lesson completed", "course bundle purchase"],
    kpiTerms: ["purchase-conversion rate", "course-completion rate", "subscription LTV"],
    mechanicTerms: ["course-preview creative", "subscription upsell", "lookalike on course completers"],
  },
  edu_vocational_mobile: {
    primaryEvent: "course enrollment",
    alternativeEvents: ["first lesson completed", "certification purchase", "subscription start"],
    kpiTerms: ["enrollment-conversion rate", "completion rate", "subscription LTV"],
    mechanicTerms: ["career-outcome creative", "lookalike on certification earners", "subscription upsell"],
  },
  edu_reading_literacy_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "first book read", "annual-plan upgrade"],
    kpiTerms: ["trial-conversion rate", "weekly retention", "subscription LTV"],
    mechanicTerms: ["parent-targeted creative", "compliant for kids advertising rules", "annual-plan upsell"],
  },
  edu_stem_coding_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "first lesson completed", "course bundle purchase"],
    kpiTerms: ["trial-conversion rate", "weekly retention", "subscription LTV"],
    mechanicTerms: ["free-trial paywall", "lookalike on long-term subscribers", "creative testing with output samples"],
  },

  // ── Mobile dating & social ──────────────────────────────────
  dating_mainstream_mobile: {
    primaryEvent: "premium subscription start",
    alternativeEvents: ["first match", "first message sent", "boost purchase"],
    kpiTerms: ["premium-subscription rate", "first-match rate", "30-day retention", "ARPPU"],
    mechanicTerms: ["match-quality lookalike", "premium-feature upsell", "compliant dating creative"],
  },
  dating_niche_mobile: {
    primaryEvent: "premium subscription start",
    alternativeEvents: ["first match", "first message sent", "profile verification"],
    kpiTerms: ["premium-subscription rate", "first-match rate", "30-day retention"],
    mechanicTerms: ["niche-audience lookalike", "premium-feature upsell", "compliant dating creative"],
  },
  dating_hookup_mobile: {
    primaryEvent: "premium subscription start",
    alternativeEvents: ["first match", "boost purchase", "premium-feature unlock"],
    kpiTerms: ["premium-subscription rate", "ARPPU", "30-day retention"],
    mechanicTerms: ["compliant adult-dating creative", "premium-feature upsell", "geo-fenced campaigns"],
  },
  dating_premium_matchmaking_mobile: {
    primaryEvent: "premium subscription start",
    alternativeEvents: ["first match", "concierge booking", "annual-plan upgrade"],
    kpiTerms: ["premium-subscription rate", "subscription LTV", "match-success rate"],
    mechanicTerms: ["high-intent lookalike", "concierge upsell", "compliant creative"],
  },
  social_discovery_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["first connection", "premium-feature unlock", "30-day active"],
    kpiTerms: ["subscription rate", "30-day retention", "DAU/MAU ratio"],
    mechanicTerms: ["interest-based lookalike", "premium-feature upsell", "compliant creative"],
  },
  social_network_mobile: {
    primaryEvent: "30-day active user",
    alternativeEvents: ["first connection", "first post", "premium subscription"],
    kpiTerms: ["DAU/MAU ratio", "30-day retention", "ARPDAU"],
    mechanicTerms: ["interest-based lookalike", "premium-feature upsell", "viral mechanics push"],
  },
  social_community_forum_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["first post", "first comment", "premium-feature unlock"],
    kpiTerms: ["subscription rate", "30-day retention", "DAU/MAU ratio"],
    mechanicTerms: ["interest-based lookalike", "premium-feature upsell", "creative testing with community samples"],
  },

  // ── Mobile sports ───────────────────────────────────────────
  sports_news_scores_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "premium content unlock", "annual-plan upgrade"],
    kpiTerms: ["trial-conversion rate", "match-day surge rate", "subscription LTV"],
    mechanicTerms: ["match-calendar aligned creative", "premium-feature upsell", "lookalike on year-round users"],
  },
  sports_fantasy_dfs_mobile: {
    primaryEvent: "first contest entered",
    alternativeEvents: ["funded account", "first deposit", "second contest"],
    kpiTerms: ["funded-account rate", "first-deposit value", "contests per user", "30-day retention"],
    mechanicTerms: ["sport-calendar aligned creative", "first-deposit promo", "lookalike on regular players"],
  },
  sports_betting_mobile: {
    primaryEvent: "first time depositor",
    alternativeEvents: ["first deposit", "first bet placed", "second bet"],
    kpiTerms: ["FTD rate", "first-deposit value", "regulated geo split", "monthly retention"],
    mechanicTerms: ["regulated-geo targeting", "first-deposit promo", "compliant sportsbook creative", "match-calendar aligned campaigns"],
  },
  sports_community_mobile: {
    primaryEvent: "engaged user (30-day active)",
    alternativeEvents: ["first post", "subscription start", "first comment"],
    kpiTerms: ["30-day active rate", "DAU/MAU ratio", "subscription rate"],
    mechanicTerms: ["match-calendar aligned creative", "interest-based lookalike", "premium-feature upsell"],
  },

  // ── Mobile gambling ─────────────────────────────────────────
  gambling_online_casino_mobile: {
    primaryEvent: "first time depositor",
    alternativeEvents: ["first deposit", "first wager", "second deposit"],
    kpiTerms: ["FTD rate", "first-deposit value", "regulated geo split", "monthly retention", "ARPPU"],
    mechanicTerms: ["regulated-geo targeting", "first-deposit promo testing", "compliant casino creative", "VIP-tier lookalike"],
  },
  gambling_poker_mobile: {
    primaryEvent: "first time depositor",
    alternativeEvents: ["first deposit", "first hand played", "second deposit"],
    kpiTerms: ["FTD rate", "first-deposit value", "hands per user", "regulated geo split"],
    mechanicTerms: ["regulated-geo targeting", "first-deposit promo testing", "compliant poker creative"],
  },
  gambling_bingo_mobile: {
    primaryEvent: "first time depositor",
    alternativeEvents: ["first deposit", "first game", "loyalty enrollment"],
    kpiTerms: ["FTD rate", "first-deposit value", "regulated geo split", "monthly retention"],
    mechanicTerms: ["regulated-geo targeting", "loyalty-club mechanics", "compliant bingo creative"],
  },
  gambling_lottery_mobile: {
    primaryEvent: "first ticket purchase",
    alternativeEvents: ["first deposit", "subscription / auto-buy", "second purchase"],
    kpiTerms: ["first-purchase rate", "subscription attach rate", "regulated geo split"],
    mechanicTerms: ["jackpot-aligned creative", "subscription upsell", "compliant lottery creative"],
  },

  // ── Mobile real estate ──────────────────────────────────────
  realestate_property_buy_mobile: {
    primaryEvent: "lead submitted",
    alternativeEvents: ["property inquiry", "saved search", "agent contact"],
    kpiTerms: ["lead-conversion rate", "lead-quality score", "agent-attach rate"],
    mechanicTerms: ["geo-fenced creative", "lookalike on closed-deal leads", "saved-search re-engagement"],
  },
  realestate_rental_mobile: {
    primaryEvent: "rental inquiry",
    alternativeEvents: ["application submitted", "saved search", "tour booked"],
    kpiTerms: ["inquiry-conversion rate", "application rate", "geo-coverage split"],
    mechanicTerms: ["geo-fenced creative", "saved-search re-engagement", "lookalike on completed rentals"],
  },
  realestate_host_owner_mobile: {
    primaryEvent: "listing posted",
    alternativeEvents: ["first inquiry received", "first booking received"],
    kpiTerms: ["host-onboarding rate", "first-listing rate", "monthly host retention"],
    mechanicTerms: ["host-side acquisition (separate funnel)", "income-projection creative", "lookalike on active hosts"],
  },
  realestate_mortgage_mobile: {
    primaryEvent: "loan application started",
    alternativeEvents: ["pre-approval requested", "loan disbursement"],
    kpiTerms: ["application-completion rate", "pre-approval rate", "loan-value per approved user"],
    mechanicTerms: ["pre-approval flow optimization", "lookalike on approved borrowers", "compliant mortgage creative"],
  },
  realestate_property_mgmt_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["first property added", "first tenant enrolled"],
    kpiTerms: ["subscription rate", "monthly retention", "property-count per user"],
    mechanicTerms: ["property-onboarding flow", "subscription upsell", "lookalike on multi-property landlords"],
  },

  // ── Mobile auto ─────────────────────────────────────────────
  auto_marketplace_new_mobile: {
    primaryEvent: "lead submitted",
    alternativeEvents: ["test-drive booked", "configurator completed", "dealer contact"],
    kpiTerms: ["lead-conversion rate", "test-drive rate", "dealer-attach rate"],
    mechanicTerms: ["geo-fenced creative around dealer locations", "lookalike on test-drive bookers", "configurator-flow optimization"],
  },
  auto_marketplace_used_mobile: {
    primaryEvent: "lead submitted",
    alternativeEvents: ["vehicle inquiry", "saved search", "dealer contact"],
    kpiTerms: ["lead-conversion rate", "saved-search rate", "geo-coverage split"],
    mechanicTerms: ["geo-fenced creative", "saved-search re-engagement", "lookalike on closed-deal buyers"],
  },
  auto_rental_mobile: {
    primaryEvent: "completed booking",
    alternativeEvents: ["first booking", "loyalty signup", "premium tier upgrade"],
    kpiTerms: ["booking ROAS", "AOV per booking", "loyalty attach rate"],
    mechanicTerms: ["loyalty-driven re-engagement", "destination-aware creative", "lookalike on premium-tier renters"],
  },
  auto_subscription_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["application submitted", "first month activated"],
    kpiTerms: ["application-conversion rate", "subscription LTV", "monthly retention"],
    mechanicTerms: ["application-flow optimization", "lookalike on long-term subscribers", "compliant auto-finance creative"],
  },
  auto_service_mobile: {
    primaryEvent: "service booking",
    alternativeEvents: ["first appointment", "subscription / membership"],
    kpiTerms: ["booking-conversion rate", "subscription attach rate", "30-day retention"],
    mechanicTerms: ["geo-fenced creative around service centers", "subscription upsell", "lookalike on regular customers"],
  },
  auto_parking_mobile: {
    primaryEvent: "first parking session",
    alternativeEvents: ["account creation", "second session", "subscription / pass"],
    kpiTerms: ["first-session rate", "weekly retention", "pass-attach rate"],
    mechanicTerms: ["geo-fenced creative", "weekly retention push", "pass upsell"],
  },
  auto_ev_charging_mobile: {
    primaryEvent: "first charging session",
    alternativeEvents: ["account creation", "subscription / membership", "second session"],
    kpiTerms: ["first-session rate", "monthly retention", "membership attach rate"],
    mechanicTerms: ["geo-fenced creative around charging stations", "membership upsell", "lookalike on regular charges"],
  },

  // ── Mobile classifieds ──────────────────────────────────────
  classifieds_general_mobile: {
    primaryEvent: "listing submission",
    alternativeEvents: ["first inquiry", "first sale", "premium-listing purchase"],
    kpiTerms: ["seller-onboarding rate", "listing-completion rate", "premium-attach rate"],
    mechanicTerms: ["dual-side acquisition (buyer + seller)", "category-level lookalike", "premium-listing upsell"],
  },
  classifieds_p2p_resale_mobile: {
    primaryEvent: "listing submission",
    alternativeEvents: ["first sale", "first purchase", "subscription / promotion"],
    kpiTerms: ["seller-onboarding rate", "buyer-conversion rate", "GMV per user"],
    mechanicTerms: ["dual-side acquisition", "category-level lookalike", "promotion-flow optimization"],
  },
  classifieds_jobs_mobile: {
    primaryEvent: "application submission",
    alternativeEvents: ["job apply", "saved search", "subscription start"],
    kpiTerms: ["application-conversion rate", "subscription attach rate", "saved-search rate"],
    mechanicTerms: ["industry-level lookalike", "saved-search re-engagement", "subscription upsell for premium features"],
  },
  classifieds_rentals_mobile: {
    primaryEvent: "rental inquiry",
    alternativeEvents: ["application submitted", "saved search", "tour booked"],
    kpiTerms: ["inquiry-conversion rate", "application rate", "geo-coverage split"],
    mechanicTerms: ["geo-fenced creative", "saved-search re-engagement", "lookalike on completed rentals"],
  },

  // ── Mobile telco & utilities ────────────────────────────────
  telco_mobile_carrier_mobile: {
    primaryEvent: "plan signup",
    alternativeEvents: ["SIM activation", "first bill paid", "plan upgrade"],
    kpiTerms: ["signup-conversion rate", "30-day active rate", "plan-upgrade attach rate"],
    mechanicTerms: ["existing-customer cross-sell", "geo-fenced creative", "lookalike on premium-tier subscribers"],
  },
  telco_broadband_isp_mobile: {
    primaryEvent: "plan signup",
    alternativeEvents: ["installation booked", "first bill paid", "plan upgrade"],
    kpiTerms: ["signup-conversion rate", "30-day active rate", "geo-coverage split"],
    mechanicTerms: ["geo-fenced creative around coverage areas", "plan-upgrade upsell", "lookalike on premium-tier subscribers"],
  },
  telco_utility_provider_mobile: {
    primaryEvent: "plan signup",
    alternativeEvents: ["account creation", "first bill paid"],
    kpiTerms: ["signup-conversion rate", "30-day active rate", "plan-tier split"],
    mechanicTerms: ["geo-fenced creative", "compliant utility creative", "lookalike on premium-tier subscribers"],
  },
  telco_esim_marketplace_mobile: {
    primaryEvent: "first eSIM purchase",
    alternativeEvents: ["account creation", "second purchase", "subscription / data plan"],
    kpiTerms: ["first-purchase rate", "AOV", "repeat-purchase rate", "destination-coverage split"],
    mechanicTerms: ["destination-aware creative", "lookalike on frequent travelers", "subscription upsell"],
  },

  // ── Mobile B2B ──────────────────────────────────────────────
  b2b_collab_mobile: {
    primaryEvent: "paid plan activation",
    alternativeEvents: ["trial-to-paid conversion", "first workspace created", "team invite"],
    kpiTerms: ["trial-conversion rate", "team-expansion rate", "subscription LTV"],
    mechanicTerms: ["product-led growth funnels", "team-invite viral push", "lookalike on multi-seat teams"],
  },
  b2b_crm_sales_mobile: {
    primaryEvent: "paid plan activation",
    alternativeEvents: ["trial-to-paid conversion", "first contact added", "team seat purchase"],
    kpiTerms: ["trial-conversion rate", "seat-expansion rate", "subscription LTV"],
    mechanicTerms: ["product-led growth", "seat-expansion upsell", "lookalike on multi-seat teams"],
  },
  b2b_hr_tech_mobile: {
    primaryEvent: "paid plan activation",
    alternativeEvents: ["trial-to-paid conversion", "first employee onboarded", "annual-plan upgrade"],
    kpiTerms: ["trial-conversion rate", "subscription LTV", "monthly retention"],
    mechanicTerms: ["industry-vertical lookalike", "annual-plan upsell", "compliant HR creative"],
  },
  b2b_intelligence_mobile: {
    primaryEvent: "paid plan activation",
    alternativeEvents: ["trial-to-paid conversion", "first dashboard built", "team seat purchase"],
    kpiTerms: ["trial-conversion rate", "subscription LTV", "monthly retention"],
    mechanicTerms: ["industry-vertical lookalike", "team-expansion upsell", "creative testing with sample dashboards"],
  },
  b2b_cloud_storage_mobile: {
    primaryEvent: "paid plan activation",
    alternativeEvents: ["trial-to-paid conversion", "first upload", "storage tier upgrade"],
    kpiTerms: ["trial-conversion rate", "storage-tier upgrade rate", "subscription LTV"],
    mechanicTerms: ["storage-tier upsell", "free-trial paywall", "lookalike on heavy users"],
  },
  b2b_doc_signing_mobile: {
    primaryEvent: "paid plan activation",
    alternativeEvents: ["trial-to-paid conversion", "first document signed", "team seat purchase"],
    kpiTerms: ["trial-conversion rate", "team-expansion rate", "subscription LTV"],
    mechanicTerms: ["product-led growth", "team-expansion upsell", "industry-vertical lookalike"],
  },
  b2b_field_service_mobile: {
    primaryEvent: "paid plan activation",
    alternativeEvents: ["trial-to-paid conversion", "first technician added", "team seat purchase"],
    kpiTerms: ["trial-conversion rate", "team-expansion rate", "subscription LTV"],
    mechanicTerms: ["industry-vertical lookalike", "team-expansion upsell", "creative testing with workflow samples"],
  },

  // ── Mobile other (charity, religion, kids, adult, civic) ────
  charity_donation_mobile: {
    primaryEvent: "donation completed",
    alternativeEvents: ["first donation", "recurring donor enrollment", "campaign signup"],
    kpiTerms: ["donation-conversion rate", "recurring-donor rate", "AOV per donation"],
    mechanicTerms: ["cause-aligned creative", "recurring-donor upsell", "lookalike on long-term donors"],
  },
  charity_volunteer_mobile: {
    primaryEvent: "volunteer signup",
    alternativeEvents: ["first hour logged", "second event", "subscription / membership"],
    kpiTerms: ["signup-conversion rate", "monthly retention", "volunteer-hour rate"],
    mechanicTerms: ["cause-aligned creative", "geo-fenced creative around volunteer events", "lookalike on regular volunteers"],
  },
  civic_government_mobile: {
    primaryEvent: "service completion",
    alternativeEvents: ["account creation", "first form submitted", "first payment"],
    kpiTerms: ["service-completion rate", "30-day retention", "form-submission rate"],
    mechanicTerms: ["citizen-service flow optimization", "compliant government creative", "geo-fenced creative"],
  },
  religion_scripture_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["account creation", "first reading session", "annual-plan upgrade"],
    kpiTerms: ["subscription rate", "monthly retention", "subscription LTV"],
    mechanicTerms: ["faith-aligned creative", "subscription upsell", "lookalike on long-term subscribers"],
  },
  religion_devotional_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["account creation", "first prayer session", "annual-plan upgrade"],
    kpiTerms: ["subscription rate", "monthly retention", "subscription LTV"],
    mechanicTerms: ["faith-aligned creative", "subscription upsell", "lookalike on long-term subscribers"],
  },
  kids_entertainment_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "first content viewed", "annual-plan upgrade"],
    kpiTerms: ["trial-conversion rate", "monthly retention", "subscription LTV"],
    mechanicTerms: ["parent-targeted creative", "compliant for kids advertising rules", "annual-plan upsell"],
  },
  kids_parenting_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "first feature used", "annual-plan upgrade"],
    kpiTerms: ["trial-conversion rate", "monthly retention", "subscription LTV"],
    mechanicTerms: ["parent-targeted creative", "subscription upsell", "lookalike on long-term subscribers"],
  },
  adult_content_mobile: {
    primaryEvent: "premium subscription start",
    alternativeEvents: ["trial-to-paid conversion", "first session", "annual-plan upgrade"],
    kpiTerms: ["trial-conversion rate", "subscription LTV", "compliant geo split"],
    mechanicTerms: ["regulated-geo targeting", "compliant adult creative (where legal)", "lookalike on long-term subscribers"],
  },
  adult_cam_mobile: {
    primaryEvent: "first credit pack purchase",
    alternativeEvents: ["account creation", "subscription start"],
    kpiTerms: ["first-purchase rate", "ARPPU", "compliant geo split"],
    mechanicTerms: ["regulated-geo targeting", "compliant adult creative (where legal)", "credit-pack monetization"],
  },

  // ── Mobile generative AI ────────────────────────────────────
  ai_chat_assistant_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "first conversation", "premium feature unlock"],
    kpiTerms: ["trial-conversion rate", "subscription LTV", "monthly retention"],
    mechanicTerms: ["free-trial paywall", "lookalike on long-term subscribers", "creative testing with use-case samples"],
  },
  ai_image_generator_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["credit-pack purchase", "first generation", "trial-to-paid conversion"],
    kpiTerms: ["trial-conversion rate", "credits-per-user", "subscription LTV"],
    mechanicTerms: ["credit-pack monetization", "free-trial paywall", "creative testing with output samples"],
  },
  ai_writing_tool_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "first generation", "annual-plan upgrade"],
    kpiTerms: ["trial-conversion rate", "subscription LTV", "monthly retention"],
    mechanicTerms: ["free-trial paywall", "lookalike on long-term subscribers", "creative testing with use-case samples"],
  },
  ai_code_assistant_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["trial-to-paid conversion", "first completion accepted", "team seat purchase"],
    kpiTerms: ["trial-conversion rate", "team-expansion rate", "subscription LTV"],
    mechanicTerms: ["product-led growth", "team-expansion upsell", "lookalike on multi-seat teams"],
  },
  ai_voice_video_mobile: {
    primaryEvent: "subscription start",
    alternativeEvents: ["credit-pack purchase", "first generation", "trial-to-paid conversion"],
    kpiTerms: ["trial-conversion rate", "credits-per-user", "subscription LTV"],
    mechanicTerms: ["credit-pack monetization", "free-trial paywall", "creative testing with output samples"],
  },
};

/**
 * Returns the vocabulary block for a non-gaming mobile sub-vertical.
 */
export function getMobileNonGamingVocabulary(
  subVertical: MobileNonGamingSubVertical,
): VerticalVocabulary {
  const v = MOBILE_NON_GAMING_VOCABULARY[subVertical];
  if (!v) {
    throw new Error(`Missing vocabulary for sub-vertical: ${subVertical}`);
  }
  return v;
}
