/**
 * Followups API client — Ticket 2.5-FE.
 *
 * Typed wrappers for the 9 endpoints shipped in ticket-2-5-be:
 *   - GET    /api/followups                           (list, channel-parameterized)
 *   - POST   /api/prospects/:id/send-next-followup    (generate + return deep link)
 *   - PATCH  /api/followups/:id                       (edit body / scheduledAt / status)
 *   - POST   /api/followups/bulk/archive              (hard delete by ids or filter)
 *   - POST   /api/prospects/:id/mark-replied
 *   - POST   /api/prospects/:id/archive
 *   - POST   /api/prospects/bulk/pause                (toggle followupPaused)
 *
 * Sequence-config endpoints live in lib/api/sequence-config.ts.
 *
 * Conventions:
 *   - All requests credentials: "include" so the session cookie flows.
 *   - Non-2xx responses throw ApiError with the parsed `error` code from
 *     the body where available.
 *   - Returned shapes mirror the routes' JSON exactly; the UI status
 *     mapping is server-side (derived.uiStatus on list items), so no
 *     client-side recomputation here.
 */
import { ApiError } from "@/lib/api";

// ─────────────────────────────────────────────────────────────────
// Shared types — mirror the BE wire format
// ─────────────────────────────────────────────────────────────────

export const SUPPORTED_CHANNELS = [
  "whatsapp",
  "telegram",
  "teams",
  "slack",
] as const;
export type SupportedChannel = (typeof SUPPORTED_CHANNELS)[number];

export const LIST_STATUSES = [
  "all",
  "not_yet_sent",
  "sent",
  "replied",
  "no_reply",
  "paused",
] as const;
export type ListStatus = (typeof LIST_STATUSES)[number];

export const FOLLOWUP_EDITABLE_STATUSES = [
  "scheduled",
  "queued",
  "cancelled",
  "sent",
] as const;
export type FollowupEditableStatus = (typeof FOLLOWUP_EDITABLE_STATUSES)[number];

export interface Followup {
  id: number;
  prospectId: string;
  stage: number;
  channel: string;
  status: string;
  scheduledAt: string; // ISO timestamp
  generatedMessage: string | null;
  sentAt: string | null;
  deepLinkUrl: string | null;
  clickedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface FollowupListProspect {
  id: string;
  prospectName: string | null;
  company: string | null;
  title: string | null;
  vertical: string | null;
  subVertical: string | null;
  country: string | null;
  language: string | null;
  phone: string | null;
  telegramHandle: string | null;
  teamsEmail: string | null;
  slackUserId: string | null;
  firstMessageBody: string | null;
  firstMessageChannel: string | null;
  firstMessageSentAt: string | null;
  replied: number; // 0 or 1
  repliedAt: string | null;
  followupPaused: boolean;
  campaignId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FollowupListItem {
  prospect: FollowupListProspect;
  followups: Followup[];
  derived: {
    uiStatus: Exclude<ListStatus, "all">;
    sentCount: number;
    scheduledCount: number;
    totalCount: number;
    maxFollowups: number;
    lastSent: Followup | null;
    nextScheduled: Followup | null;
  };
}

export interface FollowupListResponse {
  items: FollowupListItem[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface ListFollowupsArgs {
  channel: SupportedChannel;
  status?: ListStatus;
  page?: number;
  perPage?: number;
}

export interface SendNextFollowupResponse {
  followupId: number;
  stage: number;
  deepLinkUrl: string;
  generatedMessage: string;
}

export interface PatchFollowupInput {
  generatedMessage?: string;
  scheduledAt?: string; // ISO with offset
  status?: FollowupEditableStatus;
}

export interface BulkArchiveByIdsInput {
  mode: "prospect_ids";
  prospectIds: string[];
}
export interface BulkArchiveByFilterInput {
  mode: "filter";
  channel: SupportedChannel;
  filter: "replied" | "no_reply" | "paused";
}
export type BulkArchiveInput =
  | BulkArchiveByIdsInput
  | BulkArchiveByFilterInput;

export interface BulkArchiveResponse {
  archived: number;
  ids: string[];
}

export interface MarkRepliedResponse {
  prospect: FollowupListProspect;
  cancelledFollowups: number;
  alreadyReplied: boolean;
}

export interface ArchiveProspectResponse {
  ok: true;
  archivedProspectId: string;
}

export interface BulkPauseInput {
  prospectIds: string[];
  paused: boolean;
}
export interface BulkPauseResponse {
  updated: number;
  ids: string[];
}

// ─────────────────────────────────────────────────────────────────
// Internal fetch helper
// ─────────────────────────────────────────────────────────────────

async function http<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(path, init);
  if (!res.ok) {
    let code: string | undefined;
    let message = `${method} ${path} failed (${res.status})`;
    let parsedBody: unknown = undefined;
    try {
      parsedBody = await res.json();
      if (
        parsedBody &&
        typeof (parsedBody as { error?: unknown }).error === "string"
      ) {
        const errStr = (parsedBody as { error: string }).error;
        code = errStr;
        message = errStr;
      }
    } catch {
      // body wasn't json; keep the default message
    }
    throw new ApiError(message, res.status, code, parsedBody);
  }
  // 204 No Content is valid; return undefined cast as T
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

// ─────────────────────────────────────────────────────────────────
// Endpoint wrappers
// ─────────────────────────────────────────────────────────────────

export function listFollowups(
  args: ListFollowupsArgs,
): Promise<FollowupListResponse> {
  const params = new URLSearchParams();
  params.set("channel", args.channel);
  if (args.status) params.set("status", args.status);
  if (args.page) params.set("page", String(args.page));
  if (args.perPage) params.set("perPage", String(args.perPage));
  return http("GET", `/api/followups?${params.toString()}`);
}

export function sendNextFollowup(
  prospectId: string,
  channel: SupportedChannel,
): Promise<SendNextFollowupResponse> {
  return http("POST", `/api/prospects/${prospectId}/send-next-followup`, {
    channel,
  });
}

export function patchFollowup(
  followupId: number,
  input: PatchFollowupInput,
): Promise<{ followup: Followup }> {
  return http("PATCH", `/api/followups/${followupId}`, input);
}

export function bulkArchiveFollowups(
  input: BulkArchiveInput,
): Promise<BulkArchiveResponse> {
  return http("POST", "/api/followups/bulk/archive", input);
}

export function markProspectReplied(
  prospectId: string,
  repliedAt?: string,
): Promise<MarkRepliedResponse> {
  return http("POST", `/api/prospects/${prospectId}/mark-replied`, {
    ...(repliedAt ? { repliedAt } : {}),
  });
}

export function archiveProspect(
  prospectId: string,
): Promise<ArchiveProspectResponse> {
  return http("POST", `/api/prospects/${prospectId}/archive`);
}

export function bulkPauseProspects(
  input: BulkPauseInput,
): Promise<BulkPauseResponse> {
  return http("POST", "/api/prospects/bulk/pause", input);
}
