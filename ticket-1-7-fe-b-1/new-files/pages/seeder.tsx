import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  SeederForm,
  formValuesToCreateInput,
  type SeederFormValues,
} from "@/components/seeder/SeederForm";
import { ResearchProgress } from "@/components/seeder/ResearchProgress";
import { BriefEditor } from "@/components/seeder/BriefEditor";
import { MessageReview } from "@/components/seeder/MessageReview";
import {
  useCreateProspect,
  useDeleteProspect,
  useGenerateMessage,
  useUpdateProspect,
} from "@/hooks/use-prospects";
import { useResearchStream } from "@/lib/sse";
import type { Prospect, ProspectBrief } from "@/lib/api/prospects";
import type { GenerateMessageResult, ResearchInput } from "@/lib/api/seeder";

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

export default function SeederPage() {
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>({ name: "form" });
  const [abandonOpen, setAbandonOpen] = useState(false);

  const createMutation = useCreateProspect();
  const updateMutation = useUpdateProspect();
  const deleteMutation = useDeleteProspect();
  const generateMutation = useGenerateMessage();
  const research = useResearchStream();

  // Wire research-stream completion → transition to brief stage
  useEffect(() => {
    if (
      stage.name === "research" &&
      research.state.status === "complete"
    ) {
      const brief = research.state.brief;
      const prospect = stage.prospect;
      // Persist the brief onto the prospect, then transition.
      updateMutation.mutate(
        { id: prospect.id, input: { researchBrief: brief } },
        {
          onSuccess: (updated) => {
            setStage({ name: "brief", prospect: updated, brief });
          },
          onError: (err) => {
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

  // ── Stage transitions ────────────────────────────────────────────────────

  async function handleFormSubmit(values: SeederFormValues) {
    const input = formValuesToCreateInput(values);
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
    research.cancel();
    // Return to form stage. The draft prospect already exists; offer abandon.
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
      // Generate message
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
      setStage({
        ...stage,
        result,
      });
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

  function handleMessageDone() {
    if (stage.name !== "message") return;
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
          className="text-2xl font-semibold tracking-tight"
          data-testid="page-title"
        >
          Seeder
        </h1>
        <p className="text-sm text-muted-foreground">
          Source new prospects and seed your outreach pipeline.
        </p>
      </header>

      {/* Stage indicator */}
      <StageIndicator stage={stage.name} />

      {stage.name === "form" && (
        <SeederForm
          onSubmit={handleFormSubmit}
          isSubmitting={createMutation.isPending}
        />
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
            <div className="flex justify-center gap-2">
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
