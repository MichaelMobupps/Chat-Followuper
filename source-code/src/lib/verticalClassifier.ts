/**
 * Vertical classifier — infers vertical from email content.
 *
 * Priority order:
 *   1. Explicit label/subject keywords (gaming, cps, fintech, retarget)
 *   2. Email body content analysis (gaming signals, fintech signals, retargeting signals)
 *   3. Default: non_gaming_ua
 *
 * When vertical = "cps", a second-pass sub-vertical classifier runs to
 * determine the specific CPS industry (e-commerce, classifieds, fintech, etc.)
 *
 * Body analysis uses weighted signal scoring so a single stray word
 * doesn't flip classification — the content needs a real cluster of
 * language to override the default.
 */

// ── Signal definitions ──────────────────────────────────────────────

interface Signal {
  pattern: RegExp;
  weight: number;
}

/**
 * Gaming signals — terms that appear in gaming UA emails but almost
 * never in non-gaming mobile UA, CPS, or retargeting emails.
 *
 * Three tiers:
 *   strong (3): unambiguously gaming — game genres, stores, game-specific metrics
 *   medium (2): strongly associated but can appear elsewhere (e.g. "installs" in non-gaming UA)
 *   weak   (1): contextual nudges — meaningful in clusters, not alone
 */
const GAMING_SIGNALS: Signal[] = [
  // Strong — game genres & formats
  { pattern: /\b(match-?\d|puzzle|casual|hyper-?casual|mid-?core|hard-?core|idle|rpg|mmorpg|moba|strategy game|simulation game|card game|word game|trivia)\b/i, weight: 3 },
  // Strong — game-industry-specific terms
  { pattern: /\b(playable\s+ad|rewarded\s+video|offerwall|in-?app\s+purchas|iap|gacha|loot\s*box|game\s+economy|soft\s+launch|global\s+launch|live-?ops|liveops)\b/i, weight: 3 },
  // Strong — game studios / publisher context
  { pattern: /\b(game\s+studio|game\s+publisher|game\s+developer|mobile\s+game|gaming\s+app|gaming\s+compan|top\s+grossing\s+game)\b/i, weight: 3 },
  // Strong — well-known game titles as contextual anchors (extend as needed)
  { pattern: /\b(clash\s+of\s+clans|candy\s+crush|coin\s+master|royal\s+match|fishdom|gardenscapes|homescapes|township|merge\s+mansion|monopoly\s+go|squad\s+busters|brawl\s+stars|pubg\s+mobile|genshin\s+impact|roblox|among\s+us)\b/i, weight: 3 },
  // Medium — UA metrics with gaming flavor
  { pattern: /\b(d[137]\s+retention|roas\s+day|day-?\d+\s+roas|ltv\s+model|cohort\s+ltv|paying\s+user|arpdau|arppu|arpu)\b/i, weight: 2 },
  // Medium — ad network / platform terms heavy in gaming
  { pattern: /\b(applovin|unity\s+ads|ironsouce|ironsource|is\s+levelplay|mintegral|liftoff|vungle|chartboost|moloco|adjoe)\b/i, weight: 2 },
  // Medium — gaming market context
  { pattern: /\b(app\s*annie|sensor\s*tower|data\.ai|appmagic|apptica|mobile\s+gaming\s+market|gaming\s+vertical)\b/i, weight: 2 },
  // Weak — terms that nudge toward gaming in context
  { pattern: /\b(installs|cpi|ipm|ctr|creative\s+testing|ad\s+monetiz|mediation|waterfall|bidding)\b/i, weight: 1 },
  // Weak — game-adjacent terms
  { pattern: /\b(title|titles|portfolio|top\s+charts|charts)\b/i, weight: 1 },
];

const GAMING_THRESHOLD = 5; // need at least this combined weight to classify as gaming

const CPS_SIGNALS: Signal[] = [
  { pattern: /\b(fintech|finance\s+app|banking\s+app|neobank|crypto|trading\s+app|lending|insurance\s+app|payments?\s+app)\b/i, weight: 3 },
  { pattern: /\b(cps|cost\s+per\s+sale|cost\s+per\s+action|cpa\s+model|rev-?share|revenue\s+share)\b/i, weight: 3 },
  { pattern: /\b(subscription|trial\s+to\s+paid|first\s+deposit|ftd|first\s+time\s+deposit|fico|credit\s+score|loan\s+app)\b/i, weight: 2 },
  { pattern: /\b(affiliate|performance\s+network|offer\s+wall|conversion\s+flow)\b/i, weight: 1 },
];

