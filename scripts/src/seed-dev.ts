import {
  db,
  pool,
  usersTable,
  prospectsTable,
  followupsTable,
  dailyUsageTable,
} from "@workspace/db";

const SEED_USER_EMAIL = "seed-dev@chat-followuper.local";
const SEED_USER_NAME = "Seed Dev";
const SEED_PROSPECT_PHONE = "+15555550100";
const SEED_FOLLOWUP_STAGE = 1;
const SEED_DATE = "2026-04-30";

async function main() {
  console.log("[seed-dev] starting");

  const [user] = await db
    .insert(usersTable)
    .values({
      email: SEED_USER_EMAIL,
      name: SEED_USER_NAME,
      isConnected: true,
    })
    .onConflictDoUpdate({
      target: usersTable.email,
      set: { name: SEED_USER_NAME, isConnected: true },
    })
    .returning();
  console.log(`[seed-dev] user: ${user.id} (${user.email})`);

  const [prospect] = await db
    .insert(prospectsTable)
    .values({
      userId: user.id,
      prospectName: "Ada Lovelace",
      company: "Analytical Engines Ltd",
      title: "Chief Mathematician",
      vertical: "saas",
      country: "GB",
      language: "en",
      phone: SEED_PROSPECT_PHONE,
      sourceMode: "manual_entry",
      contextNotes: "Met at conference. Interested in compute orchestration.",
      firstMessageChannel: "whatsapp",
    })
    .onConflictDoUpdate({
      target: [prospectsTable.userId, prospectsTable.phone],
      set: { prospectName: "Ada Lovelace" },
    })
    .returning();
  console.log(
    `[seed-dev] prospect: ${prospect.id} (${prospect.prospectName})`,
  );

  const [followup] = await db
    .insert(followupsTable)
    .values({
      prospectId: prospect.id,
      stage: SEED_FOLLOWUP_STAGE,
      channel: "whatsapp",
      status: "queued",
      scheduledAt: new Date(`${SEED_DATE}T09:00:00Z`),
    })
    .onConflictDoUpdate({
      target: [followupsTable.prospectId, followupsTable.stage],
      set: { status: "queued" },
    })
    .returning();
  console.log(
    `[seed-dev] followup: ${followup.id} (stage ${followup.stage}, status ${followup.status})`,
  );

  const usageRows = await db
    .insert(dailyUsageTable)
    .values({
      userId: user.id,
      date: SEED_DATE,
      messagesGenerated: 0,
      messagesSent: 0,
      apolloRevealsUsed: 0,
    })
    .onConflictDoNothing({
      target: [dailyUsageTable.userId, dailyUsageTable.date],
    })
    .returning();
  if (usageRows.length > 0) {
    console.log(
      `[seed-dev] daily_usage: inserted for ${user.id} on ${SEED_DATE}`,
    );
  } else {
    console.log(
      `[seed-dev] daily_usage: already exists for ${user.id} on ${SEED_DATE} (skipped)`,
    );
  }

  console.log("[seed-dev] done");
  await pool.end();
}

main().catch(async (err) => {
  console.error("[seed-dev] failed:", err);
  await pool.end();
  process.exit(1);
});
