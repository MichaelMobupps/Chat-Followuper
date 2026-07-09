import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  SeederForm,
  formValuesToCreateInput,
  type SeederFormValues,
} from "@/components/seeder/SeederForm";
import { ResearchProgress } from "@/components/seeder/ResearchProgress";
import { BriefEditor } from "@/components/seeder/BriefEditor";
import { MessageReview } from "@/components/seeder/MessageReview";
import {
  ApolloPicker,
  type ApolloDiscoveryResult,
} from "@/components/seeder/ApolloPicker";
import {
  useCreateProspect,
  useDeleteProspect,
  useGenerateMessage,
  useUpdateProspect,
} from "@/hooks/use-prospects";
import { useResearchStream } from "@/lib/sse";
import type { Prospect, ProspectBrief } from "@/lib/api/prospects";
import type { GenerateMessageResult, ResearchInput } from "@/lib/api/seeder";
import { usePrepareFirstMessage } from "@/hooks/use-manual-ingest";
import { useChannelLink } from "@/hooks/use-whatsapp";
import { type SendIntentChannel } from "@/lib/api/whatsapp";
import {
  SendConfirmDialog,
  type PendingSendConfirm,
} from "@/components/SendConfirmDialog";

type Stage =
  | { name: "form" }
  | { name: "research"; prospect: Prospect; researchInput: ResearchInput }
  | { name: "brief"; prospect: Prospect; brief: ProspectBrief }
  | {
      name: "message";
      prospect: Prospect;
      brief: ProspectBrief;
      result: GenerateMessageResult;
    }
  | { name: "done"; prospect: Prospect };

interface ApolloPrefill {
  apolloPersonId: string;
  apolloOrgId: string;
}