const CPS_THRESHOLD = 4;

const RETARGETING_SIGNALS: Signal[] = [
  { pattern: /\b(retarget|re-?target|re-?engage|reengag|remarketing|re-?marketing)\b/i, weight: 3 },
  { pattern: /\b(lapsed\s+user|dormant\s+user|churned\s+user|inactive\s+user|win-?back)\b/i, weight: 3 },
  { pattern: /\b(deep\s*link|deferred\s+deep\s*link|push\s+notification\s+campaign|crm\s+campaign)\b/i, weight: 2 },
  { pattern: /\b(reattribution|re-?attribution)\b/i, weight: 2 },
];

const RETARGETING_THRESHOLD = 4;


// ── CPS Sub-vertical signal definitions ─────────────────────────────

interface SubVerticalDef {
  key: string;
  label: string;
  signals: Signal[];
  threshold: number;
}

const CPS_SUB_VERTICALS: SubVerticalDef[] = [
  {
    key: "cps_ecommerce",
    label: "CPS / E-commerce & Retail",
    threshold: 5,
    signals: [
      // Strong (3) — unambiguously e-commerce
      { pattern: /\b(e-?commerce|ecommerce|online\s+retail|online\s+store|webshop)\b/i, weight: 3 },
      { pattern: /\b(product\s+catalog|product\s+categories|shopping\s+cart|checkout\s+flow)\b/i, weight: 3 },
      { pattern: /\b(confirmed\s+purchase|purchase\s+event|order\s+value|average\s+order)\b/i, weight: 3 },
      { pattern: /\b(aov|add\s+to\s+cart|basket\s+size)\b/i, weight: 3 },
      { pattern: /\b(retailer|retail\s+site|retail\s+brand|specialist\s+retailer)\b/i, weight: 3 },
      { pattern: /\b(consumer\s+electronics|fashion\s+retail|beauty\s+retail)\b/i, weight: 3 },
      { pattern: /\b(cost-?per-?sale|confirmed\s+sales|confirmed\s+revenue)\b/i, weight: 3 },
      // Medium (2)
      { pattern: /\b(roas|return\s+on\s+ad\s+spend|cancellation\s+rate)\b/i, weight: 2 },
      { pattern: /\b(product\s+feed|shopping\s+campaign|merchant\s+center)\b/i, weight: 2 },
      { pattern: /\b(gmv|gross\s+merchandise|sales\s+volume|sales\s+data)\b/i, weight: 2 },
      { pattern: /\b(inventory|warehouse|fulfillment|shipping)\b/i, weight: 2 },
      { pattern: /\b(direct-?to-?consumer|d2c|dtc)\b/i, weight: 2 },
      // Weak (1)
      { pattern: /\b(shoppers|buyers|purchase\s+intent)\b/i, weight: 1 },
      { pattern: /\b(price\s+comparison|discount|coupon)\b/i, weight: 1 },
    ],
  },
  {
    key: "cps_classifieds",
    label: "CPS / Classifieds & Marketplaces",
    threshold: 5,
    signals: [
      // Strong (3)
      { pattern: /\b(classifieds?|classified\s+platform|classified\s+site|classified\s+search)\b/i, weight: 3 },
      { pattern: /\b(listing\s+submission|listing\s+action|listing\s+event|listing\s+lead)\b/i, weight: 3 },
      { pattern: /\b(seller\s+lead|seller\s+acquisition|seller\s+onboarding)\b/i, weight: 3 },
      { pattern: /\b(property\s+listing|automotive\s+listing|car\s+listing)\b/i, weight: 3 },
      { pattern: /\b(peer-?to-?peer|p2p\s+marketplace)\b/i, weight: 3 },
      { pattern: /\b(listing-?ready|listing\s+volume|completed\s+listing)\b/i, weight: 3 },
      // Medium (2)
      { pattern: /\b(marketplace\s+platform|marketplace\s+dependency)\b/i, weight: 2 },
      { pattern: /\b(automotive|property\s+portal|real\s+estate\s+portal)\b/i, weight: 2 },
      { pattern: /\b(buyer-?seller|supply-?demand)\b/i, weight: 2 },
      { pattern: /\b(posted\s+listing|active\s+listing)\b/i, weight: 2 },
      // Weak (1)
      { pattern: /\b(marketplace|listings|sellers)\b/i, weight: 1 },
      { pattern: /\b(portal)\b/i, weight: 1 },
    ],
  },
  {
    key: "cps_fintech",
    label: "CPS / Fintech & Financial Services",
    threshold: 5,
    signals: [
      // Strong (3)
      { pattern: /\b(fintech|finance\s+app|banking\s+app|neobank)\b/i, weight: 3 },
      { pattern: /\b(crypto|cryptocurrency|trading\s+app|trading\s+platform)\b/i, weight: 3 },
      { pattern: /\b(forex|forex\s+broker|cfds?|spread\s+betting)\b/i, weight: 3 },
      { pattern: /\b(lending|loan\s+app|loan\s+platform|microlending)\b/i, weight: 3 },
      { pattern: /\b(insurance\s+app|insurtech)\b/i, weight: 3 },
      { pattern: /\b(payment\s+app|payments?\s+app|digital\s+wallet|e-?wallet|ewallet)\b/i, weight: 3 },
      { pattern: /\b(remittance|money\s+transfer)\b/i, weight: 3 },
      // Medium (2)
      { pattern: /\b(first\s+deposit|ftd|first\s+time\s+deposit)\b/i, weight: 2 },
      { pattern: /\b(fico|credit\s+score|credit\s+check)\b/i, weight: 2 },
      { pattern: /\b(kyc|know\s+your\s+customer|account\s+verification)\b/i, weight: 2 },
      { pattern: /\b(robo-?advisor|wealth\s+management)\b/i, weight: 2 },
      { pattern: /\b(underwriting|premium\s+calculation)\b/i, weight: 2 },
      { pattern: /\b(bnpl|buy\s+now\s+pay\s+later)\b/i, weight: 2 },
      // Weak (1)
      { pattern: /\b(deposit|withdrawal|transaction)\b/i, weight: 1 },
      { pattern: /\b(banking|financial|investment)\b/i, weight: 1 },
    ],
  },
  {
    key: "cps_travel",
    label: "CPS / Travel & Hospitality",
    threshold: 5,
    signals: [
      // Strong (3)
      { pattern: /\b(travel\s+booking|hotel\s+booking|flight\s+booking)\b/i, weight: 3 },
      { pattern: /\b(online\s+travel\s+agency|ota|travel\s+platform)\b/i, weight: 3 },
      { pattern: /\b(accommodation|resort\s+booking|villa\s+rental)\b/i, weight: 3 },
      { pattern: /\b(airline|low-?cost\s+carrier|budget\s+airline)\b/i, weight: 3 },
      { pattern: /\b(tour\s+operator|tour\s+booking|activity\s+booking)\b/i, weight: 3 },
      { pattern: /\b(travel\s+comparison|fare\s+comparison|meta-?search)\b/i, weight: 3 },
      // Medium (2)
      { pattern: /\b(travell?er|tourism|tourist)\b/i, weight: 2 },
      { pattern: /\b(booking\s+confirmation|reservation)\b/i, weight: 2 },
      { pattern: /\b(hotel\s+chain|hospitality)\b/i, weight: 2 },
      { pattern: /\b(ancillary\s+revenue|seat\s+selection|baggage)\b/i, weight: 2 },
      { pattern: /\b(destination\s+marketing)\b/i, weight: 2 },
      // Weak (1)
      { pattern: /\b(travel|booking|hotel|flight)\b/i, weight: 1 },
      { pattern: /\b(vacation|holiday)\b/i, weight: 1 },
    ],
  },
  {
    key: "cps_food_delivery",
    label: "CPS / Food & Delivery",
    threshold: 5,
    signals: [
      // Strong (3)
      { pattern: /\b(food\s+delivery|meal\s+delivery|grocery\s+delivery)\b/i, weight: 3 },
      { pattern: /\b(quick\s+commerce|q-?commerce|dark\s+store)\b/i, weight: 3 },
      { pattern: /\b(restaurant\s+platform|restaurant\s+partner)\b/i, weight: 3 },
      { pattern: /\b(order\s+delivery|delivery\s+radius|delivery\s+fleet)\b/i, weight: 3 },
      { pattern: /\b(cloud\s+kitchen|ghost\s+kitchen|virtual\s+kitchen)\b/i, weight: 3 },
      // Medium (2)
      { pattern: /\b(first\s+order|order\s+frequency|reorder\s+rate)\b/i, weight: 2 },
      { pattern: /\b(basket\s+value|minimum\s+order)\b/i, weight: 2 },
      { pattern: /\b(delivery\s+fee|delivery\s+time)\b/i, weight: 2 },
      { pattern: /\b(restaurant\s+onboarding|merchant\s+acquisition)\b/i, weight: 2 },
      // Weak (1)
      { pattern: /\b(food|delivery|restaurant|grocery)\b/i, weight: 1 },
      { pattern: /\b(order|meal)\b/i, weight: 1 },
    ],
  },
  {
    key: "cps_subscription",
    label: "CPS / Subscription & SaaS",
    threshold: 5,
    signals: [
      // Strong (3)
      { pattern: /\b(subscription|subscriber|subscriber\s+growth)\b/i, weight: 3 },
      { pattern: /\b(trial\s+to\s+paid|free\s+trial\s+conversion)\b/i, weight: 3 },
      { pattern: /\b(monthly\s+plan|annual\s+plan|pricing\s+tier)\b/i, weight: 3 },
      { pattern: /\b(streaming\s+service|streaming\s+platform)\b/i, weight: 3 },
      { pattern: /\b(saas|software\s+as\s+a\s+service)\b/i, weight: 3 },
      { pattern: /\b(subscription\s+box|recurring\s+revenue)\b/i, weight: 3 },
      { pattern: /\b(content\s+platform|digital\s+content)\b/i, weight: 3 },
      // Medium (2)
      { pattern: /\b(churn\s+rate|retention\s+rate|subscriber\s+churn)\b/i, weight: 2 },
      { pattern: /\b(paywall|premium\s+content|freemium)\b/i, weight: 2 },
      { pattern: /\b(mrr|arr|monthly\s+recurring)\b/i, weight: 2 },
      { pattern: /\b(onboarding\s+flow|activation\s+rate)\b/i, weight: 2 },
      // Weak (1)
      { pattern: /\b(subscribe|premium|plan)\b/i, weight: 1 },
      { pattern: /\b(trial|upgrade)\b/i, weight: 1 },
    ],
  },
  {
    key: "cps_education",
    label: "CPS / Education & EdTech",
    threshold: 5,
    signals: [
      // Strong (3)
      { pattern: /\b(edtech|education\s+technology|online\s+learning)\b/i, weight: 3 },
      { pattern: /\b(online\s+course|course\s+enrollment|course\s+completion)\b/i, weight: 3 },
      { pattern: /\b(tutoring|tutor\s+platform|learning\s+platform)\b/i, weight: 3 },
      { pattern: /\b(language\s+learning|test\s+prep|exam\s+prep)\b/i, weight: 3 },
      { pattern: /\b(student\s+acquisition|learner\s+acquisition)\b/i, weight: 3 },
      { pattern: /\b(mooc|certification\s+program)\b/i, weight: 3 },
      // Medium (2)
      { pattern: /\b(curriculum|syllabus|lesson\s+plan)\b/i, weight: 2 },
      { pattern: /\b(teacher\s+onboarding|instructor\s+marketplace)\b/i, weight: 2 },
      { pattern: /\b(study\s+material|learning\s+path)\b/i, weight: 2 },
      { pattern: /\b(enrollment|student\s+engagement)\b/i, weight: 2 },
      // Weak (1)
      { pattern: /\b(education|learning|student|course)\b/i, weight: 1 },
      { pattern: /\b(school|university|academic)\b/i, weight: 1 },
    ],
  },
  {
    key: "cps_health_wellness",
    label: "CPS / Health & Wellness",
    threshold: 5,
    signals: [
      // Strong (3)
      { pattern: /\b(telehealth|telemedicine|health\s+app)\b/i, weight: 3 },
      { pattern: /\b(pharmacy|online\s+pharmacy|prescription\s+delivery)\b/i, weight: 3 },
      { pattern: /\b(fitness\s+app|workout\s+app|wellness\s+app)\b/i, weight: 3 },
      { pattern: /\b(health\s+supplement|nutraceutical)\b/i, weight: 3 },
      { pattern: /\b(mental\s+health|therapy\s+platform)\b/i, weight: 3 },
      { pattern: /\b(patient\s+acquisition|healthcare\s+platform)\b/i, weight: 3 },
      // Medium (2)
      { pattern: /\b(consultation\s+booking|doctor\s+appointment)\b/i, weight: 2 },
      { pattern: /\b(health\s+insurance|medical|clinical)\b/i, weight: 2 },
      { pattern: /\b(nutrition|diet\s+plan|meal\s+plan)\b/i, weight: 2 },
      { pattern: /\b(gym\s+membership|fitness\s+tracker)\b/i, weight: 2 },
      // Weak (1)
      { pattern: /\b(health|wellness|fitness)\b/i, weight: 1 },
      { pattern: /\b(medical|doctor|pharmacy)\b/i, weight: 1 },
    ],
  },
  {
    key: "cps_utilities_telco",
    label: "CPS / Utilities & Telco",
    threshold: 5,
    signals: [
      // Strong (3)
      { pattern: /\b(telecom|telco|mobile\s+operator|carrier)\b/i, weight: 3 },
      { pattern: /\b(broadband|fiber\s+optic|internet\s+plan)\b/i, weight: 3 },
      { pattern: /\b(sim\s+card|prepaid|postpaid|data\s+plan)\b/i, weight: 3 },
      { pattern: /\b(energy\s+provider|utility\s+provider)\b/i, weight: 3 },
      { pattern: /\b(plan\s+comparison|tariff\s+comparison)\b/i, weight: 3 },
      // Medium (2)
      { pattern: /\b(subscriber\s+acquisition|sim\s+activation)\b/i, weight: 2 },
      { pattern: /\b(number\s+portability|contract\s+renewal)\b/i, weight: 2 },
      // Weak (1)
      { pattern: /\b(provider|network|coverage)\b/i, weight: 1 },
    ],
  },
  {
    key: "cps_automotive",
    label: "CPS / Automotive",
    threshold: 5,
    signals: [
      // Strong (3)
      { pattern: /\b(car\s+sales|vehicle\s+sales|auto\s+dealer)\b/i, weight: 3 },
      { pattern: /\b(car\s+marketplace|car\s+platform|auto\s+platform)\b/i, weight: 3 },
      { pattern: /\b(test\s+drive|car\s+rental|vehicle\s+rental)\b/i, weight: 3 },
      { pattern: /\b(auto\s+insurance|car\s+insurance\s+comparison)\b/i, weight: 3 },
      { pattern: /\b(used\s+car|pre-?owned\s+vehicle|certified\s+pre-?owned)\b/i, weight: 3 },
      { pattern: /\b(car\s+listing|vehicle\s+listing)\b/i, weight: 3 },
      // Medium (2)
      { pattern: /\b(automotive\s+dealer|showroom)\b/i, weight: 2 },
      { pattern: /\b(trade-?in|car\s+valuation|vehicle\s+inspection)\b/i, weight: 2 },
      { pattern: /\b(auto\s+loan|car\s+financing)\b/i, weight: 2 },
      // Weak (1)
      { pattern: /\b(car|vehicle|automotive)\b/i, weight: 1 },
      { pattern: /\b(dealer|motor)\b/i, weight: 1 },
    ],
  },
  {
    key: "cps_real_estate",
    label: "CPS / Real Estate & Property",
    threshold: 5,
    signals: [
      // Strong (3)
      { pattern: /\b(real\s+estate|property\s+portal|property\s+platform)\b/i, weight: 3 },
      { pattern: /\b(property\s+listing|home\s+listing)\b/i, weight: 3 },
      { pattern: /\b(mortgage|home\s+loan|property\s+loan)\b/i, weight: 3 },
      { pattern: /\b(real\s+estate\s+agent|property\s+agent)\b/i, weight: 3 },
      { pattern: /\b(condo|apartment\s+listing|house\s+listing)\b/i, weight: 3 },
      { pattern: /\b(property\s+search|home\s+buyer)\b/i, weight: 3 },
      // Medium (2)
      { pattern: /\b(tenancy|rental\s+listing|lease)\b/i, weight: 2 },
      { pattern: /\b(property\s+developer|new\s+launch)\b/i, weight: 2 },
      { pattern: /\b(stamp\s+duty|property\s+valuation)\b/i, weight: 2 },
      { pattern: /\b(co-?living|serviced\s+apartment)\b/i, weight: 2 },
      // Weak (1)
      { pattern: /\b(property|home|house)\b/i, weight: 1 },
      { pattern: /\b(rent|buy)\b/i, weight: 1 },
    ],
  },
  {
    key: "cps_dating_social",
    label: "CPS / Dating & Social",
    threshold: 5,
    signals: [
      // Strong (3)
      { pattern: /\b(dating\s+app|dating\s+platform|matchmaking)\b/i, weight: 3 },
      { pattern: /\b(dating\s+service|online\s+dating)\b/i, weight: 3 },
      { pattern: /\b(social\s+discovery|relationship\s+app)\b/i, weight: 3 },
      { pattern: /\b(premium\s+membership|premium\s+match)\b/i, weight: 3 },
      // Medium (2)
      { pattern: /\b(profile\s+creation|match\s+rate|swipe)\b/i, weight: 2 },
      { pattern: /\b(premium\s+subscriber|dating\s+premium)\b/i, weight: 2 },
      // Weak (1)
      { pattern: /\b(dating|match|connection)\b/i, weight: 1 },
    ],
  },
  {
    key: "cps_gaming_iap",
    label: "CPS / Gaming (In-App Purchase)",
    threshold: 5,
    signals: [
      // Strong (3)
      { pattern: /\b(in-?app\s+purchase\s+event|first\s+purchase\s+event)\b/i, weight: 3 },
      { pattern: /\b(payer\s+conversion|paying\s+user\s+acquisition)\b/i, weight: 3 },
      { pattern: /\b(iap\s+revenue|purchase\s+roas)\b/i, weight: 3 },
      { pattern: /\b(spender\s+acquisition|whale\s+acquisition)\b/i, weight: 3 },
      // Medium (2)
      { pattern: /\b(purchase\s+event\s+tracking|revenue\s+event)\b/i, weight: 2 },
      { pattern: /\b(first-?time\s+buyer|payer\s+rate)\b/i, weight: 2 },
    ],
  },
];

