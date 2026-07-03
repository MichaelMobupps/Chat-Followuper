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
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
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
  return apiFetch<TestDigestResponse>("/api/users/me/test-digest", {
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

export function getHealthCheck(): Promise<HealthCheckResponse> {
  return apiFetch<HealthCheckResponse>("/api/users/me/health-check");
}

// ─────────────────────────────────────────────────────────────────
// Apollo usage
// ─────────────────────────────────────────────────────────────────

export interface ApolloUsage {
  revealsUsedToday: number;
  revealsLimit: number;
  revealsUsedAllTime: number;
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