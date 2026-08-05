/**
 * @deprecated Replaced by pushoverDigest.ts — weekday midday GMT+2 batch only.
 * Kept as a stub so imports do not break; not called by the scheduler.
 */
export interface PushoverDueResult {
  notificationsSent: number;
  followupsSkipped: number;
  errors: number;
}

export async function runPushoverDueNotifications(): Promise<PushoverDueResult> {
  return { notificationsSent: 0, followupsSkipped: 0, errors: 0 };
}