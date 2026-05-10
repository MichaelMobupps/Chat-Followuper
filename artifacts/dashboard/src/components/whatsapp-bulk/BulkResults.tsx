import { useState } from "react";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  ExternalLink,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useWhatsappLink } from "@/hooks/use-whatsapp";
import { ApiError } from "@/lib/api";
import type { CandidateProcessing } from "./BulkSavingProgress";

interface Props {
  states: CandidateProcessing[];
  onStartNewBatch: () => void;
}

export function BulkResults({ states, onStartNewBatch }: Props) {
  const ready = states.filter((s) => s.stage === "ready");
  const pending = states.filter((s) => s.stage === "ready-pending-phone");
  const failed = states.filter((s) => s.stage === "failed");

  return (
    <section className="space-y-6" data-testid="bulk-results">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          Batch complete
        </h2>
        <p className="text-sm text-muted-foreground">
          {ready.length} ready to send · {pending.length} phone reveal pending ·{" "}
          {failed.length} failed
        </p>
      </header>

      {ready.length > 0 && (
        <ResultGroup
          title={`Ready to send (${ready.length})`}
          tone="success"
          description="Phone is set and the first message is generated. Click to open WhatsApp."
        >
          {ready.map((s) => (
            <ReadyRow key={s.prospectId} state={s} />
          ))}
        </ResultGroup>
      )}

      {pending.length > 0 && (
        <ResultGroup
          title={`Phone reveal pending (${pending.length})`}
          tone="warning"
          description="Apollo's webhook will deliver the phone in minutes. The message is already drafted; you'll get a Mailgun email when these are ready to send."
        >
          {pending.map((s) => (
            <PendingRow key={s.prospectId} state={s} />
          ))}
        </ResultGroup>
      )}

      {failed.length > 0 && (
        <ResultGroup
          title={`Failed (${failed.length})`}
          tone="error"
          description="Apollo credits already spent on these are not refunded. Try again in a new batch."
        >
          {failed.map((s, idx) => (
            <FailedRow key={idx} state={s} />
          ))}
        </ResultGroup>
      )}

      <div className="flex justify-end pt-2">
        <Button onClick={onStartNewBatch} data-testid="button-new-batch">
          <RefreshCw className="h-4 w-4 mr-2" />
          New batch
        </Button>
      </div>
    </section>
  );
}

function ResultGroup({
  title,
  description,
  tone,
  children,
}: {
  title: string;
  description: string;
  tone: "success" | "warning" | "error";
  children: React.ReactNode;
}) {
  const toneClasses = {
    success: "border-green-500/40",
    warning: "border-amber-500/40",
    error: "border-destructive/40",
  }[tone];
  return (
    <section className={`rounded-md border ${toneClasses} p-4 space-y-3`}>
      <div className="space-y-0.5">
        <h3 className="font-semibold text-sm">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function ReadyRow({ state }: { state: CandidateProcessing }) {
  const { toast } = useToast();
  const { mutate, isPending } = useWhatsappLink();
  const { candidate, prospectId } = state;
  const { person, org } = candidate;
  const displayName =
    [person.firstName, person.lastNameObfuscated].filter(Boolean).join(" ") ||
    person.name ||
    "(no name)";

  function openLink() {
    if (!prospectId) return;
    mutate(prospectId, {
      onSuccess: (data) => {
        // Open in new tab. Browser may block popups; advise the SDR.
        const w = window.open(data.url, "_blank", "noopener,noreferrer");
        if (!w) {
          toast({
            title: "Browser blocked the popup",
            description: "Allow popups for this site, or copy the link manually.",
            variant: "destructive",
          });
        }
      },
      onError: (err) => {
        // useWhatsappLink declares TError = ApiError so err is typed
        // accordingly. err.code may be undefined for non-API errors
        // (network failures still surface as ApiError but with no code);
        // err.message is always present on ApiError.
        const msg = err.code ?? err.message;
        toast({
          title: "Could not open WhatsApp link",
          description: msg,
          variant: "destructive",
        });
      },
    });
  }

  return (
    <Card data-testid={`ready-row-${prospectId}`}>
      <CardContent className="p-3 flex items-center gap-3">
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{displayName}</div>
          <div className="text-xs text-muted-foreground truncate">
            {person.title ?? "(no title)"} · {org.name}
          </div>
          {state.firstMessageBody && (
            <div
              className="mt-1 flex items-start gap-1 text-xs text-muted-foreground/80 italic"
              title={state.firstMessageBody}
            >
              <MessageSquare className="h-3 w-3 flex-shrink-0 mt-0.5" />
              <span className="truncate">{state.firstMessageBody}</span>
            </div>
          )}
        </div>
        <Button
          size="sm"
          onClick={openLink}
          disabled={isPending}
          data-testid={`button-open-whatsapp-${prospectId}`}
        >
          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
          Open WhatsApp
        </Button>
      </CardContent>
    </Card>
  );
}

function PendingRow({ state }: { state: CandidateProcessing }) {
  const { candidate } = state;
  const { person, org } = candidate;
  const displayName =
    [person.firstName, person.lastNameObfuscated].filter(Boolean).join(" ") ||
    person.name ||
    "(no name)";
  return (
    <Card data-testid={`pending-row-${state.prospectId}`}>
      <CardContent className="p-3 flex items-center gap-3">
        <Clock className="h-4 w-4 text-amber-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{displayName}</div>
          <div className="text-xs text-muted-foreground truncate">
            {person.title ?? "(no title)"} · {org.name}
          </div>
          {state.firstMessageBody && (
            <div
              className="mt-1 flex items-start gap-1 text-xs text-muted-foreground/80 italic"
              title={state.firstMessageBody}
            >
              <MessageSquare className="h-3 w-3 flex-shrink-0 mt-0.5" />
              <span className="truncate">{state.firstMessageBody}</span>
            </div>
          )}
        </div>
        <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
          phone pending
        </Badge>
      </CardContent>
    </Card>
  );
}

function FailedRow({ state }: { state: CandidateProcessing }) {
  const { candidate, error } = state;
  const { person, org } = candidate;
  const displayName =
    [person.firstName, person.lastNameObfuscated].filter(Boolean).join(" ") ||
    person.name ||
    "(no name)";
  return (
    <Card>
      <CardContent className="p-3 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="text-sm font-medium truncate">{displayName}</div>
          <div className="text-xs text-muted-foreground truncate">
            {person.title ?? "(no title)"} · {org.name}
          </div>
          <div className="text-xs text-destructive">{error ?? "Unknown error"}</div>
        </div>
      </CardContent>
    </Card>
  );
}
