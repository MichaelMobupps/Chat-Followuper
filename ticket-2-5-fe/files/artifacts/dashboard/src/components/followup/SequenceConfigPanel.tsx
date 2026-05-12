/**
 * Sequence config panel — Ticket 2.5-FE.
 *
 * Reads /api/users/me/sequence-config; writes a PATCH on Save.
 * Uses a Sheet so the panel doesn't compete with the row list for
 * screen real estate.
 *
 * Notes:
 *  - The BE refines maxDays >= minDays per stage and sendHourEnd >
 *    sendHourStart at the request level. The UI mirrors those rules
 *    with local validation before submit; the server is the source of
 *    truth for error reporting.
 *  - doctrineVariant per stage is selectable here but the LLM generator
 *    does not yet consume it (handoff §5.6). A small note conveys that.
 */
import { useEffect, useState, type ChangeEvent } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useSequenceConfig,
  usePatchSequenceConfig,
} from "@/hooks/use-sequence-config";
import {
  DOCTRINE_VARIANTS,
  DAY_LABELS,
  VARIANT_LABELS,
  type DoctrineVariant,
  type SequenceConfig,
  type SequenceConfigPatch,
  type StageTiming,
} from "@/lib/api/sequence-config";
import { ApiError } from "@/lib/api";

const DEFAULT_VARIANT_BY_INDEX: DoctrineVariant[] = [
  "new_insight",
  "competitor_move",
  "easy_out",
];
function defaultVariantForStage(stageIndex: number): DoctrineVariant {
  return DEFAULT_VARIANT_BY_INDEX[stageIndex] ?? "fresh_angle";
}

interface FormState {
  stageTiming: StageTiming[];
  sendDays: number[];
  sendHourStart: number;
  sendHourEnd: number;
  maxFollowups: number;
  requireApproval: boolean;
  digestHourLocal: number;
  digestTimezone: string;
}

function configToForm(c: SequenceConfig): FormState {
  return {
    stageTiming: c.stageTiming.map((s) => ({ ...s })),
    sendDays: [...c.sendDays].sort((a, b) => a - b),
    sendHourStart: c.sendHourStart,
    sendHourEnd: c.sendHourEnd,
    maxFollowups: c.maxFollowups,
    requireApproval: c.requireApproval,
    digestHourLocal: c.digestHourLocal,
    digestTimezone: c.digestTimezone,
  };
}

function formatTimingErrors(form: FormState): string | null {
  for (let i = 0; i < form.stageTiming.length; i++) {
    const s = form.stageTiming[i]!;
    if (s.maxDays < s.minDays) {
      return `Stage ${i + 1}: max days must be at least min days.`;
    }
    if (s.minDays < 0 || s.maxDays < 0) {
      return `Stage ${i + 1}: days must be 0 or more.`;
    }
  }
  if (form.sendHourEnd <= form.sendHourStart) {
    return "Send hour end must be after send hour start.";
  }
  if (form.sendDays.length === 0) {
    return "Pick at least one send day.";
  }
  return null;
}

