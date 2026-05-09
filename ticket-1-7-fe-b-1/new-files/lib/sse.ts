import { useCallback, useEffect, useRef, useState } from "react";
import type { ProspectBrief } from "./api/prospects";
import type { CostBreakdown, ResearchInput } from "./api/seeder";
import { buildResearchStreamUrl } from "./api/seeder";

/**
 * Discriminated union representing every observable state of the
 * research SSE stream. Components switch on `status` to render.
 */
export type ResearchState =
  | { status: "idle" }
  | { status: "connecting" }
  | { status: "streaming"; events: ProgressEvent[] }
  | {
      status: "complete";
      events: ProgressEvent[];
      brief: ProspectBrief;
      cost: CostBreakdown;
    }
  | { status: "error"; events: ProgressEvent[]; message: string };

/**
 * Loose shape for `event: progress` payloads. The server emits a
 * variety of progress event types; the dashboard only displays
 * a `label` and a relative timestamp. We keep this open.
 */
export interface ProgressEvent {
  type: string;
  label?: string;
  detail?: string;
  ts: number;
  raw: unknown;
}

interface UseResearchStreamReturn {
  state: ResearchState;
  start: (input: ResearchInput) => void;
  cancel: () => void;
  reset: () => void;
}

/**
 * Manages the EventSource lifecycle for the research stream.
 *
 * Behavior:
 *   - `start(input)` opens an SSE connection. State transitions
 *     idle → connecting → streaming → (complete | error).
 *   - The hook closes the connection on `done` or `error` server events,
 *     and on unmount, to prevent EventSource's automatic reconnect loop.
 *   - `cancel()` aborts an in-flight stream and returns to idle.
 *   - `reset()` clears terminal state back to idle (after complete/error).
 */
export function useResearchStream(): UseResearchStreamReturn {
  const [state, setState] = useState<ResearchState>({ status: "idle" });
  const sourceRef = useRef<EventSource | null>(null);
  const eventsRef = useRef<ProgressEvent[]>([]);

  const closeSource = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
  }, []);

  const start = useCallback(
    (input: ResearchInput) => {
      closeSource();
      eventsRef.current = [];
      setState({ status: "connecting" });

      const url = buildResearchStreamUrl(input);
      const es = new EventSource(url, { withCredentials: true });
      sourceRef.current = es;

      es.addEventListener("progress", (e: MessageEvent) => {
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(e.data);
        } catch {
          parsed = { raw: e.data };
        }
        const p = parsed as Record<string, unknown>;
        const evt: ProgressEvent = {
          type: typeof p?.type === "string" ? p.type : "progress",
          label: typeof p?.label === "string" ? p.label : undefined,
          detail: typeof p?.detail === "string" ? p.detail : undefined,
          ts: Date.now(),
          raw: parsed,
        };
        eventsRef.current = [...eventsRef.current, evt];
        setState({ status: "streaming", events: eventsRef.current });
      });

      es.addEventListener("result", (e: MessageEvent) => {
        try {
          const parsed = JSON.parse(e.data) as {
            brief: ProspectBrief;
            cost: CostBreakdown;
          };
          setState({
            status: "complete",
            events: eventsRef.current,
            brief: parsed.brief,
            cost: parsed.cost,
          });
        } catch (err) {
          setState({
            status: "error",
            events: eventsRef.current,
            message: `Could not parse research result: ${
              err instanceof Error ? err.message : String(err)
            }`,
          });
        }
      });

      // Server-emitted custom error events carry a JSON payload with `message`.
      // Native EventSource connection errors (no `data`) are caught by `onerror` below.
      es.addEventListener("error", (e: MessageEvent) => {
        if (e.data) {
          try {
            const parsed = JSON.parse(e.data) as { message?: string };
            const msg =
              typeof parsed.message === "string"
                ? parsed.message
                : "Research stream returned an error.";
            setState({
              status: "error",
              events: eventsRef.current,
              message: msg,
            });
            closeSource();
            return;
          } catch {
            // fall through to generic error below
          }
        }
        // No data → native connection error
        // Only mark as error if not already in a terminal state
        setState((prev) => {
          if (prev.status === "complete" || prev.status === "error") {
            return prev;
          }
          return {
            status: "error",
            events: eventsRef.current,
            message:
              "Lost connection to the research stream. Try again, or contact support if it persists.",
          };
        });
        closeSource();
      });

      es.addEventListener("done", () => {
        closeSource();
      });
    },
    [closeSource],
  );

  const cancel = useCallback(() => {
    closeSource();
    setState({ status: "idle" });
    eventsRef.current = [];
  }, [closeSource]);

  const reset = useCallback(() => {
    setState({ status: "idle" });
    eventsRef.current = [];
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      closeSource();
    };
  }, [closeSource]);

  return { state, start, cancel, reset };
}
