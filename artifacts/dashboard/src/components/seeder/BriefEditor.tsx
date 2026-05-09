import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Plus } from "lucide-react";
import type { ProspectBrief } from "@/lib/api/prospects";

interface Props {
  initialBrief: ProspectBrief;
  onSave: (brief: ProspectBrief) => void | Promise<void>;
  onCancel: () => void;
  isSaving?: boolean;
  isLanguageNonEnglish?: boolean;
}

/**
 * Editable fields are the argument-craft fields that the message generator
 * directly consumes. Research metadata (country, scale tier, competitors,
 * generated-at) is shown read-only — re-running research replaces the
 * whole brief, not mutates it.
 *
 * For the *Native fields, only show inputs when language is non-English.
 * If language is English, those fields stay empty and aren't surfaced.
 */
export function BriefEditor({
  initialBrief,
  onSave,
  onCancel,
  isSaving,
  isLanguageNonEnglish,
}: Props) {
  const [brief, setBrief] = useState<ProspectBrief>(initialBrief);

  function update<K extends keyof ProspectBrief>(
    key: K,
    value: ProspectBrief[K],
  ) {
    setBrief((b) => ({ ...b, [key]: value }));
  }

  function updateReason(idx: number, value: string) {
    setBrief((b) => ({
      ...b,
      tangibleReasons: b.tangibleReasons.map((r, i) => (i === idx ? value : r)),
    }));
  }

  function addReason() {
    setBrief((b) => ({
      ...b,
      tangibleReasons: [...b.tangibleReasons, ""],
    }));
  }

  function removeReason(idx: number) {
    setBrief((b) => ({
      ...b,
      tangibleReasons: b.tangibleReasons.filter((_, i) => i !== idx),
    }));
  }

  function handleSave() {
    // Strip empty reasons before saving
    const cleaned: ProspectBrief = {
      ...brief,
      tangibleReasons: brief.tangibleReasons
        .map((r) => r.trim())
        .filter((r) => r.length > 0),
    };
    void onSave(cleaned);
  }

  return (
    <div className="space-y-6" data-testid="brief-editor">
      {/* Read-only research metadata */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Research metadata (read-only)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ReadOnlyField label="Country" value={brief.determinedCountry} />
            <ReadOnlyField label="Scale tier" value={brief.determinedScaleTier} />
            <ReadOnlyField
              label="Daily volume"
              value={String(brief.calibratedDailyVolume)}
            />
            <ReadOnlyField label="Primary event" value={brief.primaryEvent} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Scale rationale</Label>
            <p className="text-sm mt-1">{brief.scaleRationale}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Market context</Label>
            <p className="text-sm mt-1">{brief.marketContext}</p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Competitors</Label>
            <div className="flex flex-wrap gap-1.5">
              {brief.finalCompetitors.length === 0 && (
                <span className="text-xs text-muted-foreground italic">
                  None identified.
                </span>
              )}
              {brief.finalCompetitors.map((c) => (
                <Badge key={c} variant="outline">
                  {c}
                </Badge>
              ))}
            </div>
          </div>
          {brief.alternativeEvents.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Alternative events
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {brief.alternativeEvents.map((e) => (
                  <Badge key={e} variant="outline">
                    {e}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground pt-2">
            Generated {brief.generatedAt} · {brief.generatorModel} · $
            {brief.generatorCostUsd?.toFixed?.(4) ?? "—"}
          </p>
        </CardContent>
      </Card>

      {/* Editable arguments */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Editable arguments
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <EditableTextarea
            label="Specific hook"
            description="The personalized opening that ties this prospect's situation to MobUpps."
            value={brief.prospectSpecificHook}
            onChange={(v) => update("prospectSpecificHook", v)}
            testId="input-brief-hook"
          />
          <EditableTextarea
            label="Primary growth problem"
            description="The pain point this outreach addresses."
            value={brief.prospectPrimaryGrowthProblem}
            onChange={(v) => update("prospectPrimaryGrowthProblem", v)}
            testId="input-brief-problem"
          />
          <EditableTextarea
            label="Why argument"
            description="Why MobUpps fits this prospect specifically."
            value={brief.whyArgument}
            onChange={(v) => update("whyArgument", v)}
            testId="input-brief-why"
          />
          <EditableTextarea
            label="Validation argument"
            description="Comparable wins / proof points for this vertical."
            value={brief.validationArgument}
            onChange={(v) => update("validationArgument", v)}
            testId="input-brief-validation"
          />
          <EditableTextarea
            label="How argument"
            description="The mechanism — how MobUpps would deliver."
            value={brief.howArgument}
            onChange={(v) => update("howArgument", v)}
            testId="input-brief-how"
          />

          <div className="space-y-2">
            <Label>Tangible reasons</Label>
            <p className="text-xs text-muted-foreground">
              Concrete, measurable reasons. The message generator uses these
              as bullet points if relevant.
            </p>
            <div className="space-y-2">
              {brief.tangibleReasons.map((reason, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    value={reason}
                    onChange={(e) => updateReason(idx, e.target.value)}
                    placeholder="e.g. MAFO bids on first_deposit signal"
                    data-testid={`input-brief-reason-${idx}`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => removeReason(idx)}
                    data-testid={`button-remove-reason-${idx}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addReason}
                data-testid="button-add-reason"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add reason
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Native-language versions */}
      {isLanguageNonEnglish && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Native-language versions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Used by the message generator when the target language is not English.
            </p>
            <EditableTextarea
              label="Why argument (native)"
              value={brief.whyArgumentNative}
              onChange={(v) => update("whyArgumentNative", v)}
              testId="input-brief-why-native"
            />
            <EditableTextarea
              label="Validation argument (native)"
              value={brief.validationArgumentNative}
              onChange={(v) => update("validationArgumentNative", v)}
              testId="input-brief-validation-native"
            />
            <EditableTextarea
              label="How argument (native)"
              value={brief.howArgumentNative}
              onChange={(v) => update("howArgumentNative", v)}
              testId="input-brief-how-native"
            />
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSaving}
          data-testid="button-brief-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          data-testid="button-brief-save"
        >
          {isSaving ? "Saving…" : "Save & generate message"}
        </Button>
      </div>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <p className="text-sm font-medium mt-0.5 break-words">{value || "—"}</p>
    </div>
  );
}

interface EditableTextareaProps {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  testId: string;
}

function EditableTextarea({
  label,
  description,
  value,
  onChange,
  testId,
}: EditableTextareaProps) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        data-testid={testId}
      />
    </div>
  );
}
