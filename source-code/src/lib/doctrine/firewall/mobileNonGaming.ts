/**
 * Vertical firewall for mobile non-gaming sub-verticals.
 *
 * Blocks gaming-specific vocabulary and web-CPS-specific vocabulary from
 * appearing in non-gaming mobile messages. Note that this firewall is broad
 * because non-gaming mobile spans many sub-verticals — the per-vertical
 * vocabulary block in the system prompt provides the positive guidance,
 * and this firewall provides the negative cleanup pass.
 */

import type { FirewallEntry } from "./mobileGaming";

export const MOBILE_NON_GAMING_FIREWALL: FirewallEntry[] = [
  // ── Gaming-specific terms that should not appear in non-gaming ──
  { blocked: "ARPDAU", replacement: "ARPU", reason: "gaming metric in non-gaming context" },
  { blocked: "ARPPU", replacement: "ARPU per paying user", reason: "gaming metric in non-gaming context" },
  { blocked: "gacha", replacement: "monetized event", reason: "gaming term in non-gaming context" },
  { blocked: "gacha pull", replacement: "monetized event", reason: "gaming term in non-gaming context" },
  { blocked: "battle pass", replacement: "premium tier", reason: "gaming term in non-gaming context" },
  { blocked: "live-ops", replacement: "campaign cycle", reason: "gaming term in non-gaming context" },
  { blocked: "live ops", replacement: "campaign cycle", reason: "gaming term in non-gaming context" },
  { blocked: "soft launch", replacement: "tier-2 market test", reason: "gaming term in non-gaming context" },
  { blocked: "rewarded video", replacement: "incentivized engagement", reason: "gaming term in non-gaming context" },
  { blocked: "playable ad", replacement: "interactive ad creative", reason: "gaming term in non-gaming context" },
  { blocked: "playable ads", replacement: "interactive ad creatives", reason: "gaming term in non-gaming context" },
  { blocked: "guild", replacement: "community", reason: "gaming term in non-gaming context" },
  { blocked: "alliance", replacement: "community", reason: "gaming term in non-gaming context" },
  { blocked: "whale", replacement: "high-value user", reason: "gaming term in non-gaming context" },
  { blocked: "whales", replacement: "high-value users", reason: "gaming term in non-gaming context" },
  { blocked: "in-app purchase", replacement: "primary conversion event", reason: "gaming-default term; verify the intended event for this vertical" },
  { blocked: "IAP", replacement: "primary conversion event", reason: "gaming abbreviation in non-gaming context" },
  { blocked: "first IAP", replacement: "first conversion", reason: "gaming term in non-gaming context" },
  { blocked: "level completion", replacement: "milestone completion", reason: "gaming event in non-gaming context" },
  { blocked: "session length", replacement: "engagement time", reason: "gaming-default metric; verify metric appropriate for this vertical" },
  { blocked: "DAU", replacement: "daily active users", reason: "gaming-default metric expansion" },
  { blocked: "matches per user", replacement: "sessions per user", reason: "gaming term in non-gaming context" },
  { blocked: "skin attach rate", replacement: "premium-tier attach rate", reason: "gaming term in non-gaming context" },

  // ── Web CPS terms that should not appear in mobile ──
  { blocked: "monthly visits", replacement: "monthly active users", reason: "web metric in mobile context" },
  { blocked: "browser session", replacement: "app session", reason: "web term in mobile context" },
  { blocked: "publisher curation", replacement: "ad network optimization", reason: "web CPS term in mobile context" },
  { blocked: "affiliate flow", replacement: "campaign flow", reason: "web CPS term in mobile context" },
  { blocked: "affiliate funnel", replacement: "campaign funnel", reason: "web CPS term in mobile context" },
  { blocked: "via affiliate", replacement: "via campaign", reason: "web CPS term in mobile context" },

  // ── Cross-vertical leaks within non-gaming (e.g., subscription terms in
  // ecommerce, ecom terms in fintech). The vertical-specific vocabulary
  // block in the system prompt is the primary guard against these; this
  // firewall is a backstop for the most common leaks.
  // Note: subscription terms ARE valid for subscription verticals
  // (media, edu, fitness, telehealth), so we don't blanket-block them
  // here — instead we rely on the per-vertical vocabulary block to set
  // the right expectation, and the critic to catch mismatches.
];
