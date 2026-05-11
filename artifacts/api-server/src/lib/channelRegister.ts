/**
 * Channel register — chat-specific writing rules per channel, plus
 * mode-specific shape rules (prospector first-message vs followuper).
 *
 * Mirrors the architecture of `languageNativeness.ts`. Each (channel × mode)
 * combination produces a writer rule block (injected into writer + rewriter
 * prompts) and a critic rule block (injected into the critic prompt).
 *
 * Two modes:
 *   - "prospector" — first cold message to a prospect on this channel.
 *     Carries the full doctrine (WHY → VALIDATION+HOW → CTA), compressed
 *     for chat. ~5-7 sentences max.
 *   - "followuper" — every subsequent message in an ongoing thread.
 *     Compressed shape: prior-contact reference + new value point + soft CTA.
 *     2-3 sentences max. Requires conversation context — no context, no message.
 *
 * All four channels (WhatsApp, Telegram, Teams, Slack) are fully
 * implemented.
 */

export type ChannelCode = "whatsapp" | "telegram" | "teams" | "slack";
export type GenerationMode = "prospector" | "followuper";

export function isChannelCode(value: string): value is ChannelCode {
  return ["whatsapp", "telegram", "teams", "slack"].includes(value);
}

// ─────────────────────────────────────────────────────────────────
// WHATSAPP — Prospector mode (first cold message)
// ─────────────────────────────────────────────────────────────────

const WHATSAPP_PROSPECTOR_WRITER_RULES = `WHATSAPP — FIRST COLD MESSAGE — STRUCTURAL RULES

This is the first message to this prospect on WhatsApp. The prospect does not
know us yet. The message must carry the full doctrine, compressed for chat:

DOCTRINE STRUCTURE (compressed for chat — the full email version is 5 sections;
this version merges them into 5-7 sentences total):

1. GREETING — One short line. Use the GREETING FORMAT rules from the language
   nativeness block (or "Hi {FirstName}," for English / Latin-script casual
   markets). Never "Dear", never "Good morning", never "I hope this finds you
   well", never an emoji-laden opener.

2. WHY — Sentence 1 (the line right after the greeting). Prospect-led: open
   with their brand, vertical, market, or a specific peer behavior.
   ABSOLUTELY FORBIDDEN openers:
     "Our ...", "We ...", "At MobUpps ...", "MobUpps is ...", "I'm reaching out".
   These flip the message from prospect-led to self-referential and break the
   doctrine. The first content word should be about the prospect or their market.

3. VALIDATION + HOW — Sentence 2-3 (one or two sentences). Merge what we can
   deliver with how we deliver it:
     - One specific volume or quality signal (real number, never a range —
       say "above 12%" not "8-15%", say "400+ daily" not "150-400")
     - One concrete vertical-native mechanic — language and metrics that match
       the prospect's exact sub-vertical. Generic "we optimize campaigns" or
       "we drive results" is forbidden.
     - One competitor or peer name-drop where it makes the claim concrete.

4. CTA — Final sentence. One soft question. Low-friction. No calendar links.
   Max 15 words. One question mark, never an exclamation mark.

LENGTH:
- 5-7 sentences total including greeting.
- Hard cap at 7 sentences.

FORMAT:
- No subject line. WhatsApp has no subject field. The "subject" field in your
  JSON output should be a brief 3-5 word topic tag for internal tracking only.
- No signature block. No "Best, Michael" or "Cheers,". The sender's name is
  shown automatically by WhatsApp.
- Plain text only. No bullet lists. No markdown. No headers.
- Always use the "%" symbol for percentages. NEVER spell out "percent",
  "Prozent", "процент", "por ciento", "pour cent", "phần trăm", "퍼센트",
  "パーセント", "เปอร์เซ็นต์".
- No em dashes. No en dashes. Use commas or periods.
- No snake_case tokens (e.g. "funded_account" is forbidden, "funded account"
  is correct).
- No bracketed editorial notes ([Verify X], [Check Y]) — these leak from
  rewriting passes and must never appear.

TONE:
- Real human typing on a phone. Casual-professional.
- No corporate buzzwords: "synergy", "leverage", "delve", "seamless",
  "holistic", "game-changer", "unlock potential", "navigate the landscape".
- No spam phrases: "circling back", "touching base", "hope you are well",
  "I trust this finds you well", "would love to", "wanted to reach out",
  "I just wanted to".
- No "X, not Y" constructions. Rephrase as positive specification.
   BAD: "Real CPI optimization, not vanity bidding."
   GOOD: "Real CPI optimization tied to confirmed installs."

EMOJIS:
- 0 emojis in conservative markets (Japan, Korea, Germany, Nordics, Russia, China).
- 0-1 emoji in friendly markets (LATAM, India, Southeast Asia, Middle East, Africa).
- When in doubt, zero. An over-emojified WhatsApp message reads worse than a plain one.

COUNTRY-MATCHED REFERENCES:
- All competitor names, peer brands, market data, and regulatory references MUST
  match the prospect's country. NEVER default to US references for non-US
  prospects. Indian prospect = Indian peers, Indian metrics. Brazilian
  prospect = Brazilian peers. Etc.

VERTICAL-NATIVE TERMINOLOGY (CRITICAL):
- Use the exact event terminology and metrics the prospect's sub-vertical uses.
- Gaming UA prospects use IAP, payer conversion, ARPDAU, D7 ROAS, retention.
- Fintech prospects use funded account, first deposit, KYC.
- E-commerce prospects use confirmed purchase, AOV, ROAS.
- Telehealth prospects use consultation booking, appointment.
- Cross-vertical leakage (gaming jargon in fintech, subscription jargon in
  e-commerce, etc.) is a critical failure.`;

