/**
 * User extras API client — preferences, digest, health, Apollo usage, admin.
 *
 * Endpoints follow the /api/users/me/* and /api/admin/* conventions used
 * elsewhere in the dashboard (notification-settings, sequence-config, etc.).
 */
import { apiFetch } from "@/lib/api";
import { apiPath } from "@/lib/config";

// ─────────────────────────────────────────────────────────────────
// User preferences
// ─────────────────────────────────────────────────────────────────

export type PreferredChannel = "whatsapp" | "telegram";

export interface UserPreferences {
  preferredChannel: PreferredChannel | null;
  messageTemplate: string | null;
  // Field names mirror the api-server (pushover_quiet_hour_* columns). The GET
  // response always returns numbers (columns are NOT NULL w/ defaults 8/20); the
  // PATCH schema is .strict() and these are optional-but-NOT-nullable, so callers
  // must OMIT them when unset — never send null.
  pushoverQuietHourStart: number | null;
  pushoverQuietHourEnd: number | null;
}

export type UserPreferencesPatch = Partial<UserPreferences>;

export function getUserPreferences(): Promise<UserPreferences> {
  return apiFetch<UserPreferences>(apiPath("/users/me/preferences"));
}

export function patchUserPreferences(
  input: UserPreferencesPatch,
): Promise<UserPreferences> {
  return apiFetch<UserPreferences>(apiPath("/users/me/preferences"), {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// ─────────────────────────────────────────────────────────────────
// Test digest email
// ─────────────────────────────────────────────────────────────────

export interface TestDigestResponse {
  ok: boolean;
  message?: string;
}

export function postTestDigest(): Promise<TestDigestResponse> {
  // Path must match the BE route (routes/userExtras.ts) — it is
  // "/users/me/test-digest-email", not "/test-digest". The mismatch was the
  // HTTP 404 on the accounts-page "Send test digest email" button.
  return apiFetch<TestDigestResponse>(apiPath("/users/me/test-digest-email"), {
    method: "POST",
  });
}

// ─────────────────────────────────────────────────────────────────
// Health check (user-facing ops panel)
// ─────────────────────────────────────────────────────────────────

export type HealthCheckStatus = "ok" | "degraded" | "error";

export interface HealthCheckItem {
  name: string;
  status: "ok" | "error";
  message?: string;
  latencyMs?: number;
}

export interface HealthCheckResponse {
  status: HealthCheckStatus;
  checks: HealthCheckItem[];
  checkedAt: string;
}

// The api-server's health-check endpoint reports which integrations are
// CONFIGURED (boolean flags), not a list of live check results. Adapt that into
// the panel's { status, checks[], checkedAt } shape so Accounts renders it
// instead of crashing on `health.data.checks.map` (checks was undefined).
// Frontend-only; no backend change.
interface HealthCheckConfigResponse {
  smtpConfigured: boolean;
  pushoverConfigured: boolean;
  apolloConfigured: boolean;
  appUrlConfigured: boolean;
  appUrl: string | null;
}

export function getHealthCheck(): Promise<HealthCheckResponse> {
  return apiFetch<HealthCheckConfigResponse>(
    apiPath("/users/me/health-check"),
  ).then((r) => {
    const checks: HealthCheckItem[] = [
      { name: "Email (SMTP)", status: r.smtpConfigured ? "ok" : "error" },
      { name: "Pushover", status: r.pushoverConfigured ? "ok" : "error" },
      { name: "Apollo", status: r.apolloConfigured ? "ok" : "error" },
      {
        name: "Public URL",
        status: r.appUrlConfigured ? "ok" : "error",
        message: r.appUrl ?? undefined,
      },
    ];
    const status: HealthCheckStatus = checks.every((c) => c.status === "ok")
      ? "ok"
      : "degraded";
    return { status, checks, checkedAt: new Date().toISOString() };
  });
}

// ─────────────────────────────────────────────────────────────────
// Apollo usage
// ─────────────────────────────────────────────────────────────────

// Mirrors the api-server GET /api/users/me/apollo-usage response. (Currently
// unconsumed; realigned so a future consumer reads real fields, not undefined.)
export interface ApolloUsage {
  month: string; // "YYYY-MM"
  revealsUsed: number;
  revealCap: number;
  remaining: number;
  capExceeded: boolean;
}

export function getApolloUsage(): Promise<ApolloUsage> {
  return apiFetch<ApolloUsage>(apiPath("/users/me/apollo-usage"));
}

// ─────────────────────────────────────────────────────────────────
// Admin (ops dashboard)
// ─────────────────────────────────────────────────────────────────

export interface AdminWhoami {
  isAdmin: boolean;
}

export interface AdminActivityEvent {
  id: string;
  actionType: string;
  actionStatus: string;
  prospectId: string | null;
  followupId: number | null;
  costUsd: number | null;
  executedAt: string;
}

export interface AdminActivityRep {
  user: {
    id: string;
    email: string;
    name: string | null;
    /** Admin kill switch (2026-07-15) — see POST followups-pause below. */
    followupsPaused: boolean;
  };
  totalSpendUsd: number;
  totalEventCount: number;
  recentEventCount: number;
  events: AdminActivityEvent[];
}

export interface AdminActivityResponse {
  reps: AdminActivityRep[];
  totals: {
    spendUsd: number;
    totalEventCount: number;
    eventsShown: number;
  };
  eventCap: number;
}

/** One model's slice of the per-call ledger. */
export interface AdminLlmSpendModel {
  model: string;
  costUsd: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Calls booked at $0 because the model had no price entry — see below. */
  unpricedCalls: number;
}

export interface AdminLlmSpendResponse {
  days: number;
  since: string;
  /**
   * Oldest ledger row. Per-model history is NOT backfillable (model names are
   * discarded at the action_logs boundary), so the data starts when the ledger
   * shipped. The UI must say "since <this>" rather than imply a silent zero for
   * any window that predates it.
   */
  coverageStartsAt: string | null;
  totals: { costUsd: number; calls: number; unpricedCalls: number };
  /**
   * Spend with no attributable user. Its own line, never filtered out — money
   * we can't attribute is exactly what an accounting view must show.
   */
  unattributed: { costUsd: number; calls: number };
  byUser: Array<{
    userId: string | null;
    email: string | null;
    name: string | null;
    costUsd: number;
    calls: number;
  }>;
  byModel: AdminLlmSpendModel[];
  byTask: Array<{ task: string; costUsd: number; calls: number }>;
}

export function getAdminWhoami(): Promise<AdminWhoami> {
  return apiFetch<AdminWhoami>(apiPath("/admin/whoami"));
}

export function getAdminActivity(): Promise<AdminActivityResponse> {
  return apiFetch<AdminActivityResponse>(apiPath("/admin/activity"));
}

export function getAdminLlmSpend(days = 30): Promise<AdminLlmSpendResponse> {
  return apiFetch<AdminLlmSpendResponse>(apiPath(`/admin/llm-spend?days=${days}`));
}

/**
 * Pause or resume one rep's follow-ups (admin kill switch).
 *
 * Stops follow-up sends and the notifications that drive them. Does NOT stop
 * first messages or the weekly stats digest — the flag is named for follow-ups
 * and that scope is deliberate (see users.followups_paused).
 */
export function setAdminFollowupsPause(
  userId: string,
  paused: boolean,
): Promise<{ id: string; followupsPaused: boolean }> {
  return apiFetch<{ id: string; followupsPaused: boolean }>(
    apiPath(`/admin/users/${userId}/followups-pause`),
    { method: "POST", body: JSON.stringify({ paused }) },
  );
}