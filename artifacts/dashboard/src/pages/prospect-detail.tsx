import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft,
  Copy,
  Download,
  Pencil,
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
import { useChannelLink } from "@/hooks/use-whatsapp";
import { ApiError } from "@/lib/api";
import {
  getProspect,
  deleteProspect,
  updateProspect,
  type Prospect,
  type ProspectStatus,
  type ProspectBrief,
} from "@/lib/api/prospects";
import { generateMessage } from "@/lib/api/seeder";
import {
  ProspectTimeline,
  useLastGenerationScore,
} from "@/components/prospects/ProspectTimeline";

export default function ProspectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [briefExpanded, setBriefExpanded] = useState(false);
  const [editingMessage, setEditingMessage] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");

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

  const editMessage = useMutation<unknown, ApiError, string>({
    mutationFn: (newBody) =>
      updateProspect(id!, { firstMessageBody: newBody }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospect", id] });
      queryClient.invalidateQueries({ queryKey: ["prospects-list"] });
      setEditingMessage(false);
      toast({ title: "Message updated" });
    },
    onError: (err) => {
      toast({
        title: "Could not update message",
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

  const outcomeMutation = useMutation<
    Prospect,
    ApiError,
    "worked" | "no_response"
  >({
    mutationFn: async (outcome) => {
      const current = queryClient.getQueryData<Prospect>(["prospect", id]);
      if (!current) throw new Error("Prospect not loaded");
      const label =
        outcome === "worked" ? "[Outcome: worked]" : "[Outcome: no response]";
      const prefix = `${label} `;
      const existing = current.contextNotes ?? "";
      const next = existing.trim()
        ? `${prefix}${existing.trim()}`
        : prefix.trim();
      return updateProspect(id!, { contextNotes: next });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospect", id] });
      toast({ title: "Outcome saved" });
    },
    onError: (err) => {
      toast({
        title: "Could not save outcome",
        description: err.code ?? err.message,
        variant: "destructive",
      });
    },
  });

  const channelLink = useChannelLink();
  const lastGenScore = useLastGenerationScore(id ?? "");

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

  const openChannel =
    p.firstMessageChannel === "telegram" ? "telegram" : "whatsapp";

  function copySummary() {
    const summary = [
      `Name: ${p.prospectName ?? "—"}`,
      `Company: ${p.company ?? "—"}`,
      `Phone: ${p.phone ?? p.telegramHandle ?? "—"}`,
      `Status: ${status}`,
      `Channel: ${p.firstMessageChannel ?? "—"}`,
    ].join("\n");
    navigator.clipboard.writeText(summary).then(
      () => toast({ title: "Summary copied" }),
      () =>
        toast({ title: "Could not copy", variant: "destructive" }),
    );
  }

  function openChatLink() {
    channelLink.mutate(
      { prospectId: p.id, channel: openChannel },
      {
        onSuccess: (data) => {
          const w = window.open(data.url, "_blank", "noopener,noreferrer");
          if (!w) {
            toast({
              title: "Browser blocked the popup",
              description:
                "Allow popups for this site, or copy the link manually.",
              variant: "destructive",
            });
          }
        },
        onError: (err) => {
          toast({
            title: `Could not open ${openChannel === "telegram" ? "Telegram" : "WhatsApp"} link`,
            description: err.code ?? err.message,
            variant: "destructive",
          });
        },
      },
    );
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
        {status === "ready" &&
          (p.firstMessageChannel === "whatsapp" ||
            p.firstMessageChannel === "telegram") && (
            <Button
              onClick={openChatLink}
              disabled={channelLink.isPending}
              data-testid="button-open-chat"
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Open {p.firstMessageChannel === "telegram" ? "Telegram" : "WhatsApp"}
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
          onClick={copySummary}
          data-testid="button-copy-summary"
        >
          <Copy className="h-3.5 w-3.5 mr-1.5" />
          Copy summary
        </Button>
        <Button
          variant="outline"
          onClick={() => downloadTechnicalLog(p)}
          data-testid="button-download-log"
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Technical log
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
            {/* Sales-facing fields only. Source / Apollo person ID /
                Updated / sourceMode are debug — see Technical log. */}
            <Field label="Name" value={p.prospectName} />
            <Field label="Company" value={p.company} />
            <Field label="Title" value={p.title} />
            <Field label="Country" value={p.country} />
            <Field label="Language" value={p.language} />
            <Field label="Phone" value={p.phone} mono />
            <Field label="Channel" value={p.firstMessageChannel} />
            <Field label="LinkedIn" value={p.linkedinUrl} truncate />
            <Field label="Telegram" value={p.telegramHandle} mono />
            <Field label="Created" value={formatDate(p.createdAt)} />
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
              {/* phoneNumber audit field moved to Technical log download. */}
              <Field label="Reveal status" value={p.phoneRevealStatus} />
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

      {lastGenScore != null ? (
        <p className="text-xs text-muted-foreground" data-testid="gen-quality">
          Last generation quality:{" "}
          <span className="font-medium text-foreground">
            {lastGenScore.toFixed(2)}
          </span>
        </p>
      ) : null}

      {/* Variant outcome */}
      <div className="flex flex-wrap gap-2" data-testid="variant-outcome">
        <Button
          variant="outline"
          size="sm"
          onClick={() => outcomeMutation.mutate("worked")}
          disabled={outcomeMutation.isPending}
        >
          Mark as worked
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => outcomeMutation.mutate("no_response")}
          disabled={outcomeMutation.isPending}
        >
          No response
        </Button>
      </div>

      {/* Message card */}
      <Card data-testid="message-card">
        <CardContent className="p-4 space-y-3">
          <SectionTitle>First message</SectionTitle>
          {editingMessage ? (
            <>
              <textarea
                value={messageDraft}
                onChange={(e) => setMessageDraft(e.target.value)}
                rows={Math.max(8, messageDraft.split("\n").length + 1)}
                className="w-full rounded-md border bg-muted/30 p-3 text-sm font-sans resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                data-testid="textarea-message-edit"
                disabled={editMessage.isPending}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => editMessage.mutate(messageDraft.trim())}
                  disabled={
                    editMessage.isPending ||
                    messageDraft.trim().length === 0 ||
                    messageDraft.trim() === (p.firstMessageBody ?? "").trim()
                  }
                  data-testid="button-save-message"
                >
                  {editMessage.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : null}
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingMessage(false)}
                  disabled={editMessage.isPending}
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : p.firstMessageBody ? (
            <>
              <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                {p.firstMessageBody}
              </div>
              <div className="flex gap-2">
                <CopyButton value={p.firstMessageBody} />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMessageDraft(p.firstMessageBody ?? "");
                    setEditingMessage(true);
                  }}
                  data-testid="button-edit-message"
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
              </div>
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

      <ProspectTimeline prospectId={p.id} />

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
  if (p.phoneRevealStatus === "expired") return "phone-expired";
  if (!p.phone && !p.telegramHandle) return "phone-pending";
  if (p.firstMessageBody) return "ready";
  return "draft";
}

/**
 * Stub-brief detector. Bulk-flow prospects ship with a synthesized
 * stub brief (generator_model="stub-2.3-fe", daily_volume=0) — these
 * fields are debug-only artifacts of the stub itself, not real
 * research output. Hide them from the sales-facing detail view.
 * Added in Ticket detail-page-cleanup.
 */
function isStubBrief(brief: ProspectBrief): boolean {
  return brief.generatorModel.startsWith("stub-");
}

/**
 * Download a JSON technical log of this prospect — full row plus
 * computed status and stub-brief flag. Replaces the per-field debug
 * display that used to clutter the sales-facing detail view.
 * Added in Ticket detail-page-cleanup.
 */
function downloadTechnicalLog(p: Prospect): void {
  const log = {
    exportedAt: new Date().toISOString(),
    prospect: p,
    computed: {
      status: computeStatus(p),
      isStubBrief: p.researchBrief ? isStubBrief(p.researchBrief) : null,
    },
  };
  const blob = new Blob([JSON.stringify(log, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `prospect-${p.id}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
  const stub = isStubBrief(brief);
  return (
    <div className="space-y-3 text-sm">
      {stub ? (
        <p className="text-xs text-muted-foreground">
          Stub brief — bulk-flow prospects ship with a placeholder. Real
          research metadata (scale tier, daily volume, primary event)
          appears here for seeder-flow prospects that ran the full LLM
          research pipeline. Re-research per prospect is a future ticket.
          Generator model and cost are available in the Technical log
          download regardless.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs">
          <Field label="Country" value={brief.determinedCountry} />
          <Field label="Scale tier" value={brief.determinedScaleTier} />
          <Field
            label="Daily volume"
            value={String(brief.calibratedDailyVolume)}
          />
          <Field label="Primary event" value={brief.primaryEvent} />
          <Field label="Generated at" value={formatDate(brief.generatedAt)} />
        </div>
      )}
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
    "phone-expired": {
      label: "Unreachable",
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
