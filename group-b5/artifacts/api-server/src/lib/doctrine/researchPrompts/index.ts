/**
 * Research prompt dispatcher.
 *
 * Routes a sub-vertical to the correct platform-family research prompt.
 */

import { getDoctrineDomain, isValidSubVertical } from "../taxonomy";
import { getMobileGamingResearchSystemPrompt } from "./mobileGaming";
import { getMobileNonGamingResearchSystemPrompt } from "./mobileNonGaming";
import { getWebCpsResearchSystemPrompt } from "./webCps";
import type { ResearchPromptInput } from "./mobileGaming";

export type { ResearchPromptInput };

/**
 * Returns the system prompt for the research stage, routed to the correct
 * platform-family file based on the prospect's sub-vertical.
 */
export function getResearchSystemPrompt(input: ResearchPromptInput): string {
  if (!isValidSubVertical(input.subVertical)) {
    throw new Error(`Unknown sub-vertical for research prompt: ${input.subVertical}`);
  }
  const domain = getDoctrineDomain(input.subVertical);
  if (domain === "mobileGaming") return getMobileGamingResearchSystemPrompt(input);
  if (domain === "mobileNonGaming") return getMobileNonGamingResearchSystemPrompt(input);
  if (domain === "webCps") return getWebCpsResearchSystemPrompt(input);
  throw new Error(`No research prompt for doctrine domain: ${domain}`);
}

/**
 * The user prompt for the research stage. Short — the system prompt carries
 * all the doctrine; the user prompt is the concrete request.
 */
export function getResearchUserPrompt(input: ResearchPromptInput): string {
  return `Produce a research brief for ${input.brand} (${input.country || "market unknown"}, sub-vertical ${input.subVertical}). Target message language: ${input.language}. Return JSON only.`;
}