const WHATSAPP_PROSPECTOR_CRITIC_RULES = `WHATSAPP CHANNEL REGISTER CHECK — PROSPECTOR MODE:

Score channel_register_match 1-5 against these criteria for the FIRST COLD
WhatsApp message:

Score 5 (passes):
- 5-7 sentences total in the body
- Greeting is exactly one short line, language-appropriate
- WHY (sentence 1) starts prospect-led — first content word is about the
  prospect, their brand, their vertical, or their market
- VALIDATION + HOW (sentences 2-3) include one specific volume number,
  one vertical-native mechanic, and ideally one peer/competitor reference
- CTA (final sentence) is one soft question, max 15 words
- No subject line attempted
- No signature / sign-off
- Plain text, no markdown, no bullets
- No spam phrases ("circling back", "touching base", etc.)
- No em dashes
- "%" symbol used (not "percent" / "Prozent" / etc.)
- No "X, not Y" constructions
- All references country-matched (no US peers for non-US prospects)
- Vertical-native terminology throughout

Score 3-4 (minor issues, can pass with one nit):
- 8 sentences but otherwise tight
- One small spam phrase that slipped in
- Greeting slightly informal for the market

Score 1-2 (FAIL — needs_rewrite must be true):
- 9+ sentences (reads like an email)
- Has a signature block
- Greeting is missing or wrong-language
- WHY starts with "Our ...", "We ...", "At MobUpps ...", or any self-referential opener
- Volume given as a range ("8-15%") instead of one specific number
- US references in a non-US-prospect message
- Generic mechanics ("we optimize campaigns", "we drive results")
- Wrong-vertical terminology (e.g., gaming jargon in fintech message)
- Multiple CTAs or multiple question marks
- Bullet points or numbered lists
- Markdown formatting
- Subject line attempted in the body
- Em dashes present
- Spelled-out percentage
- "X, not Y" construction present

If channel_register_match < 3, needs_rewrite MUST be true.`;

// ─────────────────────────────────────────────────────────────────
// WHATSAPP — Followuper mode (subsequent messages in thread)
// ─────────────────────────────────────────────────────────────────

const WHATSAPP_FOLLOWUPER_WRITER_RULES = `WHATSAPP — FOLLOW-UP MESSAGE — STRUCTURAL RULES

This is a follow-up to a prior conversation on WhatsApp. The prospect already
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

FOLLOW-UP STRUCTURE — 2-3 sentences total:

1. PRIOR-CONTACT REFERENCE (sentence 1) — Reference the prior thread in the
   FIRST sentence. Keep it brief and concrete. Examples:
     "Following up on the MAFO numbers I sent."
     "Quick follow-up on the Lazada CPS angle we discussed."
     "Circling back on the casual UA conversation."
   The reference must name the SPECIFIC topic, not be vague. Do NOT write
   "Following up on my detailed message from April 24th about the MAFO
   performance benchmarks across our gaming clients in Brazil" — too long
   for a chat thread.

2. NEW VALUE POINT (sentence 2, optional sentence 3) — One thing they did
   not engage with from the prior message, expanded with fresh evidence,
   OR a response to something they said back. Stage strategy rotation:
     - Stage 1: Add a new insight, data point, or relevant industry development.
     - Stage 2: Shift angle — reference a competitor move or market trend.
     - Stage 3: Direct and brief, give them an easy out ("if timing isn't
       right, no worries").
     - Stage 4+: Continue rotating fresh angles. Each stage must bring
       something genuinely new. NEVER repeat an angle from a previous stage.

3. SOFT CTA (final sentence) — One soft question. Lower friction than the
   first message's CTA. Examples: "Worth a quick test on a small segment?",
   "Open to a 15-min call this week?", "If timing is off, no worries — let
   me know either way?"

LENGTH:
- 2-3 sentences MAXIMUM. Hard cap.
- A 4-sentence follow-up reads like spam on WhatsApp.

FORMAT — same rules as the first message:
- No subject line, no signature, plain text only.
- "%" symbol always. No em dashes. No snake_case. No markdown.
- No bracketed editorial notes.
- One question mark maximum. No exclamation marks.

TONE — same:
- Real human texting. Casual-professional.
- No "circling back" used vaguely (you may write "circling back on the
  Lazada CPS angle" because that names a specific topic; you may NOT write
  "just circling back" alone — that's a spam signal).
- No "touching base", "hope you are well", "would love to".
- No corporate buzzwords ("synergy", "leverage", "delve", "seamless", etc.).
- No "X, not Y" constructions.

CONTEXT-USE PATTERN:
- If the prior message included a specific number, reference it: "the 12% lift
  I mentioned" — don't repeat the full pitch.
- If the prospect replied with a question, the follow-up addresses that question.
- If the prospect asked for materials (case study, deck), the follow-up delivers
  or references delivery of those materials.
- If the prior message named a competitor, you can update on that competitor's
  recent move or pivot to a different angle entirely.`;

