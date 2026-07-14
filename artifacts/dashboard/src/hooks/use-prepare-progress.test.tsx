/**
 * usePrepareProgress / useFollowupProgress — the polling rule.
 *
 * The bug these encode: the server PARKS a terminal progress entry (ready/error)
 * for a 15-minute TTL, and a new run's first GET can read it, because the GET is
 * dispatched before the POST (resetQueries refetches synchronously; mutateAsync
 * defers its fetch by a microtask). Believing it returned `false` from
 * refetchInterval, which kills the poller FOR THE WHOLE RUN — a frozen bar.
 *
 * `running` is the escape hatch. These tests assert the poller survives a stale
 * terminal frame while a run is live, and still stops when idle — the property
 * that a reviewer talked themselves into believing twice, wrongly.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { usePrepareProgress } from "./use-manual-ingest";
import { useFollowupProgress } from "./use-followups";

const getPrepareProgress = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/manual-ingest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/manual-ingest")>()),
  getPrepareProgress: (...a: unknown[]) => getPrepareProgress(...a),
}));

const getFollowupProgress = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/followups", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/followups")>()),
  getFollowupProgress: (...a: unknown[]) => getFollowupProgress(...a),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  // mockReset, NOT clearAllMocks: clear only wipes recorded calls, leaving
  // QUEUED mockResolvedValueOnce values behind. A test whose poller stops early
  // doesn't drain its queue, and the leftovers surface as the NEXT test's first
  // response — so these tests would pass or fail depending on the order they ran
  // in and on whether the code under test was correct. Reset drops the queue.
  getPrepareProgress.mockReset();
  getFollowupProgress.mockReset();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Let the 1.2s interval fire n times. */
async function tick(n = 1) {
  for (let i = 0; i < n; i++) {
    await vi.advanceTimersByTimeAsync(1300);
  }
}

describe("usePrepareProgress", () => {
  it("KEEPS POLLING through a stale terminal frame while a run is live", async () => {
    // The regenerate case: first GET reads the previous run's parked "ready",
    // then the route stamps "queued" and the real run reports in.
    getPrepareProgress
      .mockResolvedValueOnce({ stage: "ready", pct: 100 }) // stale
      .mockResolvedValueOnce({ stage: "queued", pct: 5 })
      .mockResolvedValue({ stage: "writing", pct: 65 });

    const { result } = renderHook(
      () => usePrepareProgress("p1", { running: true }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data?.stage).toBe("ready"));
    await tick(2);
    // Had the poller believed the stale frame, it would still read "ready".
    await waitFor(() => expect(result.current.data?.stage).toBe("writing"));
    expect(getPrepareProgress.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("STOPS polling on a terminal frame when no run is live", async () => {
    getPrepareProgress.mockResolvedValue({ stage: "ready", pct: 100 });

    renderHook(() => usePrepareProgress("p1", { running: false }), { wrapper });

    await waitFor(() => expect(getPrepareProgress).toHaveBeenCalledTimes(1));
    await tick(3);
    expect(getPrepareProgress).toHaveBeenCalledTimes(1);
  });

  it("does not poll at all without a prospectId", async () => {
    renderHook(() => usePrepareProgress(null, { running: true }), { wrapper });
    await tick(2);
    expect(getPrepareProgress).not.toHaveBeenCalled();
  });

  it("keeps polling a non-terminal stage even when not running", async () => {
    // Pre-existing behaviour must survive: a live run reported by the server
    // is watched regardless of the caller's flag.
    getPrepareProgress.mockResolvedValue({ stage: "researching", pct: 30 });

    renderHook(() => usePrepareProgress("p1", { running: false }), { wrapper });

    await waitFor(() => expect(getPrepareProgress).toHaveBeenCalledTimes(1));
    await tick(2);
    expect(getPrepareProgress.mock.calls.length).toBeGreaterThan(1);
  });
});

describe("useFollowupProgress (the twin — same store, same bug)", () => {
  it("KEEPS POLLING through a stale terminal frame while a run is live", async () => {
    getFollowupProgress
      .mockResolvedValueOnce({ stage: "error", pct: 100, error: "boom" }) // stale
      .mockResolvedValue({ stage: "writing", pct: 65 });

    const { result } = renderHook(
      () => useFollowupProgress(42, { running: true }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data?.stage).toBe("error"));
    await tick(2);
    await waitFor(() => expect(result.current.data?.stage).toBe("writing"));
  });

  it("STOPS polling on a terminal frame when no run is live", async () => {
    getFollowupProgress.mockResolvedValue({ stage: "ready", pct: 100 });

    renderHook(() => useFollowupProgress(42, { running: false }), { wrapper });

    await waitFor(() => expect(getFollowupProgress).toHaveBeenCalledTimes(1));
    await tick(3);
    expect(getFollowupProgress).toHaveBeenCalledTimes(1);
  });
});
