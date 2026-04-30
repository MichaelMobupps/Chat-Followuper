/**
 * Sub-vertical taxonomy.
 *
 * Each sub-vertical code encodes:
 *   - Top-level vertical category (gaming, fintech, ecommerce, etc.)
 *   - Specific niche within that category
 *   - Platform (`_mobile` or `_web` suffix where the distinction matters)
 *
 * Sub-verticals route to the correct doctrine file via `getDoctrineDomain`:
 *   gaming_*_mobile        → mobileGaming
 *   <other>_mobile         → mobileNonGaming
 *   <anything>_web         → webCps
 *
 * The platform suffix is mandatory for any vertical that exists in both
 * mobile and web flavors (ecommerce, fintech, food delivery, travel, etc.).
 * Mobile-only categories (gaming) carry only `_mobile`. Web-only categories
 * (most CPS leadgen, traditional brokerage comparison) carry only `_web`.
 *
 * The store column `prospects.vertical` holds one of these codes.
 */

// ─────────────────────────────────────────────────────────────────
// Doctrine domain — which platform-family file the sub-vertical routes to
// ─────────────────────────────────────────────────────────────────

export type DoctrineDomain = "mobileGaming" | "mobileNonGaming" | "webCps";

// ─────────────────────────────────────────────────────────────────
// Sub-vertical type union
// ─────────────────────────────────────────────────────────────────

// Gaming sub-verticals (always mobile)
export const GAMING_SUB_VERTICALS = [
  "gaming_casual_mobile",
  "gaming_hyper_casual_mobile",
  "gaming_match3_mobile",
  "gaming_puzzle_mobile",
  "gaming_word_mobile",
  "gaming_simulation_mobile",
  "gaming_idle_mobile",
  "gaming_midcore_rpg_mobile",
  "gaming_midcore_strategy_mobile",
  "gaming_midcore_moba_mobile",
  "gaming_midcore_card_mobile",
  "gaming_midcore_action_mobile",
  "gaming_hardcore_mmo_mobile",
  "gaming_hardcore_shooter_mobile",
  "gaming_social_casino_mobile",
  "gaming_sports_sim_mobile",
  "gaming_racing_mobile",
  "gaming_kids_edu_mobile",
] as const;

// Mobile non-gaming utility & lifestyle
export const MOBILE_UTILITY_SUB_VERTICALS = [
  "utility_productivity_mobile",
  "utility_general_mobile",
  "photo_video_editor_mobile",
  "lifestyle_general_mobile",
  "generative_ai_consumer_mobile",
] as const;

// Mobile fintech
export const MOBILE_FINTECH_SUB_VERTICALS = [
  "fintech_neobank_mobile",
  "fintech_traditional_bank_mobile",
  "fintech_crypto_exchange_mobile",
  "fintech_crypto_wallet_defi_mobile",
  "fintech_brokerage_trading_mobile",
  "fintech_forex_cfd_mobile",
  "fintech_lending_mobile",
  "fintech_bnpl_mobile",
  "fintech_payments_wallet_mobile",
  "fintech_remittance_mobile",
  "fintech_insurance_mobile",
  "fintech_robo_advisor_mobile",
  "fintech_personal_finance_mobile",
  "fintech_micro_investing_mobile",
  "fintech_savings_mobile",
] as const;

// Mobile ecommerce
export const MOBILE_ECOM_SUB_VERTICALS = [
  "ecom_marketplace_multi_seller_mobile",
  "ecom_retail_brand_mobile",
  "ecom_fashion_mobile",
  "ecom_beauty_mobile",
  "ecom_electronics_mobile",
  "ecom_home_garden_mobile",
  "ecom_groceries_mobile",
  "ecom_secondhand_resale_mobile",
  "ecom_flash_sales_mobile",
  "ecom_subscription_box_mobile",
  "ecom_quick_commerce_mobile",
] as const;

// Mobile food
export const MOBILE_FOOD_SUB_VERTICALS = [
  "food_delivery_aggregator_mobile",
  "food_grocery_delivery_mobile",
  "food_restaurant_brand_mobile",
  "food_meal_kit_mobile",
  "food_cloud_kitchen_mobile",
  "food_reservation_mobile",
] as const;

