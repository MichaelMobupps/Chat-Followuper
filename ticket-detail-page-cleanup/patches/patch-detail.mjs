#!/usr/bin/env node
/**
 * Ticket detail-page-cleanup — sales-facing detail view + downloadable
 * technical log. 6 atomic edits in prospect-detail.tsx.
 *
 *   1. Import Download icon
 *   2. Add isStubBrief + downloadTechnicalLog helpers
 *   3. Add Technical log button to action row
 *   4. Strip debug fields from Prospect data card
 *   5. Strip phoneNumber audit field from Phone reveal card
 *   6. Gate BriefView technical metadata behind isStubBrief
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "artifacts/dashboard/src/pages/prospect-detail.tsx",
);

// ─── Edit 1 — import Download ─────────────────────────────────────
const E1_OLD = `  ArrowLeft,
  Copy,
  CheckCircle2,`;

const E1_NEW = `  ArrowLeft,
  Copy,
  Download,
  CheckCircle2,`;

const E1_MARKER = `Download,`;

// ─── Edit 2 — add helpers after computeStatus ─────────────────────
const E2_OLD = `function computeStatus(p: Prospect): ProspectStatus {
  if (p.firstMessageSentAt) return "sent";
  if (p.phoneRevealStatus === "blocked") return "phone-blocked";
  if (p.phoneRevealStatus === "no_match") return "phone-no-match";
  if (!p.phone) return "phone-pending";
  if (p.firstMessageBody) return "ready";
  return "draft";
}`;

const E2_NEW = `function computeStatus(p: Prospect): ProspectStatus {
  if (p.firstMessageSentAt) return "sent";
  if (p.phoneRevealStatus === "blocked") return "phone-blocked";
  if (p.phoneRevealStatus === "no_match") return "phone-no-match";
  if (!p.phone) return "phone-pending";
  if (p.firstMessageBody) return "ready";
  return "draft";
}

/**
 * Stub-brief detector. Bulk-flow prospects ship with a synthesized
 * stub brief (generator_model="stub-2.3-fe", daily_volume=0) — these
 * fields are debug-only artifacts of the stub itself, not real
 * research output. Hide them from the sales-facing detail view.
 * Added in Ticket detail-page-cleanup.
 */
function isStubBrief(brief: ProspectBrief): boolean {
  return brief.generatorModel.startsWith("stub-");
}

/**
 * Download a JSON technical log of this prospect — full row plus
 * computed status and stub-brief flag. Replaces the per-field debug
 * display that used to clutter the sales-facing detail view.
 * Added in Ticket detail-page-cleanup.
 */
