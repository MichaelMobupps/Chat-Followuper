import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft,
  Copy,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  Send as SendIcon,
  ExternalLink,
  Loader2,
  RefreshCw,
  Trash2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useWhatsappLink } from "@/hooks/use-whatsapp";
import { ApiError } from "@/lib/api";
import {
  getProspect,
  deleteProspect,
  type Prospect,
  type ProspectStatus,
  type ProspectBrief,
} from "@/lib/api/prospects";
import { generateMessage } from "@/lib/api/seeder";

export default function ProspectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [briefExpanded, setBriefExpanded] = useState(false);

  const query = useQuery<Prospect, ApiError>({
    queryKey: ["prospect", id],
    queryFn: () => getProspect(id),
    enabled: !!id,
  });

  const regenerate = useMutation<unknown, ApiError, string>({
    mutationFn: (prospectId) => generateMessage(prospectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospect", id] });
      queryClient.invalidateQueries({ queryKey: ["prospects-list"] });
      toast({ title: "Message regenerated" });
    },
    onError: (err) => {
      toast({
        title: "Could not regenerate message",
        description: err.code ?? err.message,
        variant: "destructive",
      });
    },
  });

  const remove = useMutation<unknown, ApiError, string>({
    mutationFn: (prospectId) => deleteProspect(prospectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospects-list"] });
      toast({ title: "Prospect deleted" });
      navigate("/prospects");
    },
    onError: (err) => {
      toast({
        title: "Could not delete prospect",
        description: err.code ?? err.message,
        variant: "destructive",
      });
    },
  });

  const whatsappLink = useWhatsappLink();

  if (query.isLoading) {
    return (
      <section className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </section>
    );
  }

  if (query.isError || !query.data) {
    return (
      <section className="space-y-4 max-w-2xl mx-auto">
        <a
          href="/prospects"
          onClick={(e) => {
            e.preventDefault();
            navigate("/prospects");
          }}
          className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground gap-1 cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to prospects
        </a>
        <Card>
          <CardContent className="p-8 text-center space-y-2">
            <AlertTriangle className="h-6 w-6 text-destructive mx-auto" />
            <div className="text-sm font-medium">Could not load prospect</div>
            <div className="text-xs text-muted-foreground">
              {query.error?.code ?? query.error?.message ?? "Unknown error"}
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  const p = query.data;
  const status = computeStatus(p);
  const displayName = p.prospectName ?? "(no name)";

  function openWhatsappLink() {
    whatsappLink.mutate(p.id, {
      onSuccess: (data) => {
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
        toast({
          title: "Could not open WhatsApp link",
          description: err.code ?? err.message,
          variant: "destructive",
        });
      },
    });
  }

  return (
    <section className="space-y-6 max-w-4xl">
      <header className="space-y-3">
        <a
          href="/prospects"
          onClick={(e) => {
            e.preventDefault();
            navigate("/prospects");
          }}
          className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground gap-1 cursor-pointer"
          data-testid="link-back"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to prospects
        </a>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 space-y-1">
            <h1
              className="text-2xl font-semibold tracking-tight truncate"
              data-testid="page-title"
            >
              {displayName}
            </h1>
            <p className="text-sm text-muted-foreground truncate">
              {[p.title, p.company].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <StatusBadge status={status} />
        </div>
      </header>

      {/* Top action row */}
      <div className="flex flex-wrap gap-2">
        {status === "ready" && p.firstMessageChannel === "whatsapp" && (
          <Button
            onClick={openWhatsappLink}
            disabled={whatsappLink.isPending}
            data-testid="button-open-whatsapp"
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Open WhatsApp
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => regenerate.mutate(p.id)}
          disabled={regenerate.isPending || !p.researchBrief}
          title={
            !p.researchBrief
              ? "Research brief missing — message generation requires it"
              : undefined
          }
          data-testid="button-regenerate"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 mr-1.5 ${regenerate.isPending ? "animate-spin" : ""}`}
          />
          Regenerate message
        </Button>
        <Button
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={() => setConfirmDeleteOpen(true)}
          data-testid="button-delete"
        >
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          Delete
        </Button>
      </div>

      {/* Data card */}
      <Card data-testid="data-card">
        <CardContent className="p-4 space-y-3">
          <SectionTitle>Prospect data</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Field label="Name" value={p.prospectName} />
            <Field label="Company" value={p.company} />
            <Field label="Title" value={p.title} />
            <Field label="Country" value={p.country} />
            <Field label="Language" value={p.language} />
            <Field label="Phone" value={p.phone} mono />
            <Field label="Channel" value={p.firstMessageChannel} />
            <Field label="Source" value={p.sourceMode} />
            <Field label="LinkedIn" value={p.linkedinUrl} truncate />
            <Field label="Apollo person ID" value={p.apolloPersonId} mono truncate />
            <Field label="Telegram" value={p.telegramHandle} mono />
            <Field label="Created" value={formatDate(p.createdAt)} />
            <Field label="Updated" value={formatDate(p.updatedAt)} />
            {p.firstMessageSentAt && (
              <Field label="Sent" value={formatDate(p.firstMessageSentAt)} />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Phone reveal info — only shown for non-trivial states */}
      {p.phoneRevealStatus !== "none" && (
        <Card data-testid="phone-reveal-card">
          <CardContent className="p-4 space-y-3">
            <SectionTitle>Phone reveal</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Field label="Reveal status" value={p.phoneRevealStatus} />
              <Field label="phoneNumber (audit)" value={p.phoneNumber} mono />
            </div>
            {p.phoneRevealStatus === "pending" && (
              <p className="text-xs text-muted-foreground">
                Apollo's webhook will deliver the phone in minutes. The prospect
                will move to "ready" when phone + message are both set.
              </p>
            )}
            {p.phoneRevealStatus === "blocked" && (
              <p className="text-xs text-destructive">
                Geo-blocked. The phone country is not in the allowed market list.
                This is a terminal state.
              </p>
            )}
            {p.phoneRevealStatus === "no_match" && (
              <p className="text-xs text-destructive">
                Apollo could not locate a phone for this person. This is a terminal
                state.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Message card */}
      <Card data-testid="message-card">
        <CardContent className="p-4 space-y-3">
          <SectionTitle>First message</SectionTitle>
          {p.firstMessageBody ? (
            <>
              <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                {p.firstMessageBody}
              </div>
              <CopyButton value={p.firstMessageBody} />
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              No message yet. {!p.researchBrief && "Research brief is missing — generate-message requires a brief."}
              {p.researchBrief && " Click Regenerate above to draft one."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Brief card (collapsible) */}
      <Card data-testid="brief-card">
        <CardContent className="p-4 space-y-3">
          <button
            type="button"
            onClick={() => setBriefExpanded((b) => !b)}
            className="flex items-center gap-1 text-sm font-medium hover:text-foreground/80"
            data-testid="button-brief-toggle"
          >
            {briefExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Research brief {p.researchBrief ? "" : "(none)"}
          </button>
          {briefExpanded && p.researchBrief && (
            <BriefView brief={p.researchBrief} />
          )}
          {briefExpanded && !p.researchBrief && (
            <p className="text-xs text-muted-foreground">
              No research brief stored. Bulk-flow prospects (Ticket 2.3-FE) ship
              with stub briefs; the seeder flow ships with full LLM-researched
              briefs. Re-research per prospect is a future ticket.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent data-testid="delete-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this prospect?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the prospect record and cascades to follow-ups and
              conversation history. Apollo credits already spent on phone
              reveals are not refunded. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDeleteOpen(false);
                remove.mutate(p.id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

function computeStatus(p: Prospect): ProspectStatus {
  if (p.firstMessageSentAt) return "sent";
  if (p.phoneRevealStatus === "blocked") return "phone-blocked";
  if (p.phoneRevealStatus === "no_match") return "phone-no-match";
  if (!p.phone) return "phone-pending";
  if (p.firstMessageBody) return "ready";
  return "draft";
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
  truncate = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 items-baseline">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`col-span-2 ${mono ? "font-mono text-xs" : "text-sm"} ${truncate ? "truncate" : "break-words"}`}
        title={truncate && value ? value : undefined}
      >
        {value || <span className="text-muted-foreground/60">—</span>}
      </div>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        toast({
          title: "Could not copy",
          description: "Copy manually with Cmd-C / Ctrl-C",
          variant: "destructive",
        });
      });
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleCopy}
      data-testid="button-copy-message"
    >
      {copied ? (
        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-green-600" />
      ) : (
        <Copy className="h-3.5 w-3.5 mr-1.5" />
      )}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function BriefView({ brief }: { brief: ProspectBrief }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <Field label="Country" value={brief.determinedCountry} />
        <Field label="Scale tier" value={brief.determinedScaleTier} />
        <Field
          label="Daily volume"
          value={String(brief.calibratedDailyVolume)}
        />
        <Field label="Primary event" value={brief.primaryEvent} />
        <Field label="Generator model" value={brief.generatorModel} mono />
        <Field
          label="Generator cost"
          value={`$${brief.generatorCostUsd.toFixed(4)}`}
          mono
        />
        <Field label="Generated at" value={formatDate(brief.generatedAt)} />
      </div>
      {brief.prospectSpecificHook && (
        <BriefBlock label="Specific hook" body={brief.prospectSpecificHook} />
      )}
      {brief.prospectPrimaryGrowthProblem && (
        <BriefBlock
          label="Primary growth problem"
          body={brief.prospectPrimaryGrowthProblem}
        />
      )}
      {brief.whyArgument && <BriefBlock label="Why" body={brief.whyArgument} />}
      {brief.validationArgument && (
        <BriefBlock label="Validation" body={brief.validationArgument} />
      )}
      {brief.howArgument && <BriefBlock label="How" body={brief.howArgument} />}
      {brief.marketContext && (
        <BriefBlock label="Market context" body={brief.marketContext} />
      )}
      {brief.tangibleReasons && brief.tangibleReasons.length > 0 && (
        <BriefBlock
          label="Tangible reasons"
          body={brief.tangibleReasons.map((r) => `• ${r}`).join("\n")}
        />
      )}
      {brief.finalCompetitors && brief.finalCompetitors.length > 0 && (
        <BriefBlock
          label="Competitors"
          body={brief.finalCompetitors.join(", ")}
        />
      )}
    </div>
  );
}

function BriefBlock({ label, body }: { label: string; body: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-xs whitespace-pre-wrap rounded-md bg-muted/30 px-3 py-2">
        {body}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ProspectStatus }) {
  const config: Record<
    ProspectStatus,
    { label: string; icon: typeof CheckCircle2; cls: string }
  > = {
    sent: {
      label: "Sent",
      icon: SendIcon,
      cls: "border-blue-500 text-blue-700 dark:text-blue-400",
    },
    ready: {
      label: "Ready",
      icon: CheckCircle2,
      cls: "border-green-500 text-green-700 dark:text-green-400",
    },
    draft: {
      label: "Draft",
      icon: FileText,
      cls: "border-muted-foreground text-muted-foreground",
    },
    "phone-pending": {
      label: "Phone pending",
      icon: Clock,
      cls: "border-amber-500 text-amber-700 dark:text-amber-400",
    },
    "phone-blocked": {
      label: "Geo-blocked",
      icon: XCircle,
      cls: "border-destructive text-destructive",
    },
    "phone-no-match": {
      label: "No phone",
      icon: XCircle,
      cls: "border-destructive text-destructive",
    },
  };
  const c = config[status];
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${c.cls}`}>
      <Icon className="h-3 w-3" />
      {c.label}
    </Badge>
  );
}
