/**
 * previewFirstMessage — write a first message BEFORE the contact exists.
 *
 * Backs "Generate message" in the Add-a-contact dialog. Same doctrine pipeline
 * as manualContactPrepare.prepareFirstMessage (classify → research → generate),
 * with one structural difference: there is no prospect row, so nothing is read
 * from or written to `prospects`. The output is parked in the draft store and
 * claimed by the subsequent manual-ingest create via its draftId.
 *
 * Deliberately NOT folded into prepareFirstMessage: that function is defined by
 * the row it loads (channel resolution, the cached-body short-circuit, the
 * already-sent guard, deep-link building, the terminal txn that writes the body
 * next to the spend). None of it applies here, and threading a "no row" mode
 * through it would put a second, sparsely-tested branch inside the path every
 * existing caller uses. This duplicates ~40 lines of orchestration to keep that
 * path untouched.
 *
 * Spend: research + generation, billed like any other run — recorded here, and
 * the caller pre-checks the daily cap. No deep link is built (there is no
 * identifier column to build one from yet); the create flow does that later.
 */
import { sql } from "drizzle-orm";
import { db, dailyUsageTable, usersTable, ACTION_TYPES, actionLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getLanguageForCountry } from "../lib/geoGate";
import { isValidSubVertical, getDoctrineDomain } from "../lib/doctrine/taxonomy";
import { classifySeed } from "./seedClassifier";
import { recordDailyLlmSpend } from "../lib/llmSpendCap";
import { usageBucketDate } from "../lib/usageBucket";
import { researchProspect, type ProspectBrief } from "./prospectResearch";
import { LoggingProgressEmitter } from "./progressEvents";
import { generateChatMessage, type ProspectInput } from "./messageGenerator";
import type { ChannelCode } from "../lib/channelRegister";
import { logger } from "../lib/logger";
import { appendMessageTemplate } from "../lib/messageTemplate";
import { setDraftProgress } from "./prepareProgress";
import { setDraft } from "./firstMessageDrafts";

export interface PreviewFirstMessageResult {
  message: string;
  classified: {
    vertical: string;
    subVertical: string;
    country: string;
    language: string;
    product: string;
  };
  researchCostUsd: number;
  generationCostUsd: number;
}

function defaultSubVertical(vertical: string): string {
  if (vertical === "web_cps") return "cps_web_classifieds_general";
  return "utility_general_mobile";
}

function defaultProduct(vertical: string): string {
  if (vertical === "web_cps") return "CPS / performance marketing";
  return "mobile user acquisition";
}