function downloadTechnicalLog(p: Prospect): void {
  const log = {
    exportedAt: new Date().toISOString(),
    prospect: p,
    computed: {
      status: computeStatus(p),
      isStubBrief: p.researchBrief ? isStubBrief(p.researchBrief) : null,
    },
  };
  const blob = new Blob([JSON.stringify(log, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = \`prospect-\${p.id}-\${Date.now()}.json\`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}`;

const E2_MARKER = `function isStubBrief(brief: ProspectBrief)`;

// ─── Edit 3 — Technical log button in action row ──────────────────
const E3_OLD = `        <Button
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={() => setConfirmDeleteOpen(true)}
          data-testid="button-delete"
        >
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          Delete
        </Button>
      </div>`;

const E3_NEW = `        <Button
          variant="outline"
          onClick={() => downloadTechnicalLog(p)}
          data-testid="button-download-log"
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Technical log
        </Button>
        <Button
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={() => setConfirmDeleteOpen(true)}
          data-testid="button-delete"
        >
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          Delete
        </Button>
      </div>`;

const E3_MARKER = `data-testid="button-download-log"`;

// ─── Edit 4 — Strip debug fields from Prospect data card ──────────
const E4_OLD = `          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Field label="Name" value={p.prospectName} />
            <Field label="Company" value={p.company} />
            <Field label="Title" value={p.title} />
            <Field label="Country" value={p.country} />
            <Field label="Language" value={p.language} />
            <Field label="Phone" value={p.phone} mono />
            <Field label="Channel" value={p.firstMessageChannel} />
            <Field label="Source" value={p.sourceMode} />
            <Field label="LinkedIn" value={p.linkedinUrl} truncate />
            <Field label="Apollo person ID" value={p.apolloPersonId} mono truncate />
            <Field label="Telegram" value={p.telegramHandle} mono />
            <Field label="Created" value={formatDate(p.createdAt)} />
            <Field label="Updated" value={formatDate(p.updatedAt)} />
            {p.firstMessageSentAt && (
              <Field label="Sent" value={formatDate(p.firstMessageSentAt)} />
            )}
          </div>`;

const E4_NEW = `          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {/* Sales-facing fields only. Source / Apollo person ID /
                Updated / sourceMode are debug — see Technical log. */}
            <Field label="Name" value={p.prospectName} />
            <Field label="Company" value={p.company} />
            <Field label="Title" value={p.title} />
            <Field label="Country" value={p.country} />
            <Field label="Language" value={p.language} />
            <Field label="Phone" value={p.phone} mono />
            <Field label="Channel" value={p.firstMessageChannel} />
            <Field label="LinkedIn" value={p.linkedinUrl} truncate />
            <Field label="Telegram" value={p.telegramHandle} mono />
            <Field label="Created" value={formatDate(p.createdAt)} />
            {p.firstMessageSentAt && (
              <Field label="Sent" value={formatDate(p.firstMessageSentAt)} />
            )}
          </div>`;

const E4_MARKER = `Sales-facing fields only. Source / Apollo person ID`;

// ─── Edit 5 — Strip phoneNumber audit from Phone reveal card ──────
const E5_OLD = `            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Field label="Reveal status" value={p.phoneRevealStatus} />
              <Field label="phoneNumber (audit)" value={p.phoneNumber} mono />
            </div>`;

const E5_NEW = `            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {/* phoneNumber audit field moved to Technical log download. */}
              <Field label="Reveal status" value={p.phoneRevealStatus} />
            </div>`;

const E5_MARKER = `phoneNumber audit field moved to Technical log download`;

// ─── Edit 6 — Gate BriefView technical metadata behind isStubBrief
const E6_OLD = `function BriefView({ brief }: { brief: ProspectBrief }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <Field label="Country" value={brief.determinedCountry} />
        <Field label="Scale tier" value={brief.determinedScaleTier} />
        <Field
          label="Daily volume"
          value={String(brief.calibratedDailyVolume)}
        />
        <Field label="Primary event" value={brief.primaryEvent} />
        <Field label="Generator model" value={brief.generatorModel} mono />
        <Field
          label="Generator cost"
          value={\`$\${brief.generatorCostUsd.toFixed(4)}\`}
          mono
        />
        <Field label="Generated at" value={formatDate(brief.generatedAt)} />
      </div>`;

const E6_NEW = `function BriefView({ brief }: { brief: ProspectBrief }) {
  const stub = isStubBrief(brief);
  return (
    <div className="space-y-3 text-sm">
      {stub ? (
        <p className="text-xs text-muted-foreground">
          Stub brief — bulk-flow prospects ship with a placeholder. Real
          research metadata (scale tier, daily volume, primary event)
          appears here for seeder-flow prospects that ran the full LLM
          research pipeline. Re-research per prospect is a future ticket.
          Generator model and cost are available in the Technical log
          download regardless.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs">
          <Field label="Country" value={brief.determinedCountry} />
          <Field label="Scale tier" value={brief.determinedScaleTier} />
          <Field
            label="Daily volume"
            value={String(brief.calibratedDailyVolume)}
          />
          <Field label="Primary event" value={brief.primaryEvent} />
          <Field label="Generated at" value={formatDate(brief.generatedAt)} />
        </div>
      )}`;

const E6_MARKER = `const stub = isStubBrief(brief);`;

// ─── applyEdit ────────────────────────────────────────────────────

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count += 1;
    idx += needle.length;
  }
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
  ["import-download", E1_OLD, E1_NEW, E1_MARKER],
  ["helpers", E2_OLD, E2_NEW, E2_MARKER],
  ["log-button", E3_OLD, E3_NEW, E3_MARKER],
  ["data-card-strip", E4_OLD, E4_NEW, E4_MARKER],
  ["reveal-strip", E5_OLD, E5_NEW, E5_MARKER],
  ["brief-gate", E6_OLD, E6_NEW, E6_MARKER],
]) {
  const r = applyEdit(label, source, oldStr, newStr, marker);
  if (!r.ok) process.exit(3);
  source = r.source;
}

writeFileSync(FILE, source, "utf8");

const evidence = {
  importPresent: countOccurrences(source, "Download,") === 1,
  helpersPresent:
    countOccurrences(source, "function isStubBrief(brief: ProspectBrief)") === 1 &&
    countOccurrences(source, "function downloadTechnicalLog(p: Prospect)") === 1,
  buttonPresent: countOccurrences(source, `data-testid="button-download-log"`) === 1,
  // Removed debug fields really gone.
  sourceFieldGone: countOccurrences(source, `<Field label="Source" value={p.sourceMode} />`) === 0,
  apolloIdFieldGone:
    countOccurrences(source, `<Field label="Apollo person ID" value={p.apolloPersonId} mono truncate />`) === 0,
  updatedFieldGone:
    countOccurrences(source, `<Field label="Updated" value={formatDate(p.updatedAt)} />`) === 0,
  phoneAuditFieldGone:
    countOccurrences(source, `<Field label="phoneNumber (audit)" value={p.phoneNumber} mono />`) === 0,
  generatorModelFieldGone:
    countOccurrences(source, `<Field label="Generator model" value={brief.generatorModel} mono />`) === 0,
  briefStubBranchPresent: countOccurrences(source, "const stub = isStubBrief(brief);") === 1,
};
console.log("[detail-page-cleanup] [evidence]", JSON.stringify(evidence));
if (Object.values(evidence).some((v) => !v)) {
  console.log("[detail-page-cleanup] FAIL"); process.exit(4);
}
console.log("[detail-page-cleanup] DONE");
