/**
 * Shared daily-usage bucket date (audit DB7).
 *
 * Returns the current calendar date as `YYYY-MM-DD` in the given IANA timezone,
 * so a user's daily counters/caps reset at THEIR local midnight rather than at
 * UTC midnight (which is ~02:00–03:00 in Asia/Jerusalem — the reset landed in
 * the middle of the local night and a local day straddled two UTC rows).
 *
 * Consistency rule: every writer AND the cap reader for a given daily counter
 * must derive the bucket from THIS function with the same user's timezone. The
 * LLM daily-spend-cap group (generateMessage / manualContactPrepare /
 * followupMessageService writers + llmSpendCap reader) all do. The Apollo
 * reveal counter (monthly cap) and messages_sent (no cap) intentionally remain
 * UTC-bucketed — a monthly boundary shift is negligible and messages_sent has
 * no reset to get wrong.
 *
 * An invalid/unknown timezone falls back to UTC (never throws) so a bad
 * digestTimezone value can't break spend accounting.
 */
export function usageBucketDate(timezone: string | null | undefined): string {
  const tz = timezone && timezone.trim() ? timezone.trim() : "UTC";
  try {
    // en-CA renders as YYYY-MM-DD, which is exactly the `date` column format.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    // Unknown IANA zone → Intl throws a RangeError; fall back to UTC.
    return new Date().toISOString().slice(0, 10);
  }
}
