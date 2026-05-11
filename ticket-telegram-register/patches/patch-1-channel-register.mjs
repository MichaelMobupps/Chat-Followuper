#!/usr/bin/env node
/**
 * Ticket telegram-register, patch 1/1: lib/channelRegister.ts
 *
 * Three atomic edits populating Phase 2 (Telegram) content:
 *
 *   E1. Docstring update: "Phase 1 implements WhatsApp fully" ->
 *       "Phase 1-2 implement WhatsApp and Telegram fully".
 *
 *   E2. Replace the four empty TELEGRAM placeholder consts with full
 *       content blocks. Mirrors the WhatsApp register depth (~150-200
 *       LOC across the four blocks). Each block keeps the same const
 *       name and surrounding structure; only the assignment value
 *       changes from "" to a populated template literal.
 *
 *   E3. Update "// Future channels (placeholders for Phases 2-4)"
 *       header comment to "(Phases 3-4)" since Telegram is no longer
 *       a placeholder.
 *
 * Telegram-specific register decisions (vs WhatsApp baseline):
 *   - Length: 5-8 sentences prospector (vs 5-7 WhatsApp), 3-4 followuper (vs 2-3)
 *   - Markdown: explicitly forbidden on cold messages despite Telegram
 *     supporting it; allowed in followups only if the prospect's prior
 *     reply showed they format messages themselves
 *   - Links: forbidden in cold messages (auto-expanded previews look
 *     like campaign blasts); allowed in followups when prior thread
 *     established a reason
 *   - Stickers: forbidden in all modes
 *   - @username: never used as the greeting; "Hi" without name is the
 *     fallback when no first name is in the prospect record
 *   - Bot-suspicion: stricter human-voice rule than WhatsApp
 *   - Geo peer skew: RU/CIS/Eastern Europe/MENA/Iran/LATAM/crypto-Web3
 *   - Vertical: explicit nod to crypto/Web3 sub-vertical terminology
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

const E1_OLD = ` * Phase 1 implements WhatsApp fully. Telegram, Teams, and Slack return
 * placeholder strings until their respective phases.`;

const E1_NEW = ` * Phase 1-2 implement WhatsApp and Telegram fully. Teams and Slack return
 * placeholder strings until their respective phases.`;

const E1_MARKER = `Phase 1-2 implement WhatsApp and Telegram fully`;

// ═════════════════════════════════════════════════════════════════
// Edit 2 - Populate four TELEGRAM placeholder consts
// ═════════════════════════════════════════════════════════════════
//
// OLD = the four placeholder lines exactly as they appear today.
// NEW = the same four const names with populated template literals.
//
// Em-dashes appear in NEW (inside the template literal text shown to
// the LLM). Em-dashes do NOT appear in OLD. Anchor is em-dash-free.

const E2_OLD = `const TELEGRAM_PROSPECTOR_WRITER_RULES = ""; // Phase 2
const TELEGRAM_PROSPECTOR_CRITIC_RULES = ""; // Phase 2
const TELEGRAM_FOLLOWUPER_WRITER_RULES = ""; // Phase 2
const TELEGRAM_FOLLOWUPER_CRITIC_RULES = ""; // Phase 2`;

const E2_NEW = `const TELEGRAM_PROSPECTOR_WRITER_RULES = \`TELEGRAM — FIRST COLD MESSAGE — STRUCTURAL RULES

This is the first message to this prospect on Telegram. The prospect does not
know us yet. Telegram has heavier bot traffic than WhatsApp; the message must
sound unmistakably human or it will be dismissed as automation.

DOCTRINE STRUCTURE (compressed for chat — the full email version is 5 sections;
this version merges them into 5-8 sentences total):

1. GREETING — One short line. Use the GREETING FORMAT rules from the language
   nativeness block. If the prospect record has only a Telegram @username and
   no first name, open with a plain language-appropriate "Hi" or equivalent
   WITHOUT a name. Never address the prospect by their @username (e.g.,
   "Hi @ivan_petrov,") — it reads as scraped. Never "Dear", never "Good
   morning", never "I hope this finds you well".

2. WHY — Sentence 1 (the line right after the greeting). Prospect-led: open
   with their brand, vertical, market, or a specific peer behavior.
   ABSOLUTELY FORBIDDEN openers:
     "Our ...", "We ...", "At MobUpps ...", "MobUpps is ...", "I'm reaching out".
   These flip the message from prospect-led to self-referential and break the
   doctrine. The first content word should be about the prospect or their market.

3. VALIDATION + HOW — Sentences 2-4 (two or three sentences; Telegram tolerates
   slightly more length than WhatsApp). Merge what we can deliver with how we
   deliver it:
     - One specific volume or quality signal (real number, never a range —
       say "above 12%" not "8-15%", say "400+ daily" not "150-400")
     - One concrete vertical-native mechanic — language and metrics that match
       the prospect's exact sub-vertical. Generic "we optimize campaigns" or
       "we drive results" is forbidden.
     - One competitor or peer name-drop where it makes the claim concrete.

4. CTA — Final sentence. One soft question. Low-friction. No calendar links.
   Max 15 words. One question mark, never an exclamation mark.

LENGTH:
- 5-8 sentences total including greeting.
- Hard cap at 8 sentences.
- Telegram tolerates more length than WhatsApp, but a 9+ sentence first
  message still reads as a sales pitch.

FORMAT:
- No subject line. Telegram has no subject field. The "subject" field in your
  JSON output should be a brief 3-5 word topic tag for internal tracking only.
- No signature block. No "Best, Michael" or "Cheers,". The sender's name is
  shown automatically by Telegram.
- Plain text only. NO markdown on cold messages even though Telegram supports
  it natively. *Bold* and _italic_ on a first message read as marketing copy,
  not a real person typing. Save formatting for established threads.
- No links in the first message. Telegram auto-expands link previews; a
  preview block on a cold message looks like a campaign blast.
- Always use the "%" symbol for percentages. NEVER spell out "percent",
  "Prozent", "процент", "por ciento", "pour cent", "phần trăm", "퍼센트",
  "パーセント", "เปอร์เซ็นต์".
- No em dashes. No en dashes. Use commas or periods.
- No snake_case tokens (e.g. "funded_account" is forbidden, "funded account"
  is correct).
- No bracketed editorial notes ([Verify X], [Check Y]) — these leak from
  rewriting passes and must never appear.

TONE:
- Real human typing. Telegram has heavy bot traffic; the message must read
  as written by a person. Casual-professional, slightly more direct than
  WhatsApp.
- No corporate buzzwords: "synergy", "leverage", "delve", "seamless",
  "holistic", "game-changer", "unlock potential", "navigate the landscape".
- No spam phrases: "circling back", "touching base", "hope you are well",
  "I trust this finds you well", "would love to", "wanted to reach out",
  "I just wanted to".
- No "X, not Y" constructions. Rephrase as positive specification.
   BAD: "Real CPI optimization, not vanity bidding."
   GOOD: "Real CPI optimization tied to confirmed installs."

EMOJIS AND STICKERS:
- 0 emojis on any first cold Telegram message.
- 0 stickers ever, in any mode. Stickers on a cold business message read as
  bot or spam.
- Telegram's emoji and sticker culture is strong in private DMs between
  acquaintances; it is NOT appropriate for first business outreach.

COUNTRY-MATCHED REFERENCES:
- All competitor names, peer brands, market data, and regulatory references
  MUST match the prospect's country. NEVER default to US references for
  non-US prospects. Telegram skews heavily toward Russia, CIS, Eastern
  Europe, MENA, Iran, parts of LATAM, and crypto/Web3 communities globally
  — peer references should reflect the prospect's actual market.

VERTICAL-NATIVE TERMINOLOGY (CRITICAL):
- Use the exact event terminology and metrics the prospect's sub-vertical uses.
- Gaming UA prospects use IAP, payer conversion, ARPDAU, D7 ROAS, retention.
- Fintech prospects use funded account, first deposit, KYC.
- E-commerce prospects use confirmed purchase, AOV, ROAS.
- Crypto/Web3 prospects (a heavy Telegram demographic) use wallet connect,
  first deposit, KYC, on-chain conversion, TGE, mainnet launch. Match the
  prospect's tech stack without overusing crypto buzzwords.
- Telehealth prospects use consultation booking, appointment.
- Cross-vertical leakage (gaming jargon in fintech, subscription jargon in
  e-commerce, etc.) is a critical failure.\`;

const TELEGRAM_PROSPECTOR_CRITIC_RULES = \`TELEGRAM CHANNEL REGISTER CHECK — PROSPECTOR MODE:

Score channel_register_match 1-5 against these criteria for the FIRST COLD
Telegram message:

Score 5 (passes):
- 5-8 sentences total in the body
- Greeting is exactly one short line, language-appropriate; if no first
  name is available, "Hi" or equivalent without a name is acceptable
- Prospect's @username is NOT used as the salutation
- WHY (sentence 1) starts prospect-led — first content word is about the
  prospect, their brand, their vertical, or their market
- VALIDATION + HOW (sentences 2-4) include one specific volume number,
  one vertical-native mechanic, and ideally one peer/competitor reference
- CTA (final sentence) is one soft question, max 15 words
- No subject line attempted
- No signature / sign-off
- Plain text, no markdown (no *bold*, _italic_, \\\`code\\\`, links, or headings)
- No links / URLs in the message
- No emojis, no stickers
- No spam phrases ("circling back", "touching base", etc.)
- No em dashes
- "%" symbol used (not "percent" / "Prozent" / etc.)
- No "X, not Y" constructions
- All references country-matched (peers reflect the prospect's actual market,
  with RU/CIS/MENA/crypto-Web3 awareness for typical Telegram demographics)
- Vertical-native terminology throughout

Score 3-4 (minor issues, can pass with one nit):
- 9 sentences but otherwise tight
- One small spam phrase that slipped in
- Greeting slightly informal for the market

Score 1-2 (FAIL — needs_rewrite must be true):
- 10+ sentences (reads like an email, not a chat)
- Has a signature block
- Greeting addresses the prospect by @username
- Greeting is missing or wrong-language
- WHY starts with "Our ...", "We ...", "At MobUpps ...", or any
  self-referential opener
- Volume given as a range ("8-15%") instead of one specific number
- US references in a non-US-prospect message
- Generic mechanics ("we optimize campaigns", "we drive results")
- Wrong-vertical terminology (e.g., gaming jargon in fintech message)
- Multiple CTAs or multiple question marks
- Bullet points or numbered lists
- Markdown formatting (asterisks for bold, underscores for italics,
  backticks for code, # for headings)
- Links / URLs in the message
- Emojis or stickers
- Subject line attempted in the body
- Em dashes present
- Spelled-out percentage
- "X, not Y" construction present

If channel_register_match < 3, needs_rewrite MUST be true.\`;

const TELEGRAM_FOLLOWUPER_WRITER_RULES = \`TELEGRAM — FOLLOW-UP MESSAGE — STRUCTURAL RULES

This is a follow-up to a prior conversation on Telegram. The prospect already
knows who we are. Your only valid input is the prior conversation. Every
value point in this follow-up must trace to something visible in that
conversation — what we said before, or what the prospect said back.

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
   The reference must name the SPECIFIC topic, not be vague. Do NOT write
   "Following up on my detailed message from April 24th about the MAFO
   performance benchmarks across our gaming clients in Brazil" — too long
   for a chat thread.

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
- Telegram tolerates slightly more length on followups than WhatsApp;
  WhatsApp follow-up cap is 2-3 sentences, Telegram is 3-4. A 5-sentence
  follow-up still reads like spam.

FORMAT — same rules as the first message, with two narrow relaxations:
- No subject line, no signature, plain text default.
- Light markdown for emphasis is acceptable in established conversations
  where the prior thread shows the prospect uses formatting themselves
  (they sent *bold*, _italic_, or \\\`code\\\` in their reply). Default: stay plain.
- Links are acceptable when the prior conversation established a reason to
  share one (case study request, deck request, etc.). Prefer a clean URL to
  the resource over a tracked redirect. Telegram will auto-expand the link
  preview; a clean preview is fine, a campaign-tracking URL with UTM params
  reads as spam.
- "%" symbol always. No em dashes. No snake_case.
- No bracketed editorial notes.
- One question mark maximum. No exclamation marks.

TONE — same:
- Real human texting. Casual-professional.
- Telegram has heavy bot traffic; even in established threads, the message
  must read as written by a person.
- No "circling back" used vaguely (you may write "circling back on the
  Lazada CPS angle" because that names a specific topic; you may NOT write
  "just circling back" alone, that's a spam signal).
- No "touching base", "hope you are well", "would love to".
- No corporate buzzwords ("synergy", "leverage", "delve", "seamless", etc.).
- No "X, not Y" constructions.
- No stickers, even in established conversations. No emojis on follow-ups
  unless the prospect used one in their reply first.

CONTEXT-USE PATTERN:
- If the prior message included a specific number, reference it ("the 12%
  lift I mentioned"). Do not repeat the full pitch.
- If the prospect replied with a question, the follow-up addresses that
  question.
- If the prospect asked for materials (case study, deck), the follow-up
  delivers or references delivery of those materials.
- If the prior message named a competitor, you can update on that competitor's
  recent move or pivot to a different angle entirely.\`;

const TELEGRAM_FOLLOWUPER_CRITIC_RULES = \`TELEGRAM CHANNEL REGISTER CHECK — FOLLOWUPER MODE:

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
- Markdown is absent OR matches what the prospect used in the thread
- Links are absent OR justified by the prior conversation
- No stickers; no emojis unless the prospect used one first
- All claims traceable to the prior conversation (no invented numbers
  or new competitor references)

Score 3-4 (minor issues, can pass with one nit):
- 5 sentences but otherwise on register
- Reference is slightly vague ("following up on our chat" without naming
  the topic)
- Light markdown used without clear precedent in the thread

Score 1-2 (FAIL — needs_rewrite must be true):
- 6+ sentences (too long for chat follow-up)
- No reference to prior contact in the first sentence
- Re-introduces MobUpps or the sender
- Repeats the full pitch from the prior message
- Invents new claims or numbers not in the prior conversation
- Uses spam phrases ("just circling back", "touching base", "would love to")
- Has em dashes or signature block
- Stickers present
- Markdown overuse (multiple bold runs, headings, lists)
- Multiple question marks or any exclamation marks
- "X, not Y" construction present

ALSO score context_grounding 1-5 (followup mode only):

Score 5: every claim in the follow-up traces to something in the prior
conversation (what we said, what they replied, or the SDR's context notes).

Score 3-4: most claims traceable; one minor unsupported detail.

Score 1-2: introduces new claims, numbers, competitors, or facts not
present in the prior conversation. This is fabrication. needs_rewrite MUST
be true.

If channel_register_match < 3 OR context_grounding < 3, needs_rewrite MUST be true.\`;`;

const E2_MARKER = `TELEGRAM CHANNEL REGISTER CHECK`;

// ═════════════════════════════════════════════════════════════════
// Edit 3 - "Future channels" comment header update
// ═════════════════════════════════════════════════════════════════

const E3_OLD = `// Future channels (placeholders for Phases 2-4)`;
const E3_NEW = `// Future channels (placeholders for Phases 3-4)`;
const E3_MARKER = `// Future channels (placeholders for Phases 3-4)`;

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

for (const [label, oldStr, newStr, marker] of [
  ["telegram-docstring",        E1_OLD, E1_NEW, E1_MARKER],
  ["telegram-consts-populate",  E2_OLD, E2_NEW, E2_MARKER],
  ["future-channels-header",    E3_OLD, E3_NEW, E3_MARKER],
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
  docstringUpdated:           source.includes(`Phase 1-2 implement WhatsApp and Telegram fully`),
  oldDocstringGone:          !source.includes(`Phase 1 implements WhatsApp fully`),

  prospectorWriterPopulated:  source.includes(`TELEGRAM — FIRST COLD MESSAGE — STRUCTURAL RULES`),
  prospectorCriticPopulated:  source.includes(`TELEGRAM CHANNEL REGISTER CHECK — PROSPECTOR MODE`),
  followuperWriterPopulated:  source.includes(`TELEGRAM — FOLLOW-UP MESSAGE — STRUCTURAL RULES`),
  followuperCriticPopulated:  source.includes(`TELEGRAM CHANNEL REGISTER CHECK — FOLLOWUPER MODE`),

  prospectorWriterEmpty:     !source.includes(`const TELEGRAM_PROSPECTOR_WRITER_RULES = "";`),
  prospectorCriticEmpty:     !source.includes(`const TELEGRAM_PROSPECTOR_CRITIC_RULES = "";`),
  followuperWriterEmpty:     !source.includes(`const TELEGRAM_FOLLOWUPER_WRITER_RULES = "";`),
  followuperCriticEmpty:     !source.includes(`const TELEGRAM_FOLLOWUPER_CRITIC_RULES = "";`),

  futureCommentUpdated:       source.includes(`// Future channels (placeholders for Phases 3-4)`),
  oldFutureCommentGone:      !source.includes(`// Future channels (placeholders for Phases 2-4)`),

  whatsappProsWriterUntouched: source.includes(`WHATSAPP — FIRST COLD MESSAGE — STRUCTURAL RULES`),
  whatsappProsCriticUntouched: source.includes(`WHATSAPP CHANNEL REGISTER CHECK — PROSPECTOR MODE:`),
  whatsappFolWriterUntouched:  source.includes(`WHATSAPP — FOLLOW-UP MESSAGE — STRUCTURAL RULES`),
  whatsappFolCriticUntouched:  source.includes(`WHATSAPP CHANNEL REGISTER CHECK — FOLLOWUPER MODE:`),

  teamsStillPlaceholder:      source.includes(`const TEAMS_PROSPECTOR_WRITER_RULES = ""; // Phase 3`),
  slackStillPlaceholder:      source.includes(`const SLACK_PROSPECTOR_WRITER_RULES = ""; // Phase 4`),

  routingUntouched:           source.includes(`if (channel === "telegram" && mode === "prospector") return TELEGRAM_PROSPECTOR_WRITER_RULES;`) &&
                              source.includes(`if (channel === "telegram" && mode === "followuper") return TELEGRAM_FOLLOWUPER_CRITIC_RULES;`),

  telegramSpecificContent:    source.includes(`heavier bot traffic than WhatsApp`) &&
                              source.includes(`Telegram has heavy bot traffic`) &&
                              source.includes(`auto-expand`) &&
                              source.includes(`Crypto/Web3 prospects`) &&
                              source.includes(`@username`),
};
console.log("[channel-register-telegram] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[channel-register-telegram] FAIL - failing checks:", failing.join(", "));
  process.exit(4);
}
console.log("[channel-register-telegram] DONE");
