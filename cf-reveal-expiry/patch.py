#!/usr/bin/env python3
"""
Anchor-guarded patcher for the pending-reveal expiry feature (v2).

Adds, over v1: the build.mjs sweep entry (A1) and the prospect-detail.tsx
status consumer (A2).

Modes:
  validate  -> confirm every fatal anchor (or its applied marker) is present.
               Writes nothing. Non-zero exit lists every miss.
  apply     -> perform the edits. Idempotent via per-edit markers.

The prospects-schema doc edit is non-fatal and indent-tolerant.
"""
import argparse
import sys

EDITS = {
    "action-logs": [
        (
            '  apolloPhoneRevealBlocked: "apollo.phone_reveal_blocked",',
            '  apolloPhoneRevealBlocked: "apollo.phone_reveal_blocked",\n'
            '  apolloPhoneRevealExpired: "apollo.phone_reveal_expired",',
            "apolloPhoneRevealExpired:",
            True,
        ),
    ],
    "prospects-route": [
        (
            '  "phone-no-match",\n] as const;',
            '  "phone-no-match",\n  "phone-expired",\n] as const;',
            '  "phone-expired",\n] as const;',
            True,
        ),
        (
            '    case "phone-pending":\n'
            "      return and(\n"
            "        isNull(prospectsTable.firstMessageSentAt),\n"
            "        isNull(prospectsTable.phone),\n"
            '        ne(prospectsTable.phoneRevealStatus, "blocked"),\n'
            '        ne(prospectsTable.phoneRevealStatus, "no_match"),\n'
            "      );",
            '    case "phone-expired":\n'
            "      return and(\n"
            "        isNull(prospectsTable.firstMessageSentAt),\n"
            '        eq(prospectsTable.phoneRevealStatus, "expired"),\n'
            "      );\n"
            '    case "phone-pending":\n'
            "      return and(\n"
            "        isNull(prospectsTable.firstMessageSentAt),\n"
            "        isNull(prospectsTable.phone),\n"
            '        ne(prospectsTable.phoneRevealStatus, "blocked"),\n'
            '        ne(prospectsTable.phoneRevealStatus, "no_match"),\n'
            '        ne(prospectsTable.phoneRevealStatus, "expired"),\n'
            "      );",
            'case "phone-expired":',
            True,
        ),
        (
            '  if (p.phoneRevealStatus === "no_match") return "phone-no-match";\n'
            '  if (!p.phone) return "phone-pending";',
            '  if (p.phoneRevealStatus === "no_match") return "phone-no-match";\n'
            '  if (p.phoneRevealStatus === "expired") return "phone-expired";\n'
            '  if (!p.phone) return "phone-pending";',
            'if (p.phoneRevealStatus === "expired") return "phone-expired";',
            True,
        ),
    ],
    "apollo": [
        (
            '    if (prospect.phoneRevealStatus !== "pending") {\n'
            "      // Apollo retried; we've already processed this delivery. No-op.\n"
            "      return {",
            "    if (\n"
            '      prospect.phoneRevealStatus !== "pending" &&\n'
            '      prospect.phoneRevealStatus !== "expired"\n'
            "    ) {\n"
            "      // Already a hard terminal (arrived/blocked/no_match). Apollo retried a\n"
            '      // delivery we processed. No-op. "expired" is intentionally excluded so\n'
            '      // a late phone promotes the row to "arrived" below. The .for("update")\n'
            "      // row lock serializes this against the expiry sweep.\n"
            "      return {",
            'prospect.phoneRevealStatus !== "expired"',
            True,
        ),
    ],
    "build-mjs": [
        (
            '    entryPoints: [path.resolve(artifactDir, "src/index.ts")],',
            "    entryPoints: [\n"
            '      path.resolve(artifactDir, "src/index.ts"),\n'
            '      path.resolve(artifactDir, "src/scripts/sweepReveals.ts"),\n'
            "    ],",
            "src/scripts/sweepReveals.ts",
            True,
        ),
    ],
    "fe-prospect-status": [
        (
            '  | "phone-blocked"\n  | "phone-no-match";',
            '  | "phone-blocked"\n  | "phone-no-match"\n  | "phone-expired";',
            '| "phone-expired"',
            True,
        ),
    ],
    "fe-status-badge": [
        (
            '    "phone-no-match": {\n'
            '      label: "No phone",\n'
            "      icon: XCircle,\n"
            '      cls: "border-destructive text-destructive",\n'
            "    },\n"
            "  };",
            '    "phone-no-match": {\n'
            '      label: "No phone",\n'
            "      icon: XCircle,\n"
            '      cls: "border-destructive text-destructive",\n'
            "    },\n"
            '    "phone-expired": {\n'
            '      label: "Unreachable",\n'
            "      icon: XCircle,\n"
            '      cls: "border-destructive text-destructive",\n'
            "    },\n"
            "  };",
            '"phone-expired": {',
            True,
        ),
    ],
    "fe-filters": [
        (
            '  { value: "phone-no-match", label: "No phone" },',
            '  { value: "phone-no-match", label: "No phone" },\n'
            '  { value: "phone-expired", label: "Unreachable" },',
            'value: "phone-expired"',
            True,
        ),
    ],
    "fe-detail": [
        (
            '  if (p.phoneRevealStatus === "no_match") return "phone-no-match";\n'
            '  if (!p.phone) return "phone-pending";',
            '  if (p.phoneRevealStatus === "no_match") return "phone-no-match";\n'
            '  if (p.phoneRevealStatus === "expired") return "phone-expired";\n'
            '  if (!p.phone) return "phone-pending";',
            'if (p.phoneRevealStatus === "expired") return "phone-expired";',
            True,
        ),
        (
            '    "phone-no-match": {\n'
            '      label: "No phone",\n'
            "      icon: XCircle,\n"
            '      cls: "border-destructive text-destructive",\n'
            "    },\n"
            "  };",
            '    "phone-no-match": {\n'
            '      label: "No phone",\n'
            "      icon: XCircle,\n"
            '      cls: "border-destructive text-destructive",\n'
            "    },\n"
            '    "phone-expired": {\n'
            '      label: "Unreachable",\n'
            "      icon: XCircle,\n"
            '      cls: "border-destructive text-destructive",\n'
            "    },\n"
            "  };",
            '"phone-expired": {',
            True,
        ),
    ],
}

