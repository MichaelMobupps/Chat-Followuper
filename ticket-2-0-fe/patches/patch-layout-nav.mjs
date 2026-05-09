import fs from "node:fs";

const p = "artifacts/dashboard/src/components/layout.tsx";
let src = fs.readFileSync(p, "utf8");
const before = src;

// 1. Add MessageCircle and Send to lucide-react imports
//    Anchor: the Megaphone import added in FE-A
const iconAnchor = '  Megaphone,\n} from "lucide-react";';
const newIcons =
  '  Megaphone,\n  MessageCircle,\n  Send,\n} from "lucide-react";';

if (src.includes("MessageCircle,") && src.includes("Send,")) {
  console.log("[SKIP] MessageCircle and Send icons already imported");
} else if (!src.includes(iconAnchor)) {
  console.error("[FAIL] could not find Megaphone import anchor");
  console.error("       expected exact: '  Megaphone,\\n} from \"lucide-react\";'");
  console.error("       Apply 1.7-FE-A first if not done.");
  process.exit(2);
} else {
  src = src.replace(iconAnchor, newIcons);
  console.log("[APPLY] added MessageCircle + Send imports");
}

// 2. Add 4 new nav items after the Campaigns line (added in FE-A)
//    Old "Prospects" and "Followups" items are intentionally NOT removed —
//    they'll be retired in tickets 2.3 and 2.5 once the new pages go live.
//    During the migration window the old links still work and don't conflict
//    with the new /prospect/* and /followup/* routes (different URLs).
const navAnchor =
  '{ label: "Campaigns", href: "/campaigns", icon: Megaphone },';
const newNav =
  navAnchor +
  '\n  { label: "Prospect: WhatsApp", href: "/prospect/whatsapp", icon: MessageCircle },' +
  '\n  { label: "Prospect: Telegram", href: "/prospect/telegram", icon: Send },' +
  '\n  { label: "Follow-up: WhatsApp", href: "/followup/whatsapp", icon: MessageCircle },' +
  '\n  { label: "Follow-up: Telegram", href: "/followup/telegram", icon: Send },';

if (src.includes('href: "/prospect/whatsapp"')) {
  console.log("[SKIP] new nav items already present");
} else if (!src.includes(navAnchor)) {
  console.error("[FAIL] could not find Campaigns nav anchor");
  console.error("       Apply 1.7-FE-A first if not done.");
  process.exit(2);
} else {
  src = src.replace(navAnchor, newNav);
  console.log("[APPLY] added 4 new nav items");
}

if (src === before) {
  console.log("[NOOP] no changes");
} else {
  fs.writeFileSync(p, src);
  console.log("[DONE] layout.tsx patched");
}