export async function previewFirstMessage(params: {
  userId: string;
  draftId: string;
  senderName: string;
  firstName: string;
  company: string;
  /** Coarse vertical from the dialog's Web/Mobile toggle. */
  vertical: string;
  channel: ChannelCode;
  prePlatformContext?: string | null;
}): Promise<PreviewFirstMessageResult> {
  const { userId, draftId, senderName, channel } = params;
  const start = Date.now();
  const company = params.company.trim();

  const userRows = await db
    .select({
      messageTemplate: usersTable.messageTemplate,
      digestTimezone: usersTable.digestTimezone,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const userMessageTemplate = userRows[0]?.messageTemplate;
  const userTimezone = userRows[0]?.digestTimezone;

  let vertical = params.vertical === "web_cps" ? "web_cps" : "mobile";
  let subVertical = "";
  let country = "";
  let language = "";
  let product = "";

  // Ask-less classification, same contract as the prepare path: derive what the
  // writer needs from the company/URL seed. Never throws — a failed classify
  // degrades to the coarse defaults below rather than failing the preview.
  setDraftProgress(userId, draftId, "researching");
  try {
    const seedUrl = (params.prePlatformContext ?? "").match(/https?:\/\/\S+/)?.[0];
    const classified = await classifySeed({
      seed: seedUrl || company,
      company,
      vertical: vertical === "web_cps" ? "web_cps" : "mobile",
    });
    subVertical = classified.subVertical;
    vertical = classified.vertical || vertical;
    country = classified.country || country;
    language = classified.language || language;
    product = classified.product || product;
    if (classified.costUsd > 0) {
      // Book immediately so it isn't lost if research/generation throws — the
      // prepare path books classify the same way, outside its terminal txn.
      await recordDailyLlmSpend(userId, classified.costUsd).catch((e) =>
        logger.warn(
          { err: String(e) },
          "preview first message: classify spend record failed",
        ),
      );
    }
  } catch (err) {
    logger.warn(
      { err: String(err) },
      "preview first message: seed classification failed; using defaults",
    );
  }

  if (!isValidSubVertical(subVertical)) subVertical = defaultSubVertical(vertical);
  // Keep the coarse vertical consistent with the (now-final) sub-vertical.
  // Unlike the prepare path, `vertical` here is never empty — it's seeded from
  // the dialog's Web/Mobile toggle and only ever reassigned to a classifier
  // value — so this normalizes a DISAGREEMENT (classifier says web, toggle said
  // mobile) rather than filling a blank.
  vertical = getDoctrineDomain(subVertical) === "webCps" ? "web_cps" : "mobile";
  if (!language) language = country ? getLanguageForCountry(country) : "en";
  if (!product) product = defaultProduct(vertical);

  const researchResult = await researchProspect(
    {
      brand: company,
      country,
      language,
      subVertical,
      product,
      sdrContextNotes: params.prePlatformContext ?? undefined,
    },
    new LoggingProgressEmitter(),
  );
  const brief: ProspectBrief = researchResult.brief;
  const researchCostUsd = researchResult.cost.usd;

  // AUDIT [High] — book research spend NOW, not in the terminal insert below.
  // The prepare path gets away with booking late because it persists the brief
  // first, so a later failure at least leaves something bought. Here there is no
  // row to persist to: if generation throws, an unbooked research call would be
  // spend the daily cap never sees — and since the cap is a read-then-check, a
  // caller could repeat failing generations indefinitely and never trip it.
  if (researchCostUsd > 0) {
    await recordDailyLlmSpend(userId, researchCostUsd).catch((e) =>
      logger.warn(
        { err: String(e) },
        "preview first message: research spend record failed",
      ),
    );
  }

  const prospectInput: ProspectInput = {
    prospectName: params.firstName.trim(),
    company,
    vertical,
    subVertical,
    product,
    country,
    language,
    contextNotes: params.prePlatformContext ?? undefined,
  };

  setDraftProgress(userId, draftId, "writing");
  const generated = await generateChatMessage({
    prospect: prospectInput,
    channel,
    stage: 0,
    senderName,
    researchBrief: brief,
  });

  setDraftProgress(userId, draftId, "finalizing");
  const generationCostUsd = generated.costEstimate.usd;
  const message = appendMessageTemplate(generated.message, userMessageTemplate);
  const today = usageBucketDate(userTimezone);

  // No prospect row to write, so this is spend-only. Research + classify are
  // already booked above (each right after it happened), so this books ONLY the
  // generation — double-counting research here would inflate the cap and the
  // weekly digest.
  await db
    .insert(dailyUsageTable)
    .values({
      userId,
      date: today,
      messagesGenerated: 1,
      anthropicSpendUsd: generationCostUsd.toFixed(4),
    })
    .onConflictDoUpdate({
      target: [dailyUsageTable.userId, dailyUsageTable.date],
      set: {
        messagesGenerated: sql`${dailyUsageTable.messagesGenerated} + 1`,
        anthropicSpendUsd: sql`${dailyUsageTable.anthropicSpendUsd} + CAST(${generationCostUsd.toFixed(4)} AS numeric)`,
      },
    });

  // Park the result for the create call. The brief never goes to the client.
  setDraft(userId, draftId, {
    message,
    brief,
    classified: { vertical, subVertical, country, language, product },
    company,
  });

  try {
    await db.insert(actionLogsTable).values({
      userId,
      actionType: ACTION_TYPES.seederMessageGenerated,
      actionStatus: "success",
      durationMs: Date.now() - start,
      metadata: {
        channel,
        costUsd: generationCostUsd,
        researchCostUsd,
        via: "preview_first_message",
        iterations: generated.modelMetadata.iterations,
        finalOverallScore: generated.modelMetadata.finalOverallScore,
      },
    });
  } catch (err) {
    logger.warn({ err }, "preview first message: audit log failed");
  }

  setDraftProgress(userId, draftId, "ready");

  return {
    message,
    classified: { vertical, subVertical, country, language, product },
    researchCostUsd,
    generationCostUsd,
  };
}
