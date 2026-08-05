/**
 * Smoke: first-message generator parity — routing, exemplars, prompt inputs.
 *
 * Answers (and then LOCKS) a question that was asked about the Add-dialog's
 * "Generate message" button: does it use the exemplar library, and the same
 * gemini-3.5-flash → gemini-3-flash-preview → claude-sonnet-4-6 chain as every
 * other first-message path?
 *
 * Zero LLM spend: this asserts the ROUTING POLICY and the PROMPT CONTENT that
 * decide those answers, by calling the pure functions directly. No model is
 * ever invoked.
 *
 *   FOLLOWUP_DIGEST_SCHEDULER=false node ../../lib/db/node_modules/tsx/dist/cli.mjs \
 *     src/scripts/smokeGeneratorParity.ts
 */
import {
  GEMINI_DEFAULT_MODEL,
  GEMINI_FALLBACK_MODEL,
  ANTHROPIC_FALLBACK_MODEL,
  CRITIC_MODEL,
  isGreyAreaVertical,
} from "../lib/llm/router";
import { selectExemplars, buildExemplarBlock } from "../lib/exemplars/select";
import { getExemplarLibrary } from "../lib/exemplars/loader";
import {
  getProspectorUserPrompt,
  getFollowuperUserPrompt,
  type MessageContext,
} from "../services/messagePrompts";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
  console.log(`[parity] ${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` :: ${detail}` : ""}`);
  if (ok) pass++;
  else fail++;
};

// The context a first-message run produces. previewFirstMessage (the Generate
// button) and manualContactPrepare (Add-contact / row Generate) build a
// field-identical ProspectInput and both call generateChatMessage with
// stage: 0 — so one context stands for both.
const ctx: MessageContext = {
  prospect_name: "Arushi",
  company: "Kuku FM",
  vertical: "mobile",
  sub_vertical: "utility_general_mobile",
  product: "mobile user acquisition",
  country: "India",
  language: "en",
  channel: "whatsapp",
  sender_name: "Michael",
  stage: 0,
  research_brief: { companyOverview: "Audio streaming." } as never,
} as unknown as MessageContext;

function main(): number {
  // ── 1. The model chain is exactly the documented policy ──────────────
  check(
    "writer chain tier 1 = gemini-3.5-flash",
    GEMINI_DEFAULT_MODEL === "gemini-3.5-flash",
    GEMINI_DEFAULT_MODEL,
  );
  check(
    "writer chain tier 2 = gemini-3-flash-preview",
    GEMINI_FALLBACK_MODEL === "gemini-3-flash-preview",
    GEMINI_FALLBACK_MODEL,
  );
  check(
    "writer chain tier 3 (final fallback) = claude-sonnet-4-6",
    ANTHROPIC_FALLBACK_MODEL === "claude-sonnet-4-6",
    ANTHROPIC_FALLBACK_MODEL,
  );
  check("critic = claude-sonnet-5", CRITIC_MODEL === "claude-sonnet-5", CRITIC_MODEL);

  // ── 2. Routing cannot diverge between the two first-message paths ─────
  // The writer's only caller-dependent branch is isGreyAreaVertical(vertical,
  // subVertical). The coarse vertical is ONLY ever "web_cps" or "mobile", so it
  // can never match the grey-area pattern — which means the recent change to how
  // previewFirstMessage computes `vertical` (the SDR's toggle now wins, never
  // re-derived from the model's sub-vertical) CANNOT affect which model writes.
  check(
    "coarse vertical alone never trips grey-area routing (web_cps)",
    isGreyAreaVertical("web_cps", null) === false,
  );
  check(
    "coarse vertical alone never trips grey-area routing (mobile)",
    isGreyAreaVertical("mobile", null) === false,
  );
  check(
    "grey-area routing is decided by subVertical",
    isGreyAreaVertical("mobile", "casino_social") === true &&
      isGreyAreaVertical("web_cps", "crypto_exchange") === true,
  );
  check(
    "...so flipping ONLY the coarse vertical never changes the writer model",
    isGreyAreaVertical("mobile", "utility_general_mobile") ===
      isGreyAreaVertical("web_cps", "utility_general_mobile"),
  );

  // ── 3. Exemplars: the library loads, and stage 0 does NOT lose it to a
  //       stage guard (selectExemplars normalizes 0 → 1) ─────────────────
  const library = getExemplarLibrary();
  check("exemplar library loads", library.length > 0, `${library.length} exemplars`);
  const selected = selectExemplars(
    {
      language: "en",
      stage: 0, // what a first message passes
      vertical: "mobile",
      subVertical: "utility_general_mobile",
      product: "mobile user acquisition",
      country: "India",
    },
    2,
  );
  check(
    "selectExemplars(stage 0) still returns exemplars (0 normalizes to 1)",
    selected.length > 0,
    `${selected.length} selected`,
  );
  check("buildExemplarBlock renders them", buildExemplarBlock(selected).length > 0);

  // ── 4. THE FINDING: the first-message prompt never asks for them ──────
  // stage 0 → mode "prospector" → getProspectorUserPrompt, which builds a
  // research block + a competitor block and NO exemplar block. The exemplar
  // library is wired into getFollowuperUserPrompt only. So NO first-message
  // path uses exemplars — not the Generate button, not the row Generate, not
  // Add-contact. This asserts today's real behaviour so a change is deliberate.
  const prospectorPrompt = getProspectorUserPrompt(ctx);
  const followuperPrompt = getFollowuperUserPrompt({
    ...ctx,
    stage: 1,
    conversation: [{ role: "user", content: "hi" }],
  } as unknown as MessageContext);

  const exemplarMarker = /STYLE EXEMPLARS/i;

  // The BENCH SAYS NO. Wiring this library into the first-message prompt was
  // tried and reverted (2026-07-14): on a matched 10-case subset it cut healing
  // (2.00 → 1.70 iterations) but cost 0.5 of critic score (4.10 → 3.60). The
  // per-case split is the real finding — exemplars RESCUED weak drafts
  // (ar-UAE 3→1 iters, $0.089→$0.034, score held) and CORRUPTED strong ones
  // (ru-Kazakhstan 1→3 iters, score 5→3, 6x the cost). Every exemplar in the
  // library is a follow-up opening on a prior thread, and no amount of "do not
  // mirror the opening" framing stopped it dragging a clean cold open toward
  // follow-up register. So first messages deliberately carry NO exemplars.
  // Assert that, so re-adding them is a decision someone makes on purpose.
  check(
    "first-message (prospector) prompt carries NO exemplars — bench-backed decision",
    !exemplarMarker.test(prospectorPrompt),
    "reverted: -0.50 score for -0.30 iterations",
  );
  check(
    "the follow-up prompt DOES carry exemplars (prior-thread shape is correct there)",
    exemplarMarker.test(followuperPrompt),
  );
  check(
    "both prompts carry the competitor grounding + research brief",
    /competitor/i.test(prospectorPrompt) && /competitor/i.test(followuperPrompt),
  );
  check(
    "the prospector prompt is byte-identical across renders (cache-safe)",
    getProspectorUserPrompt(ctx) === prospectorPrompt,
  );

  console.log(`\n[parity] ${pass}/${pass + fail} PASS`);
  return fail === 0 ? 0 : 1;
}

process.exit(main());
