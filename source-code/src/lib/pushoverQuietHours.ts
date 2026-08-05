/**
 * Per-rep Pushover quiet-hours gate using digestTimezone.
 *
 * pushoverQuietHourStart/End define the allowed delivery window in local
 * time. Outside [start, end) is quiet — notifications should be skipped.
 */

export interface QuietHoursPrefs {
  pushoverQuietHourStart: number;
  pushoverQuietHourEnd: number;
  digestTimezone: string;
}

function localHour(timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).formatToParts(new Date());
    return Number(parts.find((p) => p.type === "hour")?.value ?? -1);
  } catch {
    return new Date().getUTCHours();
  }
}

function hourInAllowedWindow(
  hour: number,
  start: number,
  end: number,
): boolean {
  if (start === end) return true;
  if (start < end) {
    return hour >= start && hour < end;
  }
  // Window spans midnight, e.g. 22–6
  return hour >= start || hour < end;
}

/**
 * Returns true when the current local hour is outside the rep's allowed
 * Pushover window (i.e. we should NOT send).
 */
export function isPushoverQuietNow(prefs: QuietHoursPrefs): boolean {
  if (process.env.PUSHOVER_SKIP_QUIET_HOURS === "true") return false;
  const hour = localHour(prefs.digestTimezone);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return false;
  return !hourInAllowedWindow(
    hour,
    prefs.pushoverQuietHourStart,
    prefs.pushoverQuietHourEnd,
  );
}