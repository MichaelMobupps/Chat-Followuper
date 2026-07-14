/**
 * FirstMessagePreviewDialog — the generate → preview → confirm state machine.
 *
 * Nobody had ever rendered this component: the whole feature shipped on
 * typecheck + review. These tests cover the states an SDR actually walks
 * through, and the three behaviours the audit had to fix by argument alone:
 *   - a blocked popup (onSend → false) must NOT dismiss the dialog or lose the edit;
 *   - an edit must be PATCHed before the composer opens (prepare reads the stored body);
 *   - Send must be inert while a save is in flight (double-PATCH + close-mid-send).
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FirstMessagePreviewDialog,
  type PreviewTarget,
} from "./FirstMessagePreviewDialog";
import type { PrepareProgress } from "@/lib/api/manual-ingest";

// The dialog's only mutation is the PATCH (useUpdateProspect → updateProspect);
// stub the transport under it so the component, not a fake, is what we exercise.
const updateProspect = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/prospects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/prospects")>()),
  updateProspect: (...args: unknown[]) => updateProspect(...args),
}));

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast, dismiss: vi.fn(), toasts: [] }),
}));

const TARGET: PreviewTarget = {
  id: "p1",
  prospectName: "Arushi",
  company: "Kuku FM",
};

const MSG = "Hey Arushi, saw Kuku FM crossed 2M installs — worth a look?";

function setup(
  props: Partial<React.ComponentProps<typeof FirstMessagePreviewDialog>> = {},
) {
  const onSend = props.onSend ?? vi.fn().mockResolvedValue(true);
  const onOpenChange = props.onOpenChange ?? vi.fn();
  const onRegenerate = props.onRegenerate ?? vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={client}>
      <FirstMessagePreviewDialog
        open
        onOpenChange={onOpenChange}
        target={TARGET}
        channel="whatsapp"
        isGenerating={false}
        progress={undefined}
        message={MSG}
        error={null}
        onRegenerate={onRegenerate}
        onSend={onSend}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onSend, onOpenChange, onRegenerate };
}

beforeEach(() => {
  vi.clearAllMocks();
  updateProspect.mockResolvedValue({ id: "p1" });
});

describe("FirstMessagePreviewDialog", () => {
  describe("generating", () => {
    const progress: PrepareProgress = { stage: "writing", pct: 65 };

    it("shows the staged bar and no message box while generating", () => {
      setup({ isGenerating: true, progress, message: null });
      expect(screen.getByTestId("preview-generating")).toBeInTheDocument();
      expect(screen.getByTestId("prepare-progress")).toHaveAttribute(
        "data-stage",
        "writing",
      );
      expect(
        screen.queryByTestId("preview-first-message-body"),
      ).not.toBeInTheDocument();
    });

    it("renders nothing for the bar when progress is suppressed/absent", () => {
      // useFreshProgress hands `undefined` while a stale terminal frame is
      // being hidden — the dialog must cope, not crash or show a phantom bar.
      setup({ isGenerating: true, progress: undefined, message: null });
      expect(screen.getByTestId("preview-generating")).toBeInTheDocument();
      expect(screen.queryByTestId("prepare-progress")).not.toBeInTheDocument();
    });

    it("disables Send and hides Regenerate mid-run", () => {
      setup({ isGenerating: true, progress, message: null });
      expect(screen.getByTestId("preview-send")).toBeDisabled();
      expect(screen.queryByTestId("preview-regenerate")).not.toBeInTheDocument();
    });

    it("refuses to close mid-run (a dropped run would burn spend for nothing)", async () => {
      const onOpenChange = vi.fn();
      setup({ isGenerating: true, progress, message: null, onOpenChange });
      await userEvent.keyboard("{Escape}");
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  describe("ready", () => {
    it("shows the generated message, editable", () => {
      setup();
      expect(screen.getByTestId("preview-first-message-body")).toHaveValue(MSG);
      expect(screen.getByTestId("preview-send")).toBeEnabled();
    });

    it("labels Send with the channel, and switches to Save & send once edited", async () => {
      setup();
      expect(screen.getByTestId("preview-send")).toHaveTextContent(
        "Send in WhatsApp",
      );
      await userEvent.type(screen.getByTestId("preview-first-message-body"), "!");
      expect(screen.getByTestId("preview-send")).toHaveTextContent("Save & send");
    });

    it("offers Save for later only after an edit", async () => {
      setup();
      expect(screen.queryByTestId("preview-save")).not.toBeInTheDocument();
      await userEvent.type(screen.getByTestId("preview-first-message-body"), "!");
      expect(screen.getByTestId("preview-save")).toBeInTheDocument();
    });

    it("blocks Send on an all-blank edit (the BE requires a non-empty body)", async () => {
      setup();
      await userEvent.clear(screen.getByTestId("preview-first-message-body"));
      expect(screen.getByTestId("preview-send")).toBeDisabled();
    });

    it("sends WITHOUT a PATCH when the message is untouched", async () => {
      const { onSend, onOpenChange } = setup();
      await userEvent.click(screen.getByTestId("preview-send"));
      await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
      expect(updateProspect).not.toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("edit → send ordering", () => {
    it("PATCHes the edited body BEFORE opening the composer", async () => {
      // prepare-first-message reads the STORED body, so an unsaved edit would
      // silently send the old text. Order is the correctness property here.
      const calls: string[] = [];
      updateProspect.mockImplementation(async () => {
        calls.push("patch");
        return { id: "p1" };
      });
      const onSend = vi.fn(async () => {
        calls.push("send");
        return true;
      });
      setup({ onSend });

      await userEvent.type(
        screen.getByTestId("preview-first-message-body"),
        " Edited.",
      );
      await userEvent.click(screen.getByTestId("preview-send"));

      await waitFor(() => expect(onSend).toHaveBeenCalled());
      expect(calls).toEqual(["patch", "send"]);
      expect(updateProspect).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ firstMessageBody: `${MSG} Edited.` }),
      );
    });

    it("keeps the dialog OPEN and the edit intact when the popup is blocked", async () => {
      // onSend resolves false (window.open returned null). The SDR must not
      // lose the message they just wrote.
      const onSend = vi.fn().mockResolvedValue(false);
      const { onOpenChange } = setup({ onSend });

      await userEvent.type(
        screen.getByTestId("preview-first-message-body"),
        " Edited.",
      );
      await userEvent.click(screen.getByTestId("preview-send"));

      await waitFor(() => expect(onSend).toHaveBeenCalled());
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      expect(screen.getByTestId("preview-first-message-body")).toHaveValue(
        `${MSG} Edited.`,
      );
    });

    it("does not fire a second PATCH while a save is in flight", async () => {
      // Save for later leaves the dialog open; Send must be inert until it
      // settles, or we double-PATCH and close the dialog mid-send.
      let release: (v: unknown) => void = () => {};
      updateProspect.mockImplementation(
        () => new Promise((r) => (release = r)),
      );
      setup();

      await userEvent.type(screen.getByTestId("preview-first-message-body"), "!");
      await userEvent.click(screen.getByTestId("preview-save"));
      await waitFor(() =>
        expect(screen.getByTestId("preview-send")).toBeDisabled(),
      );
      expect(updateProspect).toHaveBeenCalledTimes(1);

      release({ id: "p1" });
    });
  });

  describe("error", () => {
    it("explains the failure and offers Try again (not Regenerate)", () => {
      setup({ message: null, error: "llm_timeout" });
      expect(screen.getByTestId("preview-error")).toHaveTextContent("llm_timeout");
      // Nothing was written, so "Regenerate" would imply re-spending on a
      // message that never existed.
      expect(screen.getByTestId("preview-regenerate")).toHaveTextContent(
        "Try again",
      );
      expect(screen.getByTestId("preview-send")).toBeDisabled();
    });

    it("retries through onRegenerate", async () => {
      const { onRegenerate } = setup({ message: null, error: "llm_timeout" });
      await userEvent.click(screen.getByTestId("preview-regenerate"));
      expect(onRegenerate).toHaveBeenCalledTimes(1);
    });

    it("says Regenerate when a message DOES exist", () => {
      setup();
      expect(screen.getByTestId("preview-regenerate")).toHaveTextContent(
        "Regenerate",
      );
    });
  });

  describe("channel coverage", () => {
    it.each([
      ["whatsapp", "Send in WhatsApp"],
      ["telegram", "Send in Telegram"],
      ["linkedin", "Send in LinkedIn"],
    ] as const)("labels Send for %s", (channel, label) => {
      setup({ channel });
      expect(screen.getByTestId("preview-send")).toHaveTextContent(label);
    });

    it("warns that LinkedIn can't prefill", () => {
      setup({ channel: "linkedin" });
      expect(screen.getByText(/LinkedIn can't prefill text/i)).toBeInTheDocument();
    });
  });
});