const WHATSAPP_FOLLOWUPER_CRITIC_RULES = `WHATSAPP CHANNEL REGISTER CHECK — FOLLOWUPER MODE:

Score channel_register_match 1-5 against these criteria for FOLLOW-UP messages:

Score 5 (passes):
- 2-3 sentences total
- Sentence 1 explicitly references the prior conversation with a SPECIFIC
  topic name (not vague "following up")
- Sentence 2-3 introduces a NEW angle or addresses prospect's reply,
  derived from the prior conversation's content
- No re-introduction of MobUpps or the sender
- Soft CTA, one question mark
- No spam phrases, no em dashes, no markdown, "%" symbol used
- All claims traceable to the prior conversation (no invented numbers
  or new competitor references)

Score 3-4 (minor issues, can pass with one nit):
- 4 sentences but otherwise on register
- Reference is slightly vague ("following up on our chat" without naming
  the topic)

Score 1-2 (FAIL — needs_rewrite must be true):
- 5+ sentences (too long for chat follow-up)
- No reference to prior contact in the first sentence
- Re-introduces MobUpps or the sender
- Repeats the full pitch from the prior message
- Invents new claims or numbers not in the prior conversation
- Uses spam phrases ("just circling back", "touching base", "would love to")
- Has em dashes, signature block, or markdown
- Multiple question marks or any exclamation marks
- "X, not Y" construction present

ALSO score context_grounding 1-5 (followup mode only):

Score 5: every claim in the follow-up traces to something in the prior
conversation (what we said, what they replied, or the SDR's context notes).

Score 3-4: most claims traceable; one minor unsupported detail.

Score 1-2: introduces new claims, numbers, competitors, or facts not
present in the prior conversation. This is fabrication. needs_rewrite MUST
be true.

If channel_register_match < 3 OR context_grounding < 3, needs_rewrite MUST be true.`;

// ─────────────────────────────────────────────────────────────────
// Additional channels: Telegram, Teams, Slack
// ─────────────────────────────────────────────────────────────────

const TELEGRAM_PROSPECTOR_WRITER_RULES = `TELEGRAM — FIRST COLD MESSAGE — STRUCTURAL RULES

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
  e-commerce, etc.) is a critical failure.`;

const TELEGRAM_PROSPECTOR_CRITIC_RULES = `TELEGRAM CHANNEL REGISTER CHECK — PROSPECTOR MODE:

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
- Plain text, no markdown (no *bold*, _italic_, \`code\`, links, or headings)
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

If channel_register_match < 3, needs_rewrite MUST be true.`;

const TELEGRAM_FOLLOWUPER_WRITER_RULES = `TELEGRAM — FOLLOW-UP MESSAGE — STRUCTURAL RULES

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
  (they sent *bold*, _italic_, or \`code\` in their reply). Default: stay plain.
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
  recent move or pivot to a different angle entirely.`;

const TELEGRAM_FOLLOWUPER_CRITIC_RULES = `TELEGRAM CHANNEL REGISTER CHECK — FOLLOWUPER MODE:

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

If channel_register_match < 3 OR context_grounding < 3, needs_rewrite MUST be true.`;

const TEAMS_PROSPECTOR_WRITER_RULES = `TEAMS — FIRST COLD MESSAGE — STRUCTURAL RULES

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
- Teams supports a SUBSET of markdown: **bold**, _italic_, \`inline code\`,
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
  in healthcare, etc.) is a critical failure.`;

