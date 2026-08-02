/**
 * HTTP-level test that pins the legacy `/api` → prefixed-API redirect
 * (L1b; ROADMAP v3 redirect rule 6: "Pin the status code with a test that
 * boots the app, so a future edit fails a gate rather than passing silently").
 *
 * WHAT IT PINS, one test per property (TODO open item 13):
 *
 *   1. a POST to a legacy `/api/...` path answers **307**, not 308/302/301;
 *   2. the `Location` is the same path under `API_BASE_PATH`, query intact;
 *   3. what arrives at the prefixed mount is still a **POST** — read out of the
 *      server's own access log, per v3 redirect rule 4, rather than asserted;
 *   4. with `BASE_PATH` unset the legacy mount does not exist at all, so the
 *      rolled-back state stays exactly as it is today.
 *
 * WHY IT BOOTS A CHILD PROCESS. The app cannot be imported here: `app.ts` uses
 * directory imports (`import router from "./routes"`), which Node's ESM
 * resolver rejects with ERR_UNSUPPORTED_DIR_IMPORT. So the test builds the
 * artifact with the artifact's own `build.mjs` — no second copy of the esbuild
 * config to drift — and boots `dist/index.mjs`, which is the bundle that
 * actually ships. It rebuilds every run on purpose: booting a stale `dist`
 * would let this test pass while the source said 308, which is the exact
 * failure it exists to prevent.
 *
 * The two servers listen on OS-assigned free ports and are killed by their own
 * PIDs in `after`, so a workspace workflow on a fixed port is never involved.
 *
 * `NODE_ENV=production` is set for the children for one reason: it switches
 * pino out of the pretty transport into one JSON object per line, which is
 * what makes the access-log assertion in property 3 a parse rather than a
 * guess. The only other thing that flag reaches is the `secure` attribute on
 * session cookies, and none of the four probes authenticates.
 *
 * A boot needs `DATABASE_URL` (`lib/db` throws at import without it); this
 * repo's `lib/db` suite already assumes a live database. None of the four
 * probes reaches a query — all four are answered before any handler that
 * touches the pool.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import path from "node:path";

const ARTIFACT_DIR = path.resolve(import.meta.dirname, "..");
const ENTRY = path.join(ARTIFACT_DIR, "dist", "index.mjs");
const BOOT_TIMEOUT_MS = 30_000;
const LOG_TIMEOUT_MS = 5_000;

/**
 * A legacy path that deliberately matches no route.
 *
 * The property under test belongs to the *mount*, not to any endpoint: the
 * redirect is issued before routing, so a path that no router claims exercises
 * it exactly as a real one does. Using a real endpoint instead would couple
 * this gate to that endpoint's auth behavior, and a future refactor there would
 * fail this test for a reason that has nothing to do with the status code —
 * which is how a gate loses its credibility. Caught in L1b audit round 1.
 */
const LEGACY_PROBE = "/api/__l1b_status_probe__";
const PREFIXED_PROBE = "/chat/api/__l1b_status_probe__";

/** One completed-request line from the server's access log. */
type AccessLogEntry = { method: string; url: string; statusCode: number };

type Server = {
  base: string;
  child: ChildProcess;
  entries: AccessLogEntry[];
  stderr: string;
};

/** An OS-assigned free port: bind to 0, read the port back, release it. */
async function freePort(): Promise<number> {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  if (address === null || typeof address === "string") {
    throw new Error("could not obtain a free port");
  }
  const { port } = address;
  probe.close();
  await once(probe, "close");
  return port;
}

