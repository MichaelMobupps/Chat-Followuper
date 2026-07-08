import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  AlarmClock,
  CalendarPlus,
  CheckCircle2,
  Copy,
  Layers,
  MessageCircle,
  Send,
  Pencil,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SendConfirmDialog } from "@/components/SendConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import {
  useListFollowups,
  useMarkProspectReplied,
  useSendNextFollowup,
  useSnoozeFollowup,
} from "@/hooks/use-followups";
import { type Followup, type SupportedChannel } from "@/lib/api/followups";
import { EditFollowupDialog } from "@/components/followup/EditFollowupDialog";
import { type SendIntentChannel } from "@/lib/api/whatsapp";
import { lintMessageLength } from "@/lib/messageLint";
import { googleCalendarFollowupUrl } from "@/lib/calendarLink";
import { cn } from "@/lib/utils";

type TodayChannel = SupportedChannel | "all";

type DueRow = {
  item: {
    prospect: {
      id: string;
      prospectName: string | null;
      company: string | null;
      phone: string | null;
      telegramHandle: string | null;
      followupPaused: boolean;
      replied: number;
      firstMessageBody: string | null;
    };
  };
  channel: SupportedChannel;
  next: Followup;
};

const CHANNEL_LABEL: Record<SupportedChannel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
};

type SnoozeOption = "1d" | "3d" | "next_monday";

function canOpenChat(
  channel: SupportedChannel,
  prospect: { phone: string | null; telegramHandle: string | null },
): boolean {
  if (channel === "telegram") {
    return !!(prospect.telegramHandle || prospect.phone);
  }
  return !!prospect.phone;
}

