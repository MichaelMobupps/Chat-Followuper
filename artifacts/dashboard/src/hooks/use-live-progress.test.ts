/**
 * useFreshProgress — the stale-terminal-frame suppression rule.
 *
 * This is the exact logic a verifier caught me getting wrong twice: first by
 * "fixing" the stale-frame race with call ordering (impossible — the GET is
 * dispatched before the POST regardless), then by masking every terminal frame
 * while a run is live (which would blank the bar at the finish, because the
 * run's REAL "ready" arrives while `running` is still true). So it gets tested.
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useFreshProgress } from "./use-live-progress";

type Frame = { stage: string; pct: number };

const f = (stage: string, pct = 0): Frame => ({ stage, pct });

/** Drive the hook through a sequence of (raw, running, runKey) renders. */
function drive(
  steps: Array<[Frame | undefined, boolean, string | null]>,
): Array<Frame | undefined> {
  const seen: Array<Frame | undefined> = [];
  const { result, rerender } = renderHook(
    ({ raw, running, key }: { raw?: Frame; running: boolean; key: string | null }) =>
      useFreshProgress(raw, running, key),
    { initialProps: { raw: steps[0]![0], running: steps[0]![1], key: steps[0]![2] } },
  );
  seen.push(result.current);
  for (const [raw, running, key] of steps.slice(1)) {
    rerender({ raw, running, key });
    seen.push(result.current);
  }
  return seen;
}

describe("useFreshProgress", () => {
  it("passes everything through when no run is live", () => {
    // Not running: the bar shows whatever the last run left, including its
    // final Ready — that's the intended resting state on the Contacts row.
    const seen = drive([
      [f("ready", 100), false, "p1"],
      [f("error", 100), false, "p1"],
      [f("writing", 65), false, "p1"],
    ]);
    expect(seen).toEqual([f("ready", 100), f("error", 100), f("writing", 65)]);
  });

  it("suppresses a STALE ready frame at the start of a run (no green flash)", () => {
    // The regenerate case: server still holds the previous run's ready (15-min
    // TTL) and our first GET reads it before the POST lands.
    const seen = drive([
      [undefined, false, "p1"], // idle, previous run over
      [undefined, true, "p1"], // click: running, cache reset
      [f("ready", 100), true, "p1"], // stale frame arrives → must be hidden
      [f("queued", 5), true, "p1"], // server stamped the new run → shows
    ]);
    expect(seen[2]).toBeUndefined();
    expect(seen[3]).toEqual(f("queued", 5));
  });

  it("suppresses a STALE error frame through a retry (no red flash)", () => {
    const seen = drive([
      [undefined, false, "p1"],
      [undefined, true, "p1"],
      [f("error", 100), true, "p1"], // previous failure, parked server-side
      [f("researching", 30), true, "p1"],
    ]);
    expect(seen[2]).toBeUndefined();
    expect(seen[3]).toEqual(f("researching", 30));
  });

  it("does NOT suppress the run's real ready (bar must not blink out at the end)", () => {
    // The server stamps ready BEFORE the route responds, so the real terminal
    // frame lands while `running` is still true. Once the run has shown a fresh
    // stage, terminal frames must pass through.
    const seen = drive([
      [undefined, true, "p1"],
      [f("queued", 5), true, "p1"],
      [f("writing", 65), true, "p1"],
      [f("ready", 100), true, "p1"], // real ready, still running → must SHOW
      [f("ready", 100), false, "p1"], // POST resolved
    ]);
    expect(seen[3]).toEqual(f("ready", 100));
    expect(seen[4]).toEqual(f("ready", 100));
  });

  it("does not suppress a real error once the run has reported in", () => {
    const seen = drive([
      [undefined, true, "p1"],
      [f("researching", 30), true, "p1"],
      [f("error", 100), true, "p1"], // this run genuinely failed → must SHOW
    ]);
    expect(seen[2]).toEqual(f("error", 100));
  });

  it("re-arms suppression for the NEXT run (flag resets when running clears)", () => {
    const seen = drive([
      [undefined, true, "p1"],
      [f("writing", 65), true, "p1"], // run 1 saw fresh
      [f("ready", 100), false, "p1"], // run 1 done
      [undefined, true, "p1"], // run 2 starts
      [f("ready", 100), true, "p1"], // run 1's parked frame → hidden again
    ]);
    expect(seen[4]).toBeUndefined();
  });

  it("re-arms when the poller switches target mid-flight (runKey change)", () => {
    // Structural guard: today three UI gates stop two runs overlapping, so
    // `running` always dips false between them. If any of them regressed,
    // the runKey reset is what still keeps prospect B from rendering A's
    // leftover Ready frame.
    const seen = drive([
      [undefined, true, "pA"],
      [f("writing", 65), true, "pA"], // A saw fresh
      [f("ready", 100), true, "pB"], // switched to B WITHOUT running dipping
    ]);
    expect(seen[2]).toBeUndefined();
  });

  it("passes non-terminal frames through untouched, always", () => {
    const seen = drive([
      [f("queued", 5), true, "p1"],
      [f("researching", 30), true, "p1"],
      [f("writing", 65), true, "p1"],
      [f("finalizing", 90), true, "p1"],
    ]);
    expect(seen).toEqual([
      f("queued", 5),
      f("researching", 30),
      f("writing", 65),
      f("finalizing", 90),
    ]);
  });

  it("treats an idle frame as fresh (it is a real server answer, not a leftover)", () => {
    // "idle" = no entry server-side — it proves the stale entry is GONE, so a
    // later terminal frame can only belong to this run.
    const seen = drive([
      [undefined, true, "p1"],
      [f("idle", 0), true, "p1"],
      [f("ready", 100), true, "p1"],
    ]);
    expect(seen[2]).toEqual(f("ready", 100));
  });
});
