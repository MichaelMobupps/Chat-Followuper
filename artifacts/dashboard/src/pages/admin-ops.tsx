import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Shield, Users } from "lucide-react";
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
import { getAdminActivity, getAdminWhoami } from "@/lib/api/user-extras";

export default function AdminOpsPage() {
  const [, navigate] = useLocation();

  const whoami = useQuery({
    queryKey: ["admin-whoami"],
    queryFn: getAdminWhoami,
  });

  const activity = useQuery({
    queryKey: ["admin-activity"],
    queryFn: getAdminActivity,
    enabled: whoami.data?.isAdmin === true,
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
                    <div className="flex gap-2 text-xs">
                      <Badge variant="outline">
                        ${rep.totalSpendUsd.toFixed(2)} spend
                      </Badge>
                      <Badge variant="secondary">
                        {rep.recentEventCount} recent / {rep.totalEventCount}{" "}
                        total
                      </Badge>
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