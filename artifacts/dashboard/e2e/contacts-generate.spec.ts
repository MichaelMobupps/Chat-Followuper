/**
 * Contacts: generate → preview → confirm, in a REAL browser.
 *
 * Everything under /api is stubbed (see playwright.config.ts). No DB, no
 * api-server, no LLM spend, and — deliberately — no request to any third-party
 * host: `window.open` is stubbed, so the LinkedIn deep link is asserted as a
 * string and never navigated to.
 *
 * What this adds over the 34 jsdom tests: the real component tree under real
 * CSS in real Chromium, the real 1.2s polling clock, and the actual
 * stale-terminal-progress race reproduced end-to-end.
 */
import { test, expect, type Page, type Route } from "@playwright/test";

const USER = {
  id: "u1",
  email: "rep@example.test",
  name: "Smoke Rep",
  picture: null,
  isAdmin: false,
};

const MSG = "Hey Arushi, saw Kuku FM crossed 2M installs — worth a look?";

type Row = Record<string, unknown>;

function prospectRow(over: Row = {}): Row {
  return {
    id: "p1",
    prospectName: "Arushi",
    company: "Kuku FM",
    phone: "+919560249640",
    telegramHandle: null,
    linkedinUrl: null,
    status: "draft",
    sourceMode: "manual",
    firstMessageBody: null,
    createdAt: new Date("2026-07-14T10:00:00Z").toISOString(),
    ...over,
  };
}

/** Auth + an empty-ish Contacts list. Individual tests add their own routes. */
async function stubBase(page: Page, rows: Row[] = [prospectRow()]) {
  await page.route("**/api/auth/me", (r: Route) =>
    r.fulfill({ json: USER }),
  );
  await page.route("**/api/prospects?**", (r: Route) =>
    r.fulfill({ json: { prospects: rows, total: rows.length, page: 1, perPage: 50 } }),
  );
  // Anything else under /api that a page might touch on mount — keep the app
  // from erroring on unrelated widgets without granting network access.
  await page.route("**/api/manual-ingest/settings", (r: Route) =>
    r.fulfill({ json: { enabled: true } }),
  );
}

/**
 * Replace window.open with a recorder. MUST run before any Send click.
 * This is the guard that keeps the suite localhost-only: without it, a
 * "Send in LinkedIn" click would make Chromium fetch a real linkedin.com URL.
 */
async function stubWindowOpen(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __opened: string[] }).__opened = [];
    window.open = (url?: string | URL) => {
      (window as unknown as { __opened: string[] }).__opened.push(String(url));
      // Non-null: the app treats null as "popup blocked".
      return {} as Window;
    };
  });
}

async function openedUrls(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __opened: string[] }).__opened,
  );
}

/**
 * The staged bar renders in TWO places by design — under the row AND in the
 * preview dialog (that is the feature: progress is visible either way). Scope
 * assertions to the dialog's copy rather than loosening the locator.
 */
function dialogBar(page: Page) {
  return page
    .getByTestId("first-message-preview-dialog")
    .getByTestId("prepare-progress");
}

