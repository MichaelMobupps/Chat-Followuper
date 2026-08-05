/**
 * AddManualContactDialog — "Generate message" (write before the contact is saved)
 * and the manual paste box (Speed pass, 2026-07-16).
 *
 * These exist because the feature shipped on argument alone and an adversarial
 * verifier then found four Highs in it. What's asserted here is exactly what was
 * broken, so it can't come back:
 *   - a GENERATED draft is INVALIDATED when the form drifts from what was
 *     researched (company / ticker / firstName / context) — the BE silently
 *     drops a stale draft, and the UI used to keep promising it would be saved.
 *     The box stays visible now (it doubles as the paste box) but empties, and
 *     the button returns to "Generate message";
 *   - a PASTED message (no draftId) is the SDR's own text: it is NOT wiped by
 *     form drift, and it submits as firstMessageBody WITHOUT a draftId;
 *   - the dialog cannot be closed mid-run (Esc/X desynced draftId from the
 *     message, then the page silently paid to generate a second one);
 *   - a generated draft sends draftId + firstMessageBody together;
 *   - the plain add path (no Generate, nothing pasted) sends a byte-identical
 *     body.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddManualContactDialog } from "./AddManualContactDialog";

const postManualIngest = vi.hoisted(() => vi.fn());
const postPreviewFirstMessage = vi.hoisted(() => vi.fn());
const getPreviewProgress = vi.hoisted(() => vi.fn());
const postClassifySeed = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/manual-ingest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/manual-ingest")>()),
  postManualIngest: (...a: unknown[]) => postManualIngest(...a),
  postPreviewFirstMessage: (...a: unknown[]) => postPreviewFirstMessage(...a),
  getPreviewProgress: (...a: unknown[]) => getPreviewProgress(...a),
  postClassifySeed: (...a: unknown[]) => postClassifySeed(...a),
}));

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast, dismiss: vi.fn(), toasts: [] }),
}));

const MSG = "Hi Yaron, saw MobUpps shipped three releases this quarter — worth a look?";

function setup(props: Partial<React.ComponentProps<typeof AddManualContactDialog>> = {}) {
  const onOpenChange = props.onOpenChange ?? vi.fn();
  const onAdded = props.onAdded ?? vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AddManualContactDialog
        channel="whatsapp"
        open
        onOpenChange={onOpenChange}
        onAdded={onAdded}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange, onAdded };
}

/** Fill the minimum the form needs to enable Generate + Add. */
async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId("manual-first-name"), "Yaron");
  await user.type(screen.getByTestId("manual-phone"), "+972501234567");
  await user.type(screen.getByTestId("manual-company"), "MobUpps");
  await user.click(screen.getByTestId("manual-ticker-mobile"));
}

async function generate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("manual-generate"));
  await waitFor(() => expect(screen.getByTestId("manual-message")).toHaveValue(MSG));
}

beforeEach(() => {
  vi.clearAllMocks();
  postPreviewFirstMessage.mockResolvedValue({
    draftId: "ignored-the-fe-keeps-its-own",
    message: MSG,
    classified: {
      vertical: "mobile",
      subVertical: "utility_general_mobile",
      country: "Israel",
      language: "he",
      product: "mobile user acquisition",
    },
  });
  getPreviewProgress.mockResolvedValue({ stage: "writing", pct: 65 });
  postManualIngest.mockResolvedValue({
    id: "p1",
    prospectName: "Yaron",
    company: "MobUpps",
    firstMessageBody: MSG,
  });
});

