import { apiFetch } from "../api";

// F-B: the channel a reminder should default to. Mirrors the BE enum.
export type PreferredChannel = "whatsapp" | "telegram" | "linkedin";

export interface NotificationSettings {
  // API7: the server returns only the masked form — the raw key is never sent
  // back to the client. Enter a new key to change it, or "Disable" to clear.
  pushoverUserKeyMasked: string | null;
  pushoverEnabled: boolean;
  pushoverAppConfigured: boolean;
  // F-B: new fields the API now returns.
  preferredChannel: PreferredChannel;
  pushoverQuietHourStart: number | null;
  pushoverQuietHourEnd: number | null;
  // Reminders & schedule (2026-07-09): per-user reminder hour (in the user's
  // digest timezone) + day-of-week arrays (0=Sun..6=Sat; empty = never).
  pushoverHourLocal: number;
  pushoverDays: number[];
  digestDays: number[];
}

export interface NotificationSettingsPatch {
  pushoverUserKey?: string | null;
  // F-B: new fields the API now accepts. Quiet-hours are non-nullable on the BE
  // (z.number().optional()) — omit to leave unchanged; NEVER send null (400).
  preferredChannel?: PreferredChannel;
  pushoverQuietHourStart?: number;
  pushoverQuietHourEnd?: number;
  // Reminders & schedule: omit to leave unchanged; [] is a valid "never".
  pushoverHourLocal?: number;
  pushoverDays?: number[];
  digestDays?: number[];
}

export function getNotificationSettings(): Promise<NotificationSettings> {
  return apiFetch<NotificationSettings>("/api/users/me/notification-settings");
}

export function patchNotificationSettings(
  input: NotificationSettingsPatch,
): Promise<NotificationSettings> {
  return apiFetch<NotificationSettings>("/api/users/me/notification-settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function postTestPushover(): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/api/users/me/test-pushover", {
    method: "POST",
  });
}