// Mobile travel
export const MOBILE_TRAVEL_SUB_VERTICALS = [
  "travel_ota_booking_mobile",
  "travel_hotel_brand_mobile",
  "travel_flight_search_mobile",
  "travel_airline_brand_mobile",
  "travel_vacation_rental_mobile",
  "travel_tours_activities_mobile",
  "travel_rideshare_mobile",
  "travel_transit_mobile",
  "travel_loyalty_card_mobile",
] as const;

// Mobile subscription media
export const MOBILE_MEDIA_SUB_VERTICALS = [
  "media_video_streaming_mobile",
  "media_music_streaming_mobile",
  "media_podcast_mobile",
  "media_audiobook_ebook_mobile",
  "media_news_magazine_mobile",
  "media_short_drama_mobile",
  "media_kids_content_mobile",
  "media_live_tv_sports_mobile",
  "media_generative_ai_creative_mobile",
] as const;

// Mobile health & wellness
export const MOBILE_HEALTH_SUB_VERTICALS = [
  "health_telehealth_mobile",
  "health_pharmacy_mobile",
  "health_mental_wellness_mobile",
  "health_fitness_workout_mobile",
  "health_nutrition_diet_mobile",
  "health_women_pregnancy_mobile",
  "health_chronic_condition_mobile",
  "health_meditation_mobile",
] as const;

// Mobile education
export const MOBILE_EDU_SUB_VERTICALS = [
  "edu_language_learning_mobile",
  "edu_k12_tutoring_mobile",
  "edu_higher_ed_mobile",
  "edu_test_prep_mobile",
  "edu_kids_early_learning_mobile",
  "edu_skill_courses_mobile",
  "edu_vocational_mobile",
  "edu_reading_literacy_mobile",
  "edu_stem_coding_mobile",
] as const;

// Mobile dating & social
export const MOBILE_DATING_SOCIAL_SUB_VERTICALS = [
  "dating_mainstream_mobile",
  "dating_niche_mobile",
  "dating_hookup_mobile",
  "dating_premium_matchmaking_mobile",
  "social_discovery_mobile",
  "social_network_mobile",
  "social_community_forum_mobile",
] as const;

// Mobile sports
export const MOBILE_SPORTS_SUB_VERTICALS = [
  "sports_news_scores_mobile",
  "sports_fantasy_dfs_mobile",
  "sports_betting_mobile",
  "sports_community_mobile",
] as const;

// Mobile real-money gambling (separate from sports betting where legal)
export const MOBILE_GAMBLING_SUB_VERTICALS = [
  "gambling_online_casino_mobile",
  "gambling_poker_mobile",
  "gambling_bingo_mobile",
  "gambling_lottery_mobile",
] as const;

// Mobile real estate
export const MOBILE_REALESTATE_SUB_VERTICALS = [
  "realestate_property_buy_mobile",
  "realestate_rental_mobile",
  "realestate_host_owner_mobile",
  "realestate_mortgage_mobile",
  "realestate_property_mgmt_mobile",
] as const;

// Mobile automotive
export const MOBILE_AUTO_SUB_VERTICALS = [
  "auto_marketplace_new_mobile",
  "auto_marketplace_used_mobile",
  "auto_rental_mobile",
  "auto_subscription_mobile",
  "auto_service_mobile",
  "auto_parking_mobile",
  "auto_ev_charging_mobile",
] as const;

// Mobile classifieds
export const MOBILE_CLASSIFIEDS_SUB_VERTICALS = [
  "classifieds_general_mobile",
  "classifieds_p2p_resale_mobile",
  "classifieds_jobs_mobile",
  "classifieds_rentals_mobile",
] as const;

// Mobile telecom & utilities
export const MOBILE_TELCO_SUB_VERTICALS = [
  "telco_mobile_carrier_mobile",
  "telco_broadband_isp_mobile",
  "telco_utility_provider_mobile",
  "telco_esim_marketplace_mobile",
] as const;

