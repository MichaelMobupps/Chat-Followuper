#!/usr/bin/env node
/**
 * Ticket Beacon-1-foundation — patch 2/2: src/index.css
 *
 * Four atomic edits:
 *   2a. :root font block — swap Inter for Manrope (body) and Menlo
 *       for JetBrains Mono. Add --app-font-display for Bricolage
 *       Grotesque. Then add Beacon raw tokens (ignite palette,
 *       glow primitives, accent companions, motion).
 *   2b. .dark block — replace shadcn HSL values with Beacon-mapped
 *       equivalents. All existing components inherit Beacon palette
 *       automatically through the shadcn variable system.
 *   2c. body @apply — preserve shadcn base, add Beacon body gradient
 *       (subtle TG-blue + ignite-mint radials). Add .font-display
 *       utility for headings.
 *   2d. @theme inline — extend with Beacon Tailwind utilities so
 *       bg-ignite, text-ignite-bright, shadow-glow-medium, ease-bcn
 *       work as Tailwind classes.
 *
 * Component files are NOT touched. Components inherit colors via
 * shadcn vars; new Beacon-specific styling reaches for var(--bcn-*)
 * tokens or the new Tailwind utilities.
 *
 * Idempotent. All anchors em-dash-free.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(process.cwd(), "artifacts/dashboard/src/index.css");

// ═════════════════════════════════════════════════════════════════
// Edit 2a — :root font block + Beacon tokens
// ═════════════════════════════════════════════════════════════════

const E2A_OLD = `  --app-font-sans: 'Inter', system-ui, sans-serif;
  --app-font-serif: Georgia, serif;
  --app-font-mono: Menlo, monospace;`;

const E2A_NEW = `  /* Beacon-1: type stack */
  --app-font-sans: 'Manrope', system-ui, sans-serif;
  --app-font-display: 'Bricolage Grotesque', system-ui, sans-serif;
  --app-font-serif: Georgia, serif;
  --app-font-mono: 'JetBrains Mono', Menlo, monospace;

  /* Beacon-1: Ignite palette (companion to shadcn primary, accessible via var) */
  --bcn-ignite:        #00F5D4;
  --bcn-ignite-bright: #4FFFE3;
  --bcn-ignite-deep:   #00C9AE;
  --bcn-ignite-dim:    rgba(0, 245, 212, 0.12);
  --bcn-ignite-aura:   rgba(0, 245, 212, 0.35);

  /* Beacon-1: Companion accents (status, variety) */
  --bcn-tg-blue:       #2AABEE;
  --bcn-wa-green:      #25D366;
  --bcn-warn:          #F5B547;
  --bcn-danger-vivid:  #F43F5E;

  /* Beacon-1: Glow primitives — the core of the system */
  --bcn-glow-soft:   0 0 0 1px rgba(0,245,212,.18), 0 0 20px rgba(0,245,212,.18);
  --bcn-glow-medium: 0 0 0 1px rgba(0,245,212,.35), 0 0 28px rgba(0,245,212,.32), 0 0 60px rgba(0,245,212,.10);
  --bcn-glow-hard:   0 0 0 1.5px rgba(0,245,212,.55), 0 0 36px rgba(0,245,212,.48), 0 0 80px rgba(0,245,212,.16);

  /* Beacon-1: Motion */
  --bcn-ease:      cubic-bezier(.2, .8, .2, 1);
  --bcn-ease-snap: cubic-bezier(.5, 1.6, .4, 1);
  --bcn-dur-fast:  120ms;
  --bcn-dur-base:  200ms;
  --bcn-dur-slow:  360ms;`;

const E2A_MARKER = `--app-font-display: 'Bricolage Grotesque'`;

// ═════════════════════════════════════════════════════════════════
// Edit 2b — .dark block remap to Beacon HSL
// ═════════════════════════════════════════════════════════════════

const E2B_OLD = `.dark {
  --button-outline: rgba(255, 255, 255, 0.1);
  --badge-outline: rgba(255, 255, 255, 0.05);
  --opaque-button-border-intensity: 9;
  --elevate-1: rgba(255, 255, 255, 0.04);
  --elevate-2: rgba(255, 255, 255, 0.09);

  --background: 222 47% 8%;
  --foreground: 210 40% 98%;
  --border: 217 33% 18%;
  --card: 222 47% 11%;
  --card-foreground: 210 40% 98%;
  --card-border: 217 33% 18%;
  --sidebar: 222 47% 9%;
  --sidebar-foreground: 210 40% 98%;
  --sidebar-border: 217 33% 18%;
  --sidebar-primary: 210 40% 98%;
  --sidebar-primary-foreground: 222 47% 11%;
  --sidebar-accent: 217 33% 18%;
  --sidebar-accent-foreground: 210 40% 98%;
  --sidebar-ring: 210 40% 98%;
  --popover: 222 47% 11%;
  --popover-foreground: 210 40% 98%;
  --popover-border: 217 33% 18%;
  --primary: 210 40% 98%;
  --primary-foreground: 222 47% 11%;
  --secondary: 217 33% 18%;
  --secondary-foreground: 210 40% 98%;
  --muted: 217 33% 18%;
  --muted-foreground: 215 20% 65%;
  --accent: 217 33% 18%;
  --accent-foreground: 210 40% 98%;
  --destructive: 0 63% 41%;
  --destructive-foreground: 210 40% 98%;
  --input: 217 33% 18%;
  --ring: 210 40% 98%;
  --chart-1: 220 70% 50%;
  --chart-2: 160 60% 45%;
  --chart-3: 30 80% 55%;
  --chart-4: 280 65% 60%;
  --chart-5: 340 75% 55%;
}`;

const E2B_NEW = `.dark {
  /* Beacon-1: remapped from generic dark slate to Beacon's Ignite palette.
     Existing shadcn-styled components inherit Beacon colors via these vars
     without per-component changes. */

  --button-outline: rgba(0, 245, 212, 0.10);
  --badge-outline: rgba(0, 245, 212, 0.05);
  --opaque-button-border-intensity: 9;
  --elevate-1: rgba(0, 245, 212, 0.04);
  --elevate-2: rgba(0, 245, 212, 0.09);

  /* Surfaces (bg-canvas, bg-surface, bg-elevated, bg-hover) */
  --background: 217 37% 7%;
  --foreground: 213 53% 97%;
  --border: 218 32% 15%;
  --card: 217 41% 10%;
  --card-foreground: 213 53% 97%;
  --card-border: 218 32% 15%;
  --sidebar: 217 41% 10%;
  --sidebar-foreground: 213 53% 97%;
  --sidebar-border: 218 32% 15%;

  /* Sidebar primary = ignite — selected nav items locked-bright */
  --sidebar-primary: 172 100% 48%;
  --sidebar-primary-foreground: 164 68% 7%;
  --sidebar-accent: 218 37% 16%;
  --sidebar-accent-foreground: 170 100% 65%;
  --sidebar-ring: 172 100% 48%;

  /* Popovers + dropdowns sit on bg-elevated */
  --popover: 218 39% 14%;
  --popover-foreground: 213 53% 97%;
  --popover-border: 218 32% 15%;

  /* Primary = ignite. Buttons + ring + emphasis use this. */
  --primary: 172 100% 48%;
  --primary-foreground: 164 68% 7%;

  --secondary: 218 39% 14%;
  --secondary-foreground: 213 53% 97%;
  --muted: 218 39% 14%;
  --muted-foreground: 217 18% 56%;
  --accent: 218 37% 16%;
  --accent-foreground: 170 100% 65%;
  --destructive: 350 89% 60%;
  --destructive-foreground: 213 53% 97%;
  --input: 218 32% 15%;
  --ring: 172 100% 48%;

  /* Chart palette tinted toward Beacon: ignite, tg-blue, wa-green, warn, danger */
  --chart-1: 172 100% 48%;
  --chart-2: 201 85% 55%;
  --chart-3: 142 70% 49%;
  --chart-4: 38 90% 62%;
  --chart-5: 350 89% 60%;
}`;

const E2B_MARKER = `Beacon-1: remapped from generic dark slate`;

// ═════════════════════════════════════════════════════════════════
// Edit 2c — body @apply + .font-display helper
// ═════════════════════════════════════════════════════════════════

const E2C_OLD = `  body {
    @apply font-sans antialiased bg-background text-foreground;
  }
}`;

const E2C_NEW = `  body {
    @apply font-sans antialiased bg-background text-foreground;
    /* Beacon-1: subtle radial atmosphere — TG blue + ignite mint */
    background-image:
      radial-gradient(1200px 600px at 80% -10%, rgba(42,171,238,.06), transparent 60%),
      radial-gradient(900px 500px at -10% 110%, rgba(0,245,212,.06), transparent 60%);
    background-attachment: fixed;
    min-height: 100vh;
  }

  /* Beacon-1: display-font helper. Use .font-display on a heading
     to switch from Manrope to Bricolage Grotesque. */
  .font-display {
    font-family: var(--app-font-display);
    letter-spacing: -0.015em;
  }
}`;

const E2C_MARKER = `Beacon-1: subtle radial atmosphere`;

// ═════════════════════════════════════════════════════════════════
// Edit 2d — @theme inline extensions (Tailwind utilities)
// ═════════════════════════════════════════════════════════════════

const E2D_OLD = `  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}`;

const E2D_NEW = `  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);

  /* Beacon-1: Tailwind utilities for Ignite + accents.
     Enables: bg-ignite, text-ignite-bright, border-tg-blue,
     shadow-glow-medium, ease-bcn, etc. */
  --color-ignite:        var(--bcn-ignite);
  --color-ignite-bright: var(--bcn-ignite-bright);
  --color-ignite-deep:   var(--bcn-ignite-deep);
  --color-tg-blue:       var(--bcn-tg-blue);
  --color-wa-green:      var(--bcn-wa-green);
  --color-bcn-warn:      var(--bcn-warn);
  --color-bcn-danger:    var(--bcn-danger-vivid);

  --shadow-glow-soft:    var(--bcn-glow-soft);
  --shadow-glow-medium:  var(--bcn-glow-medium);
  --shadow-glow-hard:    var(--bcn-glow-hard);

  --ease-bcn:      var(--bcn-ease);
  --ease-bcn-snap: var(--bcn-ease-snap);
}`;

const E2D_MARKER = `Beacon-1: Tailwind utilities for Ignite + accents.`;

// ═════════════════════════════════════════════════════════════════
// applyEdit
// ═════════════════════════════════════════════════════════════════

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) { count++; idx += needle.length; }
  return count;
}

function applyEdit(label, source, oldStr, newStr, marker) {
  const m = countOccurrences(source, marker);
  const o = countOccurrences(source, oldStr);
  if (m > 0) { console.log(`[${label}] SKIP — already applied`); return { source, ok: true }; }
  if (o === 0) { console.log(`[${label}] NOOP — anchor not found`); return { source, ok: false }; }
  if (o > 1) { console.log(`[${label}] FAIL — anchor matched ${o} times`); return { source, ok: false }; }
  console.log(`[${label}] APPLY`);
  return { source: source.replace(oldStr, newStr), ok: true };
}

let source;
try { source = readFileSync(FILE, "utf8"); }
catch (err) { console.error(`[FATAL] cannot read ${FILE}: ${err.message}`); process.exit(2); }

for (const [label, oldStr, newStr, marker] of [
  ["root-fonts-tokens",  E2A_OLD, E2A_NEW, E2A_MARKER],
  ["dark-block-beacon",  E2B_OLD, E2B_NEW, E2B_MARKER],
  ["body-gradient",      E2C_OLD, E2C_NEW, E2C_MARKER],
  ["theme-utilities",    E2D_OLD, E2D_NEW, E2D_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  manropeBody: source.includes(`'Manrope'`),
  bricolageDisplay: source.includes(`'Bricolage Grotesque'`),
  jetbrainsMono: source.includes(`'JetBrains Mono'`),
  interGone: !source.includes(`'Inter'`),
  igniteToken: source.includes("--bcn-ignite:        #00F5D4"),
  glowMedium: source.includes("--bcn-glow-medium:"),
  darkBlockRemapped: source.includes("--background: 217 37% 7%"),
  primaryIgnite: source.includes("--primary: 172 100% 48%"),
  oldDarkGone: !source.includes("--background: 222 47% 8%"),
  bodyGradient: source.includes("Beacon-1: subtle radial atmosphere"),
  fontDisplayHelper: source.includes(".font-display {"),
  themeIgnite: source.includes("--color-ignite:"),
  themeGlow: source.includes("--shadow-glow-medium:"),
};
console.log("[index-css] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[index-css] FAIL"); process.exit(4);
}
console.log("[index-css] DONE");
