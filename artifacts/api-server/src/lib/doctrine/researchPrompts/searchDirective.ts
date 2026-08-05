/**
 * Explicit web-search protocol for the research call.
 *
 * WHY THIS EXISTS — measured, not theoretical.
 *
 * The research prompts' entire search instruction was the phrase "Use web
 * search to find". Opus 4.7 searches hard on that anyway (~$0.31/case of
 * web-search fan-out). Sonnet 5 does the bare minimum ($0.026/case) and returns
 * a thinner brief — it scored 3/3 against Opus's 3/5 on the research bench.
 *
 * That is not Sonnet being worse. It's a documented interaction with a fix we
 * made ourselves: we send `thinking: {type:"disabled"}` on Sonnet-tier models
 * (thinking tokens would eat the 2.5k/3.2k JSON budget and blow the 120s/135s
 * web-search timeout — see lib/llm/thinking.ts), and per Anthropic's Sonnet 5
 * guidance, "with thinking disabled, the model is less likely to reach for
 * tools or consider searching — if the harness relies on tool calls with
 * thinking off, add an explicit nudge in the system prompt", plus "if
 * web-search is under-used, describe in the prompt why and how it should be
 * called". So: the cheap number was our own doing, and this block is the
 * prescribed remedy.
 *
 * MODEL-CONDITIONAL ON PURPOSE. Emitted only for models that need it, so the
 * prompt for today's opus-4-7 default stays BYTE-IDENTICAL — this can't move
 * the production baseline while we're still evaluating. An unconditional block
 * would risk pushing Opus (which already searches plenty) into searching more,
 * i.e. paying more for the model we're trying to stop paying for.
 */

export interface SearchDirectiveOpts {
  /** False when the call has no web access (knowledge-only fallback). */
  webSearchEnabled: boolean;
  /**
   * Emit the explicit protocol. Set for model families whose tool-use rate
   * drops when thinking is disabled (see modelNeedsExplicitToolNudge).
   */
  aggressiveSearch: boolean;
  brand: string;
}

/**
 * A concrete search plan. Deliberately names the queries to run and forbids
 * answering the fresh-signal fields from memory — vague encouragement ("search
 * thoroughly") is what we already had, and it did not work.
 *
 * Returns "" when not needed, so the prompt is unchanged for every other model.
 */
export function buildSearchDirectiveBlock(opts: SearchDirectiveOpts): string {
  if (!opts.aggressiveSearch || !opts.webSearchEnabled) return "";

  return `
SEARCH PROTOCOL (follow this before writing any JSON):
You have live web search. The fresh-signal fields below (fresh_hook, hook_date_or_recency, hook_source, runs_youtube_ads, runs_meta_ads, acquisition_model) MUST come from a search you actually ran on this call — never from memory, and never from the brand being familiar. Your training data is stale by construction: a hook is only useful to the SDR if it is real and recent, and you cannot know what is recent without looking.

Run SEVERAL searches before concluding — a single query is not research. Work through these until you have a dated signal, stopping early only once you have a specific one:
  1. "${opts.brand}" hiring growth OR UA OR performance marketing — recent job posts date a growth push.
  2. "${opts.brand}" funding OR raise OR round — dated, and a strong spend signal.
  3. "${opts.brand}" launch OR expansion OR partnership OR award — recent news.
  4. "${opts.brand}" Google Ads Transparency Center — video/YouTube ad presence.
  5. "${opts.brand}" Meta Ad Library — Meta/Facebook ad presence.

Then judge: prefer the MOST RECENT and MOST SPECIFIC signal, and record its date/recency and source. Searching more is cheap; a fabricated or stale hook costs the SDR the prospect. If the searches genuinely turn up nothing dated, that is a valid outcome — set fresh_hook to "" rather than inventing one. Returning no hook is correct; guessing is not.
`;
}
