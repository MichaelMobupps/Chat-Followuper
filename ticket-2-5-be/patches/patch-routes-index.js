#!/usr/bin/env node
/**
 * Ticket 2.5-BE patch: register followups and sequenceConfig routers
 * in artifacts/api-server/src/routes/index.ts.
 *
 * Idempotent.
 */

const fs = require("node:fs");
const path = require("node:path");

const TARGET = path.join(
  process.cwd(),
  "artifacts",
  "api-server",
  "src",
  "routes",
  "index.ts",
);

function applyOnce(src, oldText, newText, label) {
  if (newText !== oldText && src.includes(newText)) {
    console.log(`[${label}] SKIP — already applied`);
    return src;
  }
  const count = src.split(oldText).length - 1;
  if (count === 0) {
    console.error(`[${label}] NOOP — anchor not found`);
    process.exit(2);
  }
  if (count > 1) {
    console.error(`[${label}] FAIL — anchor matched ${count} times`);
    process.exit(2);
  }
  return src.replace(oldText, newText);
}

function main() {
  if (!fs.existsSync(TARGET)) {
    console.error(`[FATAL] missing ${TARGET}`);
    process.exit(5);
  }
  let src = fs.readFileSync(TARGET, "utf8");

  // ── Edit 1: add the two imports right after generateMessageRouter ──
  src = applyOnce(
    src,
    'import generateMessageRouter from "./generateMessage";\n',
    'import generateMessageRouter from "./generateMessage";\nimport followupsRouter from "./followups";\nimport sequenceConfigRouter from "./sequenceConfig";\n',
    "add-imports",
  );

  // ── Edit 2: register the two routers right after generateMessageRouter use ──
  src = applyOnce(
    src,
    "router.use(generateMessageRouter);\n",
    "router.use(generateMessageRouter);\nrouter.use(followupsRouter);\nrouter.use(sequenceConfigRouter);\n",
    "register-routers",
  );

  fs.writeFileSync(TARGET, src);

  const evidence = {
    followupsImported: src.includes(
      'import followupsRouter from "./followups";',
    ),
    sequenceConfigImported: src.includes(
      'import sequenceConfigRouter from "./sequenceConfig";',
    ),
    followupsRegistered: src.includes("router.use(followupsRouter);"),
    sequenceConfigRegistered: src.includes(
      "router.use(sequenceConfigRouter);",
    ),
    existingRoutersIntact: [
      "healthRouter",
      "authRouter",
      "googleAuthRouter",
      "whatsappLinkRouter",
      "apolloRouter",
      "prospectorRouter",
      "prospectsRouter",
      "campaignsRouter",
      "generateMessageRouter",
    ].every((r) => src.includes(`router.use(${r});`)),
    apolloWebhookCommentIntact: src.includes(
      "NOTE: the apollo webhook router is NOT mounted here",
    ),
  };

  console.log("[routes-index] [evidence]", JSON.stringify(evidence));
  const failing = Object.entries(evidence)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (failing.length > 0) {
    console.error("[routes-index] FAIL —", failing);
    process.exit(4);
  }
  console.log("[routes-index] DONE");
}

main();
