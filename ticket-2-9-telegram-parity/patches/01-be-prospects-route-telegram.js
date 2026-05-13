#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────
// Patch 01: BE — allow Telegram in MANUAL_INGEST_CHANNELS and teach the
// POST /api/prospects/manual-ingest handler to accept either an E.164
// phone or a Telegram @handle for the Telegram path. WhatsApp path
// remains phone-only.
//
// Three insertions, all in artifacts/api-server/src/routes/prospects.ts:
//   A. Expand MANUAL_INGEST_CHANNELS from ["whatsapp"] to
//      ["whatsapp", "telegram"]. Cascades into manualIngestToggleBody-
//      Schema's z.enum(MANUAL_INGEST_CHANNELS) automatically.
//   B. Add a HANDLE_RE constant + extend the schema (drop the regex
//      from `phone` so it can carry either a phone or a handle; the
//      handler validates per-channel below).
//   C. Replace the handler's identifier-extraction + dedupe + insert
//      block with a channel-branching version that stores to either
//      `phone` (WhatsApp + phone-shape Telegram) or `telegram_handle`
//      (handle-shape Telegram), with a pre-check duplicate query on
//      the handle path (no unique index on telegram_handle yet).
//
// No schema changes. The `telegram_handle` column already exists on
// prospects (nullable). The `phone` unique index is unchanged.
//
// Idempotent — keyed on a unique marker inside the new code.
// ──────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");

const REPO_ROOT = process.cwd();
const FILE = path.join(
  REPO_ROOT,
  "artifacts/api-server/src/routes/prospects.ts",
);

const MARKER = "TELEGRAM_HANDLE_RE";

let src = fs.readFileSync(FILE, "utf8");

if (src.includes(MARKER)) {
  console.log("  01-be-prospects-route-telegram: already applied, skipping");
  process.exit(0);
}

// ── Step A: expand the channel allow-list ────────────────────────────────
{
  const before = 'const MANUAL_INGEST_CHANNELS = ["whatsapp"] as const;';
  const after = 'const MANUAL_INGEST_CHANNELS = ["whatsapp", "telegram"] as const;';
  if (!src.includes(before)) {
    console.error("  01-be-prospects-route-telegram: anchor A not found");
    console.error("    expected: " + JSON.stringify(before));
    process.exit(1);
  }
  src = src.replace(before, after);
}

// ── Step B: drop regex from the schema's `phone` field, add HANDLE_RE ───
// The current schema validates phone with PHONE_RE inside Zod. We move
// the per-channel format validation to the handler so Telegram can also
// accept @handles in the same field. The Zod schema continues to enforce
// presence, trimming, and a sensible upper bound on length.
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
// leading "@" which the handler strips before storage. Per Telegram's
// public username rules.
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

  if (!src.includes(before)) {
    console.error("  01-be-prospects-route-telegram: anchor B not found");
    console.error("    expected the original manualIngestBodySchema block");
    process.exit(1);
  }
  src = src.replace(before, after);
}

// ── Step C: replace the handler's body validation + insert section ──────
// The old code derives country from `body.phone` and inserts with
// `phone: body.phone`. The new code branches by channel, decides which
// column to populate (phone vs telegram_handle), runs a pre-check
// dedupe on the handle path, and stores accordingly. The action_log
// metadata also widens to surface which column ended up populated.
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
    // Telegram + E.164 input: phone column (channel just affects deep-link shape downstream).
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
        handleToStore = identifier.startsWith("@")
          ? identifier.slice(1)
          : identifier;
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

    // Handle-path dedupe — explicit pre-check because there is no
    // unique index on prospects.telegram_handle yet. Race window is
    // small (single SDR adding the same handle twice in parallel) and
    // an index can land in a follow-on schema ticket if real volume
    // demands it.
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
      // Only reachable on the phone-path conflict (telegram_handle has
      // no unique index, and the handle-path dedupe above already
      // returned 409 if a match existed).
      res.status(409).json({
        error: "duplicate_phone",
        detail: "A prospect with this phone already exists for this user.",
      });
      return;
    }`;

  if (!src.includes(before)) {
    console.error("  01-be-prospects-route-telegram: anchor C not found");
    console.error(
      "    expected the original handler's country-derivation + insert block",
    );
    process.exit(1);
  }
  src = src.replace(before, after);
}

// ── Step D: widen the action_log metadata to include identifier-kind ────
// The existing metadata records channel + ticker + hasPrePlatformContext
// + country. We add `identifierKind` ("phone" | "telegram_handle") so an
// audit query can distinguish a handle-routed Telegram ingest from a
// phone-routed one without inferring from the prospect row.
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

  if (!src.includes(before)) {
    console.error("  01-be-prospects-route-telegram: anchor D not found");
    console.error("    expected the original action_log metadata block");
    process.exit(1);
  }
  src = src.replace(before, after);
}

fs.writeFileSync(FILE, src);
console.log("  01-be-prospects-route-telegram: applied");
