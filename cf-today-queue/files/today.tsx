import { useMemo, useState } from "react";
import { format } from "date-fns";
import { MessageCircle, Send, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useListFollowups, useSendNextFollowup } from "@/hooks/use-followups";
import { type Followup } from "@/lib/api/followups";
import { EditFollowupDialog } from "@/components/followup/EditFollowupDialog";

/**
 * Today — the daily queue of follow-ups that are due right now.
 *
 * Reuses the same list, send, and edit machinery as the Follow-up screen,
 * filtered to items whose next scheduled follow-up has reached its send time.
 * Scoped to WhatsApp, the channel whose send path is wired; other channels
 * join here once their send is implemented. Each row opens WhatsApp with the
 * message prefilled, and the rep presses send.
 */
export default function TodayPage() {
  const { toast } = useToast();
  const [editing, setEditing] = useState<Followup | null>(null);
  const [editingOpen, setEditingOpen] = useState(false);

  // The list is server-paginated and ordered by updated time, and the
  // "due now" filter runs on the client, so we fetch the server's max page
  // (100) to cover the queue. Beyond 100 unsent prospects, a backend
  // due-query ordered by scheduled time is the proper fix.
  const query = useListFollowups({
    channel: "whatsapp",
    status: "not_yet_sent",
    perPage: 100,
  });
  const sendNext = useSendNextFollowup();

  const dueItems = useMemo(() => {
    const now = Date.now();
    return (query.data?.items ?? [])
      .map((item) => ({ item, next: item.derived.nextScheduled }))
      .filter(
        ({ item, next }) =>
          next != null &&
          !item.prospect.followupPaused &&
          item.prospect.replied === 0 &&
          new Date(next.scheduledAt).getTime() <= now,
      )
      .sort(
        (a, b) =>
          new Date(a.next!.scheduledAt).getTime() -
          new Date(b.next!.scheduledAt).getTime(),
      );
  }, [query.data]);

  function openEdit(f: Followup) {
    setEditing(f);
    setEditingOpen(true);
  }

  function handleSend(prospectId: string, prospectName: string) {
    sendNext.mutate(
      { prospectId, channel: "whatsapp" },
      {
        onSuccess: (data) => {
          window.open(data.deepLinkUrl, "_blank", "noopener,noreferrer");
          toast({
            title: "Opening WhatsApp",
            description: `${prospectName} · stage ${data.stage}`,
          });
        },
        onError: (err) => {
          toast({
            title: "Could not open the chat",
            description: err.code ?? err.message,
          });
        },
      },
    );
  }

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1
          className="text-2xl font-semibold tracking-tight"
          data-testid="page-title"
        >
          Today
        </h1>
        <p className="text-sm text-muted-foreground">
          Your prioritized queue of WhatsApp follow-ups due now.
        </p>
      </header>

      {query.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : query.isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            <p>
              Could not load your queue.{" "}
              {query.error?.code ?? query.error?.message ?? ""}
            </p>
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => query.refetch()}
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : dueItems.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Nothing due right now. When a follow-up reaches its send time, it
            appears here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3" data-testid="today-queue">
          {dueItems.map(({ item, next }) => {
            const f = next as Followup;
            const name = item.prospect.prospectName ?? "(no name)";
            const message =
              f.generatedMessage ?? item.prospect.firstMessageBody ?? "";
            return (
              <Card key={item.prospect.id} data-testid="today-row">
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
                        <MessageCircle className="h-3 w-3" /> WhatsApp · stage{" "}
                        {f.stage} · due{" "}
                        {format(new Date(f.scheduledAt), "MMM d, HH:mm")}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(f)}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSend(item.prospect.id, name)}
                        disabled={sendNext.isPending || !item.prospect.phone}
                      >
                        <Send className="mr-1 h-3.5 w-3.5" /> Open in WhatsApp
                      </Button>
                    </div>
                  </div>
                  {message ? (
                    <p className="whitespace-pre-wrap border-l-2 border-border pl-3 text-sm text-muted-foreground line-clamp-3">
                      {message}
                    </p>
                  ) : (
                    <p className="text-sm italic text-muted-foreground">
                      No message generated yet.
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
    </section>
  );
}
