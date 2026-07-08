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
}

export interface NotificationSettingsPatch {
  pushoverUserKey?: string | null;
  // F-B: new fields the API now accepts.
  preferredChannel?: PreferredChannel;
  pushoverQuietHourStart?: number | null;
  pushoverQuietHourEnd?: number | null;
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