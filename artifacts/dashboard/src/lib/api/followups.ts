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
 * Implementation: every wrapper delegates to the project's canonical
 * `apiFetch` helper (lib/api.ts) so error handling and field-detail
 * surfacing stay consistent across modules. Don't reinvent the helper.
 */
import { apiFetch } from "@/lib/api";
import type { PrepareProgress } from "@/lib/api/manual-ingest";

// ─────────────────────────────────────────────────────────────────
// Shared types — mirror the BE wire format
// ─────────────────────────────────────────────────────────────────

// Phase I: the followup progress endpoint speaks the exact same wire shape
// as prepare-progress, so the FE reuses the type (and PrepareProgressBar).
export type FollowupProgress = PrepareProgress;

export const SUPPORTED_CHANNELS = [
  "whatsapp",
  "telegram",
  // F-A: LinkedIn is a real channel now (clipboard-only send).
  "linkedin",
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

// P3-3: mirrors the BE — "sent" is NOT client-editable (the sent transition
// belongs to recordSendIntent; a PATCH to status:"sent" now 400s server-side).
export const FOLLOWUP_EDITABLE_STATUSES = [
  "scheduled",
  "queued",
  "cancelled",
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
  // F-A: LinkedIn is clipboard-only; the profile deep link needs this URL.
  linkedinUrl: string | null;
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
// Internal helper — thin wrapper handling method + JSON body
// serialization on top of the canonical apiFetch.
// ─────────────────────────────────────────────────────────────────

function req<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  return apiFetch<T>(path, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
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
  return req("GET", `/api/followups?${params.toString()}`);
}

export function sendNextFollowup(
  prospectId: string,
  channel: SupportedChannel,
): Promise<SendNextFollowupResponse> {
  return req("POST", `/api/prospects/${prospectId}/send-next-followup`, {
    channel,
  });
}

export function patchFollowup(
  followupId: number,
  input: PatchFollowupInput,
): Promise<{ followup: Followup }> {
  return req("PATCH", `/api/followups/${followupId}`, input);
}

// Phase I: staged progress of an in-flight on-demand follow-up generation.
// Same shape as the Contacts prepare-progress endpoint (stage/pct/error);
// unknown, foreign, or expired ids return {stage:"idle"} — never an error.
export function getFollowupProgress(
  followupId: number,
): Promise<FollowupProgress> {
  return req("GET", `/api/followups/${followupId}/progress`);
}

export type SnoozePreset = "1d" | "3d" | "next_monday";

// The api-server returns only `{ followup }`; the new schedule is on the
// returned row (followup.scheduledAt) — there is no top-level `scheduledAt`.
export function snoozeFollowup(
  followupId: number,
  preset: SnoozePreset,
): Promise<{ followup: Followup }> {
  return req("POST", `/api/followups/${followupId}/snooze`, { preset });
}

export function bulkArchiveFollowups(
  input: BulkArchiveInput,
): Promise<BulkArchiveResponse> {
  return req("POST", "/api/followups/bulk/archive", input);
}

export function markProspectReplied(
  prospectId: string,
  repliedAt?: string,
): Promise<MarkRepliedResponse> {
  return req(
    "POST",
    `/api/prospects/${prospectId}/mark-replied`,
    repliedAt ? { repliedAt } : {},
  );
}

export function archiveProspect(
  prospectId: string,
): Promise<ArchiveProspectResponse> {
  return req("POST", `/api/prospects/${prospectId}/archive`);
}

export function bulkPauseProspects(
  input: BulkPauseInput,
): Promise<BulkPauseResponse> {
  return req("POST", "/api/prospects/bulk/pause", input);
}