export function SequenceConfigPanel() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid="open-sequence-config"
        >
          <Settings className="h-4 w-4 mr-2" />
          Sequence config
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>Follow-up sequence</SheetTitle>
          <SheetDescription>
            How many stages, when they run, and which doctrine variant each
            stage uses.
          </SheetDescription>
        </SheetHeader>
        <PanelBody onClose={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

function PanelBody({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const query = useSequenceConfig();
  const patch = usePatchSequenceConfig();
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (query.data && !form) {
      setForm(configToForm(query.data));
    }
  }, [query.data, form]);

  if (query.isLoading || !form) {
    return (
      <div className="py-6 space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="py-6 text-sm text-destructive">
        Could not load sequence config:{" "}
        {query.error instanceof ApiError
          ? query.error.code ?? query.error.message
          : (query.error as Error).message}
      </div>
    );
  }

  const localError = formatTimingErrors(form);

  function update<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: val } : prev));
  }

  function updateStage(idx: number, patchStage: Partial<StageTiming>) {
    setForm((prev) => {
      if (!prev) return prev;
      const next = prev.stageTiming.map((s, i) =>
        i === idx ? { ...s, ...patchStage } : s,
      );
      return { ...prev, stageTiming: next };
    });
  }

  function addStage() {
    setForm((prev) => {
      if (!prev) return prev;
      if (prev.stageTiming.length >= 10) return prev;
      const next: StageTiming = {
        minDays: 3,
        maxDays: 5,
        doctrineVariant: defaultVariantForStage(prev.stageTiming.length),
      };
      return { ...prev, stageTiming: [...prev.stageTiming, next] };
    });
  }

  function removeStage(idx: number) {
    setForm((prev) => {
      if (!prev) return prev;
      if (prev.stageTiming.length <= 1) return prev;
      return {
        ...prev,
        stageTiming: prev.stageTiming.filter((_, i) => i !== idx),
      };
    });
  }

  function toggleDay(day: number) {
    setForm((prev) => {
      if (!prev) return prev;
      const set = new Set(prev.sendDays);
      if (set.has(day)) set.delete(day);
      else set.add(day);
      return {
        ...prev,
        sendDays: [...set].sort((a, b) => a - b),
      };
    });
  }

  function handleSave() {
    if (!form) return;
    const validation = formatTimingErrors(form);
    if (validation) {
      toast({ title: "Invalid config", description: validation });
      return;
    }
    const body: SequenceConfigPatch = {
      stageTiming: form.stageTiming,
      sendDays: form.sendDays,
      sendHourStart: form.sendHourStart,
      sendHourEnd: form.sendHourEnd,
      maxFollowups: form.maxFollowups,
      requireApproval: form.requireApproval,
      digestHourLocal: form.digestHourLocal,
      digestTimezone: form.digestTimezone,
    };
    patch.mutate(body, {
      onSuccess: () => {
        toast({ title: "Sequence config saved" });
        onClose();
      },
      onError: (err) => {
        toast({
          title: "Save failed",
          description:
            err instanceof ApiError
              ? `${err.status} ${err.code ?? err.message}`
              : (err as Error).message,
        });
      },
    });
  }

  return (
    <div className="py-6 space-y-6">
      {/* Stage timing */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Stages</h3>
          <Button
            size="sm"
            variant="ghost"
            onClick={addStage}
            disabled={form.stageTiming.length >= 10}
            data-testid="add-stage"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add stage
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          doctrineVariant is stored now and consumed by the message generator
          in a later ticket.
        </p>
        <div className="space-y-3">
          {form.stageTiming.map((stage, idx) => (
            <div
              key={idx}
              className="rounded-md border p-3 space-y-2"
              data-testid={`stage-row-${idx}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Stage {idx + 1}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeStage(idx)}
                  disabled={form.stageTiming.length <= 1}
                  data-testid={`remove-stage-${idx}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor={`stage-${idx}-min`}>
                    Min days
                  </Label>
                  <Input
                    id={`stage-${idx}-min`}
                    type="number"
                    min={0}
                    max={365}
                    value={stage.minDays}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      updateStage(idx, {
                        minDays: Number.parseInt(e.target.value, 10) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor={`stage-${idx}-max`}>
                    Max days
                  </Label>
                  <Input
                    id={`stage-${idx}-max`}
                    type="number"
                    min={0}
                    max={365}
                    value={stage.maxDays}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      updateStage(idx, {
                        maxDays: Number.parseInt(e.target.value, 10) || 0,
                      })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Doctrine variant</Label>
                <Select
                  value={stage.doctrineVariant ?? defaultVariantForStage(idx)}
                  onValueChange={(v) =>
                    updateStage(idx, {
                      doctrineVariant: v as DoctrineVariant,
                    })
                  }
                >
                  <SelectTrigger data-testid={`stage-${idx}-variant`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCTRINE_VARIANTS.map((v) => (
                      <SelectItem key={v} value={v}>
                        {VARIANT_LABELS[v]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Send days */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Send days</h3>
        <div className="flex flex-wrap gap-2">
          {DAY_LABELS.map((d) => {
            const checked = form.sendDays.includes(d.value);
            return (
              <label
                key={d.value}
                className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs cursor-pointer"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggleDay(d.value)}
                  data-testid={`send-day-${d.value}`}
                />
                <span>{d.short}</span>
              </label>
            );
          })}
        </div>
      </section>

      {/* Send hours */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Send window (local hours)</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="send-hour-start">
              Start
            </Label>
            <Input
              id="send-hour-start"
              type="number"
              min={0}
              max={23}
              value={form.sendHourStart}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                update(
                  "sendHourStart",
                  Number.parseInt(e.target.value, 10) || 0,
                )
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="send-hour-end">
              End
            </Label>
            <Input
              id="send-hour-end"
              type="number"
              min={0}
              max={23}
              value={form.sendHourEnd}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                update(
                  "sendHourEnd",
                  Number.parseInt(e.target.value, 10) || 0,
                )
              }
            />
          </div>
        </div>
      </section>

      {/* Max followups + approval */}
      <section className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="max-followups">
            Maximum follow-ups
          </Label>
          <Input
            id="max-followups"
            type="number"
            min={0}
            max={20}
            value={form.maxFollowups}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              update("maxFollowups", Number.parseInt(e.target.value, 10) || 0)
            }
            data-testid="max-followups"
          />
        </div>
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <div>
            <Label className="text-sm">Require manual approval</Label>
            <p className="text-xs text-muted-foreground">
              Effective once the auto-send worker ships. UI only for now.
            </p>
          </div>
          <Switch
            checked={form.requireApproval}
            onCheckedChange={(v) => update("requireApproval", v)}
            data-testid="require-approval"
          />
        </div>
      </section>

      {/* Digest */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Daily digest</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="digest-hour">
              Hour (local)
            </Label>
            <Input
              id="digest-hour"
              type="number"
              min={0}
              max={23}
              value={form.digestHourLocal}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                update(
                  "digestHourLocal",
                  Number.parseInt(e.target.value, 10) || 0,
                )
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="digest-tz">
              Timezone
            </Label>
            <Input
              id="digest-tz"
              value={form.digestTimezone}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                update("digestTimezone", e.target.value)
              }
              placeholder="Asia/Jerusalem"
            />
          </div>
        </div>
      </section>

      {localError && (
        <p className="text-sm text-destructive" data-testid="config-error">
          {localError}
        </p>
      )}

      <SheetFooter>
        <Button
          variant="outline"
          onClick={onClose}
          disabled={patch.isPending}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={patch.isPending || localError !== null}
          data-testid="save-sequence-config"
        >
          {patch.isPending ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
    </div>
  );
}
