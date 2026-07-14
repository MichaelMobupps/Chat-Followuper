/**
 * Smoke: Contacts "Generate" flow end-to-end (runtime, real LLM + DB).
 *
 * Seeds a manual contact with ONLY a company name (no sub-vertical/country/
 * language/product), then runs prepareFirstMessage and asserts the full chain:
 *   auto-classify (seed → taxonomy) → research (web_search) → generate (doctrine
 *   + hook) → persist. Also verifies the deferred fixes: the classified coarse
 *   vertical is persisted + consistent, and the research brief carries the new
 *   hook/ad-intel fields. Cleans up in a finally. Requires a live DB + LLM keys.
 *
 *   FOLLOWUP_DIGEST_SCHEDULER=false node ../../lib/db/node_modules/tsx/dist/cli.mjs \
 *     src/scripts/smokeContactGenerate.ts
 */
import { eq } from "drizzle-orm";
import { db, usersTable, prospectsTable, followupsTable } from "@workspace/db";
import { prepareFirstMessage } from "../services/manualContactPrepare";
import { isValidSubVertical } from "../lib/doctrine/taxonomy";

let userId = "";
let prospectId = "";

async function cleanup(): Promise<void> {
  if (prospectId)
    await db.delete(followupsTable).where(eq(followupsTable.prospectId, prospectId)).catch(() => {});
  if (prospectId)
    await db.delete(prospectsTable).where(eq(prospectsTable.id, prospectId)).catch(() => {});
  if (userId) await db.delete(usersTable).where(eq(usersTable.id, userId)).catch(() => {});
}

async function main(): Promise<number> {
  const [u] = await db
    .insert(usersTable)
    .values({ email: `smoke-gen-${Date.now()}@example.test`, name: "Alex Rep" })
    .returning({ id: usersTable.id });
  userId = u!.id;

  const [p] = await db
    .insert(prospectsTable)
    .values({
      userId,
      sourceMode: "manual",
      prospectName: "Dana",
      company: "Nubank", // only the company — everything else must be derived
      phone: "+972500000009",
      followupPaused: false,
      replied: 0,
    })
    .returning({ id: prospectsTable.id });
  prospectId = p!.id;

  console.log("[gen] running prepareFirstMessage (classify → research → generate)…");
  const t = Date.now();
  const res = await prepareFirstMessage({ prospectId, userId, senderName: "Alex" });
  console.log(`[gen] done in ${((Date.now() - t) / 1000).toFixed(0)}s, status=${res.status}`);

  let pass = 0;
  let fail = 0;
  const check = (n: string, ok: boolean, d = ""): void => {
    console.log(`[gen] ${ok ? "PASS" : "FAIL"} — ${n}${d ? ` :: ${d}` : ""}`);
    if (ok) pass++;
    else fail++;
  };

  check("message generated", !!res.message && res.message.trim().length > 20, `${res.message?.length ?? 0} chars`);
  check("deep link built (wa.me)", /wa\.me/.test(res.deepLinkUrl ?? ""), (res.deepLinkUrl ?? "").slice(0, 45));

  const [row] = await db.select().from(prospectsTable).where(eq(prospectsTable.id, prospectId)).limit(1);
  check("subVertical auto-classified + persisted (valid taxonomy code)", isValidSubVertical(row!.subVertical ?? ""), String(row!.subVertical));
  check("country persisted", !!row!.country, String(row!.country));
  check("language persisted", !!row!.language, String(row!.language));
  check("product persisted", !!row!.product, String(row!.product));
  check("coarse vertical persisted (web_cps|mobile)", row!.vertical === "web_cps" || row!.vertical === "mobile", String(row!.vertical));
  const brief = row!.researchBrief as Record<string, unknown> | null;
  check("researchBrief persisted (JSONB)", !!brief && typeof brief === "object", "");
  check(
    "brief carries hook/ad-intel fields",
    !!brief && ("freshHook" in brief || "acquisitionModel" in brief || "runsYoutubeAds" in brief),
    Object.keys(brief ?? {}).filter((k) => /hook|acquisition|youtube|meta|ctv/i.test(k)).join(","),
  );
  check("firstMessageBody persisted", !!row!.firstMessageBody, "");

  console.log(`\n[gen] ${fail === 0 ? "ALL PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
  console.log(`--- classified: ${row!.vertical} / ${row!.subVertical} / ${row!.country} / ${row!.language} ---`);
  console.log(`--- generated message ---\n${res.message ?? ""}\n---`);
  return fail;
}

main()
  .then(async (f) => {
    await cleanup();
    process.exit(f ? 1 : 0);
  })
  .catch(async (e) => {
    console.error("[gen] crashed:", e);
    await cleanup();
    process.exit(1);
  });