// Mobile B2B SaaS
export const MOBILE_B2B_SUB_VERTICALS = [
  "b2b_collab_mobile",
  "b2b_crm_sales_mobile",
  "b2b_hr_tech_mobile",
  "b2b_intelligence_mobile",
  "b2b_cloud_storage_mobile",
  "b2b_doc_signing_mobile",
  "b2b_field_service_mobile",
] as const;

// Mobile charity & civic & religion & kids & adult
export const MOBILE_OTHER_SUB_VERTICALS = [
  "charity_donation_mobile",
  "charity_volunteer_mobile",
  "civic_government_mobile",
  "religion_scripture_mobile",
  "religion_devotional_mobile",
  "kids_entertainment_mobile",
  "kids_parenting_mobile",
  "adult_content_mobile",
  "adult_cam_mobile",
] as const;

// Mobile generative AI (separate group; some overlap with utility/media)
export const MOBILE_GEN_AI_SUB_VERTICALS = [
  "ai_chat_assistant_mobile",
  "ai_image_generator_mobile",
  "ai_writing_tool_mobile",
  "ai_code_assistant_mobile",
  "ai_voice_video_mobile",
] as const;

// Web CPS sub-verticals
export const WEB_CPS_SUB_VERTICALS = [
  // E-commerce web
  "cps_web_ecom_marketplace",
  "cps_web_ecom_retail",
  "cps_web_ecom_fashion",
  "cps_web_ecom_beauty",
  "cps_web_ecom_electronics",
  "cps_web_ecom_groceries",
  // Travel web
  "cps_web_travel_ota",
  "cps_web_travel_flights",
  "cps_web_travel_hotels",
  "cps_web_travel_vacation_rental",
  "cps_web_travel_tours",
  // Fintech web
  "cps_web_fintech_banking",
  "cps_web_fintech_brokerage",
  "cps_web_fintech_insurance_comparison",
  "cps_web_fintech_lending",
  "cps_web_fintech_crypto",
  // Classifieds web
  "cps_web_classifieds_general",
  "cps_web_classifieds_jobs",
  "cps_web_classifieds_realestate",
  "cps_web_classifieds_auto",
  // Subscription web
  "cps_web_subscription_saas",
  "cps_web_subscription_streaming",
  "cps_web_subscription_news",
  // Gambling web
  "cps_web_gambling_casino",
  "cps_web_gambling_sportsbook",
  "cps_web_gambling_poker",
  "cps_web_lottery",
  // Lead generation web
  "cps_web_leadgen_insurance",
  "cps_web_leadgen_mortgage",
  "cps_web_leadgen_auto",
  "cps_web_leadgen_education",
  // Education web
  "cps_web_education_courses",
  "cps_web_education_certification",
  // Health web
  "cps_web_health_telehealth",
  "cps_web_health_pharmacy",
  "cps_web_health_supplement",
  // Food web
  "cps_web_food_delivery",
  "cps_web_food_grocery",
  // Other web
  "cps_web_dating",
  "cps_web_pet",
  "cps_web_legal_services",
  "cps_web_other",
] as const;

// Catch-all for prospects that don't fit elsewhere
export const OTHER_SUB_VERTICALS = ["other_uncategorized"] as const;

// ─────────────────────────────────────────────────────────────────
// Composite type
// ─────────────────────────────────────────────────────────────────

export const ALL_SUB_VERTICALS = [
  ...GAMING_SUB_VERTICALS,
  ...MOBILE_UTILITY_SUB_VERTICALS,
  ...MOBILE_FINTECH_SUB_VERTICALS,
  ...MOBILE_ECOM_SUB_VERTICALS,
  ...MOBILE_FOOD_SUB_VERTICALS,
  ...MOBILE_TRAVEL_SUB_VERTICALS,
  ...MOBILE_MEDIA_SUB_VERTICALS,
  ...MOBILE_HEALTH_SUB_VERTICALS,
  ...MOBILE_EDU_SUB_VERTICALS,
  ...MOBILE_DATING_SOCIAL_SUB_VERTICALS,
  ...MOBILE_SPORTS_SUB_VERTICALS,
  ...MOBILE_GAMBLING_SUB_VERTICALS,
  ...MOBILE_REALESTATE_SUB_VERTICALS,
  ...MOBILE_AUTO_SUB_VERTICALS,
  ...MOBILE_CLASSIFIEDS_SUB_VERTICALS,
  ...MOBILE_TELCO_SUB_VERTICALS,
  ...MOBILE_B2B_SUB_VERTICALS,
  ...MOBILE_OTHER_SUB_VERTICALS,
  ...MOBILE_GEN_AI_SUB_VERTICALS,
  ...WEB_CPS_SUB_VERTICALS,
  ...OTHER_SUB_VERTICALS,
] as const;