// Minimum sub-vertical score to assign a sub-vertical.
// Below this, keep sub_vertical = null (generic CPS).
const CPS_SUB_THRESHOLD = 5;


// ── Scoring ─────────────────────────────────────────────────────────

function scoreSignals(text: string, signals: Signal[]): number {
  let score = 0;
  for (const { pattern, weight } of signals) {
    if (pattern.test(text)) {
      score += weight;
    }
  }
  return score;
}

interface MatchDetail {
  vertical: string;
  score: number;
}

// ── Public API ──────────────────────────────────────────────────────

export interface VerticalResult {
  vertical: string;
  subVertical: string | null;
  reason: string;
}

/**
 * CPS sub-vertical labels for display.
 */
export const CPS_SUB_VERTICAL_LABELS: Record<string, string> = {
  cps_ecommerce: "E-commerce & Retail",
  cps_classifieds: "Classifieds & Marketplaces",
  cps_fintech: "Fintech & Financial Services",
  cps_travel: "Travel & Hospitality",
  cps_food_delivery: "Food & Delivery",
  cps_subscription: "Subscription & SaaS",
  cps_education: "Education & EdTech",
  cps_health_wellness: "Health & Wellness",
  cps_utilities_telco: "Utilities & Telco",
  cps_automotive: "Automotive",
  cps_real_estate: "Real Estate & Property",
  cps_dating_social: "Dating & Social",
  cps_gaming_iap: "Gaming (In-App Purchase)",
};

