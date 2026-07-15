import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertTriangle,
  Loader2,
  PauseCircle,
  PlayCircle,
  Shield,
  Users,
} from "lucide-react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  getAdminActivity,
  getAdminLlmSpend,
  getAdminWhoami,
  setAdminFollowupsPause,
} from "@/lib/api/user-extras";

export default function AdminOpsPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const whoami = useQuery({
    queryKey: ["admin-whoami"],
    queryFn: getAdminWhoami,
  });

  const activity = useQuery({
    queryKey: ["admin-activity"],
    queryFn: getAdminActivity,
    enabled: whoami.data?.isAdmin === true,
  });

  const spend = useQuery({
    queryKey: ["admin-llm-spend", 30],
    queryFn: () => getAdminLlmSpend(30),
    enabled: whoami.data?.isAdmin === true,
  });

  const pause = useMutation({
    mutationFn: ({ userId, paused }: { userId: string; paused: boolean }) =>
      setAdminFollowupsPause(userId, paused),
    onSuccess: (_res, vars) => {
      // Refetch rather than patch the cache: the toggle's whole purpose is to
      // reflect server state, and optimistically showing "paused" for a write
      // that silently failed is the one lie this control must never tell.
      void queryClient.invalidateQueries({ queryKey: ["admin-activity"] });
      toast({
        title: vars.paused ? "Follow-ups paused" : "Follow-ups resumed",
        description: vars.paused
          ? "Their follow-up sends and reminders stop now. First messages and the weekly stats email are unaffected."
          : "Their follow-ups will send again from the next digest.",
      });
    },
    onError: () => {
      toast({
        title: "Could not change pause state",
        description: "Nothing changed. Try again.",
        variant: "destructive",
      });
    },
  });

  if (whoami.isLoading) {
    return (
      <section className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </section>
    );
  }

  if (!whoami.data?.isAdmin) {
    return (
      <section className="space-y-4 max-w-lg">
        <Card>
          <CardContent className="p-8 text-center space-y-2">
            <Shield className="h-8 w-8 mx-auto text-muted-foreground" />
            <h1 className="text-lg font-semibold">Admin access required</h1>
            <p className="text-sm text-muted-foreground">
              This page is for managers only.
            </p>
            <button
              type="button"
              className="text-sm text-[#4FFFE3] hover:underline"
              onClick={() => navigate("/")}
            >
              Back to Today
            </button>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1
          className="text-2xl font-semibold tracking-tight flex items-center gap-2"
          data-testid="page-title"
        >
          <Shield className="h-6 w-6" />
          Ops dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Team activity, spend, and recent events across all reps.
        </p>
      </header>

      {spend.data && (
        <Card data-testid="card-llm-spend">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-baseline justify-between gap-4 flex-wrap">
              <div>
                <h2 className="font-semibold">LLM spend — last {spend.data.days} days</h2>
                <p className="text-xs text-muted-foreground">
                  Per-call ledger.{" "}
                  {spend.data.coverageStartsAt ? (
                    <>
                      Data starts{" "}
                      {format(new Date(spend.data.coverageStartsAt), "MMM d, yyyy")}{" "}
                      — earlier spend was never recorded per-model and cannot be
                      backfilled.
                    </>
                  ) : (
                    <>No calls recorded yet.</>
                  )}
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-semibold">
                  ${spend.data.totals.costUsd.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {spend.data.totals.calls} calls
                </div>
              </div>
            </div>

            {/* Both of these are shown, never folded into the total silently.
                An accounting view that hides what it can't explain reconciles
                to the wrong number and looks tidy doing it. */}
            {spend.data.unattributed.calls > 0 && (
              <div
                className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs"
                data-testid="warn-unattributed"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                <span>
                  <strong>${spend.data.unattributed.costUsd.toFixed(2)}</strong>{" "}
                  across {spend.data.unattributed.calls} call
                  {spend.data.unattributed.calls === 1 ? "" : "s"} could not be
                  attributed to a rep (included in the total above).
                </span>
              </div>
            )}
            {spend.data.totals.unpricedCalls > 0 && (
              <div
                className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs"
                data-testid="warn-unpriced"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                <span>
                  <strong>{spend.data.totals.unpricedCalls} call
                  {spend.data.totals.unpricedCalls === 1 ? "" : "s"}</strong> ran
                  on a model with no price entry and were booked at $0 — the total
                  above is an UNDER-count. Add the model to ANTHROPIC_PRICING.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">By model</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {spend.data.byModel.map((m) => (
                      <TableRow key={m.model}>
                        <TableCell className="text-xs font-mono">
                          {m.model}
                          {m.unpricedCalls > 0 && (
                            <span className="ml-1 text-destructive">(unpriced)</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-right">{m.calls}</TableCell>
                        <TableCell className="text-xs text-right">
                          ${m.costUsd.toFixed(4)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">By task</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {spend.data.byTask.map((t) => (
                      <TableRow key={t.task}>
                        <TableCell className="text-xs font-mono">{t.task}</TableCell>
                        <TableCell className="text-xs text-right">{t.calls}</TableCell>
                        <TableCell className="text-xs text-right">
                          ${t.costUsd.toFixed(4)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {activity.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading activity…
        </div>
      ) : activity.data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Total spend</div>
                <div className="text-2xl font-semibold">
                  ${activity.data.totals.spendUsd.toFixed(2)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Total events</div>
                <div className="text-2xl font-semibold">
                  {activity.data.totals.totalEventCount}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Events shown</div>
                <div className="text-2xl font-semibold">
                  {activity.data.totals.eventsShown}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    / cap {activity.data.eventCap}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            {activity.data.reps.map((rep) => (
              <Card key={rep.user.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">
                          {rep.user.name ?? rep.user.email}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {rep.user.email}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 text-xs items-center">
                      {rep.user.followupsPaused && (
                        <Badge
                          variant="destructive"
                          data-testid={`badge-paused-${rep.user.id}`}
                        >
                          Follow-ups paused
                        </Badge>
                      )}
                      <Badge variant="outline">
                        ${rep.totalSpendUsd.toFixed(2)} spend
                      </Badge>
                      <Badge variant="secondary">
                        {rep.recentEventCount} recent / {rep.totalEventCount}{" "}
                        total
                      </Badge>
                      <button
                        type="button"
                        data-testid={`button-pause-${rep.user.id}`}
                        disabled={pause.isPending}
                        className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                        onClick={() => {
                          const next = !rep.user.followupsPaused;
                          // Confirm only on PAUSE. Resuming is recoverable and
                          // restores the default; pausing silently stops another
                          // person's outreach, and they cannot see why or undo it.
                          if (
                            next &&
                            !window.confirm(
                              `Pause follow-ups for ${rep.user.email}?\n\nTheir follow-up sends and reminders stop immediately. They can't undo this themselves and won't be told who paused them.\n\nFirst messages and the weekly stats email keep working.`,
                            )
                          ) {
                            return;
                          }
                          pause.mutate({ userId: rep.user.id, paused: next });
                        }}
                      >
                        {rep.user.followupsPaused ? (
                          <>
                            <PlayCircle className="h-3.5 w-3.5" />
                            Resume
                          </>
                        ) : (
                          <>
                            <PauseCircle className="h-3.5 w-3.5" />
                            Pause
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {rep.events.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>When</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rep.events.slice(0, 10).map((e) => (
                          <TableRow key={e.id}>
                            <TableCell className="text-xs whitespace-nowrap">
                              {format(
                                new Date(e.executedAt),
                                "MMM d, HH:mm",
                              )}
                            </TableCell>
                            <TableCell className="text-xs font-mono">
                              {e.actionType}
                            </TableCell>
                            <TableCell className="text-xs">
                              {e.actionStatus}
                            </TableCell>
                            <TableCell className="text-xs text-right">
                              {e.costUsd != null
                                ? `$${e.costUsd.toFixed(4)}`
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No recent events.
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-destructive">Could not load admin activity.</p>
      )}
    </section>
  );
}