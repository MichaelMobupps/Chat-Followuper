import { Loader2, CheckCircle2, AlertTriangle, Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ApolloOrgSummary, ApolloPersonSummary } from "@/lib/api/apollo";

export type DiscoveryStage =
  | "pending"
  | "resolving"
  | "searching-org"
  | "searching-people"
  | "complete"
  | "failed";

export interface UrlDiscoveryState {
  inputUrl: string;
  stage: DiscoveryStage;
  brand?: string | null;
  org?: ApolloOrgSummary;
  people?: ApolloPersonSummary[];
  error?: string;
}

interface Props {
  states: UrlDiscoveryState[];
  onCancel: () => void;
  onProceedToGrid: () => void;
}

const STAGE_LABEL: Record<DiscoveryStage, string> = {
  pending: "Queued",
  resolving: "Resolving URL",
  "searching-org": "Searching Apollo for company",
  "searching-people": "Loading people",
  complete: "Done",
  failed: "Failed",
};

export function DiscoveryProgress({ states, onCancel, onProceedToGrid }: Props) {
  const allDone = states.every(
    (s) => s.stage === "complete" || s.stage === "failed",
  );
  const successCount = states.filter((s) => s.stage === "complete").length;
  const failedCount = states.filter((s) => s.stage === "failed").length;
  const activeCount = states.length - successCount - failedCount;
  const totalPeople = states.reduce(
    (acc, s) => acc + (s.people?.length ?? 0),
    0,
  );

  return (
    <section className="space-y-4" data-testid="discovery-progress">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            {allDone ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Discovery complete
              </>
            ) : (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                Discovering candidates…
              </>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">
            {allDone
              ? `${successCount} URLs ok · ${failedCount} failed · ${totalPeople} candidates found`
              : `${activeCount} in progress · ${successCount} done · ${failedCount} failed`}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {!allDone && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              data-testid="button-discovery-cancel"
            >
              Cancel
            </Button>
          )}
          {allDone && totalPeople > 0 && (
            <Button onClick={onProceedToGrid} data-testid="button-proceed-grid">
              Continue to candidates ({totalPeople})
            </Button>
          )}
          {allDone && totalPeople === 0 && (
            <Button variant="outline" onClick={onCancel} data-testid="button-back-to-input">
              Back to input
            </Button>
          )}
        </div>
      </header>

      <div className="space-y-2">
        {states.map((s, idx) => (
          <UrlRow key={idx} state={s} idx={idx} />
        ))}
      </div>
    </section>
  );
}

function UrlRow({ state, idx }: { state: UrlDiscoveryState; idx: number }) {
  const isActive =
    state.stage !== "complete" && state.stage !== "failed";
  return (
    <Card data-testid={`discovery-url-${idx}`}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className="shrink-0 pt-0.5">
            {isActive && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            {state.stage === "complete" && (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            )}
            {state.stage === "failed" && (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-xs truncate max-w-md" title={state.inputUrl}>
                {state.inputUrl}
              </code>
              <Badge variant="outline" className="text-[10px]">
                {STAGE_LABEL[state.stage]}
              </Badge>
            </div>
            {state.brand && (
              <p className="text-xs text-muted-foreground">
                Brand: <span className="font-medium">{state.brand}</span>
              </p>
            )}
            {state.org && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Building2 className="h-3 w-3" />
                <span>{state.org.name}</span>
                {state.org.industry && (
                  <Badge variant="outline" className="text-[10px]">
                    {state.org.industry}
                  </Badge>
                )}
              </div>
            )}
            {state.stage === "complete" && (
              <p className="text-xs">
                <span className="font-medium">{state.people?.length ?? 0}</span>{" "}
                <span className="text-muted-foreground">candidates found</span>
              </p>
            )}
            {state.error && (
              <p className="text-xs text-destructive">Error: {state.error}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
