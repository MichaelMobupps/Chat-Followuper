#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────
// Patch 02: wire <ManualContactsSection /> into ChannelFollowupPage.
//
// Two insertions:
//   A. Add import for ManualContactsSection near the existing imports.
//   B. Render <ManualContactsSection channel={channel} /> between the
//      header and the Tabs component.
//
// Idempotent.
// ──────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");

const REPO_ROOT = process.cwd();
const FILE = path.join(
  REPO_ROOT,
  "artifacts/dashboard/src/components/followup/ChannelFollowupPage.tsx",
);

const MARKER = "ManualContactsSection";

let src = fs.readFileSync(FILE, "utf8");

if (src.includes(MARKER)) {
  console.log("  02-wire-channel-followup-page: already applied, skipping");
  process.exit(0);
}

// ── Step A: import.
{
  const anchorA = 'import { SequenceConfigPanel } from "./SequenceConfigPanel";';
  if (!src.includes(anchorA)) {
    console.error("  02-wire-channel-followup-page: anchor A not found");
    console.error("    expected: " + JSON.stringify(anchorA));
    process.exit(1);
  }
  src = src.replace(
    anchorA,
    anchorA +
      '\nimport { ManualContactsSection } from "./ManualContactsSection";',
  );
}

// ── Step B: render the section between the </header> and the <Tabs>.
//   The existing structure is:
//     </header>
//
//     <Tabs ...>
//   We insert our section right after </header> with a blank line buffer
//   so the structural separation reads naturally.
{
  const anchorB = "      </header>\n\n      <Tabs";
  if (!src.includes(anchorB)) {
    console.error("  02-wire-channel-followup-page: anchor B not found");
    console.error("    expected </header> followed by <Tabs (with one blank line between)");
    process.exit(1);
  }

  const insertion = `      </header>

      {channel === "whatsapp" && (
        <ManualContactsSection channel="whatsapp" />
      )}

      <Tabs`;

  src = src.replace(anchorB, insertion);
}

fs.writeFileSync(FILE, src);
console.log("  02-wire-channel-followup-page: applied");
