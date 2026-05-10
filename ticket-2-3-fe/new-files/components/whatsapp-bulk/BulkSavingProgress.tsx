import { Loader2, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Candidate } from "./CandidateGrid";

export type ProcessingStage =
  | "queued"
  | "revealing"
  | "creating"
  | "requesting-phone-reveal"
  | "writing-brief"
  | "generating-message"
  | "ready"
  | "ready-pending-phone"
  | "failed";

export interface CandidateProcessing {
  candidate: Candidate;
  stage: ProcessingStage;
  prospectId?: string;
  error?: string;
}

interface Props {
  states: CandidateProcessing[];
}

const STAGE_LABEL: Record<ProcessingStage, string> = {
  queued: "Queued",
  revealing: "Revealing contact (1 credit)…",
  creating: "Creating prospect…",
  "requesting-phone-reveal": "Requesting phone reveal (8 credits, async)…",
  "writing-brief": "Writing stub brief…",
  "generating-message": "Generating message (3-stage Doctrine)…",
  ready: "Ready to send",
  "ready-pending-phone": "Message ready, phone reveal pending",
  failed: "Failed",
};

export function BulkSavingProgress({ states }: Props) {
  const done = states.filter(
    (s) =>
      s.stage === "ready" ||
      s.stage === "ready-pending-phone" ||
      s.stage === "failed",
  ).length;
  const total = states.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <section className="space-y-4" data-testid="bulk-saving-progress">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <Loader2
            className={`h-4 w-4 ${done < total ? "animate-spin text-muted-foreground" : "text-green-600"}`}
          />
          Processing prospects ({done} / {total})
        </h2>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
            data-testid="progress-bar"
          />
        </div>
      </header>

      <div className="space-y-2 max-h-[480px] overflow-y-auto">
        {states.map((s, idx) => (
          <ProcessingRow key={s.candidate.person.id ?? idx} state={s} idx={idx} />
        ))}
      </div>
    </section>
  );
}

function ProcessingRow({
  state,
  idx,
}: {
  state: CandidateProcessing;
  idx: number;
}) {
  const { candidate, stage } = state;
  const { person, org } = candidate;
  const displayName =
    [person.firstName, person.lastNameObfuscated].filter(Boolean).join(" ") ||
    person.name ||
    "(no name)";

  const isActive =
    stage !== "ready" && stage !== "ready-pending-phone" && stage !== "failed";

  return (
    <Card data-testid={`processing-row-${idx}`}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className="shrink-0 pt-0.5">
            {isActive && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {stage === "ready" && (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            )}
            {stage === "ready-pending-phone" && (
              <Clock className="h-4 w-4 text-amber-600" />
            )}
            {stage === "failed" && (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-medium text-sm truncate">{displayName}</span>
              <span className="text-xs text-muted-foreground truncate">
                · {person.title ?? "(no title)"} · {org.name}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className={`text-[10px] ${
                  stage === "ready"
                    ? "border-green-500 text-green-700 dark:text-green-400"
                    : stage === "ready-pending-phone"
                      ? "border-amber-500 text-amber-700 dark:text-amber-400"
                      : stage === "failed"
                        ? "border-destructive text-destructive"
                        : ""
                }`}
              >
                {STAGE_LABEL[stage]}
              </Badge>
              {state.error && (
                <span className="text-xs text-destructive">{state.error}</span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
