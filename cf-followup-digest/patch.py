#!/usr/bin/env python3
"""
Anchor-guarded patcher for the follow-up reminder digest wiring.

api-server only. Registers the open route and adds the digest script as a
build entry. The build-mjs anchor targets the sweepReveals entry added by the
reveal-expiry bundle, so apply that bundle first.

Modes: validate (no writes, lists misses), apply (idempotent via markers).
"""
import argparse
import sys

EDITS = {
    "routes-index": [
        (
            'import sequenceConfigRouter from "./sequenceConfig";',
            'import sequenceConfigRouter from "./sequenceConfig";\n'
            'import followupOpenRouter from "./followupOpen";',
            "import followupOpenRouter",
            True,
        ),
        (
            "router.use(sequenceConfigRouter);",
            "router.use(sequenceConfigRouter);\nrouter.use(followupOpenRouter);",
            "router.use(followupOpenRouter)",
            True,
        ),
    ],
    "build-mjs": [
        (
            '      path.resolve(artifactDir, "src/scripts/sweepReveals.ts"),',
            '      path.resolve(artifactDir, "src/scripts/sweepReveals.ts"),\n'
            '      path.resolve(artifactDir, "src/scripts/sendFollowupDigests.ts"),',
            "src/scripts/sendFollowupDigests.ts",
            True,
        ),
    ],
}

ARG_TO_KEY = {"routes_index": "routes-index", "build_mjs": "build-mjs"}


def read(p):
    with open(p, "r", encoding="utf-8") as fh:
        return fh.read()


def write(p, t):
    with open(p, "w", encoding="utf-8") as fh:
        fh.write(t)


def validate(paths):
    failures = []
    for arg, key in ARG_TO_KEY.items():
        content = read(paths[arg])
        for anchor, _r, marker, fatal in EDITS[key]:
            if marker in content or anchor in content:
                continue
            if fatal:
                failures.append((key, paths[arg], marker))
    if failures:
        print("VALIDATION FAILED. These anchors did not match the target tree:")
        for key, path, marker in failures:
            print(f"  - {key} ({path}); expected anchor for: {marker}")
        print("If build.mjs failed, apply the reveal-expiry bundle first.")
        return 1
    print("validation OK: all anchors located")
    return 0


def apply(paths):
    for arg, key in ARG_TO_KEY.items():
        path = paths[arg]
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
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["validate", "apply"])
    ap.add_argument("--routes-index", required=True)
    ap.add_argument("--build-mjs", required=True)
    a = ap.parse_args()
    paths = {"routes_index": a.routes_index, "build_mjs": a.build_mjs}
    sys.exit(validate(paths) if a.mode == "validate" else apply(paths))


if __name__ == "__main__":
    main()
