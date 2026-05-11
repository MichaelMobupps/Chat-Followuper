#!/usr/bin/env node
/**
 * Ticket teams-register, patch 1/1: lib/channelRegister.ts
 *
 * Dependency: requires ticket-telegram-register AND ticket-slack-register
 * to have landed first. The Edit 1 docstring anchor reads "WhatsApp
 * (Phase 1), Telegram (Phase 2), and Slack (Phase 4) are fully" which is
 * only present post-slack. Edit 3 anchors on the "// Future channel
 * (placeholder for Phase 3)" comment which is only present post-slack.
 *
 * Three atomic edits populating Teams (Phase 3) content. This completes
 * the channelRegister.ts phase work for all four supported channels.
 *
 *   E1. Docstring update: list all four channels as implemented.
 *
 *   E2. Replace the four empty TEAMS placeholder consts with full content
 *       blocks. Mirrors the depth of the WhatsApp, Telegram, and Slack
 *       register blocks.
 *
 *   E3. Reframe the now-stale "// Future channel (placeholder for Phase 3)"
 *       comment as a meaningful section header for the additional-channels
 *       block below it.
 *
 * Teams-specific register decisions (vs Slack baseline):
 *   - Most formal of the four channels. Enterprise-skewed: banking,
 *     insurance, government, healthcare, large enterprise tech, defense.
 *     Tone closer to email than chat.
 *   - External access delivery context: OFF by default at most enterprise
 *     tenants; external messages often route to an approval queue.
 *   - 1:1 chat only, never Teams channel. Never @-mention prospect in
 *     cold message (Teams @-mentions push high-urgency notifications).
 *   - Teams markdown subset (**bold**, _italic_, \`code\`, lists,
 *     blockquotes) renders inconsistently across desktop/web/mobile;
 *     default to plain text. One **bold** term acceptable. No bullets,
 *     no lists, no headings, no blockquotes.
 *   - No links in first cold message (auto-expanded previews look spammy).
 *   - Length: 6-9 sentences prospector (most of the four channels),
 *     3-4 followuper.
 *   - Greeting: "Hi {FirstName}," default; "Dear {FirstName}," acceptable
 *     in conservative markets (Japan, Germany corporate, financial
 *     services). No "Hey".
 *   - Emojis: 0 even in established conversations unless the prospect
 *     used one first AND the context is informal.
 *   - Compliance awareness: banking/insurance/healthcare/government
 *     archive Teams messages; cold messages may be reviewed.
 *   - Enterprise peer references: Workday, Salesforce, SAP, Oracle,
 *     ServiceNow. NOT Notion/Linear/Figma (Slack SaaS tier).
 *   - Vertical: explicit nod to banking/insurance/healthcare/government
 *     sector vocabulary (account-opening conversion, claims throughput,
 *     patient appointment booking, AML, compliance language).
 *
 * Idempotent. All anchors em-dash-free (box-drawing characters used in
 * Edit 3 OLD are explicitly allowed per the em-dash rule).
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

const E1_OLD = ` * WhatsApp (Phase 1), Telegram (Phase 2), and Slack (Phase 4) are fully
 * implemented. Teams (Phase 3) returns placeholder strings until its phase ships.`;

const E1_NEW = ` * All four channels (WhatsApp, Telegram, Teams, Slack) are fully
 * implemented.`;

const E1_MARKER = `All four channels (WhatsApp, Telegram, Teams, Slack) are fully`;

// ═════════════════════════════════════════════════════════════════
// Edit 2 - Populate four TEAMS placeholder consts
// ═════════════════════════════════════════════════════════════════

const E2_OLD = `const TEAMS_PROSPECTOR_WRITER_RULES = ""; // Phase 3
const TEAMS_PROSPECTOR_CRITIC_RULES = ""; // Phase 3
const TEAMS_FOLLOWUPER_WRITER_RULES = ""; // Phase 3
const TEAMS_FOLLOWUPER_CRITIC_RULES = ""; // Phase 3`;

const E2_NEW = `const TEAMS_PROSPECTOR_WRITER_RULES = \`TEAMS — FIRST COLD MESSAGE — STRUCTURAL RULES

This is the first message to this prospect on Microsoft Teams. The prospect
does not know us yet. Teams is the most formal of the four channels:
enterprise-skewed, with senior decision-makers, regulated industries, and
risk-averse approval culture. Tone runs closer to email than to WhatsApp.

DELIVERY CONTEXT:
- Cold outreach on Teams arrives via External access (chat with people
  outside your organization). External access is OFF by default at the
  tenant level in most enterprises; when on, external messages may go to
  an approval queue or land in a separate external-chats tab.
- Most prospects on Teams work at large enterprises: banking, insurance,
  government, healthcare, large enterprise tech, defense, professional
  services. Compliance archiving is standard; messages may be reviewed.
- Always 1:1 chat. Never message a Teams channel.
- Never @-mention the prospect in a cold message. Teams @-mentions push
  notifications and read as high-urgency; using one cold is presumptuous.

DOCTRINE STRUCTURE (compressed for chat — the full email version is 5
sections; this version merges them into 6-9 sentences total. Teams
tolerates more length than WhatsApp, Telegram, or Slack):

1. GREETING — One short line. "Hi {FirstName}," is the safe default for
   English markets. "Dear {FirstName}," is acceptable in conservative
   markets (Japan, Germany corporate, financial services). Use the
   language-appropriate greeting from the nativeness block. Never "Hey",
   never "Good morning", never "I hope this finds you well".

2. WHY — Sentence 1 (the line right after the greeting). Prospect-led:
   open with their company, vertical, market position, or a specific peer
   behavior. Enterprise prospects respond best to industry-context openings.
   ABSOLUTELY FORBIDDEN openers:
     "Our ...", "We ...", "At MobUpps ...", "MobUpps is ...", "I'm reaching out".
   These flip the message from prospect-led to self-referential and break the
   doctrine. The first content word should be about the prospect or their market.

3. VALIDATION + HOW — Sentences 2-5 (two to four sentences). Merge what we
   can deliver with how we deliver it:
     - One specific volume or quality signal (real number, never a range —
       say "above 12%" not "8-15%", say "400+ daily" not "150-400")
     - One concrete vertical-native mechanic — language and metrics that
       match the prospect's exact sub-vertical. Generic "we optimize
       campaigns" or "we drive results" is forbidden.
     - One competitor or peer name-drop where it makes the claim concrete.
       Enterprise prospects expect enterprise peers: Workday, Salesforce,
       ServiceNow, SAP, Oracle as company examples. NOT Notion, Linear,
       or Figma (those signal SaaS-startup tier, not enterprise).

4. CTA — Final sentence. One soft question. Enterprise tone, slightly
   more formal than the WhatsApp, Telegram, or Slack equivalents.
   Examples: "Open to a brief call this week?", "Worth a short
   conversation?", "Could we schedule 15 minutes to discuss?"
   Max 15 words. One question mark, never an exclamation mark.

LENGTH:
- 6-9 sentences total including greeting.
- Hard cap at 9 sentences.
- Teams tolerates the most length of the four channels because enterprise
  users read it more like email. But 10+ sentences still reads as a
  marketing blast and may trigger compliance-review concern.

FORMAT:
- No subject line. Teams chat has no subject field. The "subject" field in
  your JSON output should be a brief 3-5 word topic tag for internal tracking.
- No signature block. Teams shows sender name and organization automatically.
- Teams supports a SUBSET of markdown: **bold**, _italic_, \\\`inline code\\\`,
  bullet lists, ordered lists, blockquotes. Rendering is occasionally
  inconsistent across desktop, web, and mobile clients. Default to plain
  text. Acceptable: one **bold** term to highlight a key number or name.
  AVOID bullet lists, ordered lists, headings, blockquotes, and horizontal
  rules — all of these turn an enterprise message into a marketing blast.
- No links / URLs in the first message. Teams auto-expands link previews;
  a preview block on a cold message looks like a campaign blast and may
  be flagged by enterprise content filters.
- Always use the "%" symbol for percentages. NEVER spell out "percent",
  "Prozent", "процент", "por ciento", "pour cent", "phần trăm", "퍼센트",
  "パーセント", "เปอร์เซ็นต์".
- No em dashes. No en dashes. Use commas or periods.
- No snake_case tokens (e.g. "funded_account" is forbidden, "funded account"
  is correct).
- No bracketed editorial notes ([Verify X], [Check Y]) — these leak from
  rewriting passes and must never appear.

TONE:
- Most formal of the four channels. Enterprise register. Closer to email
  than to chat. The prospect should feel like a peer or vendor is
  contacting them through proper professional channels.
- No corporate buzzwords: "synergy", "leverage", "delve", "seamless",
  "holistic", "game-changer", "unlock potential", "navigate the landscape".
- No spam phrases: "circling back", "touching base", "hope you are well",
  "I trust this finds you well", "I trust you are well", "would love to",
  "wanted to reach out", "I just wanted to", "just checking in".
- No "X, not Y" constructions. Rephrase as positive specification.
   BAD: "Real CPI optimization, not vanity bidding."
   GOOD: "Real CPI optimization tied to confirmed installs."

EMOJIS:
- 0 emojis in any cold Teams message. Teams culture is conservative; a
  stranger sending :wave: or :rocket: in an external Teams chat reads as
  unprofessional, especially in regulated industries (banking, insurance,
  healthcare, government).
- 0 emoji even in established conversations on Teams unless the prospect
  uses one first AND the context is informal.

COUNTRY-MATCHED REFERENCES:
- All competitor names, peer brands, market data, and regulatory references
  MUST match the prospect's country. NEVER default to US references for
  non-US prospects.
- Teams skews to large enterprise globally: US, UK, Germany, France, Japan,
  Australia, Canada, GCC, and large-corporation markets generally. Peer
  references should reflect enterprise tier (Workday, Salesforce, SAP,
  Oracle, ServiceNow) not SaaS-startup tier (Notion, Linear, Figma).

VERTICAL-NATIVE TERMINOLOGY (CRITICAL):
- Use the exact event terminology and metrics the prospect's sub-vertical uses.
- Gaming UA prospects use IAP, payer conversion, ARPDAU, D7 ROAS, retention.
- Fintech prospects use funded account, first deposit, KYC, AML.
- E-commerce prospects use confirmed purchase, AOV, ROAS.
- Banking/insurance/healthcare/government prospects (a heavy Teams
  demographic) use sector-specific language: account-opening conversion,
  claims throughput, patient appointment booking, AML, KYC, regulatory
  filing. Compliance language signals industry literacy and is welcomed.
- Telehealth prospects use consultation booking, appointment.
- Cross-vertical leakage (gaming jargon in banking, subscription jargon
  in healthcare, etc.) is a critical failure.\`;

const TEAMS_PROSPECTOR_CRITIC_RULES = \`TEAMS CHANNEL REGISTER CHECK — PROSPECTOR MODE:

Score channel_register_match 1-5 against these criteria for the FIRST COLD
Teams message:

Score 5 (passes):
- 6-9 sentences total in the body
- Greeting is exactly one short line, language-appropriate; "Hi {FirstName},"
  default for English, "Dear {FirstName}," acceptable in conservative markets
- Prospect is NOT @-mentioned anywhere in the message
- WHY (sentence 1) starts prospect-led — first content word is about the
  prospect, their company, their vertical, or their market
- VALIDATION + HOW (sentences 2-5) include one specific volume number,
  one vertical-native mechanic, and ideally one peer/competitor reference
- Peer references are enterprise tier (Workday, Salesforce, SAP, Oracle,
  ServiceNow) not SaaS-startup tier (Notion, Linear, Figma)
- CTA (final sentence) is one soft question, max 15 words, formal register
  ("Open to a brief call this week?" rather than casual chat phrasing)
- No subject line attempted
- No signature / sign-off
- Plain text dominant; at most one **bold** term acceptable
- No bullet lists, no ordered lists, no headings, no blockquotes, no
  horizontal rules
- No links / URLs in the message
- No emojis
- No spam phrases ("circling back", "touching base", "just checking in",
  "I trust you are well", etc.)
- No em dashes
- "%" symbol used (not "percent" / "Prozent" / etc.)
- No "X, not Y" constructions
- All references country-matched (enterprise peers reflect the prospect's
  actual market)
- Vertical-native terminology throughout; compliance language welcomed
  for banking/insurance/healthcare/government prospects

Score 3-4 (minor issues, can pass with one nit):
- 10 sentences but otherwise tight
- One small spam phrase that slipped in
- Greeting slightly informal for the market ("Hi" used where "Dear" would
  fit better)
- Two **bold** runs instead of one

Score 1-2 (FAIL — needs_rewrite must be true):
- 11+ sentences (reads like an email, which Teams DOES tolerate; but
  beyond that triggers compliance-review concern)
- Has a signature block
- Greeting uses "Hey" or is missing
- Prospect @-mentioned in the message body
- WHY starts with "Our ...", "We ...", "At MobUpps ...", or any
  self-referential opener
- Volume given as a range ("8-15%") instead of one specific number
- US references in a non-US-prospect message
- Generic mechanics ("we optimize campaigns", "we drive results")
- Wrong-vertical terminology (e.g., gaming jargon in banking message)
- SaaS-startup peer references in enterprise prospect context
- Multiple CTAs or multiple question marks
- Bullet lists, ordered lists, headings, blockquotes, horizontal rules
- More than two **bold** runs
- Links / URLs in the message
- Emojis present
- Subject line attempted in the body
- Em dashes present
- Spelled-out percentage
- "X, not Y" construction present

If channel_register_match < 3, needs_rewrite MUST be true.\`;

const TEAMS_FOLLOWUPER_WRITER_RULES = \`TEAMS — FOLLOW-UP MESSAGE — STRUCTURAL RULES

This is a follow-up to a prior conversation on Microsoft Teams. The prospect
already knows who we are. Your only valid input is the prior conversation.
Every value point in this follow-up must trace to something visible in that
conversation — what we said before, or what the prospect said back.

DELIVERY CONTEXT:
- Teams followups stay in the same 1:1 chat thread by default.
- Don't repeat the original pitch. Don't re-introduce yourself.
- @-mentioning the prospect is acceptable in a followup ONLY when the
  conversation has been quiet for many days AND a meaningful update
  justifies the nudge. Default to no @-mention. Enterprise prospects
  view @-mentions as urgent; using one cold is presumptuous.

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
     "Quick follow-up on the AML compliance angle we discussed."
     "Circling back on the account-opening conversion conversation."
   The reference must name the SPECIFIC topic, not be vague.

2. NEW VALUE POINT (sentences 2-3) — One or two things they did not engage
   with from the prior message, expanded with fresh evidence, OR a response
   to something they said back. Stage strategy rotation:
     - Stage 1: Add a new insight, data point, or relevant industry development.
     - Stage 2: Shift angle — reference a competitor move or market trend.
     - Stage 3: Direct and brief, give them an easy out ("if timing isn't
       right, no problem at all").
     - Stage 4+: Continue rotating fresh angles. Each stage must bring
       something genuinely new. NEVER repeat an angle from a previous stage.

3. SOFT CTA (final sentence) — One soft question. Lower friction than the
   first message's CTA, but enterprise register. Examples: "Worth a brief
   call to walk through it?", "Open to 15 minutes this week?", "If the
   timing isn't right, happy to revisit later in the quarter?"

LENGTH:
- 3-4 sentences MAXIMUM. Hard cap.
- A 5-sentence follow-up reads like spam even on Teams.

FORMAT — same rules as the first message, with two narrow relaxations:
- No subject line, no signature.
- Light Teams-subset markdown remains acceptable; one **bold** term is the
  default cap. Avoid heavy markdown.
- Links are acceptable when the prior conversation established a reason
  to share one (case study request, deck request, compliance documentation).
  Prefer a clean URL to the resource over a tracked redirect. Teams will
  auto-expand the preview; a clean preview is fine, a campaign-tracking
  URL with UTM params reads as spam and may be flagged by content filters.
- "%" symbol always. No em dashes. No snake_case.
- No bracketed editorial notes.
- One question mark maximum. No exclamation marks.

TONE — same:
- Enterprise register. Closer to email than chat.
- No "circling back" used vaguely (you may write "circling back on the
  AML compliance angle" because that names a specific topic; you may NOT
  write "just circling back" alone, that's a spam signal).
- No "touching base", "hope you are well", "would love to", "just checking in".
- No corporate buzzwords ("synergy", "leverage", "delve", "seamless", etc.).
- No "X, not Y" constructions.
- Emojis are acceptable in followups ONLY when the prospect used one in
  their reply first AND the context is informal. Default: zero emoji.

CONTEXT-USE PATTERN:
- If the prior message included a specific number, reference it ("the 12%
  lift I mentioned"). Do not repeat the full pitch.
- If the prospect replied with a question, the follow-up addresses that
  question.
- If the prospect asked for materials (case study, deck, compliance brief),
  the follow-up delivers or references delivery of those materials.
- If the prior message named a competitor, you can update on that
  competitor's recent move or pivot to a different angle entirely.\`;

const TEAMS_FOLLOWUPER_CRITIC_RULES = \`TEAMS CHANNEL REGISTER CHECK — FOLLOWUPER MODE:

Score channel_register_match 1-5 against these criteria for FOLLOW-UP messages:

Score 5 (passes):
- 3-4 sentences total
- Sentence 1 explicitly references the prior conversation with a SPECIFIC
  topic name (not vague "following up")
- Sentences 2-3 introduce a NEW angle or address prospect's reply,
  derived from the prior conversation's content
- No re-introduction of MobUpps or the sender
- Soft CTA, one question mark, enterprise register
- No spam phrases, no em dashes, "%" symbol used
- At most one **bold** term; no bullets, lists, headings, or blockquotes
- Links are absent OR justified by the prior conversation
- @-mention of prospect absent OR justified by prolonged silence plus
  a meaningful update
- No emojis (or matched to prospect's first use)
- All claims traceable to the prior conversation (no invented numbers
  or new competitor references)

Score 3-4 (minor issues, can pass with one nit):
- 5 sentences but otherwise on register
- Reference is slightly vague ("following up on our chat" without naming
  the topic)
- Two **bold** runs where one would have sufficed

Score 1-2 (FAIL — needs_rewrite must be true):
- 6+ sentences (too long for chat follow-up even on Teams)
- No reference to prior contact in the first sentence
- Re-introduces MobUpps or the sender
- Repeats the full pitch from the prior message
- Invents new claims or numbers not in the prior conversation
- Uses spam phrases ("just circling back", "touching base", "would love to",
  "just checking in", "I trust you are well")
- Has em dashes or signature block
- Heavy markdown (bullet lists, ordered lists, headings, blockquotes)
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

const E2_MARKER = `TEAMS CHANNEL REGISTER CHECK`;

// ═════════════════════════════════════════════════════════════════
// Edit 3 - Reframe "Future channel" comment as section header
// ═════════════════════════════════════════════════════════════════
//
// The "// Future channel (placeholder for Phase 3)" comment is stale
// once Teams is implemented (no future channels remain). Replace it
// with a section header that accurately labels the block of channel
// registers below it (Telegram, Teams, Slack — Whatsapp is above this
// section). The marker is em-dash-free (uses colon instead).

const E3_OLD = `// Future channel (placeholder for Phase 3)`;
const E3_NEW = `// Additional channels: Telegram, Teams, Slack`;
const E3_MARKER = `// Additional channels: Telegram, Teams, Slack`;

// ═════════════════════════════════════════════════════════════════
// applyEdit helper
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

// Pre-flight: confirm the post-slack state.
if (!source.includes(`WhatsApp (Phase 1), Telegram (Phase 2), and Slack (Phase 4) are fully`) &&
    !source.includes(`All four channels (WhatsApp, Telegram, Teams, Slack) are fully`)) {
  console.error("[FATAL] this patch requires ticket-slack-register (and ticket-telegram-register) to have landed first");
  console.error("[FATAL] cannot find the post-slack docstring or post-teams docstring");
  process.exit(5);
}

for (const [label, oldStr, newStr, marker] of [
  ["teams-docstring",        E1_OLD, E1_NEW, E1_MARKER],
  ["teams-consts-populate",  E2_OLD, E2_NEW, E2_MARKER],
  ["section-header-reframe", E3_OLD, E3_NEW, E3_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

// ═════════════════════════════════════════════════════════════════
// Evidence
// ═════════════════════════════════════════════════════════════════

const evidence = {
  docstringUpdated:           source.includes(`All four channels (WhatsApp, Telegram, Teams, Slack) are fully`),
  oldDocstringGone:          !source.includes(`WhatsApp (Phase 1), Telegram (Phase 2), and Slack (Phase 4) are fully`),

  prospectorWriterPopulated:  source.includes(`TEAMS — FIRST COLD MESSAGE — STRUCTURAL RULES`),
  prospectorCriticPopulated:  source.includes(`TEAMS CHANNEL REGISTER CHECK — PROSPECTOR MODE`),
  followuperWriterPopulated:  source.includes(`TEAMS — FOLLOW-UP MESSAGE — STRUCTURAL RULES`),
  followuperCriticPopulated:  source.includes(`TEAMS CHANNEL REGISTER CHECK — FOLLOWUPER MODE`),

  prospectorWriterEmpty:     !source.includes(`const TEAMS_PROSPECTOR_WRITER_RULES = "";`),
  prospectorCriticEmpty:     !source.includes(`const TEAMS_PROSPECTOR_CRITIC_RULES = "";`),
  followuperWriterEmpty:     !source.includes(`const TEAMS_FOLLOWUPER_WRITER_RULES = "";`),
  followuperCriticEmpty:     !source.includes(`const TEAMS_FOLLOWUPER_CRITIC_RULES = "";`),

  sectionHeaderReframed:      source.includes(`// Additional channels: Telegram, Teams, Slack`),
  oldFutureCommentGone:      !source.includes(`// Future channel (placeholder for Phase 3)`),

  whatsappBlocksUntouched:    source.includes(`WHATSAPP — FIRST COLD MESSAGE — STRUCTURAL RULES`) &&
                              source.includes(`WHATSAPP CHANNEL REGISTER CHECK — PROSPECTOR MODE:`) &&
                              source.includes(`WHATSAPP — FOLLOW-UP MESSAGE — STRUCTURAL RULES`) &&
                              source.includes(`WHATSAPP CHANNEL REGISTER CHECK — FOLLOWUPER MODE:`),

  telegramBlocksUntouched:    source.includes(`TELEGRAM — FIRST COLD MESSAGE — STRUCTURAL RULES`) &&
                              source.includes(`TELEGRAM CHANNEL REGISTER CHECK — PROSPECTOR MODE`) &&
                              source.includes(`TELEGRAM — FOLLOW-UP MESSAGE — STRUCTURAL RULES`) &&
                              source.includes(`TELEGRAM CHANNEL REGISTER CHECK — FOLLOWUPER MODE`),

  slackBlocksUntouched:       source.includes(`SLACK — FIRST COLD MESSAGE — STRUCTURAL RULES`) &&
                              source.includes(`SLACK CHANNEL REGISTER CHECK — PROSPECTOR MODE`) &&
                              source.includes(`SLACK — FOLLOW-UP MESSAGE — STRUCTURAL RULES`) &&
                              source.includes(`SLACK CHANNEL REGISTER CHECK — FOLLOWUPER MODE`),

  noPlaceholdersRemain:      !source.includes(`= ""; // Phase`),

  routingUntouched:           source.includes(`if (channel === "teams" && mode === "prospector") return TEAMS_PROSPECTOR_WRITER_RULES;`) &&
                              source.includes(`if (channel === "teams" && mode === "followuper") return TEAMS_FOLLOWUPER_CRITIC_RULES;`),

  teamsSpecificContent:       source.includes(`Microsoft Teams`) &&
                              source.includes(`External access is OFF by default`) &&
                              source.includes(`Workday, Salesforce`) &&
                              source.includes(`account-opening conversion`) &&
                              source.includes(`AML`) &&
                              source.includes(`compliance-review concern`),
};
console.log("[channel-register-teams] [evidence]", JSON.stringify(evidence));
const failing = Object.entries(evidence).filter(([, v]) => !v).map(([k]) => k);
if (failing.length > 0) {
  console.log("[channel-register-teams] FAIL - failing checks:", failing.join(", "));
  process.exit(4);
}
console.log("[channel-register-teams] DONE");
