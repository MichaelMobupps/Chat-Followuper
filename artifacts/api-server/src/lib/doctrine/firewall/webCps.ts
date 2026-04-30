/**
 * Vertical firewall for web CPS sub-verticals.
 *
 * Blocks mobile-app vocabulary from leaking into web CPS messages. Web CPS
 * is a different ecosystem: affiliate networks, publisher curation, monthly
 * visits, browser sessions, checkout completion, etc.
 */

import type { FirewallEntry } from "./mobileGaming";

export const WEB_CPS_FIREWALL: FirewallEntry[] = [
  // ── Mobile-only terms that should not appear in web messages ──
  { blocked: "in-app purchase", replacement: "checkout completion", reason: "mobile event in web context" },
  { blocked: "IAP", replacement: "checkout completion", reason: "mobile abbreviation in web context" },
  { blocked: "install", replacement: "first-session signup", reason: "mobile event in web context" },
  { blocked: "installs", replacement: "first-session signups", reason: "mobile event in web context" },
  { blocked: "CPI", replacement: "CPC", reason: "mobile metric in web context" },
  { blocked: "MMP", replacement: "tracking pixel", reason: "mobile attribution term in web context" },
  { blocked: "AppsFlyer", replacement: "tracking pixel", reason: "mobile attribution platform in web context" },
  { blocked: "Adjust", replacement: "tracking pixel", reason: "mobile attribution platform in web context" },
  { blocked: "Singular", replacement: "tracking pixel", reason: "mobile attribution platform in web context" },
  { blocked: "deep link", replacement: "deep URL", reason: "mobile term in web context" },
  { blocked: "deep-link", replacement: "deep URL", reason: "mobile term in web context" },
  { blocked: "ARPDAU", replacement: "ARPV (average revenue per visitor)", reason: "mobile gaming metric in web context" },
  { blocked: "DAU", replacement: "daily visitors", reason: "mobile metric in web context" },
  { blocked: "MAU", replacement: "monthly visitors", reason: "mobile metric in web context" },
  { blocked: "D7 retention", replacement: "week-1 return rate", reason: "mobile metric in web context" },
  { blocked: "D30 retention", replacement: "month-1 return rate", reason: "mobile metric in web context" },
  { blocked: "D7 ROAS", replacement: "ROAS day-7", reason: "mobile-style metric reformatted for web" },
  { blocked: "D30 ROAS", replacement: "ROAS day-30", reason: "mobile-style metric reformatted for web" },
  { blocked: "ROAS day-90", replacement: "ROAS quarter-1", reason: "mobile metric in web context" },
  { blocked: "app session", replacement: "browser session", reason: "mobile term in web context" },
  { blocked: "app store", replacement: "destination page", reason: "mobile distribution term in web context" },
  { blocked: "Play Store", replacement: "destination page", reason: "mobile distribution term in web context" },
  { blocked: "App Store", replacement: "destination page", reason: "mobile distribution term in web context" },
  { blocked: "store optimization", replacement: "landing-page optimization", reason: "mobile term in web context" },
  { blocked: "ASO", replacement: "SEO", reason: "mobile term in web context" },

  // ── Gaming-specific terms that should not appear in web CPS ──
  { blocked: "gacha", replacement: "monetized event", reason: "gaming term in web CPS context" },
  { blocked: "battle pass", replacement: "premium tier", reason: "gaming term in web CPS context" },
  { blocked: "live-ops", replacement: "campaign cycle", reason: "gaming term in web CPS context" },
  { blocked: "live ops", replacement: "campaign cycle", reason: "gaming term in web CPS context" },
  { blocked: "soft launch", replacement: "tier-2 market test", reason: "gaming term in web CPS context" },
  { blocked: "rewarded video", replacement: "incentivized engagement", reason: "gaming term in web CPS context" },
  { blocked: "playable ad", replacement: "interactive ad creative", reason: "gaming term in web CPS context" },
  { blocked: "playable ads", replacement: "interactive ad creatives", reason: "gaming term in web CPS context" },
  { blocked: "guild", replacement: "community", reason: "gaming term in web CPS context" },
  { blocked: "alliance", replacement: "community", reason: "gaming term in web CPS context" },
  { blocked: "whale", replacement: "high-value user", reason: "gaming term in web CPS context" },
  { blocked: "whales", replacement: "high-value users", reason: "gaming term in web CPS context" },

  // ── Mobile-engagement terms ──
  { blocked: "push notification", replacement: "email re-engagement", reason: "mobile engagement channel in web context" },
  { blocked: "push notifications", replacement: "email re-engagement", reason: "mobile engagement channel in web context" },
];
