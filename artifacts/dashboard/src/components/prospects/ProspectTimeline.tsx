import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Clock, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import {
  getProspectTimeline,
  type ProspectTimelineEvent,
} from "@/lib/api/prospects";

function eventLabel(e: ProspectTimelineEvent): string {
  const type = e.actionType.replace(/\./g, " · ");
  return `${type} (${e.actionStatus})`;
}

function readScore(metadata: Record<string, unknown> | null): number | null {
  if (!metadata || typeof metadata.finalOverallScore !== "number") return null;
  return metadata.finalOverallScore;
}

export function ProspectTimeline({ prospectId }: { prospectId: string }) {
  const query = useQuery({
    queryKey: ["prospect-timeline", prospectId],
    queryFn: () => getProspectTimeline(prospectId),
    enabled: !!prospectId,
  });

  return (
    <Card data-testid="timeline-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          Timeline
        </div>

        {query.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading activity…
          </div>
        ) : query.isError ? (
          <p className="text-xs text-muted-foreground">
            {query.error instanceof ApiError
              ? query.error.code ?? query.error.message
              : "Could not load timeline."}
          </p>
        ) : !query.data?.events.length ? (
          <p className="text-xs text-muted-foreground">No activity yet.</p>
        ) : (
          <ol className="space-y-2">
            {query.data.events.map((e) => {
              const score = readScore(e.metadata);
              return (
                <li
                  key={e.id}
                  className="flex items-start justify-between gap-3 text-sm border-l-2 border-border pl-3 py-1"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-xs">{eventLabel(e)}</div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(e.executedAt), "MMM d, yyyy HH:mm")}
                    </div>
                  </div>
                  {score != null ? (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      score {score.toFixed(2)}
                    </Badge>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

/** Latest generation quality from action log metadata. */
export function useLastGenerationScore(prospectId: string): number | null {
  const query = useQuery({
    queryKey: ["prospect-timeline", prospectId],
    queryFn: () => getProspectTimeline(prospectId),
    enabled: !!prospectId,
  });

  if (!query.data?.events.length) return null;

  for (const e of query.data.events) {
    if (
      e.actionType.includes("generate") ||
      e.actionType.includes("message")
    ) {
      const score = readScore(e.metadata);
      if (score != null) return score;
    }
  }

  for (const e of query.data.events) {
    const score = readScore(e.metadata);
    if (score != null) return score;
  }

  return null;
}