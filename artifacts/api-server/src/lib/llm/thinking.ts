/**
 * Per-model thinking defaults.
 *
 * Model families disagree about what an OMITTED `thinking` param means, and the
 * disagreement is silent — same request shape, different behaviour, no error:
 *
 *   - Opus 4.7 / 4.8 : omitted → thinking OFF. `{type:"disabled"}` accepted.
 *   - Sonnet 5       : omitted → adaptive thinking ON. `{type:"disabled"}` accepted.
 *   - Fable 5        : thinking is ALWAYS on; `{type:"disabled"}` returns a 400 —
 *                      the param must be omitted entirely.
 *
 * That matters here because thinking tokens count against `max_tokens`. Our
 * extraction and research calls run on small budgets (2.5k–3.2k) and expect the
 * whole budget to be JSON, so on a Sonnet-tier model an omitted param silently
 * spends the budget on thinking and truncates the payload — or, with server-side
 * web search in play, pushes the call past its timeout.
 *
 * This is not theoretical: swapping the research model to sonnet-5 without this
 * failed 1 of 2 bench cases outright ("Request timed out" at 147s against the
 * 120s/135s research timeouts) and slowed the surviving case 128s → 183s.
 *
 * Extracted from companyResolver.ts, where this policy was first derived and
 * verified against the Claude API reference (audit-2 L9), so the research path
 * and the extraction path can't drift apart.
 */

/**
 * True when the model runs adaptive thinking on an omitted `thinking` param —
 * i.e. callers who want a non-thinking call must ask for it explicitly.
 *
 * Fable 5 is deliberately NOT matched: it would 400 on `{type:"disabled"}`.
 * Prefer a Sonnet-tier model for small-budget deterministic calls.
 */
export function modelDefaultsAdaptiveThinking(model: string): boolean {
  return /claude-sonnet-5/.test(model);
}

/**
 * True when a tool-using call on this model needs an explicit search/tool nudge
 * in the system prompt to behave.
 *
 * Deliberately DERIVED from modelDefaultsAdaptiveThinking rather than carrying
 * its own model list: the two are the same set for a reason. The nudge is only
 * needed because we send `{type:"disabled"}` (above), and per Anthropic's
 * Sonnet 5 guidance a thinking-disabled model "is less likely to reach for
 * tools or consider searching". Exactly the models we disable thinking on are
 * the models that then under-use tools. Two hand-maintained lists would drift;
 * this way, adding a model to one adds it to both.
 *
 * Models that are thinking-off by default (opus-4-7) are NOT matched — they
 * never lost the tool-use appetite, so they get no nudge and their prompt stays
 * byte-identical. See lib/doctrine/researchPrompts/searchDirective.ts.
 */
export function modelNeedsExplicitToolNudge(model: string): boolean {
  return modelDefaultsAdaptiveThinking(model);
}

/**
 * Spread into a messages.create() body to keep a call non-thinking across model
 * families: `...thinkingDisabledFor(model)`.
 *
 * Emits `{thinking: {type: "disabled"}}` only where that is both needed and
 * legal; otherwise `{}` (Opus is already off by default; Fable would reject it).
 */
export function thinkingDisabledFor(
  model: string,
): { thinking: { type: "disabled" } } | Record<string, never> {
  return modelDefaultsAdaptiveThinking(model)
    ? { thinking: { type: "disabled" as const } }
    : {};
}
