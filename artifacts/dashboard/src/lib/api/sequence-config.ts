/**
 * Sequence config API client — Ticket 2.5-FE.
 *
 * GET   /api/users/me/sequence-config
 * PATCH /api/users/me/sequence-config
 *
 * doctrineVariant per stage is stored but the LLM critic prompt does
 * not yet consume it; see handoff §5.6. The UI exposes the dropdown so
 * the SDR can pre-set their preference; behavior changes when the
 * variant-aware critic ticket lands.
 */
import { apiFetch } from "@/lib/api";
import { apiPath } from "@/lib/config";

export const DOCTRINE_VARIANTS = [
  "new_insight",
  "competitor_move",
  "easy_out",
  "fresh_angle",
  "proof_point",
  "urgency",
  "social_proof",
] as const;
export type DoctrineVariant = (typeof DOCTRINE_VARIANTS)[number];

export interface StageTiming {
  minDays: number;
  maxDays: number;
  doctrineVariant?: DoctrineVariant;
}

export interface SequenceConfig {
  stageTiming: StageTiming[];
  sendDays: number[]; // 0=Sun..6=Sat
  sendHourStart: number;
  sendHourEnd: number;
  maxFollowups: number;
  requireApproval: boolean;
  digestHourLocal: number;
  digestTimezone: string;
}

export type SequenceConfigPatch = Partial<SequenceConfig>;

export function getSequenceConfig(): Promise<SequenceConfig> {
  return apiFetch<SequenceConfig>(apiPath("/users/me/sequence-config"));
}

export function patchSequenceConfig(
  input: SequenceConfigPatch,
): Promise<SequenceConfig> {
  return apiFetch<SequenceConfig>(apiPath("/users/me/sequence-config"), {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// ─────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────

export const DAY_LABELS: { value: number; label: string; short: string }[] = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
];

export const VARIANT_LABELS: Record<DoctrineVariant, string> = {
  new_insight: "New insight",
  competitor_move: "Competitor move",
  easy_out: "Easy out",
  fresh_angle: "Fresh angle",
  proof_point: "Proof point",
  urgency: "Urgency",
  social_proof: "Social proof",
};
