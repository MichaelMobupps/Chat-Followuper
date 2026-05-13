#!/usr/bin/env node
// BE: allow Telegram manual ingest. Rescue-safe against clean post-2.7
// and partial prior 2.9 applications.
const fs = require("fs");
const path = require("path");

const FILE = path.join(process.cwd(), "artifacts/api-server/src/routes/prospects.ts");
let src = fs.readFileSync(FILE, "utf8");
let changed = false;

function replaceOnce(label, before, after) {
  if (!src.includes(before)) {
    console.error(`  01-be-prospects-route-telegram: anchor ${label} not found`);
    process.exit(1);
  }
  src = src.replace(before, after);
  changed = true;
}

// A. Expand the channel allow-list.
{
  const before = 'const MANUAL_INGEST_CHANNELS = ["whatsapp"] as const;';
  const after = 'const MANUAL_INGEST_CHANNELS = ["whatsapp", "telegram"] as const;';
  if (src.includes(before)) {
    src = src.replace(before, after);
    changed = true;
  } else if (/const MANUAL_INGEST_CHANNELS\s*=\s*\[[^\]]*"whatsapp"[^\]]*"telegram"[^\]]*\]\s*as const;/.test(src)) {
    // already expanded
  } else {
    console.error("  01-be-prospects-route-telegram: channel allow-list is neither original nor expanded");
    process.exit(1);
  }
}

// B. Add TELEGRAM_HANDLE_RE and relax the schema phone field from E.164-only
// to bounded identifier string. Handler validation below remains strict.
{
  const before = `const manualIngestBodySchema = z
  .object({
    channel: z.enum(MANUAL_INGEST_CHANNELS),
    firstName: z.string().trim().min(1).max(100),
    phone: z
      .string()
      .trim()
      .regex(PHONE_RE, "Phone must be E.164 format, e.g. '+919900000111'"),
    company: z.string().trim().min(1).max(200),
    ticker: z.enum(TICKERS),
    prePlatformContext: z.string().trim().max(5000).nullable().optional(),
  })
  .strict();`;

  const after = `// Telegram handle: 5-32 chars, alphanumeric + underscore, optional
// leading "@" which the handler strips before storage. Usernames are
// normalized to lowercase for duplicate detection.
const TELEGRAM_HANDLE_RE = /^@?[a-zA-Z0-9_]{5,32}$/;

const manualIngestBodySchema = z
  .object({
    channel: z.enum(MANUAL_INGEST_CHANNELS),
    firstName: z.string().trim().min(1).max(100),
    // The "phone" field carries the identifier. For WhatsApp it must be
    // E.164. For Telegram it can be either E.164 or a @handle. Format
    // validation happens per-channel in the handler so we can route to
    // the right storage column and return channel-appropriate errors.
    phone: z.string().trim().min(1).max(64),
    company: z.string().trim().min(1).max(200),
    ticker: z.enum(TICKERS),
    prePlatformContext: z.string().trim().max(5000).nullable().optional(),
  })
  .strict();`;

  if (src.includes(before)) {
    src = src.replace(before, after);
    changed = true;
  } else if (src.includes("const TELEGRAM_HANDLE_RE") && src.includes("phone: z.string().trim().min(1).max(64)")) {
    // already patched
  } else {
    console.error("  01-be-prospects-route-telegram: body schema is neither original nor patched");
    process.exit(1);
  }
}