/** Build the artifact with its own build script. Throws on a non-zero exit. */
async function buildArtifact(): Promise<void> {
  const build = spawn(process.execPath, ["build.mjs"], {
    cwd: ARTIFACT_DIR,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let err = "";
  build.stderr?.setEncoding("utf8");
  build.stderr?.on("data", (chunk: string) => {
    err += chunk;
  });
  build.stdout?.resume();
  const [code] = (await once(build, "exit")) as [number | null];
  if (code !== 0) {
    throw new Error(`build.mjs exited with ${String(code)}\n${err}`);
  }
}

/**
 * Boot the built artifact on a free port and wait until it answers its own
 * health path, collecting the access log as it arrives.
 *
 * `set` adds variables; `unset` removes them from the inherited environment.
 * The dark boot needs the second: the app distinguishes an unset `BASE_PATH`
 * from one set to a value, and this process may have either.
 */
async function boot(
  set: Record<string, string> = {},
  unset: readonly string[] = [],
): Promise<Server> {
  const port = await freePort();
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of unset) delete env[key];
  const child = spawn(process.execPath, [ENTRY], {
    cwd: ARTIFACT_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...env, NODE_ENV: "production", ...set, PORT: String(port) },
  });

  const server: Server = {
    base: `http://127.0.0.1:${String(port)}`,
    child,
    entries: [],
    stderr: "",
  };

  const stdout = child.stdout;
  const stderr = child.stderr;
  if (stdout === null || stderr === null) {
    throw new Error("child process was spawned without pipes");
  }

  let buffered = "";
  stdout.setEncoding("utf8");
  stdout.on("data", (chunk: string) => {
    buffered += chunk;
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim() === "") continue;
      try {
        const record = JSON.parse(line) as {
          req?: { method?: unknown; url?: unknown };
          res?: { statusCode?: unknown };
        };
        const method = record.req?.method;
        const url = record.req?.url;
        const statusCode = record.res?.statusCode;
        if (
          typeof method === "string" &&
          typeof url === "string" &&
          typeof statusCode === "number"
        ) {
          server.entries.push({ method, url, statusCode });
        }
      } catch {
        // Not a JSON log line (a warning, or build noise). Ignore it.
      }
    }
  });
  stderr.setEncoding("utf8");
  stderr.on("data", (chunk: string) => {
    server.stderr += chunk;
  });

  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(
        `server exited with ${String(child.exitCode)} before answering\n${server.stderr}`,
      );
    }
    try {
      const res = await fetch(`${server.base}/api/healthz`);
      await res.arrayBuffer();
      if (res.status === 200) return server;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(
        `server did not boot within ${String(BOOT_TIMEOUT_MS)}ms\n${server.stderr}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Wait until the access log since `from` satisfies `done`, or throw. */
async function waitForLog(
  server: Server,
  from: number,
  done: (entries: readonly AccessLogEntry[]) => boolean,
): Promise<AccessLogEntry[]> {
  const deadline = Date.now() + LOG_TIMEOUT_MS;
  for (;;) {
    const entries = server.entries.slice(from);
    if (done(entries)) return entries;
    if (Date.now() > deadline) {
      throw new Error(
        `the access log never satisfied the condition; saw ${JSON.stringify(entries)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

let lit: Server;
let dark: Server;

before(async () => {
  await buildArtifact();
  // LIT: served under a prefix, exactly as production is today.
  lit = await boot(
    { BASE_PATH: "/chat/", PUBLIC_URL: "https://tools.mobupps.net/chat" },
    [],
  );
  // DARK: the rollback state — both variables absent, not empty.
  dark = await boot({}, ["BASE_PATH", "PUBLIC_URL"]);
});

after(() => {
  lit?.child.kill();
  dark?.child.kill();
});

test("LIT: a POST to a legacy /api path answers 307, not 308/302/301", async () => {
  const res = await fetch(`${lit.base}${LEGACY_PROBE}`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ probe: "l1b" }),
  });
  await res.arrayBuffer();

  assert.equal(
    res.status,
    307,
    "the legacy mount must answer 307 Temporary Redirect: 308 and 301 are " +
      "permanent and cacheable, so a cached hop would survive the env-unset " +
      "rollback and bounce clients to a path that no longer exists, and 302 " +
      "permits a client to downgrade the POST to a GET",
  );
});

test("LIT: the Location is the same path under the prefix, query intact", async () => {
  const requested = "/api/followups/open/42?t=abc%20123&next=%2Fchat%2F";
  const res = await fetch(`${lit.base}${requested}`, {
    method: "POST",
    redirect: "manual",
  });
  await res.arrayBuffer();

  assert.equal(res.status, 307);
  const location = res.headers.get("location");
  assert.equal(
    location,
    "/chat/api/followups/open/42?t=abc%20123&next=%2Fchat%2F",
    "path and query must both survive: the token in an emailed follow-up " +
      "link lives in the query string",
  );

  // Resolved with a URL parser rather than by string shape (v3 ritual step 4):
  // the hop must stay on this origin and inside the API mount.
  const resolved = new URL(location ?? "", `${lit.base}${requested}`);
  assert.equal(resolved.origin, new URL(lit.base).origin);
  assert.equal(resolved.pathname, "/chat/api/followups/open/42");
  assert.equal(resolved.search, "?t=abc%20123&next=%2Fchat%2F");
});

test("LIT: the POST arrives at the prefixed mount as a POST (access log)", async () => {
  const from = lit.entries.length;
  const res = await fetch(`${lit.base}${LEGACY_PROBE}`, {
    method: "POST",
    redirect: "follow",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ probe: "l1b" }),
  });
  await res.arrayBuffer();

  // The chain ended under the prefix, at the API mount rather than the SPA
  // catch-all: no router claims this path, so the API's own 404 is the right
  // answer and proves the request was routed as an API request.
  assert.equal(new URL(res.url).pathname, PREFIXED_PROBE);
  assert.equal(res.status, 404);

  const entries = await waitForLog(lit, from, (seen) =>
    seen.some((entry) => entry.url === PREFIXED_PROBE),
  );
  const legacy = entries.find((entry) => entry.url === LEGACY_PROBE);
  const prefixed = entries.find((entry) => entry.url === PREFIXED_PROBE);

  // The property this test owns comes first, so a method downgrade is what
  // fails rather than a corroborating status check further down. Found by
  // L1b's own mutation run: under 302 the status assertions fired first and
  // masked the thing 302 actually does wrong.
  assert.ok(prefixed, "the redirected request should reach the prefixed mount");
  assert.equal(
    prefixed.method,
    "POST",
    "the method must survive the hop — under a 301 or 302 this arrives as " +
      "GET and the body is silently dropped",
  );

  assert.ok(legacy, "the legacy request should appear in the access log");
  assert.equal(legacy.method, "POST");
  assert.equal(legacy.statusCode, 307);
});

test("DARK: with BASE_PATH unset the legacy mount does not exist", async () => {
  const from = dark.entries.length;
  const res = await fetch(`${dark.base}${LEGACY_PROBE}`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ probe: "l1b" }),
  });
  await res.arrayBuffer();

  assert.ok(
    res.status < 300 || res.status >= 400,
    `dark, /api is the API itself: the request must be answered by this app, ` +
      `not redirected anywhere, but it answered ${String(res.status)}`,
  );
  assert.equal(res.headers.get("location"), null, "no redirect may be issued");

  const entries = await waitForLog(dark, from, (seen) =>
    seen.some((entry) => entry.url === LEGACY_PROBE),
  );
  for (const entry of entries) {
    assert.ok(
      entry.statusCode < 300 || entry.statusCode >= 400,
      `dark must issue no redirect, saw ${String(entry.statusCode)} for ${entry.url}`,
    );
  }
});
