import { useEffect, useRef } from "react";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ResearchState } from "@/lib/sse";

interface Props {
  state: ResearchState;
  onCancel: () => void;
  onRetry: () => void;
}

/**
 * Renders a live SSE feed: header status + auto-scrolling event log.
 * Three terminal states: complete, error, idle (after cancel).
 */
export function ResearchProgress({ state, onCancel, onRetry }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the log to the latest event
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [state]);

  const events =
    state.status === "streaming" ||
    state.status === "complete" ||
    state.status === "error"
      ? state.events
      : [];

  return (
    <section className="space-y-4" data-testid="research-progress">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            {state.status === "connecting" && (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                Connecting to research stream…
              </>
            )}
            {state.status === "streaming" && (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                Researching prospect…
              </>
            )}
            {state.status === "complete" && (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Research complete
              </>
            )}
            {state.status === "error" && (
              <>
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Research failed
              </>
            )}
          </h2>
          {state.status === "complete" && (
            <p
              className="text-sm text-muted-foreground"
              data-testid="research-cost"
            >
              Cost: ${" "}
              {typeof state.cost?.totalUsd === "number"
                ? state.cost.totalUsd.toFixed(4)
                : "—"}
            </p>
          )}
          {state.status === "error" && (
            <p
              className="text-sm text-destructive"
              data-testid="research-error-message"
            >
              {state.message}
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          {(state.status === "connecting" || state.status === "streaming") && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              data-testid="button-research-cancel"
            >
              Cancel
            </Button>
          )}
          {state.status === "error" && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              data-testid="button-research-retry"
            >
              Retry
            </Button>
          )}
        </div>
      </header>

      <Card>
        <CardContent className="p-0">
          <div
            ref={scrollRef}
            className="h-64 overflow-y-auto p-4 space-y-1 text-xs font-mono"
            data-testid="research-events-log"
          >
            {events.length === 0 && state.status !== "connecting" && (
              <p className="text-muted-foreground italic">
                No events yet.
              </p>
            )}
            {events.map((evt, idx) => (
              <div
                key={idx}
                className="flex gap-3 py-0.5"
                data-testid={`research-event-${idx}`}
              >
                <span className="text-muted-foreground shrink-0">
                  {new Date(evt.ts).toLocaleTimeString()}
                </span>
                <span className="text-muted-foreground shrink-0">
                  [{evt.type}]
                </span>
                <span className="break-words">
                  {evt.label ?? evt.detail ?? JSON.stringify(evt.raw)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
