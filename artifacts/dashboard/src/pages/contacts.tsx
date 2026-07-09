import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle, Plus, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useProspectsList } from "@/hooks/use-prospects-list";
import {
  usePrepareFirstMessage,
  usePrepareProgress,
} from "@/hooks/use-manual-ingest";
import { AddManualContactDialog } from "@/components/followup/AddManualContactDialog";
import { BulkAddDialog } from "@/components/followup/BulkAddDialog";
import { PrepareProgressBar } from "@/components/followup/PrepareProgressBar";
import { Sparkles as SparklesIcon } from "lucide-react";
import {
  type ManualIngestChannel,
} from "@/lib/api/manual-ingest";
import { type ProspectListItem } from "@/lib/api/prospects";
import { type SendIntentChannel } from "@/lib/api/whatsapp";
import { ApiError } from "@/lib/api";
import {
  SendConfirmDialog,
  type PendingSendConfirm,
} from "@/components/SendConfirmDialog";
import { toastDuplicateContactError } from "@/lib/duplicateContactToast";
import { TestChannelMessage } from "@/components/TestChannelMessage";

const CHANNEL_LABEL: Record<ManualIngestChannel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  linkedin: "LinkedIn",
};

function statusLabel(status: ProspectListItem["status"]): string {
  switch (status) {
    case "ready":
      return "Ready to send";
    case "draft":
      return "Needs message";
    case "sent":
      return "First message sent";
    case "phone-pending":
      return "Waiting on phone";
    default:
      return status;
  }
}

function statusVariant(
  status: ProspectListItem["status"],
): "default" | "secondary" | "outline" | "destructive" {
  if (status === "ready") return "default";
  if (status === "sent") return "secondary";
  if (status === "draft") return "outline";
  return "outline";
}

