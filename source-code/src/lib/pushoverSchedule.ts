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

/** Current local clock (hour + weekday 0=Sun..6=Sat) in an arbitrary zone. */
export function localClockNow(timezone: string): { hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? -1);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  return { hour, weekday: WEEKDAY_SHORT[wd] ?? -1 };
}

export function pushoverClockNow(): { hour: number; weekday: number } {
  return localClockNow(pushoverTimezone());
}

/**
 * Pushover batch runs at midday GMT+2 on weekdays only (Mon–Fri).
 * Set PUSHOVER_SKIP_SCHEDULE_CHECK=true to bypass (dev/tests).
 *
 * LEGACY global gate — superseded by isUserPushoverScheduleNow (per-user
 * hour/days/timezone, Reminders & schedule 2026-07-09). Kept for the env
 * fallback path and existing smoke assertions.
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

/**
 * Per-user Pushover schedule gate (Reminders & schedule, 2026-07-09):
 * fires when the user's LOCAL clock (their digestTimezone — the single
 * per-user zone for all reminder scheduling) is past their configured
 * reminder hour on one of their configured days. Same `>=` semantics as the
 * legacy gate (missed tick re-fires later the same day; the atomic
 * pushoverSent claim keeps it at-most-once). An empty pushoverDays array
 * means "never" — a deliberate off-switch, not a fallback to defaults.
 * Set PUSHOVER_SKIP_SCHEDULE_CHECK=true to bypass (dev/tests).
 */
export function isUserPushoverScheduleNow(user: {
  pushoverHourLocal: number;
  pushoverDays: number[];
  digestTimezone: string;
}): boolean {
  if (process.env.PUSHOVER_SKIP_SCHEDULE_CHECK === "true") return true;
  let clock: { hour: number; weekday: number };
  try {
    clock = localClockNow(user.digestTimezone);
  } catch {
    // Corrupt/unknown timezone string — fall back to the legacy global zone
    // rather than silently never notifying this user.
    clock = pushoverClockNow();
  }
  const days = Array.isArray(user.pushoverDays) ? user.pushoverDays : [1, 2, 3, 4, 5];
  if (!days.includes(clock.weekday)) return false;
  const hour =
    Number.isInteger(user.pushoverHourLocal) &&
    user.pushoverHourLocal >= 0 &&
    user.pushoverHourLocal <= 23
      ? user.pushoverHourLocal
      : pushoverHourLocal();
  return clock.hour >= hour;
}

/**
 * Per-user digest-day gate (email digest). Empty digestDays = never.
 * DIGEST_SKIP_HOUR_CHECK=true bypasses (same env the hour-gate honors, so
 * dev/smoke setups keep working without a second flag).
 */
export function isUserDigestDayNow(user: {
  digestDays: number[];
  digestTimezone: string;
}): boolean {
  if (process.env.DIGEST_SKIP_HOUR_CHECK === "true") return true;
  let weekday: number;
  try {
    weekday = localClockNow(user.digestTimezone).weekday;
  } catch {
    weekday = new Date().getUTCDay();
  }
  const days = Array.isArray(user.digestDays)
    ? user.digestDays
    : [0, 1, 2, 3, 4, 5, 6];
  return days.includes(weekday);
}