export type SubVertical = (typeof ALL_SUB_VERTICALS)[number];

// ─────────────────────────────────────────────────────────────────
// Top-level vertical mapping
// ─────────────────────────────────────────────────────────────────

export type TopLevelVertical =
  | "gaming"
  | "non_gaming_ua"
  | "fintech"
  | "ecommerce"
  | "food_qsr"
  | "travel"
  | "subscription_media"
  | "health_wellness"
  | "education"
  | "dating_social"
  | "sports_news"
  | "sports_betting"
  | "gambling"
  | "real_estate"
  | "automotive"
  | "classifieds"
  | "telco_utilities"
  | "b2b_saas"
  | "charity_civic"
  | "religion"
  | "kids_family"
  | "generative_ai"
  | "adult"
  | "cps_web"
  | "other";

// ─────────────────────────────────────────────────────────────────
// Lookup helpers
// ─────────────────────────────────────────────────────────────────

const SUB_TO_TOP_LEVEL: Record<string, TopLevelVertical> = (() => {
  const m: Record<string, TopLevelVertical> = {};
  for (const sv of GAMING_SUB_VERTICALS) m[sv] = "gaming";
  for (const sv of MOBILE_UTILITY_SUB_VERTICALS) m[sv] = "non_gaming_ua";
  for (const sv of MOBILE_FINTECH_SUB_VERTICALS) m[sv] = "fintech";
  for (const sv of MOBILE_ECOM_SUB_VERTICALS) m[sv] = "ecommerce";
  for (const sv of MOBILE_FOOD_SUB_VERTICALS) m[sv] = "food_qsr";
  for (const sv of MOBILE_TRAVEL_SUB_VERTICALS) m[sv] = "travel";
  for (const sv of MOBILE_MEDIA_SUB_VERTICALS) m[sv] = "subscription_media";
  for (const sv of MOBILE_HEALTH_SUB_VERTICALS) m[sv] = "health_wellness";
  for (const sv of MOBILE_EDU_SUB_VERTICALS) m[sv] = "education";
  for (const sv of MOBILE_DATING_SOCIAL_SUB_VERTICALS) m[sv] = "dating_social";
  for (const sv of MOBILE_SPORTS_SUB_VERTICALS) m[sv] = sv === "sports_betting_mobile" ? "sports_betting" : "sports_news";
  for (const sv of MOBILE_GAMBLING_SUB_VERTICALS) m[sv] = "gambling";
  for (const sv of MOBILE_REALESTATE_SUB_VERTICALS) m[sv] = "real_estate";
  for (const sv of MOBILE_AUTO_SUB_VERTICALS) m[sv] = "automotive";
  for (const sv of MOBILE_CLASSIFIEDS_SUB_VERTICALS) m[sv] = "classifieds";
  for (const sv of MOBILE_TELCO_SUB_VERTICALS) m[sv] = "telco_utilities";
  for (const sv of MOBILE_B2B_SUB_VERTICALS) m[sv] = "b2b_saas";
  for (const sv of MOBILE_OTHER_SUB_VERTICALS) {
    if (sv.startsWith("charity_") || sv.startsWith("civic_")) m[sv] = "charity_civic";
    else if (sv.startsWith("religion_")) m[sv] = "religion";
    else if (sv.startsWith("kids_")) m[sv] = "kids_family";
    else if (sv.startsWith("adult_")) m[sv] = "adult";
    else m[sv] = "other";
  }
  for (const sv of MOBILE_GEN_AI_SUB_VERTICALS) m[sv] = "generative_ai";
  for (const sv of WEB_CPS_SUB_VERTICALS) m[sv] = "cps_web";
  for (const sv of OTHER_SUB_VERTICALS) m[sv] = "other";
  return m;
})();

