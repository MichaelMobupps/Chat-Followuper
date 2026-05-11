#!/usr/bin/env node
/**
 * Ticket slack-register, patch 1/1: lib/channelRegister.ts
 *
 * Dependency: requires ticket-telegram-register to have landed first
 * (Edit 1 anchors on "Phase 1-2 implement WhatsApp and Telegram fully",
 * Edit 3 anchors on "Phases 3-4"; both are only present post-telegram).
 *
 * Three atomic edits populating Slack content:
 *
 *   E1. Docstring update: "Phase 1-2 implement WhatsApp and Telegram fully.
 *       Teams and Slack return placeholder strings until their respective
 *       phases."  ->  "WhatsApp (Phase 1), Telegram (Phase 2), and Slack
 *       (Phase 4) are fully implemented. Teams (Phase 3) returns placeholder
 *       strings until its phase ships."
 *
 *   E2. Replace the four empty SLACK placeholder consts with full content
 *       blocks. Mirrors the WhatsApp and Telegram register depth.
 *
 *   E3. Update "// Future channels (placeholders for Phases 3-4)" header
 *       comment to "// Future channels (placeholder for Phase 3)" since
 *       Teams is the only remaining placeholder.
 *
 * Slack-specific register decisions (vs WhatsApp baseline):
 *   - Workplace tool, not consumer. Prospect is at a SaaS/tech/marketing
 *     company in nearly every case.
 *   - Slack Connect delivery context: external messages may be blocked or
 *     routed to approval queues. Write to earn attention in a busy work feed.
 *   - 1:1 DM only, never channel. Never @-mention prospect in cold message.
 *   - Light Slack-native markdown ALLOWED (and expected): *bold* (sparing),
 *     `inline code` for product/metric names. No headings, no bullets.
 *     This differs from Telegram (which forbade markdown on cold).
 *   - No links in first cold message (Slack auto-expands previews like
 *     Telegram). Followup links allowed when justified.
 *   - Length: 5-8 sentences prospector, 3-4 followuper (matches Telegram).
 *   - Tone: more formal than WhatsApp, slightly less than email. Workplace
 *     casual. "Hi {FirstName}," default for English.
 *   - Emojis: 0 on cold DM (Slack culture loves emoji internally but a
 *     stranger sending :wave: reads as marketing automation).
 *   - Spam phrases: adds "just checking in" to the WhatsApp/Telegram list.
 *   - Vertical: explicit SaaS sub-vertical vocabulary (trial-to-paid,
 *     activation, MQL/SQL, PQL, ARR/MRR, PLG vs sales-led).
 *
 * Idempotent. All anchors em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/api-server/src/lib/channelRegister.ts",
);

// ═════════════════════════════════════════════════════════════════
// Edit 1 - Docstring update
// ═════════════════════════════════════════════════════════════════

const E1_OLD = ` * Phase 1-2 implement WhatsApp and Telegram fully. Teams and Slack return
 * placeholder strings until their respective phases.`;

const E1_NEW = ` * WhatsApp (Phase 1), Telegram (Phase 2), and Slack (Phase 4) are fully
 * implemented. Teams (Phase 3) returns placeholder strings until its phase ships.`;

const E1_MARKER = `WhatsApp (Phase 1), Telegram (Phase 2), and Slack (Phase 4) are fully`;

// ═════════════════════════════════════════════════════════════════
// Edit 2 - Populate four SLACK placeholder consts
// ═════════════════════════════════════════════════════════════════
//
// OLD = the four placeholder lines exactly as they appear today.
// NEW = the same four const names with populated template literals.

const E2_OLD = `const SLACK_PROSPECTOR_WRITER_RULES = ""; // Phase 4
const SLACK_PROSPECTOR_CRITIC_RULES = ""; // Phase 4
const SLACK_FOLLOWUPER_WRITER_RULES = ""; // Phase 4
const SLACK_FOLLOWUPER_CRITIC_RULES = ""; // Phase 4`;

const E2_NEW = `const SLACK_PROSPECTOR_WRITER_RULES = \`SLACK — FIRST COLD MESSAGE — STRUCTURAL RULES

This is the first message to this prospect on Slack. The prospect does not
know us yet. Slack is a workplace tool; the message must read as one
professional contacting another, not as marketing. In nearly every case,
the prospect is at a SaaS, tech, marketing, or gaming company; tone and
references should match that context.

DELIVERY CONTEXT:
- Cold outreach on Slack arrives via Slack Connect or external workspace DM.
  Many companies disable Slack Connect or route external messages to an
  approval queue; the prospect may see the message late or not at all.
  Write as if the message will be read in a busy work feed alongside team
  conversations — it must earn attention in two seconds.
- Always 1:1 DM. Never message a channel.
- Never @-mention the prospect in a cold message; the @-mention pushes a
  notification on top of the DM notification and reads as pushy.

DOCTRINE STRUCTURE (compressed for chat — the full email version is 5
sections; this version merges them into 5-8 sentences total):

1. GREETING — One short line. "Hi {FirstName}," is the default for English
   markets. Slack culture is first-name only; "Dear Mr. {LastName}" is
   wrong-register. Use language-appropriate greeting for non-English
   prospects per the nativeness block. Never "Good morning", never "I hope
   this finds you well".

2. WHY — Sentence 1 (the line right after the greeting). Prospect-led: open
   with their company, vertical, market position, or a specific peer behavior.
   ABSOLUTELY FORBIDDEN openers:
     "Our ...", "We ...", "At MobUpps ...", "MobUpps is ...", "I'm reaching out".
   These flip the message from prospect-led to self-referential and break the
   doctrine. The first content word should be about the prospect or their market.

3. VALIDATION + HOW — Sentences 2-4 (two or three sentences). Merge what we
   can deliver with how we deliver it:
     - One specific volume or quality signal (real number, never a range —
       say "above 12%" not "8-15%", say "400+ daily" not "150-400")
     - One concrete vertical-native mechanic — language and metrics that
       match the prospect's exact sub-vertical. Generic "we optimize
       campaigns" or "we drive results" is forbidden.
     - One competitor or peer name-drop where it makes the claim concrete.

4. CTA — Final sentence. One soft question. Low-friction. No calendar links
   in the first message. Max 15 words. One question mark, never an
   exclamation mark.

LENGTH:
- 5-8 sentences total including greeting.
- Hard cap at 8 sentences. Slack tolerates length better than WhatsApp but
  a 9+ sentence cold DM still reads as a marketing blast.

FORMAT:
- No subject line. Slack DMs have no subject field. The "subject" field in
  your JSON output should be a brief 3-5 word topic tag for internal tracking.
- No signature block. Slack shows the sender's name and workspace automatically.
- Light Slack-native markdown is acceptable and even expected:
    *bold* for one key term or number (use sparingly, max once or twice)
    \\\`inline code\\\` for product names, metric names, or technical terms
  AVOID heavy markdown: no headings, no bullet lists, no numbered lists,
  no blockquotes, no horizontal rules. The message should still read as a
  paragraph.
- No links / URLs in the first message. Slack auto-expands link previews;
  a preview block on a cold DM looks like a campaign blast. Save links
  for followups.
- Always use the "%" symbol for percentages. NEVER spell out "percent",
  "Prozent", "процент", "por ciento", "pour cent", "phần trăm", "퍼센트",
  "パーセント", "เปอร์เซ็นต์".
- No em dashes. No en dashes. Use commas or periods.
- No snake_case tokens (e.g. "funded_account" is forbidden, "funded account"
  is correct).
- No bracketed editorial notes ([Verify X], [Check Y]) — these leak from
  rewriting passes and must never appear.

TONE:
- Professional but warm. Slack workplace register. Slightly more formal
  than WhatsApp, slightly less than email. The prospect should feel like a
  colleague is messaging them, not a marketer.
- No corporate buzzwords: "synergy", "leverage", "delve", "seamless",
  "holistic", "game-changer", "unlock potential", "navigate the landscape".
- No spam phrases: "circling back", "touching base", "hope you are well",
  "I trust this finds you well", "would love to", "wanted to reach out",
  "I just wanted to", "just checking in".
- No "X, not Y" constructions. Rephrase as positive specification.
   BAD: "Real CPI optimization, not vanity bidding."
   GOOD: "Real CPI optimization tied to confirmed installs."

EMOJIS:
- 0 emojis in the first cold Slack DM. Slack culture loves emoji INTERNALLY,
  but a stranger sending :wave: or :rocket: in your DMs reads as marketing
  automation. Save emoji for established conversations, and even then,
  match what the prospect uses first.

COUNTRY-MATCHED REFERENCES:
- All competitor names, peer brands, market data, and regulatory references
  MUST match the prospect's country. NEVER default to US references for
  non-US prospects.
- Slack skews to SaaS, tech, marketing, and gaming companies in English-
  speaking markets and Western Europe. Peer references should be in-vertical
  and in-region for the prospect.

VERTICAL-NATIVE TERMINOLOGY (CRITICAL):
- Use the exact event terminology and metrics the prospect's sub-vertical uses.
- Gaming UA prospects use IAP, payer conversion, ARPDAU, D7 ROAS, retention.
- Fintech prospects use funded account, first deposit, KYC.
- E-commerce prospects use confirmed purchase, AOV, ROAS.
- SaaS prospects (a heavy Slack demographic) use trial-to-paid, activation,
  MQL/SQL, PQL, ARR/MRR. Match the prospect's growth motion (PLG vs sales-led)
  when known.
- Telehealth prospects use consultation booking, appointment.
- Cross-vertical leakage (gaming jargon in fintech, subscription jargon in
  e-commerce, etc.) is a critical failure.\`;

const SLACK_PROSPECTOR_CRITIC_RULES = \`SLACK CHANNEL REGISTER CHECK — PROSPECTOR MODE:

Score channel_register_match 1-5 against these criteria for the FIRST COLD
Slack DM:

Score 5 (passes):
- 5-8 sentences total in the body
- Greeting is exactly one short line; "Hi {FirstName}," for English markets
- Prospect is NOT @-mentioned anywhere in the message
- WHY (sentence 1) starts prospect-led — first content word is about the
  prospect, their company, their vertical, or their market
- VALIDATION + HOW (sentences 2-4) include one specific volume number,
  one vertical-native mechanic, and ideally one peer/competitor reference
- CTA (final sentence) is one soft question, max 15 words
- No subject line attempted
- No signature / sign-off
- Light Slack-native markdown is acceptable (one or two *bold* terms,
  occasional \\\`inline code\\\` for product or metric names)
- No heavy markdown (no headings, no bullet lists, no numbered lists,
  no blockquotes, no horizontal rules)
- No links / URLs in the message
- No emojis
- No spam phrases ("circling back", "touching base", "just checking in", etc.)
- No em dashes
- "%" symbol used (not "percent" / "Prozent" / etc.)
- No "X, not Y" constructions
- All references country-matched (peers reflect the prospect's actual
  market, with SaaS/tech context for typical Slack demographics)
- Vertical-native terminology throughout

Score 3-4 (minor issues, can pass with one nit):
- 9 sentences but otherwise tight
- One small spam phrase that slipped in
- Greeting slightly informal for the market
- Markdown emphasis used twice when once would have been enough

Score 1-2 (FAIL — needs_rewrite must be true):
- 10+ sentences (reads like an email)
- Has a signature block
- Greeting is missing or wrong-register ("Dear Mr. X" in Slack)
- Prospect @-mentioned in the message body
- WHY starts with "Our ...", "We ...", "At MobUpps ...", or any
  self-referential opener
- Volume given as a range ("8-15%") instead of one specific number
- US references in a non-US-prospect message
- Generic mechanics ("we optimize campaigns", "we drive results")
- Wrong-vertical terminology (e.g., gaming jargon in fintech message)
- Multiple CTAs or multiple question marks
- Heavy markdown formatting: headings, bullet lists, numbered lists,
  blockquotes, horizontal rules
- More than two *bold* runs or more than two \\\`inline code\\\` spans
- Links / URLs in the message
- Emojis present
- Subject line attempted in the body
- Em dashes present
- Spelled-out percentage
- "X, not Y" construction present

If channel_register_match < 3, needs_rewrite MUST be true.\`;

const SLACK_FOLLOWUPER_WRITER_RULES = \`SLACK — FOLLOW-UP MESSAGE — STRUCTURAL RULES

This is a follow-up to a prior conversation on Slack. The prospect already
knows who we are. Your only valid input is the prior conversation. Every
value point in this follow-up must trace to something visible in that
conversation — what we said before, or what the prospect said back.

DELIVERY CONTEXT:
- Slack followups are typically sent in the same DM thread or as a new
  message in the same DM. If the prior message lives in a Slack thread,
  treat the thread as the conversational unit.
- Don't repeat the original pitch. Don't re-introduce yourself.
- @-mentioning the prospect is acceptable in a followup ONLY when the
  conversation has been quiet for many days and a notification nudge is
  justified. Default to no @-mention.

ABSOLUTE RULE — CONTEXT GROUNDING:
- You will receive the full prior conversation (outbound and inbound) plus
  any context notes the SDR pasted. Build the follow-up entirely from that
  material.
- Do NOT invent new claims, new numbers, or new competitor references that
  weren't in the prior thread.
- Do NOT re-introduce yourself or MobUpps. The prospect already knows us.
- If the prior conversation is empty or only contains a generic greeting,
  the upstream code should have refused to call you. If you somehow received
  empty context, return a short generic check-in rather than fabricating.

FOLLOW-UP STRUCTURE — 3-4 sentences total:

1. PRIOR-CONTACT REFERENCE (sentence 1) — Reference the prior thread in the
   FIRST sentence. Keep it brief and concrete. Examples:
     "Following up on the MAFO numbers I sent."
     "Quick follow-up on the Lazada CPS angle we discussed."
     "Circling back on the casual UA conversation."
   The reference must name the SPECIFIC topic, not be vague.

2. NEW VALUE POINT (sentences 2-3) — One or two things they did not engage
   with from the prior message, expanded with fresh evidence, OR a response
   to something they said back. Stage strategy rotation:
     - Stage 1: Add a new insight, data point, or relevant industry development.
     - Stage 2: Shift angle — reference a competitor move or market trend.
     - Stage 3: Direct and brief, give them an easy out ("if timing isn't
       right, no worries").
     - Stage 4+: Continue rotating fresh angles. Each stage must bring
       something genuinely new. NEVER repeat an angle from a previous stage.

3. SOFT CTA (final sentence) — One soft question. Lower friction than the
   first message's CTA. Examples: "Worth a quick test on a small segment?",
   "Open to a 15-min call this week?", "If timing is off, no worries, let
   me know either way?"

LENGTH:
- 3-4 sentences MAXIMUM. Hard cap.
- A 5-sentence follow-up reads like spam.

FORMAT — same as first message, with two narrow relaxations:
- No subject line, no signature.
- Light Slack-native markdown still acceptable; if the prior thread shows
  the prospect uses formatting themselves, you can mirror their style
  (more *bold*, more \\\`code\\\` spans).
- Links are acceptable when the prior conversation established a reason
  to share one (case study request, deck request, etc.). Prefer a clean
  URL to the resource over a tracked redirect. Slack will auto-expand the
  preview; a clean preview is fine, a campaign-tracking URL with UTM
  params reads as spam.
- "%" symbol always. No em dashes. No snake_case.
- No bracketed editorial notes.
- One question mark maximum. No exclamation marks.

TONE — same:
- Professional but warm. Workplace register.
- No "circling back" used vaguely (you may write "circling back on the
  Lazada CPS angle" because that names a specific topic; you may NOT write
  "just circling back" alone, that's a spam signal).
- No "touching base", "hope you are well", "would love to", "just checking in".
- No corporate buzzwords ("synergy", "leverage", "delve", "seamless", etc.).
- No "X, not Y" constructions.
- Emojis are acceptable in followups ONLY when the prospect used one in
  their reply first. Default: zero emoji.

CONTEXT-USE PATTERN:
- If the prior message included a specific number, reference it ("the 12%
  lift I mentioned"). Do not repeat the full pitch.
- If the prospect replied with a question, the follow-up addresses that
  question.
- If the prospect asked for materials (case study, deck), the follow-up
  delivers or references delivery of those materials.
- If the prior message named a competitor, you can update on that
  competitor's recent move or pivot to a different angle entirely.\`;

const SLACK_FOLLOWUPER_CRITIC_RULES = \`SLACK CHANNEL REGISTER CHECK — FOLLOWUPER MODE:

Score channel_register_match 1-5 against these criteria for FOLLOW-UP messages:

Score 5 (passes):
- 3-4 sentences total
- Sentence 1 explicitly references the prior conversation with a SPECIFIC
  topic name (not vague "following up")
- Sentences 2-3 introduce a NEW angle or address prospect's reply,
  derived from the prior conversation's content
- No re-introduction of MobUpps or the sender
- Soft CTA, one question mark
- No spam phrases, no em dashes, "%" symbol used
- Markdown matches Slack-native norms (light *bold* and \\\`code\\\` allowed;
  heavy markdown still forbidden)
- Links are absent OR justified by the prior conversation
- @-mention of prospect absent OR justified by prolonged silence
- Emojis absent OR match what the prospect used first
- All claims traceable to the prior conversation (no invented numbers
  or new competitor references)

Score 3-4 (minor issues, can pass with one nit):
- 5 sentences but otherwise on register
- Reference is slightly vague ("following up on our chat" without naming
  the topic)
- Slightly heavy markdown for a followup

Score 1-2 (FAIL — needs_rewrite must be true):
- 6+ sentences (too long for chat follow-up)
- No reference to prior contact in the first sentence
- Re-introduces MobUpps or the sender
- Repeats the full pitch from the prior message
- Invents new claims or numbers not in the prior conversation
- Uses spam phrases ("just circling back", "touching base", "would love to",
  "just checking in")
- Has em dashes or signature block
- Heavy markdown (headings, bullet lists, numbered lists, blockquotes)
- Multiple question marks or any exclamation marks
- "X, not Y" construction present
- @-mention of prospect without prior-silence justification

ALSO score context_grounding 1-5 (followup mode only):

Score 5: every claim in the follow-up traces to something in the prior
conversation (what we said, what they replied, or the SDR's context notes).

Score 3-4: most claims traceable; one minor unsupported detail.

Score 1-2: introduces new claims, numbers, competitors, or facts not
present in the prior conversation. This is fabrication. needs_rewrite MUST
be true.

If channel_register_match < 3 OR context_grounding < 3, needs_rewrite MUST be true.\`;`;

const E2_MARKER = `SLACK CHANNEL REGISTER CHECK`;

// ═════════════════════════════════════════════════════════════════
// Edit 3 - "Future channels" comment update
// ═════════════════════════════════════════════════════════════════

const E3_OLD = `// Future channels (placeholders for Phases 3-4)`;
const E3_NEW = `// Future channel (placeholder for Phase 3)`;
const E3_MARKER = `// Future channel (placeholder for Phase 3)`;

// ═════════════════════════════════════════════════════════════════
// applyEdit helper - matches ticket-b-critic-categories shape
// ═════════════════════════════════════════════════════════════════

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) { count++; idx += needle.length; }
  return count;
}

function applyEdit(label, source, oldStr, newStr, marker) {
  const m = countOccurrences(source, marker);
  const o = countOccurrences(source, oldStr);
  if (m > 0) { console.log(`[${label}] SKIP - already applied`); return { source, ok: true }; }
  if (o === 0) { console.log(`[${label}] NOOP - anchor not found`); return { source, ok: false }; }
  if (o > 1) { console.log(`[${label}] FAIL - anchor matched ${o} times`); return { source, ok: false }; }
  console.log(`[${label}] APPLY`);
  return { source: source.replace(oldStr, newStr), ok: true };
}

let source;
try { source = readFileSync(FILE, "utf8"); }
catch (err) { console.error(`[FATAL] cannot read ${FILE}: ${err.message}`); process.exit(2); }

// Pre-flight: confirm the post-telegram state. Better to fail loud with a
// readable message than to NOOP on Edit 1 with a generic "anchor not found".
if (!source.includes(`Phase 1-2 implement WhatsApp and Telegram fully`) &&
    !source.includes(`WhatsApp (Phase 1), Telegram (Phase 2), and Slack (Phase 4) are fully`)) {
  console.error("[FATAL] this patch requires ticket-telegram-register to have landed first");
  console.error("[FATAL] cannot find the post-telegram docstring or post-slack docstring");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["slack-docstring",        E1_OLD, E1_NEW, E1_MARKER],
  ["slack-consts-populate",  E2_OLD, E2_NEW, E2_MARKER],
  ["future-channel-header",  E3_OLD, E3_NEW, E3_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

// ═════════════════════════════════════════════════════════════════
// Evidence - confirm the post-state
// ═════════════════════════════════════════════════════════════════

const evidence = {
  docstringUpdated:           source.includes(`WhatsApp (Phase 1), Telegram (Phase 2), and Slack (Phase 4) are fully`),
  oldDocstringGone:          !source.includes(`Phase 1-2 implement WhatsApp and Telegram fully`),

  prospectorWriterPopulated:  source.includes(`SLACK — FIRST COLD MESSAGE — STRUCTURAL RULES`),
  prospectorCriticPopulated:  source.includes(`SLACK CHANNEL REGISTER CHECK — PROSPECTOR MODE`),
  followuperWriterPopulated:  source.includes(`SLACK — FOLLOW-UP MESSAGE — STRUCTURAL RULES`),
  followuperCriticPopulated:  source.includes(`SLACK CHANNEL REGISTER CHECK — FOLLOWUPER MODE`),

  prospectorWriterEmpty:     !source.includes(`const SLACK_PROSPECTOR_WRITER_RULES = "";`),
  prospectorCriticEmpty:     !source.includes(`const SLACK_PROSPECTOR_CRITIC_RULES = "";`),
  followuperWriterEmpty:     !source.includes(`const SLACK_FOLLOWUPER_WRITER_RULES = "";`),
  followuperCriticEmpty:     !source.includes(`const SLACK_FOLLOWUPER_CRITIC_RULES = "";`),

  futureCommentUpdated:       source.includes(`// Future channel (placeholder for Phase 3)`),
  oldFutureCommentGone:      !source.includes(`// Future channels (placeholders for Phases 3-4)`),

  whatsappBlocksUntouched:    source.includes(`WHATSAPP — FIRST COLD MESSAGE — STRUCTURAL RULES`) &&
                              source.includes(`WHATSAPP CHANNEL REGISTER CHECK — PROSPECTOR MODE:`) &&
                              source.includes(`WHATSAPP — FOLLOW-UP MESSAGE — STRUCTURAL RULES`) &&
                              source.includes(`WHATSAPP CHANNEL REGISTER CHECK — FOLLOWUPER MODE:`),

  telegramBlocksUntouched:    source.includes(`TELEGRAM — FIRST COLD MESSAGE — STRUCTURAL RULES`) &&
                              source.includes(`TELEGRAM CHANNEL REGISTER CHECK — PROSPECTOR MODE`) &&
                              source.includes(`TELEGRAM — FOLLOW-UP MESSAGE — STRUCTURAL RULES`) &&
                              source.includes(`TELEGRAM CHANNEL REGISTER CHECK — FOLLOWUPER MODE`),

  teamsStillPlaceholder:      source.includes(`const TEAMS_PROSPECTOR_WRITER_RULES = ""; // Phase 3`) &&
                              source.includes(`const TEAMS_PROSPECTOR_CRITIC_RULES = ""; // Phase 3`) &&
                              source.includes(`const TEAMS_FOLLOWUPER_WRITER_RULES = ""; // Phase 3`) &&
                              source.includes(`const TEAMS_FOLLOWUPER_CRITIC_RULES = ""; // Phase 3`),

  routingUntouched:           source.includes(`if (channel === "slack" && mode === "prospector") return SLACK_PROSPECTOR_WRITER_RULES;`) &&
                              source.includes(`if (channel === "slack" && mode === "followuper") return SLACK_FOLLOWUPER_CRITIC_RULES;`),

  slackSpecificContent:       source.includes(`Slack Connect`) &&
                              source.includes(`workplace tool`) &&
                              source.includes(`SaaS prospects (a heavy Slack demographic)`) &&
                              source.includes(`@-mention`) &&
                              source.includes(`Slack-native markdown`),
};
console.log("[channel-register-slack] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[channel-register-slack] FAIL - failing checks:", failing.join(", "));
  process.exit(4);
}
console.log("[channel-register-slack] DONE");
