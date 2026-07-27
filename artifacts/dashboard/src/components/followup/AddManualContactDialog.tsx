/**
 * Add Manual Contact dialog — Ticket 2.7-FE.
 *
 * Single-screen form with a disclosure ("Add context (optional)") that
 * reveals a textarea for the SDR to paste the last message they sent
 * the contact in their actual WhatsApp/Telegram. That paste seeds the
 * first Followuper-drafted message with conversation continuity.
 *
 * Four required fields:
 *   firstName  — used in the greeting
 *   phone      — E.164 (the regex matches the BE's validation)
 *   company    — drives the doctrine pack via classification downstream
 *   ticker     — web | mobile, picks the doctrine pack (web_cps vs mobile_*)
 *
 * One optional field, disclosed:
 *   prePlatformContext — last message paste (max 5000 chars per BE schema)
 *
 * On success: toast confirms with the prospect's name and company,
 * dialog closes, follow-up list invalidates so the new prospect surfaces
 * in the main table after the BE's research/generation pipeline runs.
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronUp, Copy, Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useAddManualContact,
  useClassifySeed,
  usePreviewFirstMessage,
  usePreviewProgress,
} from "@/hooks/use-manual-ingest";
import { useFreshProgress } from "@/hooks/use-live-progress";
import { PrepareProgressBar } from "@/components/followup/PrepareProgressBar";
import {
  TICKERS,
  TICKER_LABELS,
  verticalToTicker,
  type ClassifiedSeed,
  type ManualIngestChannel,
  type ManualIngestProspect,
  type Ticker,
} from "@/lib/api/manual-ingest";
import { ApiError } from "@/lib/api";
import { toastDuplicateContactError } from "@/lib/duplicateContactToast";
import { cn } from "@/lib/utils";

// BE validates with this same regex (PHONE_RE in routes/prospects.ts).
// Mirrored here for client-side hint-only validation; the BE is authoritative.
const PHONE_RE = /^\+[1-9]\d{6,14}$/;

// Telegram-only: a handle STARTS WITH A LETTER, then 4–31 alphanumeric+
// underscore chars (total 5–32), with an optional leading "@". Matches
// TELEGRAM_HANDLE_RE in routes/prospects.ts (C1: a leading digit / all-digit
// string is a phone, not a handle).
const HANDLE_RE = /^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/;

// LinkedIn-only: a full profile URL, an "/in/<slug>" path, or a bare slug/
// handle. Mirrors normalizeLinkedinIdentifier in routes/prospects.ts (the BE
// is authoritative and normalizes to a canonical profile URL before storing).
const LINKEDIN_URL_RE = /^(https?:\/\/)?([\w-]+\.)*linkedin\.com\//i;
const LINKEDIN_PATH_RE = /^\/?in\/[\w%-]+\/?$/i;
const LINKEDIN_SLUG_RE = /^@?[a-zA-Z0-9][\w-]{2,99}$/;
function linkedinLooksValid(id: string): boolean {
  return (
    LINKEDIN_URL_RE.test(id) ||
    LINKEDIN_PATH_RE.test(id) ||
    LINKEDIN_SLUG_RE.test(id)
  );
}

const CHANNEL_NAME: Record<ManualIngestChannel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  linkedin: "LinkedIn",
};

/**
 * Draft ids are opaque correlation keys, not secrets — they're scoped by userId
 * server-side, so guessing one buys nothing. randomUUID where available (it
 * needs a secure context), with a plain-random fallback so the button still
 * works on an http:// origin. Charset matches the BE's ^[A-Za-z0-9_-]+$.
 */