test.describe("Contacts generate → preview", () => {
  test("the page renders and a draft row offers Generate", async ({ page }) => {
    // The cheapest thing jsdom cannot tell us: does the real app actually boot
    // and paint, with real CSS and real bundling.
    await stubBase(page);
    await page.goto("/contacts");

    await expect(page.getByTestId("page-title")).toHaveText(/Contacts/);
    await expect(page.getByTestId("contacts-generate-p1")).toBeVisible();
  });

  test("Generate opens the preview, streams the staged bar, then shows the message", async ({
    page,
  }) => {
    await stubBase(page);

    // Hold the POST open so the bar has a run to report on, and drive the
    // progress endpoint through the real pipeline stages.
    let stage = "queued";
    let releasePost: () => void = () => {};
    const postDone = new Promise<void>((r) => (releasePost = r));

    await page.route("**/api/prospects/p1/prepare-first-message", async (r: Route) => {
      await postDone;
      await r.fulfill({
        json: {
          status: "ready",
          prospectId: "p1",
          message: MSG,
          deepLinkUrl: `https://wa.me/919560249640?text=${encodeURIComponent(MSG)}`,
        },
      });
    });
    await page.route("**/api/prospects/p1/prepare-progress", (r: Route) =>
      r.fulfill({ json: { stage, pct: 50 } }),
    );

    await page.goto("/contacts");
    await page.getByTestId("contacts-generate-p1").click();

    // Dialog opens immediately, in the generating state.
    const dialog = page.getByTestId("first-message-preview-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-generating", "true");
    await expect(page.getByTestId("preview-generating")).toBeVisible();

    // The bar tracks the REAL server stages, on the real 1.2s clock.
    await expect(dialogBar(page)).toHaveAttribute(
      "data-stage",
      "queued",
    );
    stage = "researching";
    await expect(dialogBar(page)).toHaveAttribute(
      "data-stage",
      "researching",
      { timeout: 5000 },
    );
    stage = "writing";
    await expect(dialogBar(page)).toHaveAttribute(
      "data-stage",
      "writing",
      { timeout: 5000 },
    );

    // Finish the run → the message lands, editable.
    stage = "ready";
    releasePost();
    await expect(page.getByTestId("preview-first-message-body")).toHaveValue(MSG);
    await expect(dialog).toHaveAttribute("data-generating", "false");
    await expect(page.getByTestId("preview-send")).toBeEnabled();
  });

  test("REGRESSION: a stale parked 'ready' must not freeze or flash the bar", async ({
    page,
  }) => {
    // The exact production race: the server keeps the PREVIOUS run's terminal
    // entry for 15 minutes, and the first GET beats the POST. Pre-fix this
    // froze the bar at a green 100% "Ready" for the whole run. Here the first
    // progress GET serves that stale frame, then the run reports for real.
    await stubBase(page);

    let progressCalls = 0;
    let releasePost: () => void = () => {};
    const postDone = new Promise<void>((r) => (releasePost = r));

    await page.route("**/api/prospects/p1/prepare-first-message", async (r: Route) => {
      await postDone;
      await r.fulfill({
        json: {
          status: "ready",
          prospectId: "p1",
          message: MSG,
          deepLinkUrl: "https://wa.me/919560249640?text=hi",
        },
      });
    });
    await page.route("**/api/prospects/p1/prepare-progress", (r: Route) => {
      progressCalls += 1;
      // 1st poll: the previous run's parked terminal entry. Then the real run.
      const body =
        progressCalls === 1
          ? { stage: "ready", pct: 100 }
          : { stage: "writing", pct: 65 };
      return r.fulfill({ json: body });
    });

    await page.goto("/contacts");
    await page.getByTestId("contacts-generate-p1").click();
    await expect(page.getByTestId("preview-generating")).toBeVisible();

    // No green flash: the stale terminal frame must never paint.
    await expect(dialogBar(page)).not.toHaveAttribute(
      "data-stage",
      "ready",
    );
    // Not frozen: polling continued past the stale frame and the bar advanced.
    await expect(dialogBar(page)).toHaveAttribute(
      "data-stage",
      "writing",
      { timeout: 6000 },
    );
    expect(progressCalls).toBeGreaterThan(1);

    releasePost();
    await expect(page.getByTestId("preview-first-message-body")).toHaveValue(MSG);
  });

  test("edit → Save & send PATCHes first, then opens the composer with the edit", async ({
    page,
  }) => {
    await stubWindowOpen(page);
    await stubBase(page);

    const order: string[] = [];
    let patched: string | null = null;

    await page.route("**/api/prospects/p1", async (r: Route) => {
      if (r.request().method() !== "PATCH") return r.fallback();
      order.push("patch");
      patched = JSON.parse(r.request().postData() ?? "{}").firstMessageBody;
      await r.fulfill({ json: { id: "p1", firstMessageBody: patched } });
    });
    await page.route("**/api/prospects/p1/prepare-first-message", async (r: Route) => {
      order.push("prepare");
      // The BE short-circuits on the stored body — mirror that: echo what was
      // PATCHed, which is what makes edit-then-send correct in production.
      await r.fulfill({
        json: {
          status: "already_ready",
          prospectId: "p1",
          message: patched ?? MSG,
          deepLinkUrl: `https://wa.me/919560249640?text=${encodeURIComponent(patched ?? MSG)}`,
        },
      });
    });
    await page.route("**/api/prospects/p1/prepare-progress", (r: Route) =>
      r.fulfill({ json: { stage: "ready", pct: 100 } }),
    );

    await page.goto("/contacts");
    await page.getByTestId("contacts-generate-p1").click();
    await expect(page.getByTestId("preview-first-message-body")).toHaveValue(MSG);

    // Opening the preview already spent one `prepare` (the generate itself).
    // Only the SEND's ordering is under test here.
    order.length = 0;

    await page.getByTestId("preview-first-message-body").fill(`${MSG} Edited.`);
    await expect(page.getByTestId("preview-send")).toHaveText(/Save & send/);
    await page.getByTestId("preview-send").click();

    // The property: the edit is persisted BEFORE the composer is asked for a
    // link, because prepare serves the STORED body.
    await expect.poll(() => order.join(",")).toBe("patch,prepare");
    expect(patched).toBe(`${MSG} Edited.`);

    // The composer opened with the EDITED text — and only to wa.me.
    const opened = await openedUrls(page);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toContain("wa.me");
    expect(decodeURIComponent(opened[0]!)).toContain("Edited.");
  });

  test("a blocked popup keeps the dialog open with the edit intact", async ({
    page,
  }) => {
    // Real browser, real popup-block shape: window.open returns null.
    await page.addInitScript(() => {
      window.open = () => null;
    });
    await stubBase(page);

    await page.route("**/api/prospects/p1", (r: Route) =>
      r.request().method() === "PATCH"
        ? r.fulfill({ json: { id: "p1", firstMessageBody: `${MSG} Edited.` } })
        : r.fallback(),
    );
    await page.route("**/api/prospects/p1/prepare-first-message", (r: Route) =>
      r.fulfill({
        json: {
          status: "already_ready",
          prospectId: "p1",
          message: MSG,
          deepLinkUrl: "https://wa.me/919560249640?text=hi",
        },
      }),
    );
    await page.route("**/api/prospects/p1/prepare-progress", (r: Route) =>
      r.fulfill({ json: { stage: "ready", pct: 100 } }),
    );

    await page.goto("/contacts");
    await page.getByTestId("contacts-generate-p1").click();
    await expect(page.getByTestId("preview-first-message-body")).toHaveValue(MSG);

    await page.getByTestId("preview-first-message-body").fill(`${MSG} Edited.`);
    await page.getByTestId("preview-send").click();

    // Dialog stays; the SDR's words are still on screen.
    await expect(page.getByTestId("first-message-preview-dialog")).toBeVisible();
    await expect(page.getByTestId("preview-first-message-body")).toHaveValue(
      `${MSG} Edited.`,
    );
  });

  test("LinkedIn: the deep link is a profile URL and is never navigated to", async ({
    page,
  }) => {
    // Asserted as a STRING. Chromium must not fetch linkedin.com — this app
    // does no LinkedIn automation and the test suite must not either.
    await stubWindowOpen(page);

    const li = "https://www.linkedin.com/in/arushi-example";
    await page.route("**/api/auth/me", (r: Route) => r.fulfill({ json: USER }));
    await page.route("**/api/manual-ingest/settings", (r: Route) =>
      r.fulfill({ json: { enabled: true } }),
    );
    await page.route("**/api/prospects?**", (r: Route) =>
      r.fulfill({
        json: {
          prospects: [prospectRow({ phone: null, linkedinUrl: li })],
          total: 1,
          page: 1,
          perPage: 50,
        },
      }),
    );
    await page.route("**/api/prospects/p1/prepare-first-message", (r: Route) =>
      r.fulfill({
        json: {
          status: "already_ready",
          prospectId: "p1",
          message: MSG,
          deepLinkUrl: li,
        },
      }),
    );
    await page.route("**/api/prospects/p1/prepare-progress", (r: Route) =>
      r.fulfill({ json: { stage: "ready", pct: 100 } }),
    );
    // Belt and braces: fail loudly if anything ever tries to leave localhost.
    await page.route("**://www.linkedin.com/**", (r: Route) => r.abort());

    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/contacts");
    await page.getByRole("tab", { name: "LinkedIn" }).first().click();
    await page.getByTestId("contacts-generate-p1").click();

    await expect(page.getByTestId("preview-first-message-body")).toHaveValue(MSG);
    await expect(page.getByTestId("preview-send")).toHaveText(/Send in LinkedIn/);
    await expect(page.getByText(/LinkedIn can't prefill text/i)).toBeVisible();

    await page.getByTestId("preview-send").click();

    const opened = await openedUrls(page);
    expect(opened).toEqual([li]);
    // The real clipboard, in a real browser, with the real permission model —
    // the thing jsdom cannot check. Copy happens BEFORE window.open.
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toBe(MSG);
  });
});
