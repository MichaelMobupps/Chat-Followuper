/**
 * User extras API client — preferences, digest, health, Apollo usage, admin.
 *
 * Endpoints follow the /api/users/me/* and /api/admin/* conventions used
 * elsewhere in the dashboard (notification-settings, sequence-config, etc.).
 */
import { apiFetch } from "@/lib/api";

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
  return apiFetch<UserPreferences>("/api/users/me/preferences");
}

export function patchUserPreferences(
  input: UserPreferencesPatch,
): Promise<UserPreferences> {
  return apiFetch<UserPreferences>("/api/users/me/preferences", {
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
  return apiFetch<TestDigestResponse>("/api/users/me/test-digest-email", {
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
    "/api/users/me/health-check",
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
  return apiFetch<ApolloUsage>("/api/users/me/apollo-usage");
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
  user: { id: string; email: string; name: string | null };
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

export function getAdminWhoami(): Promise<AdminWhoami> {
  return apiFetch<AdminWhoami>("/api/admin/whoami");
}

export function getAdminActivity(): Promise<AdminActivityResponse> {
  return apiFetch<AdminActivityResponse>("/api/admin/activity");
}