/** IANA zone for fixed UTC+2 (GMT+2). No daylight saving drift. */
export const PUSHOVER_TIMEZONE = "Etc/GMT-2";

const WEEKDAY_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function pushoverHourLocal(): number {
  const raw = Number(process.env.PUSHOVER_HOUR_LOCAL ?? 12);
  return Number.isInteger(raw) && raw >= 0 && raw <= 23 ? raw : 12;
}

export function pushoverTimezone(): string {
  return process.env.PUSHOVER_TIMEZONE?.trim() || PUSHOVER_TIMEZONE;
}

export function todayInPushoverTimezone(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: pushoverTimezone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function pushoverClockNow(): { hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: pushoverTimezone(),
    hour: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? -1);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  return { hour, weekday: WEEKDAY_SHORT[wd] ?? -1 };
}

/**
 * Pushover batch runs at midday GMT+2 on weekdays only (Mon–Fri).
 * Set PUSHOVER_SKIP_SCHEDULE_CHECK=true to bypass (dev/tests).
 */
export function isPushoverScheduleNow(): boolean {
  if (process.env.PUSHOVER_SKIP_SCHEDULE_CHECK === "true") return true;
  const { hour, weekday } = pushoverClockNow();
  if (weekday === 0 || weekday === 6) return false;
  // F3 (FUP1's pushover half): `>=`, not `===`. A missed noon tick (deploy,
  // restart, blocked event loop, interval drift) would otherwise skip the
  // whole day's batch. The atomic `pushoverSent` claim in pushoverDigest
  // guarantees at-most-once, so a later same-day tick safely re-fires.
  return hour >= pushoverHourLocal();
}