describe("AddManualContactDialog — Generate message", () => {
  it("offers Generate, and says it costs budget and takes time", async () => {
    setup();
    expect(screen.getByTestId("manual-generate")).toBeInTheDocument();
    expect(screen.getByText(/uses your AI budget/i)).toBeInTheDocument();
    expect(screen.getByText(/up to a minute/i)).toBeInTheDocument();
  });

  it("needs a name, company and product type before it will spend money", async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getByTestId("manual-generate")).toBeDisabled();

    await user.type(screen.getByTestId("manual-first-name"), "Yaron");
    await user.type(screen.getByTestId("manual-company"), "MobUpps");
    expect(screen.getByTestId("manual-generate")).toBeDisabled(); // no ticker yet

    await user.click(screen.getByTestId("manual-ticker-mobile"));
    // Note: NOT the phone — the writer never sees the identifier.
    expect(screen.getByTestId("manual-generate")).toBeEnabled();
  });

  it("writes the message inline and keeps it editable", async () => {
    const user = userEvent.setup();
    setup();
    await fillForm(user);
    await generate(user);

    expect(postPreviewFirstMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "whatsapp",
        firstName: "Yaron",
        company: "MobUpps",
        vertical: "mobile",
      }),
    );
    await user.type(screen.getByTestId("manual-message"), " Edited.");
    expect(screen.getByTestId("manual-message")).toHaveValue(`${MSG} Edited.`);
  });

  it("sends draftId + the edited body together on Add", async () => {
    const user = userEvent.setup();
    setup();
    await fillForm(user);
    await generate(user);
    await user.type(screen.getByTestId("manual-message"), " Edited.");
    await user.click(screen.getByTestId("manual-submit"));

    await waitFor(() => expect(postManualIngest).toHaveBeenCalled());
    const body = postManualIngest.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.firstMessageBody).toBe(`${MSG} Edited.`);
    expect(typeof body.draftId).toBe("string");
    // The FE's own id, not whatever the response echoed.
    expect(body.draftId).toBe(
      (postPreviewFirstMessage.mock.calls[0]![0] as { draftId: string }).draftId,
    );
  });

  it("sends NEITHER draftId nor a body when nothing was generated", async () => {
    // The plain add path must be byte-identical to before this feature.
    const user = userEvent.setup();
    setup();
    await fillForm(user);
    await user.click(screen.getByTestId("manual-submit"));

    await waitFor(() => expect(postManualIngest).toHaveBeenCalled());
    const body = postManualIngest.mock.calls[0]![0] as Record<string, unknown>;
    expect(body).not.toHaveProperty("draftId");
    expect(body).not.toHaveProperty("firstMessageBody");
    expect(postPreviewFirstMessage).not.toHaveBeenCalled();
  });

  describe("a GENERATED draft is dropped when the form drifts from what was researched", () => {
    // The box itself stays mounted (it doubles as the manual paste box); the
    // invalidation empties it and re-labels the button, so the SDR can SEE the
    // paid message was dropped instead of trusting stale "will be saved" copy.
    it("company — the brief researched the OLD one; the BE would refuse it", async () => {
      const user = userEvent.setup();
      setup();
      await fillForm(user);
      await generate(user);

      await user.type(screen.getByTestId("manual-company"), " Ltd");

      expect(screen.getByTestId("manual-message")).toHaveValue("");
      expect(screen.getByTestId("manual-generate")).toHaveTextContent(
        "Generate message",
      );
    });

    it("firstName — the message greets that name by hand", async () => {
      const user = userEvent.setup();
      setup();
      await fillForm(user);
      await generate(user);

      await user.clear(screen.getByTestId("manual-first-name"));
      await user.type(screen.getByTestId("manual-first-name"), "Dana");

      // Otherwise: contact saved as Dana, carrying a message opening "Hi Yaron".
      expect(screen.getByTestId("manual-message")).toHaveValue("");
    });

    it("product type — the BE takes the draft's classification over the toggle", async () => {
      const user = userEvent.setup();
      setup();
      await fillForm(user);
      await generate(user);

      await user.click(screen.getByTestId("manual-ticker-web"));
      expect(screen.getByTestId("manual-message")).toHaveValue("");
    });

    it("context — it's fed to the writer, so a message written before it ignored it", async () => {
      const user = userEvent.setup();
      setup();
      await fillForm(user);
      await generate(user);

      await user.click(screen.getByTestId("manual-context-toggle"));
      await user.type(
        screen.getByTestId("manual-pre-platform-context"),
        "we spoke last week",
      );
      expect(screen.getByTestId("manual-message")).toHaveValue("");
    });

    it("re-picking the SAME product type does not drop it", async () => {
      const user = userEvent.setup();
      setup();
      await fillForm(user);
      await generate(user);

      await user.click(screen.getByTestId("manual-ticker-mobile")); // already mobile
      expect(screen.getByTestId("manual-message")).toHaveValue(MSG);
    });
  });

  describe("manual paste box (Speed pass, 2026-07-16)", () => {
    const PASTED = "Hey Yaron — following up on our chat about MobUpps.";

    it("is visible before anything is generated", () => {
      setup();
      expect(screen.getByTestId("manual-message")).toBeInTheDocument();
      expect(screen.getByTestId("manual-message")).toHaveValue("");
    });

    it("sends the pasted body WITHOUT a draftId — no AI ran", async () => {
      const user = userEvent.setup();
      setup();
      await fillForm(user);
      await user.type(screen.getByTestId("manual-message"), PASTED);
      await user.click(screen.getByTestId("manual-submit"));

      await waitFor(() => expect(postManualIngest).toHaveBeenCalled());
      const body = postManualIngest.mock.calls[0]![0] as Record<string, unknown>;
      expect(body.firstMessageBody).toBe(PASTED);
      expect(body).not.toHaveProperty("draftId");
      expect(postPreviewFirstMessage).not.toHaveBeenCalled();
    });

    it("survives form drift — it's the SDR's own text, not a stale draft", async () => {
      const user = userEvent.setup();
      setup();
      await fillForm(user);
      await user.type(screen.getByTestId("manual-message"), PASTED);

      // Every drift that would invalidate a GENERATED draft:
      await user.type(screen.getByTestId("manual-company"), " Ltd");
      await user.click(screen.getByTestId("manual-ticker-web"));
      await user.clear(screen.getByTestId("manual-first-name"));
      await user.type(screen.getByTestId("manual-first-name"), "Dana");

      expect(screen.getByTestId("manual-message")).toHaveValue(PASTED);
    });
  });

  describe("mid-run", () => {
    it("shows the staged bar and blocks Add", async () => {
      const user = userEvent.setup();
      let release: (v: unknown) => void = () => {};
      postPreviewFirstMessage.mockImplementation(
        () => new Promise((r) => (release = r)),
      );
      setup();
      await fillForm(user);
      await user.click(screen.getByTestId("manual-generate"));

      await waitFor(() =>
        expect(screen.getByTestId("manual-generating")).toBeInTheDocument(),
      );
      // Submitting mid-run would save the contact without its message.
      expect(screen.getByTestId("manual-submit")).toBeDisabled();

      release({ draftId: "d", message: MSG, classified: {} });
    });

    it("REGRESSION: Esc cannot close it (that desynced the draft from its message)", async () => {
      const user = userEvent.setup();
      let release: (v: unknown) => void = () => {};
      postPreviewFirstMessage.mockImplementation(
        () => new Promise((r) => (release = r)),
      );
      const { onOpenChange } = setup();
      await fillForm(user);
      await user.click(screen.getByTestId("manual-generate"));
      await waitFor(() =>
        expect(screen.getByTestId("manual-generating")).toBeInTheDocument(),
      );

      await user.keyboard("{Escape}");
      // Closing here reset draftId while the run kept going; its onSuccess then
      // set the message with no id → a paid message the submit silently dropped.
      expect(onOpenChange).not.toHaveBeenCalledWith(false);

      release({ draftId: "d", message: MSG, classified: {} });
    });
  });

  it("explains a rate-limit in words, not a machine code", async () => {
    const user = userEvent.setup();
    const { ApiError } = await import("@/lib/api");
    postPreviewFirstMessage.mockRejectedValue(
      new ApiError(429, "rate_limited", "rate_limited", {}),
    );
    setup();
    await fillForm(user);
    await user.click(screen.getByTestId("manual-generate"));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    const arg = toast.mock.calls.at(-1)![0] as { description: string };
    expect(arg.description).toMatch(/wait a moment/i);
    expect(arg.description).not.toBe("rate_limited");
  });

  it("explains the daily cap using the code the server ACTUALLY sends", async () => {
    // An earlier guess ("daily_cap_reached") matched nothing, so a capped SDR
    // read the raw code. The server throws daily_cap_exceeded.
    const user = userEvent.setup();
    const { ApiError } = await import("@/lib/api");
    postPreviewFirstMessage.mockRejectedValue(
      new ApiError(429, "daily_cap_exceeded", "daily_cap_exceeded", {}),
    );
    setup();
    await fillForm(user);
    await user.click(screen.getByTestId("manual-generate"));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    const arg = toast.mock.calls.at(-1)![0] as { description: string };
    expect(arg.description).toMatch(/AI budget/i);
    expect(arg.description).not.toBe("daily_cap_exceeded");
  });
});
