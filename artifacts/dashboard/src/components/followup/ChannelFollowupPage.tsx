/**
 * Generic channel follow-up page — Ticket 2.5-FE.
 *
 * One implementation; pages/followup/whatsapp.tsx and
 * pages/followup/telegram.tsx each render <ChannelFollowupPage
 * channel="..." />. Mirrors the BE's channel-parameterized router.
 *
 * Sends the deep link via window.open. The user-visible action is always
 * the same shape: click → either a tab opens or an error explains why it
 * can't.
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowRight,
  MessageCircle,
  Send,
  Check,
  Pencil,
  Trash2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  // F-A: LinkedIn channel icon.
  Linkedin,
  // F-B: per-stage schedule expand toggle.
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  useArchiveProspect,
  useBulkPauseProspects,
  useFollowupProgress,
  useListFollowups,
  useMarkProspectReplied,
  useSendNextFollowup,
} from "@/hooks/use-followups";
import {
  LIST_STATUSES,
  type Followup,
  type FollowupListItem,
  type FollowupProgress,
  type ListStatus,
  type SupportedChannel,
} from "@/lib/api/followups";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { EditFollowupDialog } from "./EditFollowupDialog";
import { PrepareProgressBar } from "./PrepareProgressBar";
import { BulkToolbar } from "./BulkToolbar";
import { SequenceConfigPanel } from "./SequenceConfigPanel";

const CHANNEL_LABEL: Record<SupportedChannel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  // F-A: LinkedIn label.
  linkedin: "LinkedIn",
};

const CHANNEL_ICON: Record<SupportedChannel, typeof MessageCircle> = {
  whatsapp: MessageCircle,
  telegram: Send,
  // F-A: LinkedIn icon.
  linkedin: Linkedin,
};

const STATUS_TAB_LABEL: Record<ListStatus, string> = {
  all: "All",
  not_yet_sent: "Not yet sent",
  sent: "Sent",
  replied: "Replied",
  no_reply: "No reply",
  paused: "Paused",
};

interface RowConfirm {
  kind: "mark_replied" | "archive";
  prospectId: string;
  prospectName: string;
}

interface Props {
  channel: SupportedChannel;
}

export function ChannelFollowupPage({ channel }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ListStatus>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Followup | null>(null);
  const [editingOpen, setEditingOpen] = useState(false);
  const [rowConfirm, setRowConfirm] = useState<RowConfirm | null>(null);
  // Phase I: the followup row whose message is being generated right now —
  // drives the staged progress bar. send-next is single-flight (the whole
  // table's actions share `busy`), so one slot is enough.
  const [generatingFollowup, setGeneratingFollowup] = useState<{
    prospectId: string;
    followupId: number;
  } | null>(null);

  const query = useListFollowups({ channel, status, perPage: 50 });
  const sendNext = useSendNextFollowup();
  const followupProgress = useFollowupProgress(
    generatingFollowup?.followupId ?? null,
  );
  const markReplied = useMarkProspectReplied();
  const archive = useArchiveProspect();
  const pauseOne = useBulkPauseProspects();

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;

  const allVisibleIds = useMemo(() => items.map((i) => i.prospect.id), [items]);
  const allChecked =
    allVisibleIds.length > 0 &&
    allVisibleIds.every((id) => selected.has(id));
  const someChecked =
    !allChecked && allVisibleIds.some((id) => selected.has(id));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        for (const id of allVisibleIds) next.delete(id);
      } else {
        for (const id of allVisibleIds) next.add(id);
      }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openEdit(f: Followup) {
    setEditing(f);
    setEditingOpen(true);
  }

  function handleSendNext(item: FollowupListItem) {
    const prospectId = item.prospect.id;
    const prospectName = item.prospect.prospectName ?? "(no name)";
    // Phase I: the BE resolves "next" as the lowest scheduled unsent stage —
    // the list response already carries that row (derived.nextScheduled), so
    // we know which followupId to poll BEFORE the request returns. Only poll
    // when generation will actually run (no message stored yet); a cached
    // message returns in one round-trip with nothing to watch.
    const next = item.derived.nextScheduled;
    if (next && !next.generatedMessage?.trim()) {
      // A previous run may have parked this query on a terminal ready/error
      // entry, which stops its refetch interval for good — reset restarts it.
      void queryClient.resetQueries({
        queryKey: ["followup-progress", next.id],
      });
      setGeneratingFollowup({ prospectId, followupId: next.id });
    }
    sendNext.mutate(
      { prospectId, channel },
      {
        onSettled: () => {
          // Request finished (chat opened or toast shown) — stop polling.
          // The disabled query drops its interval; state clears the bar.
          setGeneratingFollowup(null);
        },
        onSuccess: (data) => {
          // Open the deep link in a new tab. The BE doesn't mark sentAt
          // here; the send-intent endpoint (or a future click-observer
          // worker) does. Same model as the stage-0 wa.me flow.
          window.open(data.deepLinkUrl, "_blank", "noopener,noreferrer");
          // CH5: Telegram t.me/<handle>?text= often doesn't prefill the composer
          // for plain user handles — copy the message so the SDR can paste it.
          // F-A: LinkedIn is clipboard-only (no message prefill deep link), so it
          // takes the same copy-to-clipboard branch as Telegram.
          if (
            (channel === "telegram" || channel === "linkedin") &&
            data.generatedMessage
          ) {
            void navigator.clipboard.writeText(data.generatedMessage).catch(() => {});
            toast({
              title: `Opened ${CHANNEL_LABEL[channel]} — message copied`,
              description: `${prospectName}: paste it into ${CHANNEL_LABEL[channel]} if the composer is empty.`,
            });
          } else {
            toast({
              title: `Opened in ${CHANNEL_LABEL[channel]}`,
              description: `${prospectName} · stage ${data.stage}`,
            });
          }
        },
        onError: (err) => {
          const apiCode = err instanceof ApiError ? err.code : undefined;
          // Map a couple of common BE error codes to friendlier descriptions.
          const description =
            apiCode === "channel_send_not_implemented"
              ? `Send for ${CHANNEL_LABEL[channel]} is not wired yet.`
              : apiCode === "no_scheduled_followup"
                ? "No follow-up stages remain for this prospect."
                : apiCode === "message_not_generated"
                  ? "The follow-up message has not been generated yet."
                  : apiCode === "phone_reveal_pending"
                    ? "Apollo phone reveal has not arrived yet."
                    : apiCode === "no_telegram_identifier" || apiCode === "no_telegram_handle"
                      ? "No Telegram handle or phone number for this prospect."
                    : apiCode === "no_linkedin_identifier"
                      ? "No LinkedIn profile URL for this prospect."
                      : apiCode === "no_phone"
                        ? "No phone number for this prospect."
                        : apiCode === "prospect_paused"
                        ? "This prospect is paused. Resume to send."
                        : apiCode === "prospect_replied"
                          ? "This prospect already replied."
                          : err instanceof ApiError
                            ? `${err.status} ${apiCode ?? err.message}`
                            : (err as Error).message;
          toast({
            title: "Could not send next follow-up",
            description,
          });
        },
      },
    );
  }

  function handleMarkReplied(prospectId: string) {
    markReplied.mutate(
      { prospectId },
      {
        onSuccess: (data) => {
          toast({
            title: data.alreadyReplied
              ? "Already marked as replied"
              : "Marked as replied",
            description:
              data.cancelledFollowups > 0
                ? `${data.cancelledFollowups} scheduled follow-up(s) cancelled.`
                : undefined,
          });
          setRowConfirm(null);
        },
        onError: (err) => {
          toast({
            title: "Could not mark replied",
            description:
              err instanceof ApiError
                ? `${err.status} ${err.code ?? err.message}`
                : (err as Error).message,
          });
          setRowConfirm(null);
        },
      },
    );
  }

  function handleArchive(prospectId: string) {
    archive.mutate(
      { prospectId },
      {
        onSuccess: () => {
          toast({ title: "Prospect archived" });
          setSelected((prev) => {
            const next = new Set(prev);
            next.delete(prospectId);
            return next;
          });
          setRowConfirm(null);
        },
        onError: (err) => {
          toast({
            title: "Archive failed",
            description:
              err instanceof ApiError
                ? `${err.status} ${err.code ?? err.message}`
                : (err as Error).message,
          });
          setRowConfirm(null);
        },
      },
    );
  }

  function handleTogglePause(prospectId: string, currentPaused: boolean) {
    pauseOne.mutate(
      { prospectIds: [prospectId], paused: !currentPaused },
      {
        onSuccess: () => {
          toast({
            title: currentPaused ? "Resumed" : "Paused",
          });
        },
        onError: (err) => {
          toast({
            title: "Update failed",
            description:
              err instanceof ApiError
                ? `${err.status} ${err.code ?? err.message}`
                : (err as Error).message,
          });
        },
      },
    );
  }

  const Icon = CHANNEL_ICON[channel];

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Follow up</span>
          <ArrowRight className="h-3 w-3" />
          <Icon className="h-3 w-3" />
          <span>{CHANNEL_LABEL[channel]}</span>
        </div>
        <div className="flex items-center justify-between">
          <h1
            className="text-2xl font-semibold tracking-tight"
            data-testid="page-title"
          >
            Follow up on {CHANNEL_LABEL[channel]}
          </h1>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              data-testid="refresh-list"
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4 mr-2",
                  query.isFetching && "animate-spin",
                )}
              />
              Refresh
            </Button>
            <SequenceConfigPanel />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {total} prospect{total === 1 ? "" : "s"} in the current view.
        </p>
      </header>

      {/*
        F-E: manual per-channel seeding was removed from the Follow-ups page.
        Bulk contact seeding now lives in the Contacts page (Add many → phone
        bulk). The per-channel manual-ingest toggle endpoint is left dormant.
      */}

      <Tabs
        value={status}
        onValueChange={(v) => {
          setStatus(v as ListStatus);
          setSelected(new Set());
        }}
      >
        <TabsList>
          {LIST_STATUSES.map((s) => (
            <TabsTrigger
              key={s}
              value={s}
              data-testid={`status-tab-${s}`}
            >
              {STATUS_TAB_LABEL[s]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <BulkToolbar
        channel={channel}
        status={status}
        selectedProspectIds={[...selected]}
        onClearSelection={() => setSelected(new Set())}
      />

      {query.isLoading ? (
        <Card>
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </CardContent>
        </Card>
      ) : query.isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            Could not load follow-ups:{" "}
            {query.error instanceof ApiError
              ? query.error.code ?? query.error.message
              : (query.error as Error).message}
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-sm text-muted-foreground text-center">
            No prospects in this view.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table data-testid="followups-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={
                      allChecked
                        ? true
                        : someChecked
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={toggleAll}
                    data-testid="select-all"
                    aria-label="Select all visible"
                  />
                </TableHead>
                <TableHead>Prospect</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Message preview</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <FollowupRow
                  key={item.prospect.id}
                  item={item}
                  checked={selected.has(item.prospect.id)}
                  onToggle={() => toggleOne(item.prospect.id)}
                  onSendNext={() => handleSendNext(item)}
                  progress={
                    generatingFollowup?.prospectId === item.prospect.id
                      ? followupProgress.data
                      : undefined
                  }
                  onEdit={() => {
                    const target =
                      item.derived.nextScheduled ?? item.followups[0];
                    if (target) openEdit(target);
                  }}
                  onMarkReplied={() =>
                    setRowConfirm({
                      kind: "mark_replied",
                      prospectId: item.prospect.id,
                      prospectName:
                        item.prospect.prospectName ?? "this prospect",
                    })
                  }
                  onTogglePause={() =>
                    handleTogglePause(
                      item.prospect.id,
                      item.prospect.followupPaused,
                    )
                  }
                  onArchive={() =>
                    setRowConfirm({
                      kind: "archive",
                      prospectId: item.prospect.id,
                      prospectName:
                        item.prospect.prospectName ?? "this prospect",
                    })
                  }
                  busy={
                    sendNext.isPending ||
                    markReplied.isPending ||
                    archive.isPending ||
                    pauseOne.isPending
                  }
                />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <EditFollowupDialog
        open={editingOpen}
        onOpenChange={(o) => {
          setEditingOpen(o);
          if (!o) setEditing(null);
        }}
        followup={editing}
      />

      <AlertDialog
        open={rowConfirm !== null}
        onOpenChange={(o) => {
          if (!o) setRowConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {rowConfirm?.kind === "mark_replied"
                ? `Mark ${rowConfirm.prospectName} as replied?`
                : `Archive ${rowConfirm?.prospectName ?? ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {rowConfirm?.kind === "mark_replied"
                ? "Remaining scheduled follow-ups will be cancelled. This cannot be undone."
                : "Hard delete. Follow-ups and conversation history are removed too."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!rowConfirm) return;
                if (rowConfirm.kind === "mark_replied") {
                  handleMarkReplied(rowConfirm.prospectId);
                } else {
                  handleArchive(rowConfirm.prospectId);
                }
              }}
            >
              {rowConfirm?.kind === "mark_replied"
                ? "Mark replied"
                : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────
// Row
// ─────────────────────────────────────────────────────────────────

interface RowProps {
  item: FollowupListItem;
  checked: boolean;
  onToggle: () => void;
  onSendNext: () => void;
  onEdit: () => void;
  onMarkReplied: () => void;
  onTogglePause: () => void;
  onArchive: () => void;
  busy: boolean;
  /** Phase I: staged progress of this row's in-flight generation (if any). */
  progress?: FollowupProgress;
}

function FollowupRow({
  item,
  checked,
  onToggle,
  onSendNext,
  onEdit,
  onMarkReplied,
  onTogglePause,
  onArchive,
  busy,
  progress,
}: RowProps) {
  const { prospect, derived } = item;
  // F-B: the list response already carries every stage row per prospect, so we
  // can show a compact per-stage schedule without an extra request.
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const stageRows = [...item.followups].sort((a, b) => a.stage - b.stage);
  const next = derived.nextScheduled;
  const last = derived.lastSent;
  const showStage = next?.stage ?? last?.stage ?? null;
  const scheduledAt = next?.scheduledAt ?? null;
  const messagePreview =
    next?.generatedMessage ?? last?.generatedMessage ?? prospect.firstMessageBody ?? "";
  const canSendNext =
    derived.uiStatus !== "replied" &&
    derived.uiStatus !== "paused" &&
    derived.uiStatus !== "no_reply" &&
    next !== null;

  return (
    <TableRow data-testid={`row-${prospect.id}`}>
      <TableCell>
        <Checkbox
          checked={checked}
          onCheckedChange={onToggle}
          data-testid={`row-select-${prospect.id}`}
          aria-label={`Select ${prospect.prospectName ?? "prospect"}`}
        />
      </TableCell>
      <TableCell>
        <div className="font-medium">
          {prospect.prospectName ?? <span className="text-muted-foreground">(no name)</span>}
        </div>
        <div className="text-xs text-muted-foreground">
          {[prospect.title, prospect.company].filter(Boolean).join(" · ") ||
            "—"}
        </div>
        {/* Phase I: staged progress while this row's follow-up generates. */}
        {progress ? (
          <PrepareProgressBar progress={progress} className="mt-2 max-w-md" />
        ) : null}
        {/* F-B: compact expandable per-stage schedule. */}
        {stageRows.length > 0 ? (
          <div className="mt-1">
            <button
              type="button"
              onClick={() => setScheduleOpen((o) => !o)}
              className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              data-testid={`row-schedule-toggle-${prospect.id}`}
              aria-expanded={scheduleOpen}
            >
              {scheduleOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Schedule ({stageRows.length})
            </button>
            {scheduleOpen ? (
              <ul
                className="mt-1 space-y-0.5 text-[11px] text-muted-foreground"
                data-testid={`row-schedule-${prospect.id}`}
              >
                {stageRows.map((f) => (
                  <li key={f.id}>
                    Stage {f.stage} · {format(new Date(f.scheduledAt), "MMM d")} ·{" "}
                    {f.status}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </TableCell>
      <TableCell>
        <StatusBadge status={derived.uiStatus} />
      </TableCell>
      <TableCell>
        <span className="text-sm">
          {showStage !== null
            ? `${showStage} of ${derived.maxFollowups}`
            : `0 of ${derived.maxFollowups}`}
        </span>
      </TableCell>
      <TableCell>
        <span className="text-sm">
          {scheduledAt
            ? format(new Date(scheduledAt), "MMM d, HH:mm")
            : "—"}
        </span>
      </TableCell>
      <TableCell>
        <div
          className="max-w-xs truncate text-sm text-muted-foreground"
          title={messagePreview}
        >
          {messagePreview || "(no message yet)"}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="default"
            onClick={onSendNext}
            disabled={busy || !canSendNext}
            data-testid={`row-send-${prospect.id}`}
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            Send next
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onEdit}
            disabled={busy || (next === null && last === null)}
            data-testid={`row-edit-${prospect.id}`}
            aria-label="Edit follow-up"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onMarkReplied}
            disabled={busy || prospect.replied === 1}
            data-testid={`row-replied-${prospect.id}`}
            aria-label="Mark replied"
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onTogglePause}
            disabled={busy}
            data-testid={`row-pause-${prospect.id}`}
            aria-label={
              prospect.followupPaused ? "Resume" : "Pause"
            }
          >
            {prospect.followupPaused ? (
              <PlayCircle className="h-3.5 w-3.5" />
            ) : (
              <PauseCircle className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onArchive}
            disabled={busy}
            data-testid={`row-archive-${prospect.id}`}
            aria-label="Archive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