export default function ContactsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState<ManualIngestChannel>("whatsapp");
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [pendingSend, setPendingSend] = useState<PendingSendConfirm | null>(
    null,
  );

  const list = useProspectsList({
    sourceMode: "manual",
    channel,
    perPage: 50,
    sortBy: "createdAt",
    sortDir: "desc",
  });
  const prepare = usePrepareFirstMessage();
  // Phase H: poll staged progress for the row currently being generated.
  const generateProgress = usePrepareProgress(generatingId);

  // Auto-generate the first message WITHOUT opening the chat (channel-agnostic
  // — works from the WhatsApp/Telegram/LinkedIn tabs alike). The staged
  // progress bar tracks the real backend pipeline while this runs.
  async function handleGenerate(prospect: ProspectListItem) {
    // A previous run of this same row may have parked the progress query on a
    // terminal ready/error entry, which stops its refetch interval for good —
    // a retry would then show a frozen bar while the server dutifully runs.
    // Reset restores initial state and restarts the polling loop.
    void queryClient.resetQueries({
      queryKey: ["prepare-progress", prospect.id],
    });
    setGeneratingId(prospect.id);
    try {
      await prepare.mutateAsync({
        prospectId: prospect.id,
        input: { channel },
      });
      // List refetch flips the row status to "ready"; the bar shows its
      // final "Ready" state until the SDR triggers another action.
      toast({
        title: "Message ready",
        description: `${prospect.prospectName ?? "Contact"} — click ${CHANNEL_LABEL[channel]} send when you're ready.`,
      });
    } catch (err) {
      // The POST never succeeded — there is no server-side run to poll (the
      // progress entry is either absent or terminal-error). Clear the id so
      // the disabled query stops polling instead of reading "idle" forever.
      setGeneratingId(null);
      if (!toastDuplicateContactError(err, toast)) {
        toast({
          title: "Could not generate message",
          description:
            err instanceof ApiError ? err.code ?? err.message : String(err),
          variant: "destructive",
        });
      }
    }
  }

  async function handlePrepareAndSend(prospect: ProspectListItem) {
    setPreparingId(prospect.id);
    try {
      const result = await prepare.mutateAsync({
        prospectId: prospect.id,
        input: { channel },
      });

      if (!result.deepLinkUrl) {
        toast({
          title: "Message ready but link unavailable",
          description: "Check geo restrictions or missing phone/handle.",
          variant: "destructive",
        });
        return;
      }

      setSendingId(prospect.id);
      // FE10: a blocked popup makes window.open return null. Don't open the
      // confirm dialog / record a pending send for a chat the user never saw —
      // that mis-records the send (prospect-detail/table already guard this).
      const chatWindow = window.open(
        result.deepLinkUrl,
        "_blank",
        "noopener,noreferrer",
      );
      if (!chatWindow) {
        setSendingId(null);
        toast({
          title: "Popup blocked",
          description: "Allow popups for this site, then try again.",
          variant: "destructive",
        });
        return;
      }
      setPendingSend({
        prospectId: prospect.id,
        followupId: null,
        channel: channel as SendIntentChannel,
      });
      setSendConfirmOpen(true);

      // C5: t.me/<handle>?text= often doesn't prefill the composer for plain
      // user handles — copy the message so the SDR can paste it. LinkedIn is
      // clipboard-only by design (no message-prefill deep link), so it always
      // copies too. Best-effort.
      if (
        (channel === "telegram" || channel === "linkedin") &&
        result.message
      ) {
        void navigator.clipboard.writeText(result.message).catch(() => {});
        toast({
          title: `Opening ${CHANNEL_LABEL[channel]} — message copied`,
          description:
            channel === "linkedin"
              ? `${prospect.prospectName ?? "Contact"}: LinkedIn can't prefill text — paste the copied message into the profile.`
              : `${prospect.prospectName ?? "Contact"}: Telegram may not prefill the text — paste it if the composer is empty.`,
        });
      } else {
        toast({
          title: "Opening chat",
          description: `${prospect.prospectName ?? "Contact"} — review the message and press send in ${CHANNEL_LABEL[channel]}.`,
        });
      }
    } catch (err) {
      if (!toastDuplicateContactError(err, toast)) {
        toast({
          title: "Could not prepare message",
          description:
            err instanceof ApiError ? err.code ?? err.message : String(err),
          variant: "destructive",
        });
      }
    } finally {
      setPreparingId(null);
      setSendingId(null);
    }
  }

  const rows = list.data?.prospects ?? [];

  return (
    <section className="space-y-6">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1
              className="text-2xl font-semibold tracking-tight flex items-center gap-2"
              data-testid="page-title"
            >
              <Sparkles className="h-6 w-6 text-[#4FFFE3]" />
              Contacts
            </h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              Add people you already know. Chat Followuper researches the
              company, writes the first message from doctrine, and queues
              follow-ups — you just press send.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={() => setAddOpen(true)}
              data-testid="contacts-add-button"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add contact
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBulkOpen(true)}
            >
              Add many
            </Button>
          </div>
        </div>

        <Tabs
          value={channel}
          onValueChange={(v) => setChannel(v as ManualIngestChannel)}
        >
          <TabsList>
            <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
            <TabsTrigger value="telegram">Telegram</TabsTrigger>
            <TabsTrigger value="linkedin">LinkedIn</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      {list.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : list.isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Could not load contacts.{" "}
            {list.error?.code ?? list.error?.message ?? ""}
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card
          className="border-dashed"
          style={{
            boxShadow:
              "0 0 0 1px rgba(0,245,212,.18), 0 0 24px rgba(0,245,212,.12)",
          }}
        >
          <CardContent className="p-10 text-center space-y-4">
            <MessageCircle className="h-10 w-10 mx-auto text-muted-foreground" />
            <div>
              <p className="font-medium">No {CHANNEL_LABEL[channel]} contacts yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add someone with their{" "}
                {channel === "linkedin"
                  ? "profile URL"
                  : "phone number"}{" "}
                and company — we handle the rest.
              </p>
            </div>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add your first contact
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <TestChannelMessage />

      {rows.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>
                  {channel === "telegram"
                    ? "Handle / phone"
                    : channel === "linkedin"
                      ? "Profile"
                      : "Phone"}
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const generating =
                  generatingId === row.id && prepare.isPending;
                // Single-flight for the message-only Generate: there is ONE
                // generatingId + ONE progress poller, so a second row's click
                // mid-run would overwrite the first row's id and silently
                // hide its progress bar. Gate other rows until the run ends.
                const generateElsewhere =
                  generatingId !== null &&
                  generatingId !== row.id &&
                  prepare.isPending;
                const busy =
                  preparingId === row.id || sendingId === row.id || generating;
                const hasId =
                  channel === "telegram"
                    ? !!(row.telegramHandle || row.phone)
                    : channel === "linkedin"
                      ? !!row.linkedinUrl
                      : !!row.phone;
                const canSend =
                  row.status !== "sent" &&
                  row.status !== "phone-pending" &&
                  hasId;
                // "Generate" (message-only) is offered while the row still
                // needs a message. Once ready/sent, the send button takes over.
                const canGenerate =
                  row.status === "draft" && !busy && !generateElsewhere;
                const showProgress = generatingId === row.id;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.prospectName ?? "—"}
                      {showProgress ? (
                        <PrepareProgressBar
                          progress={generateProgress.data}
                          className="mt-2 max-w-md"
                        />
                      ) : null}
                    </TableCell>
                    <TableCell>{row.company ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {channel === "telegram"
                        ? row.telegramHandle ?? row.phone ?? "—"
                        : channel === "linkedin"
                          ? row.linkedinUrl ?? "—"
                          : row.phone ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(row.status)}>
                        {statusLabel(row.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {row.status === "sent" ? (
                        <span className="text-xs text-muted-foreground">
                          In follow-up queue
                        </span>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          {canGenerate ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => handleGenerate(row)}
                              data-testid={`contacts-generate-${row.id}`}
                            >
                              {generating ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <SparklesIcon className="h-4 w-4 mr-1" />
                              )}
                              Generate
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            disabled={!canSend || busy}
                            onClick={() => handlePrepareAndSend(row)}
                          >
                            {busy ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4 mr-1" />
                            )}
                            {row.status === "ready"
                              ? "Send follow-up"
                              : "Generate & send"}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ) : null}

      <AddManualContactDialog
        channel={channel}
        open={addOpen}
        onOpenChange={setAddOpen}
        prepareAfterAdd
      />
      <BulkAddDialog
        channel={channel}
        open={bulkOpen}
        onOpenChange={setBulkOpen}
      />

      <SendConfirmDialog
        open={sendConfirmOpen}
        onOpenChange={(open) => {
          setSendConfirmOpen(open);
          if (!open) setPendingSend(null);
        }}
        pending={pendingSend}
        onRecorded={() => void list.refetch()}
        onError={(message) =>
          toast({
            title: "Could not record send",
            description: message,
            variant: "destructive",
          })
        }
      />
    </section>
  );
}