export default function TodayPage() {
  const { toast } = useToast();
  const [channel, setChannel] = useState<TodayChannel>("all");
  const [editing, setEditing] = useState<Followup | null>(null);
  const [editingOpen, setEditingOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [sendConfirmBulk, setSendConfirmBulk] = useState(false);
  const [pendingSend, setPendingSend] = useState<{
    prospectId: string;
    followupId: number;
    channel: SendIntentChannel;
  } | null>(null);
  const [bulkOpening, setBulkOpening] = useState(false);
  const bulkAbortRef = useRef(false);

  const waQuery = useListFollowups({
    channel: "whatsapp",
    status: "not_yet_sent",
    perPage: 100,
  });
  const tgQuery = useListFollowups({
    channel: "telegram",
    status: "not_yet_sent",
    perPage: 100,
  });
  const sendNext = useSendNextFollowup();
  const snoozeFollowup = useSnoozeFollowup();
  const markReplied = useMarkProspectReplied();

  const activeQuery =
    channel === "telegram" ? tgQuery : channel === "whatsapp" ? waQuery : null;

  const dueItems = useMemo((): DueRow[] => {
    const now = Date.now();
    const sources =
      channel === "all"
        ? [
            ...(waQuery.data?.items ?? []).map((item) => ({
              item,
              channel: "whatsapp" as SupportedChannel,
            })),
            ...(tgQuery.data?.items ?? []).map((item) => ({
              item,
              channel: "telegram" as SupportedChannel,
            })),
          ]
        : (activeQuery?.data?.items ?? []).map((item) => ({
            item,
            channel: channel as SupportedChannel,
          }));

    return sources
      .map(({ item, channel: ch }) => ({
        item,
        channel: ch,
        next: item.derived.nextScheduled,
      }))
      .filter((row) => {
        const next = row.next;
        return (
          next != null &&
          !row.item.prospect.followupPaused &&
          row.item.prospect.replied === 0 &&
          new Date(next.scheduledAt).getTime() <= now
        );
      })
      .map(
        (row): DueRow => ({
          item: row.item,
          channel: row.channel,
          next: row.next!,
        }),
      )
      .sort(
        (a, b) =>
          new Date(a.next.scheduledAt).getTime() -
          new Date(b.next.scheduledAt).getTime(),
      );
  }, [channel, waQuery.data, tgQuery.data, activeQuery?.data]);

  useEffect(() => {
    setFocusedIndex((i) =>
      dueItems.length === 0 ? 0 : Math.min(i, dueItems.length - 1),
    );
  }, [dueItems.length]);

  const isLoading =
    channel === "all"
      ? waQuery.isLoading || tgQuery.isLoading
      : (activeQuery?.isLoading ?? false);
  const isError =
    channel === "all"
      ? waQuery.isError && tgQuery.isError
      : (activeQuery?.isError ?? false);
  const error =
    channel === "all" ? waQuery.error ?? tgQuery.error : activeQuery?.error;
  // FE3: on the "All" tab a single-channel failure must not be hidden. isError
  // is a hard fail (BOTH failed); this flags the case where exactly one channel
  // errored so we can warn without blanking the channel that loaded — otherwise
  // an SDR reads an empty WhatsApp column as "nobody due" when it actually failed.
  const partialErrorChannel: "WhatsApp" | "Telegram" | null =
    channel === "all" && !(waQuery.isError && tgQuery.isError)
      ? waQuery.isError
        ? "WhatsApp"
        : tgQuery.isError
          ? "Telegram"
          : null
      : null;

  function refetch() {
    if (channel === "all" || channel === "whatsapp") void waQuery.refetch();
    if (channel === "all" || channel === "telegram") void tgQuery.refetch();
  }

  function openEdit(f: Followup) {
    setEditing(f);
    setEditingOpen(true);
  }

  const handleSend = useCallback(
    (
      prospectId: string,
      prospectName: string,
      sendChannel: SupportedChannel,
      followupId: number,
      message?: string,
    ) => {
      if (message) {
        const lint = lintMessageLength(message);
        if (lint.overLimit) {
          toast({
            title: "Message may be too long",
            description: lint.warning ?? undefined,
            variant: "destructive",
          });
        }
      }

      sendNext.mutate(
        { prospectId, channel: sendChannel },
        {
          onSuccess: (data) => {
            window.open(data.deepLinkUrl, "_blank", "noopener,noreferrer");
            setSendConfirmBulk(false);
            setPendingSend({
              prospectId,
              followupId,
              channel: sendChannel as SendIntentChannel,
            });
            // CH5: t.me/<handle>?text= often doesn't prefill the composer for
            // plain user handles (only bot deep links do), so the SDR can land
            // on an empty chat. Copy the message so they can paste it.
            if (sendChannel === "telegram" && message) {
              void navigator.clipboard.writeText(message).catch(() => {});
              toast({
                title: "Opening Telegram — message copied",
                description: `${prospectName}: Telegram may not prefill the text — paste it if the composer is empty.`,
              });
            } else {
              toast({
                title: `Opening ${CHANNEL_LABEL[sendChannel]}`,
                description: `${prospectName} · stage ${data.stage}`,
              });
            }
            setSendConfirmOpen(true);
            refetch();
          },
          onError: (err) => {
            toast({
              title: "Could not open the chat",
              description: err.code ?? err.message,
              variant: "destructive",
            });
          },
        },
      );
    },
    [sendNext, toast],
  );

  function copyMessage(text: string) {
    navigator.clipboard.writeText(text).then(
      () => toast({ title: "Message copied" }),
      () =>
        toast({
          title: "Could not copy",
          variant: "destructive",
        }),
    );
  }

  function handleSnooze(followupId: number, option: SnoozeOption) {
    snoozeFollowup.mutate(
      { followupId, preset: option },
      {
        onSuccess: (data) => {
          toast({
            title: "Snoozed",
            description: `Rescheduled to ${format(new Date(data.followup.scheduledAt), "MMM d, HH:mm")}`,
          });
          refetch();
        },
        onError: (err) => {
          toast({
            title: "Could not snooze",
            description: err.code ?? err.message,
            variant: "destructive",
          });
        },
      },
    );
  }

  function handleMarkReplied(prospectId: string, name: string) {
    markReplied.mutate(
      { prospectId },
      {
        onSuccess: () => {
          toast({ title: "Marked as replied", description: name });
          refetch();
        },
        onError: (err) => {
          toast({
            title: "Could not mark replied",
            description: err.code ?? err.message,
            variant: "destructive",
          });
        },
      },
    );
  }

  async function handleBulkOpen() {
    const openable = dueItems.filter(({ item, channel: ch }) =>
      canOpenChat(ch, item.prospect),
    );
    if (openable.length === 0) return;

    bulkAbortRef.current = false;
    setBulkOpening(true);

    // FE4: track REAL outcomes instead of reporting the pre-loop count as if
    // every send succeeded. Each open depends on an async per-send mutation, so
    // window.open runs outside the original click gesture — browsers block all
    // but the first tab. Detect that (window.open returns null) and report it
    // honestly rather than claiming N chats opened.
    let openedCount = 0;
    let blockedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < openable.length; i++) {
      if (bulkAbortRef.current) break;
      const { item, channel: ch, next } = openable[i];
      const name = item.prospect.prospectName ?? "(no name)";
      const message =
        next.generatedMessage ?? item.prospect.firstMessageBody ?? "";

      await new Promise<void>((resolve) => {
        sendNext.mutate(
          { prospectId: item.prospect.id, channel: ch },
          {
            onSuccess: (data) => {
              const win = window.open(
                data.deepLinkUrl,
                "_blank",
                "noopener,noreferrer",
              );
              if (win) {
                openedCount++;
                if (message) {
                  const lint = lintMessageLength(message);
                  if (lint.overLimit) {
                    toast({
                      title: `${name}: long message`,
                      description: lint.warning ?? undefined,
                    });
                  }
                }
              } else {
                blockedCount++;
              }
              resolve();
            },
            onError: () => {
              failedCount++;
              resolve();
            },
          },
        );
      });

      if (i < openable.length - 1 && !bulkAbortRef.current) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    setBulkOpening(false);
    setPendingSend(null);
    refetch();

    // Only enter the "did you send these?" confirm flow for chats that actually
    // opened — confirming blocked/failed ones would record sends the SDR never made.
    if (openedCount > 0) {
      setSendConfirmBulk(true);
      setSendConfirmOpen(true);
    }

    if (blockedCount > 0) {
      toast({
        title: "Some tabs were blocked",
        description: `Opened ${openedCount} of ${openable.length}; your browser blocked ${blockedCount}. Allow pop-ups for this site, then retry.`,
        variant: "destructive",
      });
    } else if (failedCount > 0) {
      toast({
        title: "Bulk open finished with errors",
        description: `Opened ${openedCount} of ${openable.length}. ${failedCount} failed — retry those.`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Bulk open complete",
        description: `Opened ${openedCount} chat${openedCount === 1 ? "" : "s"}. Press Send in each app.`,
      });
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }
      if (dueItems.length === 0) return;

      const row = dueItems[focusedIndex];
      if (!row) return;

      const name = row.item.prospect.prospectName ?? "(no name)";
      const message =
        row.next.generatedMessage ?? row.item.prospect.firstMessageBody ?? "";

      switch (e.key) {
        case "j":
          e.preventDefault();
          setFocusedIndex((i) => Math.min(i + 1, dueItems.length - 1));
          break;
        case "k":
          e.preventDefault();
          setFocusedIndex((i) => Math.max(i - 1, 0));
          break;
        case "o":
          e.preventDefault();
          if (canOpenChat(row.channel, row.item.prospect)) {
            handleSend(
              row.item.prospect.id,
              name,
              row.channel,
              row.next.id,
              message,
            );
          }
          break;
        case "c":
          e.preventDefault();
          if (message) copyMessage(message);
          break;
        case "r":
          e.preventDefault();
          handleMarkReplied(row.item.prospect.id, name);
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dueItems, focusedIndex, handleSend]);

  return (
    <section className="space-y-6">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1
              className="text-2xl font-semibold tracking-tight"
              data-testid="page-title"
            >
              Today
            </h1>
            <p className="text-sm text-muted-foreground">
              Follow-ups due now. Add new contacts from{" "}
              <a href="/contacts" className="text-[#4FFFE3] hover:underline">
                Contacts
              </a>
              .{" "}
              <span className="text-xs">
                Keys: <kbd className="px-1 rounded bg-muted">j</kbd>/
                <kbd className="px-1 rounded bg-muted">k</kbd> navigate,{" "}
                <kbd className="px-1 rounded bg-muted">o</kbd> open,{" "}
                <kbd className="px-1 rounded bg-muted">c</kbd> copy,{" "}
                <kbd className="px-1 rounded bg-muted">r</kbd> replied
              </span>
            </p>
          </div>
          {dueItems.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleBulkOpen()}
              disabled={bulkOpening || sendNext.isPending}
              data-testid="bulk-open"
            >
              <Layers className="mr-1 h-3.5 w-3.5" />
              {bulkOpening ? "Opening…" : `Open all (${dueItems.length})`}
            </Button>
          ) : null}
        </div>
        <Tabs
          value={channel}
          onValueChange={(v) => setChannel(v as TodayChannel)}
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
            <TabsTrigger value="telegram">Telegram</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      {partialErrorChannel ? (
        <Card className="border-amber-500/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs text-amber-600 dark:text-amber-400">
            <span className="flex items-center gap-2" role="alert">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Couldn't load {partialErrorChannel} follow-ups — showing the ones
              that loaded.
            </span>
            <Button variant="outline" size="sm" onClick={refetch}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            <p>
              Could not load your queue. {error?.code ?? error?.message ?? ""}
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={refetch}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : dueItems.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Nothing due right now for{" "}
            {channel === "all" ? "any channel" : CHANNEL_LABEL[channel]}.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3" data-testid="today-queue">
          {dueItems.map(({ item, channel: ch, next }, idx) => {
            const f = next;
            const name = item.prospect.prospectName ?? "(no name)";
            const message =
              f.generatedMessage ?? item.prospect.firstMessageBody ?? "";
            const openEnabled = canOpenChat(ch, item.prospect);
            const lint = message ? lintMessageLength(message) : null;
            const focused = idx === focusedIndex;

            return (
              <Card
                key={`${ch}-${item.prospect.id}`}
                data-testid="today-row"
                className={cn(
                  "transition-colors",
                  focused && "ring-2 ring-[#00F5D4]/50",
                )}
                onClick={() => setFocusedIndex(idx)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {name}
                        {item.prospect.company ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {item.prospect.company}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MessageCircle className="h-3 w-3" />{" "}
                        {CHANNEL_LABEL[ch]} · stage {f.stage} · due{" "}
                        {format(new Date(f.scheduledAt), "MMM d, HH:mm")}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={snoozeFollowup.isPending}
                          >
                            <AlarmClock className="mr-1 h-3.5 w-3.5" /> Snooze
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleSnooze(f.id, "1d")}
                          >
                            1 day
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleSnooze(f.id, "3d")}
                          >
                            3 days
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              handleSnooze(f.id, "next_monday")
                            }
                          >
                            Next Monday (9:00)
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          handleMarkReplied(item.prospect.id, name)
                        }
                        disabled={markReplied.isPending}
                      >
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Replied
                      </Button>
                      {message ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyMessage(message)}
                        >
                          <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const url = googleCalendarFollowupUrl({
                            title: `Follow up: ${name}`,
                            scheduledAt: f.scheduledAt,
                            details: message || undefined,
                          });
                          window.open(url, "_blank", "noopener,noreferrer");
                        }}
                      >
                        <CalendarPlus className="mr-1 h-3.5 w-3.5" /> Calendar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(f)}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          handleSend(
                            item.prospect.id,
                            name,
                            ch,
                            f.id,
                            message,
                          )
                        }
                        disabled={sendNext.isPending || !openEnabled}
                      >
                        <Send className="mr-1 h-3.5 w-3.5" /> Open in{" "}
                        {CHANNEL_LABEL[ch]}
                      </Button>
                    </div>
                  </div>
                  {message ? (
                    <div className="space-y-1">
                      {lint?.overLimit ? (
                        <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3" />
                          {lint.warning}
                        </p>
                      ) : null}
                      <p className="whitespace-pre-wrap border-l-2 border-border pl-3 text-sm text-muted-foreground line-clamp-3">
                        {message}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm italic text-muted-foreground">
                      Message will be generated when you open the chat.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <EditFollowupDialog
        open={editingOpen}
        onOpenChange={(o) => {
          setEditingOpen(o);
          if (!o) setEditing(null);
        }}
        followup={editing}
      />

      <SendConfirmDialog
        open={sendConfirmOpen}
        onOpenChange={(open) => {
          setSendConfirmOpen(open);
          if (!open) {
            setPendingSend(null);
            setSendConfirmBulk(false);
          }
        }}
        pending={pendingSend}
        bulkMode={sendConfirmBulk}
        onRecorded={() => refetch()}
        onError={(message) =>
          toast({ title: "Could not record send", description: message, variant: "destructive" })
        }
      />
    </section>
  );
}