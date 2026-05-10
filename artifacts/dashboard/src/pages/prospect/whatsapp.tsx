import { useEffect, useRef, useState } from "react";
import { ArrowRight, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ApiError } from "@/lib/api";
import {
  searchOrg,
  searchPeople,
  revealContact,
  requestPhoneReveal,
  type ApolloOrgSummary,
  type ApolloPersonSummary,
} from "@/lib/api/apollo";
import { resolveUrls } from "@/lib/api/prospector";
import {
  createProspect,
  updateProspect,
  type ProspectBrief,
} from "@/lib/api/prospects";
import { generateMessage } from "@/lib/api/seeder";
import { UrlInput, type UrlInputSubmit } from "@/components/whatsapp-bulk/UrlInput";
import {
  DiscoveryProgress,
  type UrlDiscoveryState,
} from "@/components/whatsapp-bulk/DiscoveryProgress";
import {
  CandidateGrid,
  type Candidate,
} from "@/components/whatsapp-bulk/CandidateGrid";
import { RevealConfirmDialog } from "@/components/whatsapp-bulk/RevealConfirmDialog";
import {
  BulkSavingProgress,
  type CandidateProcessing,
} from "@/components/whatsapp-bulk/BulkSavingProgress";
import { BulkResults } from "@/components/whatsapp-bulk/BulkResults";

const DISCOVERY_CONCURRENCY = 4;
const FANOUT_CONCURRENCY = 3;

type Stage =
  | { name: "input" }
  | {
      name: "discover";
      states: UrlDiscoveryState[];
      titles: string[];
      country: string | null;
    }
  | {
      name: "grid";
      candidates: Candidate[];
    }
  | {
      name: "saving";
      states: CandidateProcessing[];
    }
  | {
      name: "done";
      states: CandidateProcessing[];
    };

