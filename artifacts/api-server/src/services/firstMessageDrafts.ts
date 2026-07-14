/**
 * First-message DRAFT store (2026-07).
 *
 * Backs "Generate message" inside the Add-a-contact dialog: the SDR writes and
 * reviews a message BEFORE the contact is saved, so there is no prospect row to
 * hang the result on yet. The preview run parks its output here under a
 * client-generated draftId; the subsequent manual-ingest create passes that
 * draftId and we persist the message + brief + classification in one shot,
 * without re-running (or re-paying for) the pipeline.
 *
 * WHY THE BRIEF LIVES HERE AND NOT ON THE WIRE
 * The obvious shortcut — return the researchBrief to the client and let it POST
 * it back on create — would make an LLM prompt input client-controlled:
 * followupMessageService feeds the stored brief to the follow-up writer, and
 * `prospects.researchBrief` is not otherwise writable through any route. The
 * message itself IS client-supplied (the SDR edits it in a textarea, and
 * PATCH /prospects/:id already admits firstMessageBody, so it grants nothing
 * new), but the brief never leaves the server.
 *
 * WHY IT'S ALL-OR-NOTHING
 * followupMessageService throws `research_not_complete` when researchBrief is
 * null, so a prospect saved with a message but no brief would break at
 * send-next — worse than not saving the message at all. If the draft is gone by
 * create time (TTL, restart, or another autoscale instance — the same
 * single-process assumption prepareProgress documents), the caller MUST fall
 * back to creating a plain draft contact: no message, no brief, status "draft",
 * and the row's Generate button runs the real pipeline and sets both. The only
 * loss is one wasted preview generation, which beats a contact whose follow-ups
 * throw.
 *
 * Entries are single-use: the create deletes the draft once the row is actually
 * inserted, so a draftId can't seed two contacts and the store drains as
 * contacts are created rather than only on TTL.
 */
import type { ProspectBrief } from "./prospectResearch";

export interface FirstMessageDraft {
  message: string;
  brief: ProspectBrief;
  /** Classification the run resolved — persisted so the row stays consistent. */
  classified: {
    vertical: string;
    subVertical: string;
    country: string;
    language: string;
    product: string;
  };
  /** Guards against a draft being spent on a different company than it describes. */
  company: string;
  createdAt: number;
}

const TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 2000;

const drafts = new Map<string, FirstMessageDraft>();

function key(userId: string, draftId: string): string {
  return `${userId}:${draftId}`;
}

function sweep(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [k, v] of drafts) {
    if (v.createdAt < cutoff) drafts.delete(k);
  }
}

export function setDraft(
  userId: string,
  draftId: string,
  draft: Omit<FirstMessageDraft, "createdAt">,
): void {
  sweep();
  // Hard bound: a client could mint unlimited draftIds. The rate limit on the
  // preview route is the real guard (each entry costs an LLM run to create), so
  // this is only a backstop against unbounded growth.
  if (drafts.size >= MAX_ENTRIES) {
    const oldest = [...drafts.entries()].sort(
      (a, b) => a[1].createdAt - b[1].createdAt,
    )[0];
    if (oldest) drafts.delete(oldest[0]);
  }
  drafts.set(key(userId, draftId), { ...draft, createdAt: Date.now() });
}

/**
 * Read WITHOUT removing. Returns null when the draft never existed, expired, or
 * was already spent — callers must treat null as "create a plain draft contact".
 *
 * Peek-then-delete rather than a single consume(), because the caller's insert
 * can still fail AFTER reading (duplicate_phone is a routine SDR mistake, not an
 * edge case). Consuming first meant a 409 destroyed the message they had just
 * reviewed and edited, with nothing to retry against — they'd fix the phone,
 * resubmit, and silently pay for a second generation. Delete only once the row
 * is actually in the database.
 */
export function peekDraft(
  userId: string,
  draftId: string,
): FirstMessageDraft | null {
  sweep();
  return drafts.get(key(userId, draftId)) ?? null;
}

/** Spend a draft. Idempotent; safe to call for an id that was never stored. */
export function deleteDraft(userId: string, draftId: string): void {
  drafts.delete(key(userId, draftId));
}

/** Test hook. */
export function __clearDraftsForTests(): void {
  drafts.clear();
}
