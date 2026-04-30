#!/usr/bin/env node
// Watch artifacts/api-server/src and mirror changes to source-code/src on every save.
// Uses fs.watch (recursive) — supported on macOS and Linux >= Node 20.
import { spawnSync } from "node:child_process";
import { watch } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = resolve(ROOT, "artifacts/api-server/src");
const SCRIPT = resolve(__dirname, "sync-source-code.sh");

mkdirSync(resolve(ROOT, "source-code/src"), { recursive: true });

function syncOnce() {
  const result = spawnSync("bash", [SCRIPT], { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`[watch-source-code] sync exited with code ${result.status}`);
  }
}

console.log(`[watch-source-code] initial sync from ${SRC}`);
syncOnce();

let pending = false;
let timer = null;

console.log(`[watch-source-code] watching ${SRC}`);
watch(SRC, { recursive: true }, (event, filename) => {
  if (filename) {
    console.log(`[watch-source-code] ${event}: ${filename}`);
  }
  pending = true;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    if (!pending) return;
    pending = false;
    syncOnce();
  }, 200);
});

process.on("SIGINT", () => {
  console.log("\n[watch-source-code] stopping");
  process.exit(0);
});
