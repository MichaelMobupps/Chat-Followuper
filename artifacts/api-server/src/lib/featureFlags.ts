/**
 * Environment-driven feature flags for gradual rollout.
 * Truthy values: "1", "true", "yes" (case-insensitive).
 */

function envFlag(name: string, defaultValue = false): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return defaultValue;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export interface FeatureFlags {
  apolloSeeder: boolean;
  pushover: boolean;
  weeklyDigest: boolean;
  pushoverNudges: boolean;
  manualIngest: boolean;
  prospector: boolean;
}

export function getFeatureFlags(): FeatureFlags {
  return {
    apolloSeeder: envFlag("FEATURE_APOLLO_SEEDER", true),
    pushover: envFlag("FEATURE_PUSHOVER", true),
    weeklyDigest: envFlag("FEATURE_WEEKLY_DIGEST", true),
    pushoverNudges: envFlag("FEATURE_PUSHOVER_NUDGES", true),
    manualIngest: envFlag("FEATURE_MANUAL_INGEST", true),
    prospector: envFlag("FEATURE_PROSPECTOR", true),
  };
}

export function isFeatureEnabled(flag: keyof FeatureFlags): boolean {
  return getFeatureFlags()[flag];
}