function newDraftId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `d${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** The preview route's error codes, in words an SDR can act on. */
function previewErrorCopy(err: unknown): string {
  const code = err instanceof ApiError ? (err.code ?? err.message) : String(err);
  switch (code) {
    case "rate_limited":
      return "Too many messages written in the last minute — wait a moment and try again.";
    // The server's actual code (llmSpendCap.ts throws DailyLlmCapExceededError →
    // app.ts maps it to 429 daily_cap_exceeded). An earlier guess at
    // "daily_cap_reached" matched nothing, so a capped SDR read the raw code.
    case "daily_cap_exceeded":
      return "Today's AI budget is used up. You can still add the contact and generate the message tomorrow.";
    default:
      return code;
  }
}

interface Props {
  channel: ManualIngestChannel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called after a successful ingest with the newly created prospect.
   *
   * Replaces the old `prepareAfterAdd` boolean, which fired the prepare
   * mutation from INSIDE this dialog — right as the dialog unmounted, so the
   * run had no visible progress and no preview: the SDR only saw two toasts
   * and then the message appeared, unreviewed, in the composer.
   *
   * Speed pass (2026-07-16): when the contact lands WITHOUT a message, the
   * BACKEND queues the generation itself before its 201 returns — the page
   * no longer fires a blocking prepare. The Contacts page uses this callback
   * to point its progress poller at the new row (staged bar on the row) and
   * to toast that the message is being written in the background. A caller
   * that omits this (only ManualContactsSection, itself dead code post-F-E)
   * simply doesn't track the run — the row still flips to ready on refresh.
   */
  onAdded?: (prospect: ManualIngestProspect) => void;
}

interface FormState {
  firstName: string;
  phone: string;
  company: string;
  ticker: Ticker | null;
  prePlatformContext: string;
}

const EMPTY: FormState = {
  firstName: "",
  phone: "",
  company: "",
  ticker: null,
  prePlatformContext: "",
};

export function AddManualContactDialog({
  channel,
  open,
  onOpenChange,
  onAdded,
}: Props) {
  const { toast } = useToast();
  const add = useAddManualContact();
  const classify = useClassifySeed();
  const preview = usePreviewFirstMessage();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [contextOpen, setContextOpen] = useState(false);
  const [detected, setDetected] = useState<ClassifiedSeed | null>(null);
  // A message written before the contact exists. `draftId` is what the create
  // call passes so the BE can pair the (editable) text with the research brief
  // it kept server-side. Null message = nothing generated yet.
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const previewProgress = useFreshProgress(
    usePreviewProgress(draftId, { running: preview.isPending }).data,
    preview.isPending,
    draftId,
  );

  // Client-side hint validation. The submit button is enabled when all
  // four required fields are non-empty AND the phone matches E.164 shape.
  // The BE re-validates and is the source of truth for error reporting;
  // this just trims the obvious user mistakes before hitting the wire.
  // Clipboard channels (LinkedIn, Telegram) can't prefill the composer, so the
  // SDR pastes the drafted message by hand — show a Copy button for them.
  // WhatsApp prefills on send, so it doesn't need one (matches the Copy gating
  // on the other surfaces: FirstMessagePreviewDialog + the follow-up queue).
  const isClipboardChannel = channel === "linkedin" || channel === "telegram";
  const phoneTrimmed = form.phone.trim();
  const phoneLooksValid =
    channel === "whatsapp"
      ? PHONE_RE.test(phoneTrimmed)
      : channel === "linkedin"
        ? linkedinLooksValid(phoneTrimmed)
        : PHONE_RE.test(phoneTrimmed) || HANDLE_RE.test(phoneTrimmed);
  // A raw URL in the Company field must be resolved via "Detect" first — the
  // BE stores company (max 200) and would otherwise persist the literal URL.
  const companyTrimmed = form.company.trim();
  const companyLooksLikeUrl =
    /^(https?:\/\/|www\.)/i.test(companyTrimmed) ||
    /\b(play\.google\.com|apps\.apple\.com|itunes\.apple\.com)\b/i.test(
      companyTrimmed,
    );
  // The company + product type must be settled before we spend money writing a
  // message about them, but the identifier (phone/handle/URL) is irrelevant to
  // the writer — so Generate is available before it's filled in.
  const canGenerate =
    form.firstName.trim().length > 0 &&
    companyTrimmed.length > 0 &&
    companyTrimmed.length <= 200 &&
    !companyLooksLikeUrl &&
    form.ticker !== null &&
    !preview.isPending &&
    !add.isPending;

  const canSubmit =
    form.firstName.trim().length > 0 &&
    phoneLooksValid &&
    companyTrimmed.length > 0 &&
    companyTrimmed.length <= 200 &&
    !companyLooksLikeUrl &&
    form.ticker !== null &&
    !add.isPending &&
    // Don't let a generate be orphaned by a submit landing mid-run: the draft
    // wouldn't exist yet, so the contact would save without its message.
    !preview.isPending;

  /**
   * Throw away a generated message once the form drifts from what it was
   * written about.
   *
   * AUDIT [High/Med] — the BE refuses to spend a draft on a different company
   * (its brief researched the old one), and it takes the draft's classification
   * over the SDR's ticker. Both are the right server-side calls, but they were
   * SILENT: the textarea kept showing the message above copy promising it would
   * be saved, then the contact saved without it and the page paid for a second
   * generation — with the SDR's edits gone. Better to visibly drop it here, so
   * "Generate message" reappears and the choice is theirs.
   *
   * Every input the run consumed invalidates it, NOT just the ones the server
   * guards. The server only compares company, so `firstName` and
   * `prePlatformContext` drift straight through — and firstName is the
   * *greeting*: generate for "Yaron", fix the name to "Dana", and the contact
   * saves as Dana carrying a message that opens "Hi Yaron". Silent, wrong, and
   * the most visible drift there is.
   */
  function invalidateDraft() {
    // Only a GENERATED draft goes stale when the form drifts — it was written
    // about the old values (and the BE checks it against them). A message the
    // SDR typed or pasted THEMSELVES (no draftId) is their own text; wiping it
    // on every keystroke in another field would destroy their work, so it
    // stays put.
    if (draftId === null) return;
    setDraftId(null);
    setDraftMessage(null);
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setForm(EMPTY);
    setContextOpen(false);
    setDetected(null);
    setDraftId(null);
    setDraftMessage(null);
  }

  /**
   * Write the message now, before the contact exists.
   *
   * Real spend on every click (there's no cached-message short-circuit to fall
   * into — a preview is always a fresh write), which is why it's an explicit
   * button rather than something that fires on open.
   */
  function handleGenerate() {
    if (!canGenerate || form.ticker === null) return;
    // A fresh id per run: it keys both the progress entry and the server-side
    // draft, so a re-generate can't be confused with the previous attempt.
    const id = newDraftId();
    setDraftId(id);
    setDraftMessage(null);
    preview.mutate(
      {
        draftId: id,
        channel,
        firstName: form.firstName.trim(),
        company: companyTrimmed,
        vertical: form.ticker === "web" ? "web_cps" : "mobile",
        prePlatformContext: form.prePlatformContext.trim() || undefined,
      },
      {
        onSuccess: (res) => {
          setDraftMessage(res.message);
        },
        onError: (err) => {
          setDraftId(null);
          toast({
            title: "Could not write the message",
            description: previewErrorCopy(err),
            variant: "destructive",
          });
        },
      },
    );
  }

  // Ask-less onboarding: paste a company name OR a store/website URL, and let
  // the backend classifier fill company + product type (and reveal the derived
  // sub-vertical / country / language). Everything stays editable afterwards.
  function handleDetect() {
    const seed = form.company.trim();
    if (!seed || classify.isPending) return;
    classify.mutate(
      { seed },
      {
        onSuccess: ({ classified }) => {
          if (!classified.company) {
            toast({
              title: "Couldn't resolve a company",
              description:
                "Type the company name manually, then add the contact.",
              variant: "destructive",
            });
            return;
          }
          setDetected(classified);
          const ticker = verticalToTicker(classified.vertical);
          setForm((prev) => ({
            ...prev,
            company: classified.company || prev.company,
            ticker,
          }));
          // Detect rewrites company + ticker, so any message generated against
          // the old values is now stale — same reason as the field handlers.
          invalidateDraft();
          toast({
            title: "Detected",
            description: `${classified.company} — ${TICKER_LABELS[ticker]} · ${classified.subVertical} · ${classified.country || "market TBD"}`,
          });
        },
        onError: (err) => {
          toast({
            title: "Could not auto-detect",
            description:
              err instanceof ApiError ? (err.code ?? err.message) : String(err),
            variant: "destructive",
          });
        },
      },
    );
  }

  /**
   * Copy the current message to the clipboard. LinkedIn/Telegram can't prefill
   * the composer, so the SDR pastes it in by hand — a visible Copy button beats
   * hunting for select-all. Works for a generated draft or a typed one; there's
   * no persistence here, so copying never creates or enrolls a contact.
   */
  async function handleCopyMessage() {
    const text = draftMessage?.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Message copied",
        description: `Paste it into ${CHANNEL_NAME[channel]}.`,
      });
    } catch {
      toast({
        title: "Couldn't copy",
        description: "Select the message text and copy it manually.",
        variant: "destructive",
      });
    }
  }

  function handleSubmit() {
    if (!canSubmit || form.ticker === null) return;
    const trimmedDraft = draftMessage?.trim();
    add.mutate(
      {
        channel,
        firstName: form.firstName.trim(),
        phone: phoneTrimmed,
        company: form.company.trim(),
        ticker: form.ticker,
        prePlatformContext: form.prePlatformContext.trim() || undefined,
        // Attach the message. WITH a draftId the BE pairs the (editable) text
        // with the research brief the preview run parked server-side. WITHOUT
        // one — the SDR wrote or pasted their own — the BE stores the text
        // as-is and researches the brief in the background after the insert.
        ...(trimmedDraft
          ? draftId
            ? { draftId, firstMessageBody: trimmedDraft }
            : { firstMessageBody: trimmedDraft }
          : {}),
      },
      {
        onSuccess: (prospect) => {
          const name =
            prospect.prospectName ?? form.firstName.trim();
          const co = prospect.company ?? form.company.trim();
          toast({
            title: "Contact added",
            description: `${name} from ${co}.`,
          });
          reset();
          onOpenChange(false);
          // The page takes it from here: it starts generation, shows the
          // staged bar, and opens the preview. Errors surface there.
          onAdded?.(prospect);
        },
        onError: (err) => {
          if (toastDuplicateContactError(err, toast)) return;
          const apiCode = err instanceof ApiError ? err.code : undefined;
          toast({
            title: "Could not add contact",
            description:
              err instanceof ApiError
                ? `${err.status} ${apiCode ?? err.message}`
                : (err as Error).message,
            variant: "destructive",
          });
        },
      },
    );
  }

  function handleOpenChange(next: boolean) {
    // AUDIT [High] — the Cancel button's `disabled` was decorative: Radix routes
    // Esc, outside-click and the corner X straight here. Closing mid-run called
    // reset(), nulling draftId while the mutation kept going — its onSuccess
    // then set draftMessage with NO draftId, so reopening showed the previous
    // company's paid message above copy promising it would be saved, while
    // handleSubmit (which needs BOTH) silently dropped it and the contacts page
    // paid for a second generation. Same guard the preview dialog already uses.
    //
    // `add` counts too, for the same reason Cancel disables on both: escaping
    // mid-create resets the form, and if that create then 409s on duplicate_phone
    // (exactly the case peekDraft keeps the draft alive for), the draftId is gone
    // client-side and the surviving server draft is unreachable — regenerate and
    // pay twice.
    if (!next && (preview.isPending || add.isPending)) return;
    if (!next) reset();
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a contact</DialogTitle>
          <DialogDescription>
            Send follow-ups to someone already in your {CHANNEL_NAME[channel]}.
            Paste a company name or a store / website URL and hit{" "}
            <strong>Detect</strong> — we figure out the product type,
            sub-vertical, market and language for you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="manual-firstName">First name</Label>
            <Input
              id="manual-firstName"
              autoFocus
              value={form.firstName}
              onChange={(e) => {
                update("firstName", e.target.value);
                // The generated message greets this name by hand.
                invalidateDraft();
              }}
              placeholder="Yaron"
              maxLength={100}
              data-testid="manual-first-name"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="manual-phone">
              {channel === "whatsapp"
                ? "Phone (with country code)"
                : channel === "linkedin"
                  ? "LinkedIn profile URL"
                  : "Phone or Telegram handle"}
            </Label>
            <Input
              id="manual-phone"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder={
                channel === "whatsapp"
                  ? "+972501234567"
                  : channel === "linkedin"
                    ? "https://www.linkedin.com/in/yaronk"
                    : "+972501234567 or @yaronk"
              }
              // 300 mirrors the BE identifier cap (manualIngestBodySchema.phone).
              // LinkedIn URLs can be long; without this a >300 paste showed valid
              // then bounced with a 400 on submit.
              maxLength={300}
              data-testid="manual-phone"
            />
            {form.phone.length > 0 && !phoneLooksValid && (
              <p className="text-xs text-muted-foreground">
                {channel === "whatsapp"
                  ? "Start with + and country code. Example: +972501234567."
                  : channel === "linkedin"
                    ? "Paste a LinkedIn profile URL (linkedin.com/in/…) or handle."
                    : "Use international phone (+972...) or Telegram handle (@yaronk, 5-32 chars)."}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="manual-company">Company or store / website URL</Label>
            <div className="flex gap-2">
              <Input
                id="manual-company"
                value={form.company}
                onChange={(e) => {
                  update("company", e.target.value);
                  if (detected) setDetected(null);
                  // The draft researched the OLD company — the BE would refuse
                  // to spend it, so don't keep showing it as if it'll be saved.
                  invalidateDraft();
                }}
                placeholder="MobUpps — or paste a Google Play / App Store / website URL"
                // Wide enough to hold a pasted URL; Detect resolves it to the
                // short company name the BE stores (company cap is 200).
                maxLength={2000}
                data-testid="manual-company"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleDetect}
                disabled={companyTrimmed.length === 0 || classify.isPending}
                data-testid="manual-detect"
                title="Let AI figure out the product type, sub-vertical, country and language"
              >
                {classify.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                <span className="ml-1.5">Detect</span>
              </Button>
            </div>
            {companyLooksLikeUrl && !classify.isPending && (
              <p className="text-xs text-muted-foreground">
                Looks like a URL — click <strong>Detect</strong> to resolve the
                company before adding.
              </p>
            )}
            {!companyLooksLikeUrl && companyTrimmed.length > 200 && (
              <p className="text-xs text-muted-foreground">
                Company name is too long ({companyTrimmed.length}/200). Shorten
                it, or paste a URL and click <strong>Detect</strong>.
              </p>
            )}
            {detected && (
              <p
                className="text-xs text-muted-foreground"
                data-testid="manual-detected"
              >
                Detected: {detected.subVertical} ·{" "}
                {detected.country || "market TBD"} · {detected.language}
                {detected.webSearchUsed ? " (web-verified)" : ""}. Adjust
                anything below if needed.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Product type</Label>
            <div
              className="grid grid-cols-2 gap-2"
              role="radiogroup"
              aria-label="Product type"
            >
              {TICKERS.map((t) => {
                const active = form.ticker === t;
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      update("ticker", t);
                      // A draft carries the classification from the run that
                      // wrote it, and the BE takes that over this toggle — so a
                      // post-Generate flip would be silently ignored. Drop it.
                      if (form.ticker !== t) invalidateDraft();
                    }}
                    data-testid={`manual-ticker-${t}`}
                    className={cn(
                      "flex h-10 items-center justify-center rounded-md border text-sm font-medium transition-all",
                      active
                        ? "border-[#00F5D4] bg-[rgba(0,245,212,0.08)] text-[#4FFFE3]"
                        : "border-input bg-background text-foreground hover:border-[rgba(0,245,212,0.35)]",
                    )}
                    style={
                      active
                        ? {
                            boxShadow:
                              "0 0 0 1px rgba(0,245,212,.35), 0 0 18px rgba(0,245,212,.25)",
                          }
                        : undefined
                    }
                  >
                    {TICKER_LABELS[t]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => setContextOpen((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              data-testid="manual-context-toggle"
            >
              {contextOpen ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              Add context (optional)
            </button>
            {contextOpen && (
              <div className="space-y-1.5 pt-1">
                <Textarea
                  value={form.prePlatformContext}
                  onChange={(e) => {
                    update("prePlatformContext", e.target.value);
                    // Context is fed to the writer (sdrContextNotes), so a
                    // message written before it was pasted simply ignored it.
                    invalidateDraft();
                  }}
                  placeholder="Paste your last message to them — Followuper picks up where the conversation left off."
                  maxLength={5000}
                  rows={4}
                  data-testid="manual-pre-platform-context"
                />
                <p className="text-xs text-muted-foreground">
                  {form.prePlatformContext.length}/5000
                </p>
              </div>
            )}
          </div>

          {/* First message — three ways in (Speed pass, 2026-07-16):
                1. paste/write your own into the always-visible box (fastest —
                   no LLM, no waiting; the BE researches the brief in the
                   background so follow-ups still work);
                2. Generate — write and review it HERE before the contact is
                   saved; the result is parked server-side under draftId and
                   "Add contact" claims it, so nothing is generated twice;
                3. leave it empty — the BE writes it in the background right
                   after the add, and the row flips to Ready on its own. */}
          <div className="space-y-1.5 border-t pt-4">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="manual-message">First message</Label>
              <div className="flex items-center gap-2">
                {isClipboardChannel && draftMessage?.trim() ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleCopyMessage()}
                    data-testid="manual-message-copy"
                    title="Copy the message to paste into the chat"
                  >
                    <Copy className="h-4 w-4" />
                    <span className="ml-1.5">Copy</span>
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  data-testid="manual-generate"
                  title="Research the company and write the first message now"
                >
                  {preview.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  <span className="ml-1.5">
                    {/* Keyed on draftId, not the text: only a GENERATED message
                        makes the next run a "Regenerate". */}
                    {draftId === null ? "Generate message" : "Regenerate"}
                  </span>
                </Button>
              </div>
            </div>

            {preview.isPending ? (
              <div className="py-2" data-testid="manual-generating">
                <PrepareProgressBar progress={previewProgress} />
              </div>
            ) : (
              <>
                <Textarea
                  id="manual-message"
                  value={draftMessage ?? ""}
                  onChange={(e) => setDraftMessage(e.target.value)}
                  placeholder="Already have the message? Paste it here and skip the AI entirely."
                  rows={5}
                  // Mirrors the BE cap (firstMessageBody max 20000).
                  maxLength={20000}
                  data-testid="manual-message"
                />
                {draftMessage?.trim() ? (
                  <p className="text-xs text-muted-foreground">
                    {draftMessage.length} characters · saved with the contact
                    when you click <strong>Add contact</strong>.
                  </p>
                ) : (
                  // Say what it costs and how long it takes. An SDR shouldn't
                  // discover that a button spends money by clicking it.
                  <p className="text-xs text-muted-foreground">
                    Optional — paste your own message above (instant, no AI
                    spend), or <strong>Generate message</strong> researches{" "}
                    {companyTrimmed || "the company"} and writes it here for
                    review — takes up to a minute and uses your AI budget.
                    Left empty, we write it in the background after you add
                    the contact.
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={add.isPending || preview.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            data-testid="manual-submit"
          >
            {add.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Add contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