/**
 * Returns the top-level vertical for a sub-vertical code.
 * Throws if the sub-vertical is unknown — callers must validate input first.
 */
export function getTopLevelVertical(subVertical: string): TopLevelVertical {
  const top = SUB_TO_TOP_LEVEL[subVertical];
  if (!top) {
    throw new Error(`Unknown sub-vertical: ${subVertical}`);
  }
  return top;
}

/**
 * Returns the doctrine domain (mobileGaming / mobileNonGaming / webCps) that
 * the sub-vertical routes to. This determines which doctrine files apply.
 */
export function getDoctrineDomain(subVertical: string): DoctrineDomain {
  if (subVertical.startsWith("gaming_") && subVertical.endsWith("_mobile")) {
    return "mobileGaming";
  }
  if (subVertical.endsWith("_mobile")) {
    return "mobileNonGaming";
  }
  if (subVertical.startsWith("cps_web_")) {
    return "webCps";
  }
  if (subVertical === "other_uncategorized") {
    // Default unknown to non-gaming mobile; safest fallback
    return "mobileNonGaming";
  }
  throw new Error(`Cannot determine doctrine domain for: ${subVertical}`);
}

/**
 * Type guard — returns true if the value is a valid sub-vertical code.
 * Uses Object.prototype.hasOwnProperty.call to avoid matching inherited
 * properties (e.g., "toString", "constructor") which would falsely
 * pass a naive `value in record` check.
 */
export function isValidSubVertical(value: unknown): value is SubVertical {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SUB_TO_TOP_LEVEL, value);
}

// ─────────────────────────────────────────────────────────────────
// Display labels (human-readable, for UI dropdowns and reports)
// ─────────────────────────────────────────────────────────────────

