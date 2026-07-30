import { apiFetch } from "../api";
import { apiPath } from "../config";

/**
 * Input shape for the research SSE stream.
 * Mirrors src/services/prospectResearch.ts ResearchInput.
 * brand, country, language, subVertical, product are required by the server.
 */
export interface ResearchInput {
  brand: string;
  country: string;
  language: string;
  subVertical: string;
  product: string;
  sdrContextNotes?: string;
  apolloOrgIndustry?: string;
  apolloEmployeeCount?: number;
}

export interface CostBreakdown {
  // Loose typing — the server's CostBreakdown shape may evolve.
  // The dashboard only reads totalUsd if present.
  totalUsd?: number;
  [k: string]: unknown;
}

/**
 * Build the SSE GET URL for the research stream.
 * The server accepts `?input=<JSON>` with the full ResearchInput,
 * or individual query params. JSON form is more compact for complex inputs.
 */
export function buildResearchStreamUrl(input: ResearchInput): string {
  const encoded = encodeURIComponent(JSON.stringify(input));
  return apiPath(`/prospects/research/stream?input=${encoded}`);
}

/**
 * Result of POST /api/prospects/:id/generate-message.
 * Server returns { subject, message, costUsd, iterations, finalOverallScore }.
 */
export interface GenerateMessageResult {
  subject: string;
  message: string;
  costUsd: number;
  iterations: number;
  finalOverallScore?: number;
}

export function generateMessage(
  prospectId: string,
): Promise<GenerateMessageResult> {
  return apiFetch<GenerateMessageResult>(
    apiPath(`/prospects/${prospectId}/generate-message`),
    { method: "POST" },
  );
}