/**
 * Get the display label for a CPS sub-vertical.
 * Returns "CPS / <sub-label>" or "CPS" if no sub-vertical.
 */
export function getCpsDisplayLabel(subVertical: string | null): string {
  if (!subVertical) return "CPS";
  return `CPS / ${CPS_SUB_VERTICAL_LABELS[subVertical] || subVertical}`;
}

/**
 * Second-pass: infer CPS sub-vertical from email body.
 * Only called when the primary vertical is already "cps".
 */
export function inferCpsSubVertical(
  subject: string,
  body: string = "",
): { subVertical: string | null; reason: string } {
  const fullText = (subject + " " + body).toLowerCase();

  const candidates: { key: string; score: number }[] = [];

  for (const def of CPS_SUB_VERTICALS) {
    const score = scoreSignals(fullText, def.signals);
    if (score >= def.threshold) {
      candidates.push({ key: def.key, score });
    }
  }

  if (candidates.length === 0) {
    return { subVertical: null, reason: "No sub-vertical signals above threshold" };
  }

  // Highest score wins
  candidates.sort((a, b) => b.score - a.score);
  const winner = candidates[0];

  // If winner and runner-up are very close (within 2 points), note ambiguity
  const runnerUp = candidates.length > 1 ? candidates[1] : null;
  const isAmbiguous = runnerUp && (winner.score - runnerUp.score) <= 2;

  const label = CPS_SUB_VERTICAL_LABELS[winner.key] || winner.key;
  const reason = isAmbiguous
    ? `Sub-vertical: ${label} (score: ${winner.score}, close to ${CPS_SUB_VERTICAL_LABELS[runnerUp!.key] || runnerUp!.key}: ${runnerUp!.score})`
    : `Sub-vertical: ${label} (score: ${winner.score})`;

  return { subVertical: winner.key, reason };
}

