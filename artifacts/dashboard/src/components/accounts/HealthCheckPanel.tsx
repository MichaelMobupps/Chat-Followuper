import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getHealthCheck } from "@/lib/api/user-extras";

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  ok: "default",
  degraded: "secondary",
  error: "destructive",
};

export function HealthCheckPanel() {
  const health = useQuery({
    queryKey: ["health-check"],
    queryFn: getHealthCheck,
    staleTime: 30_000,
  });

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-base font-medium">
              <Activity className="h-4 w-4" />
              System health
            </h2>
            <p className="text-xs text-muted-foreground">
              Live checks for API, database, and integrations.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void health.refetch()}
            disabled={health.isFetching}
            data-testid="health-refresh"
          >
            {health.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Refresh"
            )}
          </Button>
        </div>

        {health.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Running checks…
          </div>
        ) : health.isError ? (
          <p className="text-sm text-destructive">
            Could not load health check. The endpoint may not be deployed yet.
          </p>
        ) : health.data ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Overall</span>
              <Badge variant={STATUS_VARIANT[health.data.status] ?? "outline"}>
                {health.data.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(health.data.checkedAt).toLocaleString()}
              </span>
            </div>
            <ul className="space-y-2">
              {health.data.checks.map((check) => (
                <li
                  key={check.name}
                  className="flex items-start gap-2 text-sm rounded-md border px-3 py-2"
                >
                  {check.status === "ok" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium">{check.name}</div>
                    {check.message ? (
                      <div className="text-xs text-muted-foreground">
                        {check.message}
                      </div>
                    ) : null}
                    {check.latencyMs != null ? (
                      <div className="text-xs text-muted-foreground">
                        {check.latencyMs}ms
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}