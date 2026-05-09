import fs from "node:fs";

const p = "artifacts/dashboard/src/components/layout.tsx";
let src = fs.readFileSync(p, "utf8");
const before = src;

// 1. Add MessageCircle and Send to the lucide-react import block.
//    Anchor: the closing line of the lucide-react import.
//    Tolerant of any number of icons in any order before the close brace.
//    Earlier version anchored on `Megaphone,\n}` which broke when Settings
//    landed between Megaphone and the close brace.
const iconAnchor = '} from "lucide-react";';
const newIconsInsertion =
  '  MessageCircle,\n  Send,\n} from "lucide-react";';

// Idempotency: check for the exact post-insertion sequence.
const idempotencyMarker = newIconsInsertion;

// Sanity precondition.
if (!src.includes('from "lucide-react"')) {
  console.error('[FAIL] file does not import from lucide-react');
  process.exit(2);
}

if (src.includes(idempotencyMarker)) {
  console.log("[SKIP] MessageCircle and Send icons already imported");
} else if (!src.includes(iconAnchor)) {
  console.error('[FAIL] could not find `} from "lucide-react";` anchor');
  console.error("       Import block may have unusual formatting.");
  process.exit(2);
} else {
  // String.replace replaces only the first occurrence — safe.
  src = src.replace(iconAnchor, newIconsInsertion);
  console.log("[APPLY] added MessageCircle + Send imports");
}

// 2. Add 4 new nav items after the Campaigns line (added in FE-A).
//    Old "Prospects" and "Followups" items intentionally NOT removed —
//    they retire in tickets 2.3 and 2.5 once the new pages go live.
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
