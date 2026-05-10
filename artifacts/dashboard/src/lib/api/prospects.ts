import { apiFetch } from "../api";

/**
 * Mirrors the server's ProspectBrief interface (services/prospectResearch.ts).
 * The dashboard defines a parallel type since `lib/api-client-react` codegen
 * is not yet adopted broadly. If/when it is, this duplication is a single
 * find-and-replace away from removal.
 */
export interface ProspectBrief {
  determinedCountry: string;
  determinedScaleTier: string;
  scaleRationale: string;
  calibratedDailyVolume: number | string;
  primaryEvent: string;
  alternativeEvents: string[];
  finalCompetitors: string[];
  subsidiaryCheckNote: string;
  marketContext: string;
  prospectSpecificHook: string;
  prospectPrimaryGrowthProblem: string;
  whyArgument: string;
  validationArgument: string;
  howArgument: string;
  tangibleReasons: string[];
  whyArgumentNative: string;
  validationArgumentNative: string;
  howArgumentNative: string;
  generatedAt: string;
  generatorModel: string;
  generatorCostUsd: number;
}

export type SourceMode = "manual" | "apollo" | "csv";

export interface Prospect {
  id: string;
  userId: string;
  prospectName: string | null;
  company: string | null;
  title: string | null;
  vertical: string | null;
  subVertical: string | null;
  product: string | null;
  country: string | null;
  language: string | null;
  /** Phone (E.164). Null while waiting on async Apollo phone reveal
   *  (bulk WhatsApp flow, Ticket 2.3-BE-B). The webhook handler in
   *  services/apollo.ts promotes phoneNumber → phone via the
   *  correlationId lookup once Apollo's bulk_match resolves. Routes
   *  building wa.me deep links return 409 phone_reveal_pending when
   *  this is null. */
  phone: string | null;
  telegramHandle: string | null;
  teamsEmail: string | null;
  linkedinUrl: string | null;
  apolloPersonId: string | null;
  apolloOrgId: string | null;
  sourceMode: SourceMode;
  contextNotes: string | null;
  researchBrief: ProspectBrief | null;
  firstMessageBody: string | null;
  firstMessageChannel: string | null;
  firstMessageSentAt: string | null;
  replied: number;
  followupPaused: boolean;
  phoneRevealStatus: string;
  phoneNumber: string | null;
  campaignId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProspectInput {
  /** Phone (E.164). Optional starting with Ticket 2.3-BE-B: the bulk
   *  WhatsApp flow may create a prospect from Apollo's "Maybe" path
   *  where the phone is unknown until the async webhook lands. When
   *  omitted, apolloPersonId MUST be set (server-side superRefine
   *  cross-field check). */
  phone?: string;
  sourceMode: SourceMode;
  prospectName?: string;
  company?: string;
  title?: string;
  vertical?: string;
  subVertical?: string;
  product?: string;
  country?: string;
  language?: string;
  telegramHandle?: string;
  teamsEmail?: string;
  linkedinUrl?: string;
  apolloPersonId?: string;
  apolloOrgId?: string;
  contextNotes?: string;
  researchBrief?: ProspectBrief | null;
  campaignId?: string | null;
}

/**
 * PATCH input. Phone is intentionally absent (immutable on server).
 * `null` clears a field; `undefined` leaves it untouched.
 */
export type UpdateProspectInput = Partial<
  Omit<CreateProspectInput, "phone" | "sourceMode">
> & {
  // Allow nullable for clearable fields
  prospectName?: string | null;
  company?: string | null;
  title?: string | null;
  vertical?: string | null;
  subVertical?: string | null;
  product?: string | null;
  country?: string | null;
  language?: string | null;
  telegramHandle?: string | null;
  teamsEmail?: string | null;
  linkedinUrl?: string | null;
  apolloPersonId?: string | null;
  apolloOrgId?: string | null;
  contextNotes?: string | null;
  researchBrief?: ProspectBrief | null;
  campaignId?: string | null;
};

export function getProspect(id: string): Promise<Prospect> {
  return apiFetch<Prospect>(`/api/prospects/${id}`);
}

export function createProspect(input: CreateProspectInput): Promise<Prospect> {
  return apiFetch<Prospect>("/api/prospects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateProspect(
  id: string,
  input: UpdateProspectInput,
): Promise<Prospect> {
  return apiFetch<Prospect>(`/api/prospects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteProspect(id: string): Promise<void> {
  return apiFetch<void>(`/api/prospects/${id}`, { method: "DELETE" });
}
