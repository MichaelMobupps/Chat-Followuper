/**
 * Generic channel follow-up page — Ticket 2.5-FE.
 *
 * One implementation; pages/followup/whatsapp.tsx and the future
 * telegram/teams/slack pages each render <ChannelFollowupPage
 * channel="..." />. Mirrors the BE's channel-parameterized router.
 *
 * Sends the deep link via window.open for the WhatsApp path; for other
 * channels the BE returns 501 channel_send_not_implemented today, and
 * the toast surfaces that code directly. The user-visible action is
 * always the same shape: click → either a tab opens or an error explains
 * why it can't.
 */
import { useMemo, useState } from "react";
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
  useListFollowups,
  useMarkProspectReplied,
  useSendNextFollowup,
} from "@/hooks/use-followups";
import {
  LIST_STATUSES,
  type Followup,
  type FollowupListItem,
  type ListStatus,
  type SupportedChannel,
} from "@/lib/api/followups";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { EditFollowupDialog } from "./EditFollowupDialog";
import { BulkToolbar } from "./BulkToolbar";
import { SequenceConfigPanel } from "./SequenceConfigPanel";
import { ManualContactsSection } from "./ManualContactsSection";

const CHANNEL_LABEL: Record<SupportedChannel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  teams: "Teams",
  slack: "Slack",
};

const CHANNEL_ICON: Record<SupportedChannel, typeof MessageCircle> = {
  whatsapp: MessageCircle,
  telegram: Send,
  teams: Send,
  slack: Send,
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
  const [status, setStatus] = useState<ListStatus>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Followup | null>(null);
  const [editingOpen, setEditingOpen] = useState(false);
  const [rowConfirm, setRowConfirm] = useState<RowConfirm | null>(null);

  const query = useListFollowups({ channel, status, perPage: 50 });
  const sendNext = useSendNextFollowup();
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

  function handleSendNext(prospectId: string, prospectName: string) {
    sendNext.mutate(
      { prospectId, channel },
      {
        onSuccess: (data) => {
          // Open the deep link in a new tab. The BE doesn't mark sentAt
          // here; the send-intent endpoint (or a future click-observer
          // worker) does. Same model as the stage-0 wa.me flow.
          window.open(data.deepLinkUrl, "_blank", "noopener,noreferrer");
          toast({
            title: `Opened in ${CHANNEL_LABEL[channel]}`,
            description: `${prospectName} · stage ${data.stage}`,
          });
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
        Manual Contacts is channel-parameterized as of ticket-2-9.
        The section's own toggle state (per-user, per-channel) governs
        whether the Add button shows; rendering here is unconditional.
      */}
      {/**
       * Manual Contacts supports whatsapp + telegram as of ticket-2-9.
       * Other channels do not have manual ingest yet.
       */}
      {(channel === "whatsapp" || channel === "telegram") && (
        <ManualContactsSection channel={channel} />
      )}

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
                  onSendNext={() =>
                    handleSendNext(
                      item.prospect.id,
                      item.prospect.prospectName ?? "(no name)",
                    )
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
}: RowProps) {
  const { prospect, derived } = item;
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
