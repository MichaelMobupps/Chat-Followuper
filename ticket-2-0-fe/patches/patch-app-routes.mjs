import fs from "node:fs";

const p = "artifacts/dashboard/src/App.tsx";
let src = fs.readFileSync(p, "utf8");
const before = src;

// 1. Imports — anchor on existing CampaignDetailPage import (added in FE-A)
const importAnchor = 'import CampaignDetailPage from "@/pages/campaign-detail";';
const newImports =
  importAnchor +
  '\nimport ProspectWhatsAppPage from "@/pages/prospect/whatsapp";' +
  '\nimport ProspectTelegramPage from "@/pages/prospect/telegram";' +
  '\nimport FollowupWhatsAppPage from "@/pages/followup/whatsapp";' +
  '\nimport FollowupTelegramPage from "@/pages/followup/telegram";';

if (src.includes("import ProspectWhatsAppPage from")) {
  console.log("[SKIP] ProspectWhatsAppPage import already present");
} else if (!src.includes(importAnchor)) {
  console.error("[FAIL] could not find CampaignDetailPage import anchor");
  console.error("       expected exact: '" + importAnchor + "'");
  console.error("       Apply 1.7-FE-A first if not done.");
  process.exit(2);
} else {
  src = src.replace(importAnchor, newImports);
  console.log("[APPLY] added 4 new page imports");
}

// 2. Routes — anchor on existing /campaigns/:id route (added in FE-A)
const routeAnchor = '<Route path="/campaigns/:id" component={CampaignDetailPage} />';
const newRoutes =
  routeAnchor +
  '\n          <Route path="/prospect/whatsapp" component={ProspectWhatsAppPage} />' +
  '\n          <Route path="/prospect/telegram" component={ProspectTelegramPage} />' +
  '\n          <Route path="/followup/whatsapp" component={FollowupWhatsAppPage} />' +
  '\n          <Route path="/followup/telegram" component={FollowupTelegramPage} />';

if (src.includes('component={ProspectWhatsAppPage}')) {
  console.log("[SKIP] new routes already present");
} else if (!src.includes(routeAnchor)) {
  console.error("[FAIL] could not find /campaigns/:id route anchor");
  console.error("       Apply 1.7-FE-A first if not done.");
  process.exit(2);
} else {
  src = src.replace(routeAnchor, newRoutes);
  console.log("[APPLY] added 4 new routes");
}

if (src === before) {
  console.log("[NOOP] no changes");
} else {
  fs.writeFileSync(p, src);
  console.log("[DONE] App.tsx patched");
}