export default function SeederPage() {
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>({ name: "form" });
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [apolloOpen, setApolloOpen] = useState(false);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [pendingSend, setPendingSend] = useState<PendingSendConfirm | null>(
    null,
  );

  // Form pre-fill from Apollo discovery. When set, the form re-mounts
  // (via formKey) and uses these as defaults. Cleared on "Start over".
  const [formDefaults, setFormDefaults] = useState<
    Partial<SeederFormValues>
  >({});
  const [formKey, setFormKey] = useState(0);
  const [apolloMetadata, setApolloMetadata] = useState<ApolloPrefill | null>(
    null,
  );

  const createMutation = useCreateProspect();
  const updateMutation = useUpdateProspect();
  const deleteMutation = useDeleteProspect();
  const generateMutation = useGenerateMessage();
  const research = useResearchStream();
  const prepareFirst = usePrepareFirstMessage();
  const channelLink = useChannelLink();

  // FE1: latch so the brief-save fires exactly ONCE per research completion.
  // Without it, updateMutation's identity flips when .mutate() sets isPending,
  // re-running this effect while the guard is still true (stage only flips to
  // "brief" in the async onSuccess) → a storm of concurrent PATCH writes.
  const briefSavedForRef = useRef<string | null>(null);

  // Wire research-stream completion → transition to brief stage
  useEffect(() => {
    if (
      stage.name === "research" &&
      research.state.status === "complete"
    ) {
      const brief = research.state.brief;
      const prospect = stage.prospect;
      if (briefSavedForRef.current === prospect.id) return; // already firing/fired
      briefSavedForRef.current = prospect.id;
      updateMutation.mutate(
        { id: prospect.id, input: { researchBrief: brief } },
        {
          onSuccess: (updated) => {
            setStage({ name: "brief", prospect: updated, brief });
          },
          onError: (err) => {
            briefSavedForRef.current = null; // allow a retry on failure
            toast({
              title: "Could not save research brief",
              description: err.message,
              variant: "destructive",
            });
          },
        },
      );
    }
  }, [stage, research.state, updateMutation, toast]);

  function getDraftProspectId(): string | null {
    if (stage.name === "research") return stage.prospect.id;
    if (stage.name === "brief") return stage.prospect.id;
    if (stage.name === "message") return stage.prospect.id;
    return null;
  }

  // ── Apollo discovery → form pre-fill ─────────────────────────────────────

  function handleApolloComplete(result: ApolloDiscoveryResult) {
    const { contact, org, person } = result;
    const discovered: Partial<SeederFormValues> = {};

    // Phone: only set if non-null. Apollo typically returns E.164.
    if (contact.phone) discovered.phone = contact.phone;

    // Name: prefer the full `name` field; fall back to first+last.
    const fullName =
      contact.name ??
      `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim();
    if (fullName) discovered.prospectName = fullName;

    // Brand: the org we're targeting.
    if (org.name) discovered.brand = org.name;

    // Country: only set if Apollo's value is a clean 2-letter ISO code.
    // Apollo sometimes returns full names ("United States") which would
    // fail validation; better to leave blank than pre-fill garbage.
    const apolloCountry = (
      contact.country ??
      org.country ??
      ""
    ).trim();
    if (/^[A-Z]{2}$/.test(apolloCountry)) {
      discovered.country = apolloCountry;
    }

    // Language: Apollo doesn't tell us. Leave default ("en").

    // Sub-vertical / product: Apollo's industry is loosely related but
    // not 1:1 with subVertical. Leave for the SDR to fill in based on
    // the actual product they're prospecting.

    setFormDefaults(discovered);
    setApolloMetadata({
      apolloPersonId: person.id,
      apolloOrgId: org.id,
    });
    setFormKey((k) => k + 1);
    setApolloOpen(false);

    const phoneNote = contact.phone
      ? ""
      : " (no phone — fill manually before saving)";
    toast({
      title: "Form pre-filled from Apollo",
      description: `${fullName}${phoneNote}`,
    });
  }

  // ── Stage transitions ────────────────────────────────────────────────────

  async function handleFormSubmit(values: SeederFormValues) {
    const input = formValuesToCreateInput(values);
    // Override sourceMode + add apollo IDs if discovery was used.
    if (apolloMetadata) {
      input.sourceMode = "apollo";
      input.apolloPersonId = apolloMetadata.apolloPersonId;
      input.apolloOrgId = apolloMetadata.apolloOrgId;
    }

    try {
      const prospect = await createMutation.mutateAsync(input);
      const researchInput: ResearchInput = {
        brand: values.brand.trim(),
        country: values.country.trim(),
        language: values.language.trim(),
        subVertical: values.subVertical.trim(),
        product: values.product.trim(),
        sdrContextNotes: values.sdrContextNotes?.trim() || undefined,
      };
      setStage({ name: "research", prospect, researchInput });
      research.start(researchInput);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Could not save prospect",
        description: message,
        variant: "destructive",
      });
    }
  }

  function handleResearchCancel() {
    // FE14: only ASK here — don't tear down the stream. Previously this called
    // research.cancel() and then opened the dialog, so choosing "Keep working"
    // left stage="research" with a dead (idle) stream and nothing to resume
    // into — a blank dead-end. Leaving the stream running means "Keep working"
    // resumes seamlessly (no re-incurred cost); "Delete draft" (handleAbandon)
    // is the single path that resets/stops the stream.
    setAbandonOpen(true);
  }

  function handleResearchRetry() {
    if (stage.name === "research") {
      research.start(stage.researchInput);
    }
  }

  async function handleBriefSave(brief: ProspectBrief) {
    if (stage.name !== "brief") return;
    try {
      const updated = await updateMutation.mutateAsync({
        id: stage.prospect.id,
        input: { researchBrief: brief },
      });
      const result = await generateMutation.mutateAsync(stage.prospect.id);
      setStage({
        name: "message",
        prospect: updated,
        brief,
        result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Could not generate message",
        description: message,
        variant: "destructive",
      });
    }
  }

  async function handleMessageRegenerate() {
    if (stage.name !== "message") return;
    try {
      const result = await generateMutation.mutateAsync(stage.prospect.id);
      setStage({ ...stage, result });
      toast({
        title: "New message generated",
        description: `Cost $${result.costUsd.toFixed(4)}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Could not regenerate",
        description: message,
        variant: "destructive",
      });
    }
  }

  async function handleMessageDone(editedBody: string) {
    if (stage.name !== "message") return;
    const trimmed = editedBody.trim();
    // FE13: persist manual edits so the send flow uses what the SDR sees. The
    // prospects PATCH route accepts firstMessageBody (edit-message-capability);
    // only write when it actually changed from the generated body.
    if (trimmed && trimmed !== stage.result.message.trim()) {
      try {
        await updateMutation.mutateAsync({
          id: stage.prospect.id,
          input: { firstMessageBody: trimmed },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        toast({
          title: "Could not save your edits",
          description: message,
          variant: "destructive",
        });
        return; // stay on review so the SDR can retry or copy
      }
    }
    setStage({ name: "done", prospect: stage.prospect });
  }

  async function handleAbandon() {
    const draftId = getDraftProspectId();
    setAbandonOpen(false);
    if (!draftId) {
      setStage({ name: "form" });
      return;
    }
    try {
      await deleteMutation.mutateAsync(draftId);
      toast({ title: "Draft deleted" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Could not delete draft",
        description: `${message}. The draft prospect still exists in the database.`,
        variant: "destructive",
      });
    } finally {
      research.reset();
      setStage({ name: "form" });
    }
  }

  function handleStartOver() {
    setStage({ name: "form" });
    research.reset();
    // Clear Apollo pre-fill so the next seeder starts blank
    setFormDefaults({});
    setApolloMetadata(null);
    setFormKey((k) => k + 1);
  }

  async function handleOpenInChannel(prospect: Prospect) {
    const CHANNEL_LABEL: Record<SendIntentChannel, string> = {
      whatsapp: "WhatsApp",
      telegram: "Telegram",
      linkedin: "LinkedIn",
    };
    const channel: SendIntentChannel =
      prospect.firstMessageChannel === "telegram"
        ? "telegram"
        : prospect.firstMessageChannel === "linkedin"
          ? "linkedin"
          : "whatsapp";
    // LinkedIn is clipboard-only (its deep link can't prefill the composer), so
    // the message MUST be copied or the SDR opens an empty profile. Telegram's
    // t.me?text= is also unreliable for plain handles.
    const isClipboard = channel === "telegram" || channel === "linkedin";

    try {
      const result = await prepareFirst.mutateAsync({
        prospectId: prospect.id,
        input: { channel },
      });

      if (result.deepLinkUrl) {
        if (isClipboard && result.message) {
          void navigator.clipboard.writeText(result.message).catch(() => {});
        }
        window.open(result.deepLinkUrl, "_blank", "noopener,noreferrer");
        setPendingSend({
          prospectId: prospect.id,
          followupId: null,
          channel,
        });
        setSendConfirmOpen(true);
        toast({
          title: `Opening ${CHANNEL_LABEL[channel]}${isClipboard ? " — message copied" : ""}`,
          description:
            channel === "linkedin"
              ? "LinkedIn can't prefill text — paste the copied message into the profile."
              : "Review the message and press Send in the app.",
        });
        return;
      }

      channelLink.mutate(
        { prospectId: prospect.id, channel },
        {
          onSuccess: (data) => {
            if (isClipboard && data.body) {
              void navigator.clipboard.writeText(data.body).catch(() => {});
            }
            window.open(data.url, "_blank", "noopener,noreferrer");
            toast({
              title: `Opening ${CHANNEL_LABEL[channel]}${isClipboard ? " — message copied" : ""}`,
            });
          },
          onError: (err) => {
            toast({
              title: "Could not open chat",
              description: err.message,
              variant: "destructive",
            });
          },
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Could not prepare message",
        description: message,
        variant: "destructive",
      });
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const isLanguageNonEnglish =
    stage.name === "brief" || stage.name === "message"
      ? !["en", "en-US", "en-GB"].includes(stage.prospect.language ?? "en")
      : false;

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1
          className="text-2xl font-semibold tracking-tight flex items-center gap-2"
          data-testid="page-title"
        >
          <Sparkles className="h-6 w-6 text-[#4FFFE3]" />
          Apollo seeder
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Discover prospects via Apollo, run full LLM research, generate the
          first message from doctrine, then send from Contacts or All prospects.
          For people you already know, use{" "}
          <a href="/contacts" className="text-[#4FFFE3] hover:underline">
            Contacts
          </a>{" "}
          instead.
        </p>
      </header>

      <StageIndicator stage={stage.name} />

      {stage.name === "form" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 p-4 rounded-md border bg-card">
            <div className="space-y-0.5">
              <h2 className="text-sm font-medium">Discover via Apollo</h2>
              <p className="text-xs text-muted-foreground">
                Search for a brand, pick a person, and pre-fill the form. Reveal costs 1 Apollo credit.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setApolloOpen(true)}
              data-testid="button-apollo-open"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Open Apollo picker
            </Button>
          </div>

          {apolloMetadata && (
            <div
              className="rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-sm flex items-center justify-between gap-2"
              data-testid="apollo-prefill-banner"
            >
              <span>
                Form pre-filled from Apollo. Fill in any missing fields, then submit.
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFormDefaults({});
                  setApolloMetadata(null);
                  setFormKey((k) => k + 1);
                }}
                data-testid="button-apollo-clear"
              >
                Clear
              </Button>
            </div>
          )}

          <SeederForm
            key={formKey}
            defaultValues={formDefaults}
            onSubmit={handleFormSubmit}
            isSubmitting={createMutation.isPending}
          />
        </div>
      )}

      {stage.name === "research" && (
        <div className="space-y-4">
          <ResearchProgress
            state={research.state}
            onCancel={handleResearchCancel}
            onRetry={handleResearchRetry}
          />
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => setAbandonOpen(true)}
              data-testid="button-research-abandon"
            >
              Abandon draft
            </Button>
          </div>
        </div>
      )}

      {stage.name === "brief" && (
        <BriefEditor
          initialBrief={stage.brief}
          onSave={handleBriefSave}
          onCancel={() => setAbandonOpen(true)}
          isSaving={updateMutation.isPending || generateMutation.isPending}
          isLanguageNonEnglish={isLanguageNonEnglish}
        />
      )}

      {stage.name === "message" && (
        <MessageReview
          result={stage.result}
          onRegenerate={handleMessageRegenerate}
          onDone={handleMessageDone}
          isRegenerating={generateMutation.isPending}
        />
      )}

      {stage.name === "done" && (
        <Card data-testid="seeder-done">
          <CardContent className="p-12 text-center space-y-4">
            <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto" />
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Prospect saved</h2>
              <p className="text-sm text-muted-foreground">
                The first message is on the prospect record. Send it from the
                prospect detail page when ready.
              </p>
            </div>
            <div className="flex justify-center gap-2 flex-wrap">
              {(stage.prospect.firstMessageChannel === "whatsapp" ||
                stage.prospect.firstMessageChannel === "telegram" ||
                stage.prospect.phone ||
                stage.prospect.telegramHandle) && (
                <Button
                  onClick={() => void handleOpenInChannel(stage.prospect)}
                  disabled={
                    prepareFirst.isPending || channelLink.isPending
                  }
                  data-testid="button-open-channel"
                >
                  {prepareFirst.isPending || channelLink.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4 mr-2" />
                  )}
                  Open in{" "}
                  {stage.prospect.firstMessageChannel === "telegram"
                    ? "Telegram"
                    : "WhatsApp"}
                </Button>
              )}
              {stage.prospect.campaignId && (
                <Link href={`/campaigns/${stage.prospect.campaignId}`}>
                  <Button variant="outline" data-testid="button-view-campaign">
                    View campaign
                  </Button>
                </Link>
              )}
              <Button
                onClick={handleStartOver}
                data-testid="button-start-over"
              >
                Start another
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={apolloOpen} onOpenChange={setApolloOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Apollo discovery</DialogTitle>
          </DialogHeader>
          <ApolloPicker
            onComplete={handleApolloComplete}
            onCancel={() => setApolloOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <SendConfirmDialog
        open={sendConfirmOpen}
        onOpenChange={(open) => {
          setSendConfirmOpen(open);
          if (!open) setPendingSend(null);
        }}
        pending={pendingSend}
        onError={(message) =>
          toast({
            title: "Could not record send",
            description: message,
            variant: "destructive",
          })
        }
      />

      <AlertDialog open={abandonOpen} onOpenChange={setAbandonOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abandon draft?</AlertDialogTitle>
            <AlertDialogDescription>
              The draft prospect will be deleted. Apollo credits and research
              spend already consumed are not refunded. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-abandon-cancel">
              Keep working
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAbandon}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-abandon-confirm"
            >
              Delete draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

const STAGES: { key: Stage["name"]; label: string }[] = [
  { key: "form", label: "Input" },
  { key: "research", label: "Research" },
  { key: "brief", label: "Brief" },
  { key: "message", label: "Message" },
  { key: "done", label: "Done" },
];

function StageIndicator({ stage }: { stage: Stage["name"] }) {
  const currentIdx = STAGES.findIndex((s) => s.key === stage);
  return (
    <ol className="flex items-center gap-2 text-xs" data-testid="stage-indicator">
      {STAGES.map((s, idx) => {
        const active = idx === currentIdx;
        const done = idx < currentIdx;
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={`flex items-center justify-center h-5 w-5 rounded-full text-[10px] ${
                active
                  ? "bg-primary text-primary-foreground"
                  : done
                    ? "bg-green-600 text-white"
                    : "bg-muted text-muted-foreground"
              }`}
              data-testid={`stage-${s.key}`}
            >
              {idx + 1}
            </span>
            <span
              className={
                active
                  ? "font-medium"
                  : done
                    ? "text-muted-foreground"
                    : "text-muted-foreground"
              }
            >
              {s.label}
            </span>
            {idx < STAGES.length - 1 && (
              <span className="text-muted-foreground/50 mx-1">→</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