const TEAMS_PROSPECTOR_CRITIC_RULES = `TEAMS CHANNEL REGISTER CHECK — PROSPECTOR MODE:

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

If channel_register_match < 3, needs_rewrite MUST be true.`;

const TEAMS_FOLLOWUPER_WRITER_RULES = `TEAMS — FOLLOW-UP MESSAGE — STRUCTURAL RULES

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
  competitor's recent move or pivot to a different angle entirely.`;

const TEAMS_FOLLOWUPER_CRITIC_RULES = `TEAMS CHANNEL REGISTER CHECK — FOLLOWUPER MODE:

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

If channel_register_match < 3 OR context_grounding < 3, needs_rewrite MUST be true.`;

const SLACK_PROSPECTOR_WRITER_RULES = `SLACK — FIRST COLD MESSAGE — STRUCTURAL RULES

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
    \`inline code\` for product names, metric names, or technical terms
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
  e-commerce, etc.) is a critical failure.`;

const SLACK_PROSPECTOR_CRITIC_RULES = `SLACK CHANNEL REGISTER CHECK — PROSPECTOR MODE:

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
  occasional \`inline code\` for product or metric names)
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
- More than two *bold* runs or more than two \`inline code\` spans
- Links / URLs in the message
- Emojis present
- Subject line attempted in the body
- Em dashes present
- Spelled-out percentage
- "X, not Y" construction present

If channel_register_match < 3, needs_rewrite MUST be true.`;

const SLACK_FOLLOWUPER_WRITER_RULES = `SLACK — FOLLOW-UP MESSAGE — STRUCTURAL RULES

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
  (more *bold*, more \`code\` spans).
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
  competitor's recent move or pivot to a different angle entirely.`;

const SLACK_FOLLOWUPER_CRITIC_RULES = `SLACK CHANNEL REGISTER CHECK — FOLLOWUPER MODE:

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
- Markdown matches Slack-native norms (light *bold* and \`code\` allowed;
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

If channel_register_match < 3 OR context_grounding < 3, needs_rewrite MUST be true.`;

// ─────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────

/**
 * Build the writer rule block for the given channel + mode combination.
 * Returns empty string for channel/mode pairs not yet implemented.
 */
export function buildWriterRegisterBlock(
  channel: ChannelCode,
  mode: GenerationMode,
): string {
  if (channel === "whatsapp" && mode === "prospector") return WHATSAPP_PROSPECTOR_WRITER_RULES;
  if (channel === "whatsapp" && mode === "followuper") return WHATSAPP_FOLLOWUPER_WRITER_RULES;
  if (channel === "telegram" && mode === "prospector") return TELEGRAM_PROSPECTOR_WRITER_RULES;
  if (channel === "telegram" && mode === "followuper") return TELEGRAM_FOLLOWUPER_WRITER_RULES;
  if (channel === "teams" && mode === "prospector") return TEAMS_PROSPECTOR_WRITER_RULES;
  if (channel === "teams" && mode === "followuper") return TEAMS_FOLLOWUPER_WRITER_RULES;
  if (channel === "slack" && mode === "prospector") return SLACK_PROSPECTOR_WRITER_RULES;
  if (channel === "slack" && mode === "followuper") return SLACK_FOLLOWUPER_WRITER_RULES;
  return "";
}

/**
 * Build the critic rule block for the given channel + mode combination.
 * Returns empty string for channel/mode pairs not yet implemented.
 */
export function buildCriticRegisterBlock(
  channel: ChannelCode,
  mode: GenerationMode,
): string {
  if (channel === "whatsapp" && mode === "prospector") return WHATSAPP_PROSPECTOR_CRITIC_RULES;
  if (channel === "whatsapp" && mode === "followuper") return WHATSAPP_FOLLOWUPER_CRITIC_RULES;
  if (channel === "telegram" && mode === "prospector") return TELEGRAM_PROSPECTOR_CRITIC_RULES;
  if (channel === "telegram" && mode === "followuper") return TELEGRAM_FOLLOWUPER_CRITIC_RULES;
  if (channel === "teams" && mode === "prospector") return TEAMS_PROSPECTOR_CRITIC_RULES;
  if (channel === "teams" && mode === "followuper") return TEAMS_FOLLOWUPER_CRITIC_RULES;
  if (channel === "slack" && mode === "prospector") return SLACK_PROSPECTOR_CRITIC_RULES;
  if (channel === "slack" && mode === "followuper") return SLACK_FOLLOWUPER_CRITIC_RULES;
  return "";
}
