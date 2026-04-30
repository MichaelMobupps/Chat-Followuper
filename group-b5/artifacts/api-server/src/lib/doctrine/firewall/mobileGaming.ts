/**
 * Vertical firewall for mobile gaming sub-verticals.
 *
 * A deterministic post-LLM cleanup pass that catches and replaces
 * cross-vertical terminology leaks. Each entry maps an OFFENDING term
 * (one that does not belong in a gaming message) to its CORRECT mobile-
 * gaming replacement.
 *
 * Replacement strategy: the firewall replaces the offending phrase with
 * a contextually-correct gaming term. Minor grammatical clunkiness on the
 * replacement is rare and the critic catches it on the next iteration.
 *
 * Match rule: case-insensitive whole-word matching. Original casing is
 * preserved when possible (so "Funded Account" → "First In-App Purchase",
 * "funded account" → "first in-app purchase").
 */

export interface FirewallEntry {
  /** Offending term that should not appear in this platform-family. */
  blocked: string;
  /** Correct replacement for this platform-family. */
  replacement: string;
  /** Why this term is blocked (used for critic explanations). */
  reason: string;
}

export const MOBILE_GAMING_FIREWALL: FirewallEntry[] = [
  // ── Fintech terms that should not appear in gaming messages ──
  { blocked: "funded account", replacement: "first in-app purchase", reason: "fintech term in gaming context" },
  { blocked: "first deposit", replacement: "first in-app purchase", reason: "fintech term in gaming context" },
  { blocked: "approved loan", replacement: "first in-app purchase", reason: "fintech term in gaming context" },
  { blocked: "first time depositor", replacement: "first paying user", reason: "gambling/fintech term in gaming context" },
  { blocked: "FTD", replacement: "first paying user", reason: "gambling abbreviation in gaming context" },
  { blocked: "KYC", replacement: "user onboarding", reason: "fintech compliance term in gaming context" },
  { blocked: "AUC per user", replacement: "ARPDAU", reason: "fintech metric in gaming context" },
  { blocked: "completed policy purchase", replacement: "in-app purchase", reason: "insurance term in gaming context" },
  { blocked: "premium per policy", replacement: "ARPPU", reason: "insurance metric in gaming context" },

  // ── Ecommerce terms that should not appear in gaming messages ──
  { blocked: "confirmed purchase", replacement: "in-app purchase", reason: "ecom term in gaming context" },
  { blocked: "checkout completion", replacement: "in-app purchase", reason: "ecom term in gaming context" },
  { blocked: "AOV", replacement: "ARPPU", reason: "ecom metric in gaming context" },
  { blocked: "abandoned cart", replacement: "lapsed user", reason: "ecom term in gaming context" },
  { blocked: "abandoned-cart", replacement: "lapsed-user", reason: "ecom term in gaming context" },
  { blocked: "add-to-cart", replacement: "session start", reason: "ecom event in gaming context" },

  // ── Travel / booking terms that should not appear in gaming ──
  { blocked: "completed booking", replacement: "in-app purchase", reason: "travel term in gaming context" },
  { blocked: "first booking", replacement: "first in-app purchase", reason: "travel term in gaming context" },
  { blocked: "booking ROAS", replacement: "ROAS day-7", reason: "travel metric in gaming context" },

  // ── Subscription / SaaS terms (only blocked for non-subscription gaming) ──
  // Note: kids edu gaming and word-game subscription titles legitimately
  // use subscription terms — those are NOT blocked here. The block applies
  // to mainstream IAP-driven gaming sub-verticals.
  { blocked: "trial-to-paid conversion", replacement: "free-to-paying conversion", reason: "SaaS term in gaming context" },
  { blocked: "annual-plan upgrade", replacement: "battle pass purchase", reason: "SaaS term in gaming context" },
  { blocked: "paid plan activation", replacement: "first in-app purchase", reason: "SaaS term in gaming context" },

  // ── Telehealth / health terms ──
  { blocked: "consultation booking", replacement: "in-app purchase", reason: "health term in gaming context" },
  { blocked: "prescription fulfilled", replacement: "in-app purchase", reason: "pharmacy term in gaming context" },

  // ── Lead generation terms ──
  { blocked: "lead submitted", replacement: "first paying user", reason: "leadgen term in gaming context" },
  { blocked: "qualified lead", replacement: "engaged user", reason: "leadgen term in gaming context" },

  // ── Gambling / sportsbook terms (only blocked for non-gambling gaming) ──
  // Social casino is gaming but uses some casino-adjacent vocabulary —
  // those are handled separately. Generic real-money gambling terms below
  // are blocked from showing up in match-3 / RPG / casual gaming messages.
  { blocked: "regulated geo", replacement: "supported geo", reason: "gambling regulatory term in gaming context" },
  { blocked: "VIP-tier", replacement: "high-value-player", reason: "casino term in non-casino gaming context" },

  // ── Web-only terms ──
  { blocked: "monthly visits", replacement: "monthly active users", reason: "web metric in mobile gaming context" },
  { blocked: "browser session", replacement: "app session", reason: "web term in mobile gaming context" },
  { blocked: "publisher curation", replacement: "creative testing at scale", reason: "web CPS term in mobile gaming context" },
  { blocked: "affiliate flow", replacement: "ad network optimization", reason: "web CPS term in mobile gaming context" },
];
