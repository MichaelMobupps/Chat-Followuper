import {
  type DoctrineVariant,
  defaultVariantForStage,
  type StageTiming,
} from "@workspace/db";

const VARIANT_INSTRUCTIONS: Record<DoctrineVariant, string> = {
  new_insight:
    "Bring a NEW insight or data point the prospect has not heard in this thread.",
  competitor_move:
    "Shift to a competitor or market move angle — reference competitive dynamics.",
  easy_out:
    "Be direct and offer an easy out — low-pressure, respectful close.",
  fresh_angle:
    "Take a completely fresh angle not used in prior messages.",
  proof_point:
    "Lead with a concrete proof point, case study, or measurable result.",
  urgency:
    "Create gentle urgency — timing, window, or opportunity cost (no hard pressure).",
  social_proof:
    "Use social proof — peers, logos, or market adoption signals.",
};

export function resolveDoctrineVariant(
  stageTiming: StageTiming[],
  followupStage: number,
): DoctrineVariant {
  const idx = Math.max(0, followupStage - 1);
  const fromConfig = stageTiming[idx]?.doctrineVariant;
  if (fromConfig) return fromConfig;
  return defaultVariantForStage(idx);
}

export function doctrineVariantInstruction(variant: DoctrineVariant): string {
  return VARIANT_INSTRUCTIONS[variant];
}