// C. Replace original country/insert block with branch-aware identifier handling.
{
  const before = `    // Country derivation is best-effort. detectCountry may return null
    // for prefixes outside the known allow-list; in that case country
    // is left null and the language defaults apply downstream. We do
    // NOT reject on unknown country here — the existing wa.me send
    // path surfaces geo issues at click time via geoGate, matching the
    // Apollo flow's behavior.
    const country = detectCountry(body.phone);

    const inserted = await db
      .insert(prospectsTable)
      .values({
        userId: user.id,
        phone: body.phone,
        sourceMode: "manual",
        prospectName: body.firstName,
        company: body.company,
        vertical: tickerToCoarseVertical(body.ticker),
        country: country ?? null,
        prePlatformContext: body.prePlatformContext ?? null,
      })
      .onConflictDoNothing({
        target: [prospectsTable.userId, prospectsTable.phone],
      })
      .returning();

    if (inserted.length === 0) {
      res.status(409).json({
        error: "duplicate_phone",
        detail: "A prospect with this phone already exists for this user.",
      });
      return;
    }`;

  const after = `    // Per-channel identifier validation. The Zod schema confirmed the
    // raw string is present and bounded; we now check format and decide
    // which storage column it belongs in.
    //
    // WhatsApp: phone column only (E.164 required).
    // Telegram + E.164 input: phone column.
    // Telegram + @handle input: telegram_handle column.
    let phoneToStore: string | null = null;
    let handleToStore: string | null = null;
    let country: string | null = null;
    const identifier = body.phone;

    if (body.channel === "whatsapp") {
      if (!PHONE_RE.test(identifier)) {
        res.status(400).json({
          error: "invalid_body",
          detail: "Phone must be E.164 format, e.g. '+919900000111'.",
          path: ["phone"],
        });
        return;
      }
      phoneToStore = identifier;
      country = detectCountry(identifier) ?? null;
    } else {
      // channel === "telegram"
      if (PHONE_RE.test(identifier)) {
        phoneToStore = identifier;
        country = detectCountry(identifier) ?? null;
      } else if (TELEGRAM_HANDLE_RE.test(identifier)) {
        const withoutAt = identifier.startsWith("@")
          ? identifier.slice(1)
          : identifier;
        handleToStore = withoutAt.toLowerCase();
      } else {
        res.status(400).json({
          error: "invalid_body",
          detail:
            "For Telegram, use an international phone (e.g. '+972547734033') or a handle (e.g. '@yaronk', 5-32 chars).",
          path: ["phone"],
        });
        return;
      }
    }

    // Handle-path dedupe. Explicit pre-check because there is no unique
    // index on prospects.telegram_handle yet. The handle is normalized
    // to lowercase above so casing variants map to one row.
    if (handleToStore !== null) {
      const existingByHandle = await db
        .select({ id: prospectsTable.id })
        .from(prospectsTable)
        .where(
          and(
            eq(prospectsTable.userId, user.id),
            eq(prospectsTable.telegramHandle, handleToStore),
          ),
        )
        .limit(1);
      if (existingByHandle.length > 0) {
        res.status(409).json({
          error: "duplicate_telegram_handle",
          detail:
            "A prospect with this Telegram handle already exists for this user.",
        });
        return;
      }
    }

    const inserted = await db
      .insert(prospectsTable)
      .values({
        userId: user.id,
        phone: phoneToStore,
        telegramHandle: handleToStore,
        sourceMode: "manual",
        prospectName: body.firstName,
        company: body.company,
        vertical: tickerToCoarseVertical(body.ticker),
        country,
        prePlatformContext: body.prePlatformContext ?? null,
      })
      .onConflictDoNothing({
        target: [prospectsTable.userId, prospectsTable.phone],
      })
      .returning();

    if (inserted.length === 0) {
      res.status(409).json({
        error: "duplicate_phone",
        detail: "A prospect with this phone already exists for this user.",
      });
      return;
    }`;

  if (src.includes(before)) {
    src = src.replace(before, after);
    changed = true;
  } else if (src.includes("let phoneToStore: string | null = null;") && src.includes("handleToStore")) {
    // already patched or partially patched enough for this block
  } else {
    console.error("  01-be-prospects-route-telegram: handler insert block is neither original nor patched");
    process.exit(1);
  }
}

// D. Add identifierKind to manual-ingest action-log metadata.
{
  const before = `        metadata: {
          channel: body.channel,
          ticker: body.ticker,
          hasPrePlatformContext: !!body.prePlatformContext,
          country: country ?? null,
        },`;
  const after = `        metadata: {
          channel: body.channel,
          ticker: body.ticker,
          identifierKind: handleToStore !== null ? "telegram_handle" : "phone",
          hasPrePlatformContext: !!body.prePlatformContext,
          country: country ?? null,
        },`;
  if (src.includes("identifierKind:")) {
    // already patched
  } else if (src.includes(before)) {
    src = src.replace(before, after);
    changed = true;
  } else {
    console.error("  01-be-prospects-route-telegram: action-log metadata anchor not found");
    process.exit(1);
  }
}

fs.writeFileSync(FILE, src);
console.log(`  01-be-prospects-route-telegram: ${changed ? "applied" : "already ok"}`);
