#!/usr/bin/env node
/**
 * Anchored, idempotent patch for artifacts/dashboard/src/App.tsx
 * - Adds CampaignsPage and CampaignDetailPage imports
 * - Mounts /campaigns and /campaigns/:id routes inside ProtectedRoutes
 *
 * Re-runs are safe: each insertion checks for already-applied state first.
 */
import fs from "node:fs";

const PATH = "artifacts/dashboard/src/App.tsx";

let src = fs.readFileSync(PATH, "utf8");
const before = src;
const log = (msg) => console.log(`[patch-app-tsx] ${msg}`);

// === 1. Add imports for CampaignsPage and CampaignDetailPage ===
const importAnchor = 'import SeederPage from "@/pages/seeder";';
const importInsert =
  'import SeederPage from "@/pages/seeder";\n' +
  'import CampaignsPage from "@/pages/campaigns";\n' +
  'import CampaignDetailPage from "@/pages/campaign-detail";';

if (src.includes('import CampaignsPage from "@/pages/campaigns"')) {
  log("[SKIP] imports already present");
} else if (!src.includes(importAnchor)) {
  console.error(
    `[patch-app-tsx] [FAIL] could not locate import anchor: ${importAnchor}`,
  );
  process.exit(2);
} else {
  src = src.replace(importAnchor, importInsert);
  log("[APPLY] added CampaignsPage + CampaignDetailPage imports");
}

// === 2. Mount /campaigns and /campaigns/:id routes ===
const routeAnchor = '<Route path="/seeder" component={SeederPage} />';
const routeInsert =
  '<Route path="/seeder" component={SeederPage} />\n' +
  '          <Route path="/campaigns" component={CampaignsPage} />\n' +
  '          <Route path="/campaigns/:id" component={CampaignDetailPage} />';

if (src.includes('<Route path="/campaigns" component={CampaignsPage}')) {
  log("[SKIP] routes already mounted");
} else if (!src.includes(routeAnchor)) {
  console.error(
    `[patch-app-tsx] [FAIL] could not locate route anchor: ${routeAnchor}`,
  );
  process.exit(2);
} else {
  src = src.replace(routeAnchor, routeInsert);
  log("[APPLY] mounted /campaigns and /campaigns/:id");
}

// === Write back if changed ===
if (src === before) {
  log("[NOOP] no changes");
} else {
  fs.writeFileSync(PATH, src);
  log("[DONE] App.tsx updated");
}

// === Evidence ===
const finalSrc = fs.readFileSync(PATH, "utf8");
const evidence = {
  CampaignsPage_import: (
    finalSrc.match(/import CampaignsPage from/g) || []
  ).length,
  CampaignDetailPage_import: (
    finalSrc.match(/import CampaignDetailPage from/g) || []
  ).length,
  campaigns_route: (
    finalSrc.match(/path="\/campaigns" component=\{CampaignsPage\}/g) || []
  ).length,
  campaigns_id_route: (
    finalSrc.match(/path="\/campaigns\/:id" component=\{CampaignDetailPage\}/g) ||
    []
  ).length,
};
console.log("[patch-app-tsx] evidence:", JSON.stringify(evidence));

const expected = {
  CampaignsPage_import: 1,
  CampaignDetailPage_import: 1,
  campaigns_route: 1,
  campaigns_id_route: 1,
};
for (const [k, v] of Object.entries(expected)) {
  if (evidence[k] !== v) {
    console.error(
      `[patch-app-tsx] [FAIL] evidence mismatch for ${k}: got ${evidence[k]}, expected ${v}`,
    );
    process.exit(3);
  }
}
console.log("[patch-app-tsx] all evidence checks passed");