export default function ProspectWhatsAppPage() {
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>({ name: "input" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<Candidate[]>([]);
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  // Reset cancellation flag whenever we enter a new long-running stage
  useEffect(() => {
    if (stage.name === "discover" || stage.name === "saving") {
      cancelRef.current = { cancelled: false };
    }
  }, [stage.name]);

  // ── INPUT → DISCOVER ─────────────────────────────────────────────────
  async function handleInputSubmit(input: UrlInputSubmit) {
    const initial: UrlDiscoveryState[] = input.urls.map((u) => ({
      inputUrl: u,
      stage: "pending",
    }));
    setStage({
      name: "discover",
      states: initial,
      titles: input.titles,
      country: input.country,
    });
    void runDiscovery(input);
  }

  async function runDiscovery(input: UrlInputSubmit) {
    // Step 1: resolve all URLs in one batched server call. While the
    // request is in flight, every slot shows "resolving".
    setStage((prev) => {
      if (prev.name !== "discover") return prev;
      const next = prev.states.map((s) => ({ ...s, stage: "resolving" as const }));
      return { ...prev, states: next };
    });

    let resolutions;
    try {
      const r = await resolveUrls({ urls: input.urls });
      resolutions = r.resolved;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "resolve-urls failed";
      setStage((prev) => {
        if (prev.name !== "discover") return prev;
        return {
          ...prev,
          states: prev.states.map((s) => ({
            ...s,
            stage: "failed",
            error: msg,
          })),
        };
      });
      return;
    }

    // Map resolutions back to URL slots and stamp brands into state.
    const byUrl = new Map<string, (typeof resolutions)[number]>();
    for (const r of resolutions) byUrl.set(r.url, r);

    setStage((prev) => {
      if (prev.name !== "discover") return prev;
      return {
        ...prev,
        states: prev.states.map((s) => {
          const r = byUrl.get(s.inputUrl);
          if (!r) return { ...s, stage: "failed", error: "no resolution returned" };
          if (r.error) return { ...s, stage: "failed", error: r.error };
          if (!r.brand)
            return {
              ...s,
              stage: "failed",
              error: "no brand resolved from URL",
            };
          return { ...s, brand: r.brand, stage: "searching-org" };
        }),
      };
    });

    // Step 2-3: per-URL fan-out — searchOrg → searchPeople. Concurrency 4.
    //
    // We pass the brand directly through the worker closure rather than
    // reading state. Reading React state from inside an async function is
    // unreliable (setStage updaters may be batched/deferred under React 18),
    // so the brand we need comes from the resolutions map captured above.
    const tasks = input.urls.map((url, idx) => ({
      url,
      idx,
      brand: byUrl.get(url)?.brand ?? null,
      hadError: byUrl.get(url)?.error ?? null,
    }));

    await runWithConcurrency(tasks, DISCOVERY_CONCURRENCY, async (task) => {
      if (cancelRef.current.cancelled) return;
      // Skip slots already marked failed by the resolutions pass above.
      if (task.hadError || !task.brand) return;
      try {
        const orgRes = await searchOrg({
          brand: task.brand,
          country: input.country ?? undefined,
        });
        const org = orgRes.orgs?.[0];
        if (!org) {
          updateDiscoverySlot(task.idx, {
            stage: "failed",
            error: "no Apollo org found for brand",
          });
          return;
        }
        updateDiscoverySlot(task.idx, { org, stage: "searching-people" });
        const peopleRes = await searchPeople({
          orgId: org.id,
          titles: input.titles.length > 0 ? input.titles : undefined,
        });
        updateDiscoverySlot(task.idx, {
          people: peopleRes.people ?? [],
          stage: "complete",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        updateDiscoverySlot(task.idx, { stage: "failed", error: msg });
      }
    });
  }

  function updateDiscoverySlot(
    idx: number,
    patch: Partial<UrlDiscoveryState>,
  ) {
    setStage((prev) => {
      if (prev.name !== "discover") return prev;
      const next = [...prev.states];
      const cur = next[idx];
      if (!cur) return prev;
      next[idx] = { ...cur, ...patch };
      return { ...prev, states: next };
    });
  }

  function handleDiscoveryCancel() {
    cancelRef.current.cancelled = true;
    setStage({ name: "input" });
  }

  function handleProceedToGrid() {
    if (stage.name !== "discover") return;
    const candidates: Candidate[] = [];
    for (const s of stage.states) {
      if (s.stage !== "complete" || !s.org || !s.people) continue;
      for (const p of s.people) {
        candidates.push({ person: p, org: s.org, sourceUrl: s.inputUrl });
      }
    }
    if (candidates.length === 0) {
      toast({
        title: "No candidates found",
        description: "Try different URLs or relax the title filters.",
      });
      return;
    }
    setStage({ name: "grid", candidates });
  }

  // ── GRID → ESTIMATE → REVEAL ─────────────────────────────────────────
  function handleGridConfirm(selected: Candidate[]) {
    setPendingSelection(selected);
    setConfirmOpen(true);
  }

  function handleConfirmGo() {
    setConfirmOpen(false);
    const selected = pendingSelection;
    const initial: CandidateProcessing[] = selected.map((c) => ({
      candidate: c,
      stage: "queued",
    }));
    setStage({ name: "saving", states: initial });
    void runFanout(selected);
  }

  async function runFanout(selected: Candidate[]) {
    const indices = selected.map((_, i) => i);
    await runWithConcurrency(indices, FANOUT_CONCURRENCY, async (i) => {
      if (cancelRef.current.cancelled) return;
      await processOne(i, selected[i]!);
    });
    // Transition to DONE once everything is settled
    setStage((prev) => {
      if (prev.name !== "saving") return prev;
      return { name: "done", states: prev.states };
    });
  }

  function updateProcessingSlot(idx: number, patch: Partial<CandidateProcessing>) {
    setStage((prev) => {
      if (prev.name !== "saving") return prev;
      const next = [...prev.states];
      const cur = next[idx];
      if (!cur) return prev;
      next[idx] = { ...cur, ...patch };
      return { ...prev, states: next };
    });
  }

  async function processOne(idx: number, c: Candidate) {
    const isYes = c.person.directPhoneStatus === "yes";

    try {
      let prospectId: string;
      let phoneFromReveal: string | null = null;
      let revealedLastName: string | null = null;
      let revealedLinkedin: string | null = null;

      // ── Step 1: reveal (yes path only) ──
      if (isYes) {
        updateProcessingSlot(idx, { stage: "revealing" });
        const r = await revealContact(c.person.id);
        phoneFromReveal = r.contact.phone;
        revealedLastName = r.contact.lastName;
        revealedLinkedin = r.contact.linkedinUrl;
        if (!phoneFromReveal) {
          // Apollo charged the credit but returned no phone. Treat as failed
          // — the prospect can't be created without phone (yes path expects
          // a real phone). The "maybe" path handles the no-phone case.
          updateProcessingSlot(idx, {
            stage: "failed",
            error: "reveal returned no phone",
          });
          return;
        }
      }

      // ── Step 2: create prospect ──
      updateProcessingSlot(idx, { stage: "creating" });
      const prospectName =
        revealedLastName
          ? `${c.person.firstName ?? ""} ${revealedLastName}`.trim()
          : c.person.firstName ?? c.person.name ?? null;

      const created = await createProspect({
        ...(isYes && phoneFromReveal ? { phone: phoneFromReveal } : {}),
        sourceMode: "apollo",
        prospectName: prospectName || undefined,
        company: c.org.name ?? c.person.organizationName ?? undefined,
        title: c.person.title ?? undefined,
        country: c.person.country ?? c.org.country ?? undefined,
        language: "en",
        linkedinUrl: revealedLinkedin ?? c.person.linkedinUrl ?? undefined,
        apolloPersonId: c.person.id,
        apolloOrgId: c.person.organizationId ?? c.org.id ?? undefined,
      });
      prospectId = created.id;
      updateProcessingSlot(idx, { prospectId });

      // ── Step 3: request phone reveal (maybe path only) ──
      if (!isYes) {
        updateProcessingSlot(idx, { stage: "requesting-phone-reveal" });
        await requestPhoneReveal({
          prospectId: created.id,
          personId: c.person.id,
        });
      }

      // ── Step 4: stub brief + PATCH ──
      updateProcessingSlot(idx, { stage: "writing-brief" });
      const brief = synthesizeStubBrief(c);
      await updateProspect(created.id, { researchBrief: brief });

      // ── Step 5: generate message ──
      updateProcessingSlot(idx, { stage: "generating-message" });
      await generateMessage(created.id);

      updateProcessingSlot(idx, {
        stage: isYes ? "ready" : "ready-pending-phone",
      });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `${err.status} ${err.code ?? err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      updateProcessingSlot(idx, { stage: "failed", error: msg });
    }
  }

  // ── DONE ────────────────────────────────────────────────────────────
  function handleNewBatch() {
    setStage({ name: "input" });
    setPendingSelection([]);
    cancelRef.current = { cancelled: false };
  }

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Prospect</span>
          <ArrowRight className="h-3 w-3" />
          <MessageCircle className="h-3 w-3" />
          <span>WhatsApp</span>
        </div>
        <h1
          className="text-2xl font-semibold tracking-tight"
          data-testid="page-title"
        >
          Prospect contacts via WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground">
          Source new prospects in bulk from URLs and reach them on WhatsApp.
        </p>
      </header>

      <StageIndicator stage={stage.name} />

      {stage.name === "input" && <UrlInput onSubmit={handleInputSubmit} />}
      {stage.name === "discover" && (
        <DiscoveryProgress
          states={stage.states}
          onCancel={handleDiscoveryCancel}
          onProceedToGrid={handleProceedToGrid}
        />
      )}
      {stage.name === "grid" && (
        <CandidateGrid
          candidates={stage.candidates}
          onBack={() => setStage({ name: "input" })}
          onConfirm={handleGridConfirm}
        />
      )}
      {stage.name === "saving" && (
        <BulkSavingProgress states={stage.states} />
      )}
      {stage.name === "done" && (
        <BulkResults states={stage.states} onStartNewBatch={handleNewBatch} />
      )}

      <RevealConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        selected={pendingSelection}
        onConfirm={handleConfirmGo}
      />
    </section>
  );
}

const STAGES: { key: Stage["name"]; label: string }[] = [
  { key: "input", label: "URLs" },
  { key: "discover", label: "Discover" },
  { key: "grid", label: "Pick" },
  { key: "saving", label: "Reveal & save" },
  { key: "done", label: "Done" },
];

function StageIndicator({ stage }: { stage: Stage["name"] }) {
  const idx = STAGES.findIndex((s) => s.key === stage);
  return (
    <ol className="flex items-center gap-2 text-xs" data-testid="bulk-stage-indicator">
      {STAGES.map((s, i) => {
        const active = i === idx;
        const done = i < idx;
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
            >
              {i + 1}
            </span>
            <span className={active ? "font-medium" : "text-muted-foreground"}>
              {s.label}
            </span>
            {i < STAGES.length - 1 && (
              <span className="text-muted-foreground/50 mx-1">→</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Run an async fn over items with bounded concurrency. Each item
 * runs independently; an error in one does not stop the others
 * (the fn is responsible for its own error handling — typically by
 * stamping a "failed" status onto state).
 */
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let nextIdx = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      while (true) {
        const my = nextIdx++;
        if (my >= items.length) return;
        await fn(items[my]!);
      }
    },
  );
  await Promise.all(workers);
}

/**
 * Synthesize a minimal but well-formed ProspectBrief from Apollo data
 * alone — no LLM calls, no research stream. Used by the bulk flow so
 * generateMessage's `isResearchBrief` precondition passes. The brief's
 * empty/unknown fields cause the message generator to fall back to its
 * generic doctrine prompts; messages are doctrine-correct but less
 * personalized than seeder's full-research output.
 *
 * SDR can re-research individual prospects via the seeder later.
 */
function synthesizeStubBrief(c: Candidate): ProspectBrief {
  return {
    determinedCountry: c.person.country ?? c.org.country ?? "",
    determinedScaleTier: "unknown",
    scaleRationale: "Bulk-flow stub brief; scale not researched",
    calibratedDailyVolume: 0,
    primaryEvent: "",
    alternativeEvents: [],
    finalCompetitors: [],
    subsidiaryCheckNote: "Bulk-flow stub; not researched",
    marketContext: "",
    prospectSpecificHook: "",
    prospectPrimaryGrowthProblem: "",
    whyArgument: "",
    validationArgument: "",
    howArgument: "",
    tangibleReasons: [],
    whyArgumentNative: "",
    validationArgumentNative: "",
    howArgumentNative: "",
    generatedAt: new Date().toISOString(),
    generatorModel: "stub-2.3-fe",
    generatorCostUsd: 0,
  };
}
