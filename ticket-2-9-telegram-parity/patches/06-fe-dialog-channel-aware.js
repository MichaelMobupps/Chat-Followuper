#!/usr/bin/env node
// FE: make AddManualContactDialog channel-aware. Rescue-safe stepwise patch.
const fs = require("fs");
const path = require("path");

const FILE = path.join(process.cwd(), "artifacts/dashboard/src/components/followup/AddManualContactDialog.tsx");
let src = fs.readFileSync(FILE, "utf8");
let changed = false;

function fail(label) {
  console.error(`  06-fe-dialog-channel-aware: anchor ${label} not found`);
  process.exit(1);
}

// A. Constants.
if (!src.includes("const HANDLE_RE")) {
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
  if (!src.includes(before)) fail("A");
  src = src.replace(before, after);
  changed = true;
} else if (!src.includes("const CHANNEL_NAME")) {
  const afterHandle = `const HANDLE_RE = /^@?[a-zA-Z0-9_]{5,32}$/;`;
  const insertion = `${afterHandle}

const CHANNEL_NAME: Record<ManualIngestChannel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
};`;
  if (!src.includes(afterHandle)) fail("A2");
  src = src.replace(afterHandle, insertion);
  changed = true;
}

// B. Validation.
if (!src.includes('channel === "whatsapp"\n      ? PHONE_RE.test(phoneTrimmed)')) {
  const before = `  const phoneTrimmed = form.phone.trim();
  const phoneLooksValid = PHONE_RE.test(phoneTrimmed);`;
  const after = `  const phoneTrimmed = form.phone.trim();
  const phoneLooksValid =
    channel === "whatsapp"
      ? PHONE_RE.test(phoneTrimmed)
      : PHONE_RE.test(phoneTrimmed) || HANDLE_RE.test(phoneTrimmed);`;
  if (!src.includes(before)) fail("B");
  src = src.replace(before, after);
  changed = true;
}

// C. Description.
if (!src.includes("{CHANNEL_NAME[channel]}")) {
  const before = `          <DialogDescription>
            Send follow-ups to someone already in your WhatsApp. We figure
            out the right pitch from the company and product type.
          </DialogDescription>`;
  const after = `          <DialogDescription>
            Send follow-ups to someone already in your {CHANNEL_NAME[channel]}.
            We figure out the right pitch from the company and product type.
          </DialogDescription>`;
  if (!src.includes(before)) fail("C");
  src = src.replace(before, after);
  changed = true;
}

// D. Identifier field.
if (!src.includes("Phone or Telegram handle")) {
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
                  : "Use international phone (+972...) or Telegram handle (@yaronk, 5-32 chars). Phone links depend on Telegram privacy settings; @handle is more reliable."}
              </p>
            )}
          </div>`;
  if (!src.includes(before)) fail("D");
  src = src.replace(before, after);
  changed = true;
}

// E. Error handler.
if (!src.includes("duplicate_telegram_handle")) {
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
  if (!src.includes(before)) fail("E");
  src = src.replace(before, after);
  changed = true;
}

fs.writeFileSync(FILE, src);
console.log(`  06-fe-dialog-channel-aware: ${changed ? "applied" : "already ok"}`);
