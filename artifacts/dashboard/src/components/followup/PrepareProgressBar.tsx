/**
 * PrepareProgressBar — staged progress display for first-message
 * auto-generation (Phase H).
 *
 * Renders the real backend pipeline stages (queued → researching → writing
 * → finalizing → ready) with the current stage highlighted, a percentage
 * bar, and an error state. Driven by usePrepareProgress polling — this
 * component is presentation-only.
 *
 * Visual language matches the Beacon Ignite accents used across the manual
 * ingest surface (#00F5D4 family).
 */
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PrepareProgress } from "@/lib/api/manual-ingest";

// Ordered pipeline stages with SDR-facing labels. "queued" and
// "finalizing" are short-lived; researching/writing carry the wait.
const STAGES: Array<{ key: string; label: string }> = [
  { key: "queued", label: "Queued" },
  { key: "researching", label: "Researching company" },
  { key: "writing", label: "Writing message" },
  { key: "finalizing", label: "Finalizing" },
  { key: "ready", label: "Ready" },
];

const STAGE_INDEX: Record<string, number> = Object.fromEntries(
  STAGES.map((s, i) => [s.key, i]),
);

interface Props {
  progress: PrepareProgress | undefined;
  className?: string;
  /**
   * Drop the "Researching company" step. Follow-up generation reuses the
   * persisted research brief and never runs research (followupMessageService;
   * prepareProgress.ts says so outright: "Follow-ups skip researching"), so it
   * goes queued → writing → finalizing → ready. Rendering the shared stage list
   * there put a green check on research that never happened — the bar claiming
   * work the pipeline didn't do.
   */
  skipResearch?: boolean;
}

export function PrepareProgressBar({
  progress,
  className,
  skipResearch = false,
}: Props) {
  if (!progress || progress.stage === "idle") return null;

  const stages = skipResearch
    ? STAGES.filter((s) => s.key !== "researching")
    : STAGES;
  const stageIndex = skipResearch
    ? Object.fromEntries(stages.map((s, i) => [s.key, i]))
    : STAGE_INDEX;

  const isError = progress.stage === "error";
  const isDone = progress.stage === "ready";
  const currentIdx = isError ? -1 : stageIndex[progress.stage] ?? 0;

  return (
    <div
      className={cn("space-y-2", className)}
      data-testid="prepare-progress"
      data-stage={progress.stage}
    >
      {/* Bar */}
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700",
            isError ? "bg-destructive" : "bg-[#00F5D4]",
          )}
          style={{
            width: `${Math.max(4, Math.min(100, progress.pct))}%`,
            ...(isError
              ? {}
              : { boxShadow: "0 0 8px rgba(0,245,212,.45)" }),
          }}
        />
      </div>

      {/* Stage list */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {isError ? (
          <span className="flex items-center gap-1.5 text-xs text-destructive">
            <XCircle className="h-3.5 w-3.5" />
            Failed{progress.error ? ` — ${progress.error}` : ""}. Try again.
          </span>
        ) : (
          stages.map((stage, idx) => {
            const isCurrent = idx === currentIdx && !isDone;
            const isPast = idx < currentIdx || isDone;
            return (
              <span
                key={stage.key}
                className={cn(
                  "flex items-center gap-1 text-xs transition-colors",
                  isCurrent
                    ? "text-[#4FFFE3] font-medium"
                    : isPast
                      ? "text-muted-foreground"
                      : "text-muted-foreground/40",
                )}
                data-testid={`prepare-stage-${stage.key}`}
                data-state={isCurrent ? "current" : isPast ? "done" : "pending"}
              >
                {isPast ? (
                  <CheckCircle2 className="h-3 w-3 text-[#00F5D4]" />
                ) : isCurrent ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <span className="h-3 w-3 rounded-full border border-current/40 inline-block" />
                )}
                {stage.label}
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}