/**
 * Infer vertical from all available context.
 *
 * @param labels   - Gmail label names on the message
 * @param subject  - Email subject line
 * @param body     - Email body text (first ~800 chars is fine)
 */
export function inferVertical(
  labels: string[],
  subject: string,
  body: string = "",
): VerticalResult {
  // ── Pass 1: explicit keyword in labels or subject (existing behavior) ──
  const labelSubject = labels.join(" ").toLowerCase() + " " + subject.toLowerCase();
  if (labelSubject.includes("gaming")) {
    return { vertical: "gaming_ua", subVertical: null, reason: "Keyword 'gaming' in labels or subject" };
  }
  if (labelSubject.includes("cps") || labelSubject.includes("fintech")) {
    const sub = inferCpsSubVertical(subject, body);
    return { vertical: "cps", subVertical: sub.subVertical, reason: `Keyword 'cps'/'fintech' in labels or subject. ${sub.reason}` };
  }
  if (labelSubject.includes("retarget")) {
    return { vertical: "retargeting", subVertical: null, reason: "Keyword 'retarget' in labels or subject" };
  }

  // ── Pass 2: body content scoring ──
  const fullText = (subject + " " + body).toLowerCase();

  const gamingScore = scoreSignals(fullText, GAMING_SIGNALS);
  const cpsScore = scoreSignals(fullText, CPS_SIGNALS);
  const retargetingScore = scoreSignals(fullText, RETARGETING_SIGNALS);

  // Collect candidates that cross their threshold
  const candidates: MatchDetail[] = [];
  if (gamingScore >= GAMING_THRESHOLD) {
    candidates.push({ vertical: "gaming_ua", score: gamingScore });
  }
  if (cpsScore >= CPS_THRESHOLD) {
    candidates.push({ vertical: "cps", score: cpsScore });
  }
  if (retargetingScore >= RETARGETING_THRESHOLD) {
    candidates.push({ vertical: "retargeting", score: retargetingScore });
  }

  if (candidates.length > 0) {
    // Highest score wins; ties go to first match (gaming > cps > retargeting)
    candidates.sort((a, b) => b.score - a.score);
    const winner = candidates[0];

    // If CPS won, run sub-vertical classification
    if (winner.vertical === "cps") {
      const sub = inferCpsSubVertical(subject, body);
      return {
        vertical: "cps",
        subVertical: sub.subVertical,
        reason: `Body content analysis (score: ${winner.score}). ${sub.reason}`,
      };
    }

    return {
      vertical: winner.vertical,
      subVertical: null,
      reason: `Body content analysis (score: ${winner.score})`,
    };
  }

  // ── Pass 3: default ──
  return { vertical: "non_gaming_ua", subVertical: null, reason: "Default (no keyword or content match)" };
}