DOC_ANCHOR_SUBSTR = "Apollo returned no phone for this person"
DOC_MARKER = "pending reveal aged past REVEAL_PENDING_MAX_AGE_HOURS"

ARG_TO_KEY = {
    "action_logs": "action-logs",
    "prospects_route": "prospects-route",
    "apollo": "apollo",
    "build_mjs": "build-mjs",
    "fe_prospect_status": "fe-prospect-status",
    "fe_status_badge": "fe-status-badge",
    "fe_filters": "fe-filters",
    "prospect_detail": "fe-detail",
}


def read(p):
    with open(p, "r", encoding="utf-8") as fh:
        return fh.read()


def write(p, t):
    with open(p, "w", encoding="utf-8") as fh:
        fh.write(t)


def validate(paths):
    failures = []
    for argname, key in ARG_TO_KEY.items():
        content = read(paths[argname])
        for anchor, _r, marker, fatal in EDITS[key]:
            if marker in content or anchor in content:
                continue
            if fatal:
                failures.append((key, paths[argname], marker))
    if failures:
        print("VALIDATION FAILED. These anchors did not match the target tree:")
        for key, path, marker in failures:
            print(f"  - {key} ({path}); expected anchor for: {marker}")
        print("Nothing was changed. Send me the current file and I will re-anchor.")
        return 1
    print("validation OK: all fatal anchors located")
    return 0


def apply(paths):
    for argname, key in ARG_TO_KEY.items():
        path = paths[argname]
        content = read(path)
        changed = False
        for anchor, repl, marker, fatal in EDITS[key]:
            if marker in content:
                print(f"skip (already applied): {key} :: {marker[:46]}")
                continue
            if anchor in content:
                content = content.replace(anchor, repl, 1)
                changed = True
                print(f"applied: {key} :: {marker[:46]}")
            elif fatal:
                print(f"ERROR: anchor vanished at apply time: {key}")
                return 1
        if changed:
            write(path, content)

    schema_path = paths["prospects_schema"]
    schema = read(schema_path)
    if DOC_MARKER in schema:
        print("skip (already applied): prospects-schema doc")
    else:
        idx = schema.find(DOC_ANCHOR_SUBSTR)
        if idx == -1:
            print("warn: prospects-schema doc anchor not found; skipping (non-fatal)")
        else:
            line_start = schema.rfind("\n", 0, idx) + 1
            line_end = schema.find("\n", idx)
            prefix = ""
            for ch in schema[line_start:idx]:
                if ch in " *":
                    prefix += ch
                else:
                    break
            insert = (
                f'\n{prefix}- "expired"  pending reveal aged past '
                f"REVEAL_PENDING_MAX_AGE_HOURS\n"
                f"{prefix}             with no webhook; soft terminal (Ticket 1.5c). A late\n"
                f'{prefix}             webhook can still promote it to "arrived".'
            )
            schema = schema[:line_end] + insert + schema[line_end:]
            write(schema_path, schema)
            print("applied: prospects-schema doc")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["validate", "apply"])
    ap.add_argument("--prospects-route", required=True)
    ap.add_argument("--apollo", required=True)
    ap.add_argument("--action-logs", required=True)
    ap.add_argument("--prospects-schema", required=True)
    ap.add_argument("--build-mjs", required=True)
    ap.add_argument("--fe-prospect-status", required=True)
    ap.add_argument("--fe-status-badge", required=True)
    ap.add_argument("--fe-filters", required=True)
    ap.add_argument("--prospect-detail", required=True)
    a = ap.parse_args()
    paths = {
        "prospects_route": a.prospects_route,
        "apollo": a.apollo,
        "action_logs": a.action_logs,
        "prospects_schema": a.prospects_schema,
        "build_mjs": a.build_mjs,
        "fe_prospect_status": a.fe_prospect_status,
        "fe_status_badge": a.fe_status_badge,
        "fe_filters": a.fe_filters,
        "prospect_detail": a.prospect_detail,
    }
    sys.exit(validate(paths) if a.mode == "validate" else apply(paths))


if __name__ == "__main__":
    main()
