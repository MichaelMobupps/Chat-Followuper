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
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useAddManualContact,
  usePrepareFirstMessage,
} from "@/hooks/use-manual-ingest";
import {
  TICKERS,
  TICKER_LABELS,
  type ManualIngestChannel,
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

interface Props {
  channel: ManualIngestChannel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When true (Contacts page), kick off research + message generation after ingest. */
  prepareAfterAdd?: boolean;
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
  prepareAfterAdd = false,
}: Props) {
  const { toast } = useToast();
  const add = useAddManualContact();
  const prepare = usePrepareFirstMessage();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [contextOpen, setContextOpen] = useState(false);

  // Client-side hint validation. The submit button is enabled when all
  // four required fields are non-empty AND the phone matches E.164 shape.
  // The BE re-validates and is the source of truth for error reporting;
  // this just trims the obvious user mistakes before hitting the wire.
  const phoneTrimmed = form.phone.trim();
  const phoneLooksValid =
    channel === "whatsapp"
      ? PHONE_RE.test(phoneTrimmed)
      : channel === "linkedin"
        ? linkedinLooksValid(phoneTrimmed)
        : PHONE_RE.test(phoneTrimmed) || HANDLE_RE.test(phoneTrimmed);
  const canSubmit =
    form.firstName.trim().length > 0 &&
    phoneLooksValid &&
    form.company.trim().length > 0 &&
    form.ticker !== null &&
    !add.isPending;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setForm(EMPTY);
    setContextOpen(false);
  }

  function handleSubmit() {
    if (!canSubmit || form.ticker === null) return;
    add.mutate(
      {
        channel,
        firstName: form.firstName.trim(),
        phone: phoneTrimmed,
        company: form.company.trim(),
        ticker: form.ticker,
        prePlatformContext: form.prePlatformContext.trim() || undefined,
      },
      {
        onSuccess: (prospect) => {
          const name =
            prospect.prospectName ?? form.firstName.trim();
          const co = prospect.company ?? form.company.trim();
          toast({
            title: "Contact added",
            description: prepareAfterAdd
              ? `${name} from ${co} — writing your first message…`
              : `${name} from ${co}.`,
          });
          reset();
          onOpenChange(false);
          if (prepareAfterAdd) {
            prepare.mutate(
              { prospectId: prospect.id, input: { channel } },
              {
                onSuccess: () => {
                  toast({
                    title: "Message ready",
                    description: `${name} — click Generate & send when you're ready.`,
                  });
                },
                onError: (err) => {
                  toast({
                    title: "Contact added; message prep failed",
                    description:
                      err instanceof ApiError
                        ? err.code ?? err.message
                        : String(err),
                    variant: "destructive",
                  });
                },
              },
            );
          }
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
            We figure out the right pitch from the company and product type.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="manual-firstName">First name</Label>
            <Input
              id="manual-firstName"
              autoFocus
              value={form.firstName}
              onChange={(e) => update("firstName", e.target.value)}
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
            <Label htmlFor="manual-company">Company</Label>
            <Input
              id="manual-company"
              value={form.company}
              onChange={(e) => update("company", e.target.value)}
              placeholder="MobUpps"
              maxLength={200}
              data-testid="manual-company"
            />
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
                    onClick={() => update("ticker", t)}
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
                  onChange={(e) =>
                    update("prePlatformContext", e.target.value)
                  }
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
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={add.isPending}
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
