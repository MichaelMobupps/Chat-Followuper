import { apiFetch } from "../api";

export interface NotificationSettings {
  pushoverUserKey: string | null;
  pushoverUserKeyMasked: string | null;
  pushoverEnabled: boolean;
  pushoverAppConfigured: boolean;
}

export interface NotificationSettingsPatch {
  pushoverUserKey?: string | null;
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