const DISPLAY_LABELS: Record<string, string> = {
  // Gaming
  gaming_casual_mobile: "Casual Gaming (mobile)",
  gaming_hyper_casual_mobile: "Hyper-Casual Gaming (mobile)",
  gaming_match3_mobile: "Match-3 Gaming (mobile)",
  gaming_puzzle_mobile: "Puzzle Gaming (mobile)",
  gaming_word_mobile: "Word Gaming (mobile)",
  gaming_simulation_mobile: "Simulation Gaming (mobile)",
  gaming_idle_mobile: "Idle / Incremental Gaming (mobile)",
  gaming_midcore_rpg_mobile: "Mid-core RPG (mobile)",
  gaming_midcore_strategy_mobile: "Mid-core Strategy (mobile)",
  gaming_midcore_moba_mobile: "Mid-core MOBA (mobile)",
  gaming_midcore_card_mobile: "Mid-core Card / CCG (mobile)",
  gaming_midcore_action_mobile: "Mid-core Action (mobile)",
  gaming_hardcore_mmo_mobile: "Hardcore MMO (mobile)",
  gaming_hardcore_shooter_mobile: "Hardcore Shooter (mobile)",
  gaming_social_casino_mobile: "Social Casino (mobile, virtual coins only)",
  gaming_sports_sim_mobile: "Sports Simulation Gaming (mobile)",
  gaming_racing_mobile: "Racing Gaming (mobile)",
  gaming_kids_edu_mobile: "Kids Educational Gaming (mobile)",
  // Mobile utility
  utility_productivity_mobile: "Productivity App (mobile)",
  utility_general_mobile: "Utility App (mobile)",
  photo_video_editor_mobile: "Photo / Video Editor (mobile)",
  lifestyle_general_mobile: "Lifestyle App (mobile)",
  generative_ai_consumer_mobile: "Generative AI Consumer App (mobile)",
  // Mobile fintech
  fintech_neobank_mobile: "Neobank (mobile)",
  fintech_traditional_bank_mobile: "Traditional Bank App (mobile)",
  fintech_crypto_exchange_mobile: "Crypto Exchange (mobile)",
  fintech_crypto_wallet_defi_mobile: "Crypto Wallet / DeFi (mobile)",
  fintech_brokerage_trading_mobile: "Brokerage / Trading (mobile)",
  fintech_forex_cfd_mobile: "Forex / CFDs (mobile)",
  fintech_lending_mobile: "Lending / Loans (mobile)",
  fintech_bnpl_mobile: "BNPL (mobile)",
  fintech_payments_wallet_mobile: "Payments / Wallet (mobile)",
  fintech_remittance_mobile: "Remittance (mobile)",
  fintech_insurance_mobile: "Insurance / Insurtech (mobile)",
  fintech_robo_advisor_mobile: "Robo-Advisor (mobile)",
  fintech_personal_finance_mobile: "Personal Finance Manager (mobile)",
  fintech_micro_investing_mobile: "Micro-Investing (mobile)",
  fintech_savings_mobile: "Digital Savings (mobile)",
  // Mobile ecom
  ecom_marketplace_multi_seller_mobile: "Multi-Seller Marketplace (mobile)",
  ecom_retail_brand_mobile: "Retail Brand App (mobile)",
  ecom_fashion_mobile: "Fashion E-commerce (mobile)",
  ecom_beauty_mobile: "Beauty E-commerce (mobile)",
  ecom_electronics_mobile: "Electronics E-commerce (mobile)",
  ecom_home_garden_mobile: "Home & Garden E-commerce (mobile)",
  ecom_groceries_mobile: "Grocery E-commerce (mobile)",
  ecom_secondhand_resale_mobile: "Secondhand / Resale (mobile)",
  ecom_flash_sales_mobile: "Flash Sales / Discount (mobile)",
  ecom_subscription_box_mobile: "Subscription Box (mobile)",
  ecom_quick_commerce_mobile: "Quick Commerce / 10-min Delivery (mobile)",
  // Mobile food
  food_delivery_aggregator_mobile: "Food Delivery Aggregator (mobile)",
  food_grocery_delivery_mobile: "Grocery Delivery (mobile)",
  food_restaurant_brand_mobile: "Restaurant Brand App (mobile)",
  food_meal_kit_mobile: "Meal Kit Subscription (mobile)",
  food_cloud_kitchen_mobile: "Cloud Kitchen (mobile)",
  food_reservation_mobile: "Restaurant Reservation (mobile)",
  // Mobile travel
  travel_ota_booking_mobile: "OTA / Travel Booking (mobile)",
  travel_hotel_brand_mobile: "Hotel Brand App (mobile)",
  travel_flight_search_mobile: "Flight Search / Comparison (mobile)",
  travel_airline_brand_mobile: "Airline Brand App (mobile)",
  travel_vacation_rental_mobile: "Vacation Rental (mobile)",
  travel_tours_activities_mobile: "Tours & Activities (mobile)",
  travel_rideshare_mobile: "Rideshare (mobile)",
  travel_transit_mobile: "Public Transit / Mobility (mobile)",
  travel_loyalty_card_mobile: "Travel Loyalty / Card (mobile)",
  // Mobile media
  media_video_streaming_mobile: "Video Streaming (mobile)",
  media_music_streaming_mobile: "Music Streaming (mobile)",
  media_podcast_mobile: "Podcast App (mobile)",
  media_audiobook_ebook_mobile: "Audiobook / E-book (mobile)",
  media_news_magazine_mobile: "News / Magazine Subscription (mobile)",
  media_short_drama_mobile: "Short Drama (mobile)",
  media_kids_content_mobile: "Kids Content / Streaming (mobile)",
  media_live_tv_sports_mobile: "Live TV / Sports Streaming (mobile)",
  media_generative_ai_creative_mobile: "Generative AI Creative (mobile)",
  // Mobile health
  health_telehealth_mobile: "Telehealth (mobile)",
  health_pharmacy_mobile: "Online Pharmacy (mobile)",
  health_mental_wellness_mobile: "Mental Wellness / Therapy (mobile)",
  health_fitness_workout_mobile: "Fitness / Workout (mobile)",
  health_nutrition_diet_mobile: "Nutrition / Diet (mobile)",
  health_women_pregnancy_mobile: "Women's Health / Pregnancy (mobile)",
  health_chronic_condition_mobile: "Chronic Condition Management (mobile)",
  health_meditation_mobile: "Meditation / Mindfulness (mobile)",
  // Mobile edu
  edu_language_learning_mobile: "Language Learning (mobile)",
  edu_k12_tutoring_mobile: "K-12 Tutoring (mobile)",
  edu_higher_ed_mobile: "Higher Education (mobile)",
  edu_test_prep_mobile: "Exam / Test Prep (mobile)",
  edu_kids_early_learning_mobile: "Kids Early Learning (mobile)",
  edu_skill_courses_mobile: "Skill Courses (mobile)",
  edu_vocational_mobile: "Vocational Training (mobile)",
  edu_reading_literacy_mobile: "Reading / Literacy (mobile)",
  edu_stem_coding_mobile: "STEM / Coding (mobile)",
  // Mobile dating/social
  dating_mainstream_mobile: "Mainstream Dating (mobile)",
  dating_niche_mobile: "Niche Dating (mobile)",
  dating_hookup_mobile: "Hookup / Casual Dating (mobile)",
  dating_premium_matchmaking_mobile: "Premium Matchmaking (mobile)",
  social_discovery_mobile: "Social Discovery (mobile)",
  social_network_mobile: "Social Network (mobile)",
  social_community_forum_mobile: "Community / Forum (mobile)",
  // Mobile sports
  sports_news_scores_mobile: "Sports News / Scores (mobile)",
  sports_fantasy_dfs_mobile: "Fantasy / DFS (mobile)",
  sports_betting_mobile: "Sportsbook / Sports Betting (mobile)",
  sports_community_mobile: "Sports Community (mobile)",
  // Mobile gambling
  gambling_online_casino_mobile: "Online Casino (mobile, real money)",
  gambling_poker_mobile: "Real-Money Poker (mobile)",
  gambling_bingo_mobile: "Real-Money Bingo (mobile)",
  gambling_lottery_mobile: "Lottery (mobile)",
  // Mobile real estate
  realestate_property_buy_mobile: "Property Buy / Sale (mobile)",
  realestate_rental_mobile: "Rental Listings (mobile)",
  realestate_host_owner_mobile: "Host / Owner Side (mobile)",
  realestate_mortgage_mobile: "Mortgage / Home Loan (mobile)",
  realestate_property_mgmt_mobile: "Property Management (mobile)",
  // Mobile auto
  auto_marketplace_new_mobile: "New Car Marketplace (mobile)",
  auto_marketplace_used_mobile: "Used Car Marketplace (mobile)",
  auto_rental_mobile: "Car Rental (mobile)",
  auto_subscription_mobile: "Car Subscription (mobile)",
  auto_service_mobile: "Auto Service / Repair (mobile)",
  auto_parking_mobile: "Parking (mobile)",
  auto_ev_charging_mobile: "EV Charging (mobile)",
  // Mobile classifieds
  classifieds_general_mobile: "General Classifieds (mobile)",
  classifieds_p2p_resale_mobile: "P2P Resale (mobile)",
  classifieds_jobs_mobile: "Jobs Classifieds (mobile)",
  classifieds_rentals_mobile: "Rental Classifieds (mobile)",
  // Mobile telco
  telco_mobile_carrier_mobile: "Mobile Carrier App (mobile)",
  telco_broadband_isp_mobile: "Broadband / ISP App (mobile)",
  telco_utility_provider_mobile: "Utility Provider App (mobile)",
  telco_esim_marketplace_mobile: "eSIM Marketplace (mobile)",
  // Mobile B2B
  b2b_collab_mobile: "B2B Collaboration (mobile)",
  b2b_crm_sales_mobile: "B2B CRM / Sales (mobile)",
  b2b_hr_tech_mobile: "B2B HR Tech (mobile)",
  b2b_intelligence_mobile: "B2B Intelligence / BI (mobile)",
  b2b_cloud_storage_mobile: "B2B Cloud Storage (mobile)",
  b2b_doc_signing_mobile: "B2B Document Signing (mobile)",
  b2b_field_service_mobile: "B2B Field Service (mobile)",
  // Mobile other
  charity_donation_mobile: "Charity / Donation (mobile)",
  charity_volunteer_mobile: "Volunteer Matching (mobile)",
  civic_government_mobile: "Civic / Government (mobile)",
  religion_scripture_mobile: "Religious Scripture (mobile)",
  religion_devotional_mobile: "Religious Devotional (mobile)",
  kids_entertainment_mobile: "Kids Entertainment (mobile)",
  kids_parenting_mobile: "Parenting App (mobile)",
  adult_content_mobile: "Adult Content (mobile, where legal)",
  adult_cam_mobile: "Adult Cam Platform (mobile, where legal)",
  // Mobile gen AI
  ai_chat_assistant_mobile: "AI Chat Assistant (mobile)",
  ai_image_generator_mobile: "AI Image Generator (mobile)",
  ai_writing_tool_mobile: "AI Writing Tool (mobile)",
  ai_code_assistant_mobile: "AI Code Assistant (mobile)",
  ai_voice_video_mobile: "AI Voice / Video (mobile)",
  // Web CPS
  cps_web_ecom_marketplace: "E-commerce Marketplace (web)",
  cps_web_ecom_retail: "Retail E-commerce (web)",
  cps_web_ecom_fashion: "Fashion E-commerce (web)",
  cps_web_ecom_beauty: "Beauty E-commerce (web)",
  cps_web_ecom_electronics: "Electronics E-commerce (web)",
  cps_web_ecom_groceries: "Grocery E-commerce (web)",
  cps_web_travel_ota: "OTA / Travel Booking (web)",
  cps_web_travel_flights: "Flight Booking (web)",
  cps_web_travel_hotels: "Hotel Booking (web)",
  cps_web_travel_vacation_rental: "Vacation Rental (web)",
  cps_web_travel_tours: "Tours & Activities (web)",
  cps_web_fintech_banking: "Web Banking (web)",
  cps_web_fintech_brokerage: "Brokerage (web)",
  cps_web_fintech_insurance_comparison: "Insurance Comparison (web)",
  cps_web_fintech_lending: "Lending Comparison (web)",
  cps_web_fintech_crypto: "Crypto Exchange (web)",
  cps_web_classifieds_general: "General Classifieds (web)",
  cps_web_classifieds_jobs: "Jobs Classifieds (web)",
  cps_web_classifieds_realestate: "Real Estate Classifieds (web)",
  cps_web_classifieds_auto: "Auto Classifieds (web)",
  cps_web_subscription_saas: "B2B SaaS Subscription (web)",
  cps_web_subscription_streaming: "Streaming Subscription (web)",
  cps_web_subscription_news: "News Subscription (web)",
  cps_web_gambling_casino: "Online Casino (web)",
  cps_web_gambling_sportsbook: "Sportsbook (web)",
  cps_web_gambling_poker: "Real-Money Poker (web)",
  cps_web_lottery: "Lottery (web)",
  cps_web_leadgen_insurance: "Insurance Leadgen (web)",
  cps_web_leadgen_mortgage: "Mortgage Leadgen (web)",
  cps_web_leadgen_auto: "Auto Leadgen (web)",
  cps_web_leadgen_education: "Education Leadgen (web)",
  cps_web_education_courses: "Online Courses (web)",
  cps_web_education_certification: "Certification (web)",
  cps_web_health_telehealth: "Telehealth (web)",
  cps_web_health_pharmacy: "Online Pharmacy (web)",
  cps_web_health_supplement: "Health Supplements (web)",
  cps_web_food_delivery: "Food Delivery (web)",
  cps_web_food_grocery: "Grocery Delivery (web)",
  cps_web_dating: "Dating Site (web)",
  cps_web_pet: "Pet Marketplace (web)",
  cps_web_legal_services: "Legal Services Marketplace (web)",
  cps_web_other: "Other Web (CPS)",
  // Catch-all
  other_uncategorized: "Other / Uncategorized",
};

/**
 * Returns the human-readable display label for a sub-vertical.
 * Falls back to the raw code for unknown values.
 */
export function getDisplayLabel(subVertical: string): string {
  return DISPLAY_LABELS[subVertical] || subVertical;
}
