#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────
// Patch 05: FE — make AddManualContactDialog channel-aware for Telegram.
//
// Five edits to artifacts/dashboard/src/components/followup/
// AddManualContactDialog.tsx, all keyed on small anchored slices so each
// can land independently and the script reports which step failed if
// the file has drifted.
//
//   A. Add HANDLE_RE and CHANNEL_NAME constants next to the existing
//      PHONE_RE constant.
//   B. Widen the phoneLooksValid calculation: WhatsApp still requires
//      E.164, Telegram accepts either E.164 or a @handle.
//   C. Channel-aware DialogDescription ("WhatsApp" → "{CHANNEL_NAME[channel]}").
//   D. Channel-aware identifier field (Label, placeholder, hint).
//   E. Error handler also surfaces 409 duplicate_telegram_handle.
//
// The form-state field keeps its existing name `phone` — internally
// it's the identifier for either channel. The BE accepts either an
// E.164 phone or a @handle in the `phone` request field when channel
// is "telegram" and stores it in the right column accordingly.
//
// Idempotent — keyed on the HANDLE_RE constant introduced in Step A.
// ──────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");

const REPO_ROOT = process.cwd();
const FILE = path.join(
  REPO_ROOT,
  "artifacts/dashboard/src/components/followup/AddManualContactDialog.tsx",
);

const MARKER = "const HANDLE_RE";

let src = fs.readFileSync(FILE, "utf8");

if (src.includes(MARKER)) {
  console.log("  05-fe-dialog-channel-aware: already applied, skipping");
  process.exit(0);
}

// ── Step A: add HANDLE_RE and CHANNEL_NAME next to PHONE_RE ─────────────
{
  const before = `// BE validates with this same regex (PHONE_RE in routes/prospects.ts).
// Mirrored here for client-side hint-only validation; the BE is authoritative.
const PHONE_RE = /^\\+[1-9]\\d{6,14}$/;`;

  const after = `// BE validates with this same regex (PHONE_RE in routes/prospects.ts).
// Mirrored here for client-side hint-only validation; the BE is authoritative.
const PHONE_RE = /^\\+[1-9]\\d{6,14}$/;

// Telegram-only: a handle is 5-32 alphanumeric+underscore chars with an
// optional leading "@". Matches TELEGRAM_HANDLE_RE in routes/prospects.ts.
const HANDLE_RE = /^@?[a-zA-Z0-9_]{5,32}$/;

const CHANNEL_NAME: Record<ManualIngestChannel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
};`;

  if (!src.includes(before)) {
    console.error("  05-fe-dialog-channel-aware: anchor A not found");
    console.error("    expected the PHONE_RE declaration block");
    process.exit(1);
  }
  src = src.replace(before, after);
}

// ── Step B: widen phoneLooksValid for Telegram ──────────────────────────
{
  const before = `  const phoneTrimmed = form.phone.trim();
  const phoneLooksValid = PHONE_RE.test(phoneTrimmed);`;

  const after = `  const phoneTrimmed = form.phone.trim();
  const phoneLooksValid =
    channel === "whatsapp"
      ? PHONE_RE.test(phoneTrimmed)
      : PHONE_RE.test(phoneTrimmed) || HANDLE_RE.test(phoneTrimmed);`;

  if (!src.includes(before)) {
    console.error("  05-fe-dialog-channel-aware: anchor B not found");
    console.error("    expected the phoneLooksValid declaration");
    process.exit(1);
  }
  src = src.replace(before, after);
}

// ── Step C: channel-aware DialogDescription ─────────────────────────────
{
  const before = `          <DialogDescription>
            Send follow-ups to someone already in your WhatsApp. We figure
            out the right pitch from the company and product type.
          </DialogDescription>`;

  const after = `          <DialogDescription>
            Send follow-ups to someone already in your {CHANNEL_NAME[channel]}.
            We figure out the right pitch from the company and product type.
          </DialogDescription>`;

  if (!src.includes(before)) {
    console.error("  05-fe-dialog-channel-aware: anchor C not found");
    console.error("    expected the WhatsApp-specific DialogDescription");
    process.exit(1);
  }
  src = src.replace(before, after);
}

// ── Step D: channel-aware identifier field (label + placeholder + hint) ─
{
  const before = `          <div className="space-y-1.5">
            <Label htmlFor="manual-phone">Phone (with country code)</Label>
            <Input
              id="manual-phone"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="+972501234567"
              data-testid="manual-phone"
            />
            {form.phone.length > 0 && !phoneLooksValid && (
              <p className="text-xs text-muted-foreground">
                Start with + and country code. Example: +972501234567.
              </p>
            )}
          </div>`;

  const after = `          <div className="space-y-1.5">
            <Label htmlFor="manual-phone">
              {channel === "whatsapp"
                ? "Phone (with country code)"
                : "Phone or Telegram handle"}
            </Label>
            <Input
              id="manual-phone"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder={
                channel === "whatsapp"
                  ? "+972501234567"
                  : "+972501234567 or @yaronk"
              }
              data-testid="manual-phone"
            />
            {form.phone.length > 0 && !phoneLooksValid && (
              <p className="text-xs text-muted-foreground">
                {channel === "whatsapp"
                  ? "Start with + and country code. Example: +972501234567."
                  : "Use international phone (+972...) or Telegram handle (@yaronk, 5-32 chars)."}
              </p>
            )}
          </div>`;

  if (!src.includes(before)) {
    console.error("  05-fe-dialog-channel-aware: anchor D not found");
    console.error("    expected the phone field block");
    process.exit(1);
  }
  src = src.replace(before, after);
}

// ── Step E: error handler covers duplicate_telegram_handle ──────────────
{
  const before = `          const apiCode = err instanceof ApiError ? err.code : undefined;
          const description =
            apiCode === "duplicate_phone"
              ? "A prospect with this phone already exists in your list."
              : err instanceof ApiError
                ? \`\${err.status} \${apiCode ?? err.message}\`
                : (err as Error).message;`;

  const after = `          const apiCode = err instanceof ApiError ? err.code : undefined;
          const description =
            apiCode === "duplicate_phone"
              ? "A prospect with this phone already exists in your list."
              : apiCode === "duplicate_telegram_handle"
                ? "A prospect with this Telegram handle already exists in your list."
                : err instanceof ApiError
                  ? \`\${err.status} \${apiCode ?? err.message}\`
                  : (err as Error).message;`;

  if (!src.includes(before)) {
    console.error("  05-fe-dialog-channel-aware: anchor E not found");
    console.error("    expected the existing onError description ladder");
    process.exit(1);
  }
  src = src.replace(before, after);
}

fs.writeFileSync(FILE, src);
console.log("  05-fe-dialog-channel-aware: applied");
