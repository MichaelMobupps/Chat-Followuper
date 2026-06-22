#!/usr/bin/env python3
"""
Anchor-guarded patcher for the admin foundation wiring (api-server only).

Adds requireAdmin to the auth middleware and registers the admin router.
Modes: validate (no writes), apply (idempotent via markers).
"""
import argparse
import sys

REQUIRE_AUTH_BLOCK = '''export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }
  next();
}'''

REQUIRE_ADMIN_FN = '''

/**
 * Hard admin gate. Requires requireAuth earlier in the chain. Grants access
 * only to emails in ADMIN_EMAILS; every other authenticated user gets 403
 * and stays isolated to their own data.
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }
  if (!isAdminEmail(req.user.email)) {
    res.status(403).json({ error: "forbidden_not_admin" });
    return;
  }
  next();
}'''

EDITS = {
    "auth": [
        (
            'import { db, usersTable } from "@workspace/db";',
            'import { db, usersTable } from "@workspace/db";\n'
            'import { isAdminEmail } from "../lib/admin";',
            "isAdminEmail",
            True,
        ),
        (
            REQUIRE_AUTH_BLOCK,
            REQUIRE_AUTH_BLOCK + REQUIRE_ADMIN_FN,
            "export function requireAdmin",
            True,
        ),
    ],
    "index": [
        (
            'import sequenceConfigRouter from "./sequenceConfig";',
            'import sequenceConfigRouter from "./sequenceConfig";\n'
            'import adminRouter from "./admin";',
            "import adminRouter",
            True,
        ),
        (
            "router.use(sequenceConfigRouter);",
            "router.use(sequenceConfigRouter);\nrouter.use(adminRouter);",
            "router.use(adminRouter)",
            True,
        ),
    ],
}

ARG_TO_KEY = {"auth": "auth", "index": "index"}


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
        print("VALIDATION FAILED. These anchors did not match:")
        for key, path, marker in failures:
            print(f"  - {key} ({path}); expected anchor for: {marker}")
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
    ap.add_argument("--auth", required=True)
    ap.add_argument("--index", required=True)
    a = ap.parse_args()
    paths = {"auth": a.auth, "index": a.index}
    sys.exit(validate(paths) if a.mode == "validate" else apply(paths))


if __name__ == "__main__":
    main()
