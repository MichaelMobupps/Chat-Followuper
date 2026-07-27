/**
 * FirstMessagePreviewDialog — generate → preview → confirm for the first message.
 *
 * Before this dialog, first-message generation was INVISIBLE: adding a contact
 * fired prepare-first-message in the background and the SDR never saw the text
 * until it appeared prefilled in the WhatsApp/Telegram composer (LinkedIn: on
 * the clipboard). There was no progress indication and no chance to review.
 *
 * This dialog is the missing step, and it is channel-agnostic — the Contacts
 * page opens it from the WhatsApp, Telegram and LinkedIn tabs alike:
 *
 *   generating → live PrepareProgressBar (queued → researching → writing →
 *                finalizing → ready), driven by the same usePrepareProgress
 *                poll the row bar uses
 *   ready      → the message in an editable textarea + Regenerate / Send
 *   error      → the failure reason + Try again
 *
 * Ownership note: the dialog does NOT own the prepare mutation. The Contacts
 * page does (it holds the single-flight generatingId + the progress poller),
 * and passes state down. This dialog owns exactly one mutation — the PATCH
 * that saves an edited body — mirroring EditFirstMessageDialog.
 *
 * Send semantics: prepareFirstMessage short-circuits on a cached
 * firstMessageBody (`already_ready`, zero LLM spend), so saving an edit and
 * then sending serves the EDITED body and builds the deep link from it. The
 * save is therefore awaited before onSend() — firing both concurrently would
 * race the read in prepare and could send the pre-edit text.
 */
import { useEffect, useState, type ChangeEvent } from "react";
import { Copy, Loader2, RefreshCw, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useUpdateProspect } from "@/hooks/use-prospects";
import { useInvalidateFollowups } from "@/hooks/use-followups";
import { PrepareProgressBar } from "@/components/followup/PrepareProgressBar";
import type {
  ManualIngestChannel,
  PrepareProgress,
} from "@/lib/api/manual-ingest";
import { ApiError } from "@/lib/api";

export interface PreviewTarget {
  id: string;
  prospectName: string | null;
  company: string | null;
}

const CHANNEL_LABEL: Record<ManualIngestChannel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  linkedin: "LinkedIn",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: PreviewTarget | null;
  channel: ManualIngestChannel;
  /** True while the page's prepare mutation is in flight for `target`. */
  isGenerating: boolean;
  /** Live staged progress for `target` (undefined before the first poll). */
  progress: PrepareProgress | undefined;
  /** The generated message, or null while generating / on failure. */
  message: string | null;
  /** Set when generation failed outright (the POST rejected). */
  error: string | null;
  onRegenerate: () => void;
  /**
   * Opens the composer. Awaited so a pending save lands first. Resolves true
   * when the composer actually opened — false (e.g. popup blocked, no deep
   * link) keeps this dialog open so the SDR doesn't lose the message. The
   * page owns the error toast in that case; we stay silent.
   */
  onSend: () => boolean | Promise<boolean>;
}

export function FirstMessagePreviewDialog({
  open,
  onOpenChange,
  target,
  channel,
  isGenerating,
  progress,
  message,
  error,
  onRegenerate,
  onSend,
}: Props) {
  const { toast } = useToast();
  const update = useUpdateProspect();
  const queryClient = useQueryClient();
  const invalidateFollowups = useInvalidateFollowups();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  // AUDIT [Med] — useUpdateProspect.onSuccess only setQueryData's the prospect
  // DETAIL entry; it touches neither ["followups"] nor ["prospects-list"].
  // Without this, "Save for later" toasted success while the follow-ups table
  // and Today kept rendering the pre-edit body from cache. EditFirstMessageDialog
  // invalidates ["followups"] for exactly this reason — match it, and add
  // prospects-list since the Contacts table reads that key.
  function invalidateAfterSave() {
    void invalidateFollowups();
    void queryClient.invalidateQueries({ queryKey: ["prospects-list"] });
  }

  // Re-seed the textarea whenever a NEW message arrives (first generation or a
  // Regenerate). Keyed on target.id too so reopening for a different contact
  // never shows the previous one's text.
  useEffect(() => {
    setBody(message ?? "");
  }, [message, target?.id]);

  if (!target) return null;

  const trimmed = body.trim();
  const changed = message !== null && body !== message;
  // The BE requires a non-empty body (min(1)); block sending an all-blank edit.
  // `update.isPending` matters: without it, clicking "Save for later" (which is
  // fire-and-forget and leaves the dialog open) and then Send fired a SECOND
  // concurrent PATCH of the same body, and the save's onSuccess then closed the
  // dialog out from under the in-flight send.
  const canSend =
    !isGenerating &&
    message !== null &&
    trimmed.length > 0 &&
    !sending &&
    !update.isPending;
  const busy = isGenerating || sending || update.isPending;
  // Clipboard channels (LinkedIn, Telegram) can't reliably prefill the composer,
  // so the SDR pastes the message by hand — give them a visible Copy button on
  // the draft, not just the silent copy that fires on Send. WhatsApp prefills, so
  // it doesn't need one.
  const isClipboardChannel = channel === "linkedin" || channel === "telegram";

  const who = target.prospectName ?? "this contact";
  const where = target.company ? ` from ${target.company}` : "";

  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    try {
      // Persist the edit BEFORE opening the composer — prepare reads the
      // stored body, so an unsaved edit would silently send the old text.
      if (changed) {
        await update.mutateAsync({
          id: target!.id,
          input: { firstMessageBody: body },
        });
        // No invalidateAfterSave() here on purpose: onSend() → the prepare
        // mutation already invalidates ["prospects-list"] + ["followups"] in
        // its own onSuccess, so invalidating here too refetches both lists
        // twice for one click.
      }
      // Only dismiss once the composer is actually open. On a blocked popup
      // the page toasts and we stay put, edit intact.
      if (await onSend()) onOpenChange(false);
    } catch (err) {
      const description =
        err instanceof ApiError
          ? `${err.status} ${err.code ?? err.message}`
          : (err as Error).message;
      toast({
        title: "Could not send",
        description,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  function handleSaveOnly() {
    if (!changed || trimmed.length === 0) return;
    update.mutate(
      { id: target!.id, input: { firstMessageBody: body } },
      {
        onSuccess: () => {
          invalidateAfterSave();
          toast({
            title: "Message saved",
            description: `Draft saved for ${who}. Send it from Contacts when you're ready.`,
          });
          onOpenChange(false);
        },
        onError: (err) => {
          toast({
            title: "Could not save message",
            description:
              err instanceof ApiError
                ? `${err.status} ${err.code ?? err.message}`
                : (err as Error).message,
            variant: "destructive",
          });
        },
      },
    );
  }

  async function handleCopy() {
    const text = body.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Message copied",
        description: `Paste it into ${CHANNEL_LABEL[channel]}.`,
      });
    } catch {
      toast({
        title: "Couldn't copy",
        description: "Select the message text and copy it manually.",
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog
      open={open}
      // Don't let a stray click-outside / Esc dismiss a run in flight — the
      // generation would keep burning spend with its result thrown away.
      onOpenChange={(next) => {
        if (!next && isGenerating) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="sm:max-w-2xl"
        data-testid="first-message-preview-dialog"
        data-generating={isGenerating ? "true" : "false"}
      >
        <DialogHeader>
          <DialogTitle>
            {isGenerating ? "Writing your first message…" : "First message"}
          </DialogTitle>
          <DialogDescription>
            {isGenerating
              ? `Researching ${target.company ?? "the company"} and writing a doctrine message for ${who}. This usually takes under a minute.`
              : `Review or tweak the message for ${who}${where}, then send it in ${CHANNEL_LABEL[channel]}.`}
          </DialogDescription>
        </DialogHeader>

        {isGenerating ? (
          <div className="py-4" data-testid="preview-generating">
            <PrepareProgressBar progress={progress} />
          </div>
        ) : error !== null ? (
          <div className="py-4 space-y-3" data-testid="preview-error">
            <p className="text-sm text-destructive">
              Couldn't write the message — {error}
            </p>
            <p className="text-xs text-muted-foreground">
              The contact was still added. You can try again now, or from the
              Generate button on their row.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="preview-first-message-body">Message</Label>
            <Textarea
              id="preview-first-message-body"
              value={body}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                setBody(e.target.value)
              }
              rows={10}
              // Mirror the BE cap (prospects.ts firstMessageBody max 20000).
              maxLength={20000}
              data-testid="preview-first-message-body"
              placeholder="(no message generated yet)"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {body.length} characters
                {changed ? " · edited" : ""}
              </p>
              {isClipboardChannel ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={() => void handleCopy()}
                  disabled={trimmed.length === 0}
                  data-testid="preview-copy"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy message
                </Button>
              ) : null}
            </div>
            {channel === "linkedin" ? (
              <p className="text-xs text-muted-foreground">
                LinkedIn can't prefill text — copy the message, open the profile,
                and paste it in.
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {!isGenerating ? (
            <Button
              variant="outline"
              onClick={onRegenerate}
              disabled={busy}
              data-testid="preview-regenerate"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              {/* After a failure nothing was written, so "Regenerate" would
                  imply re-spending on a message that doesn't exist. */}
              {error !== null ? "Try again" : "Regenerate"}
            </Button>
          ) : null}
          {!isGenerating && error === null && changed ? (
            <Button
              variant="outline"
              onClick={handleSaveOnly}
              disabled={busy || trimmed.length === 0}
              data-testid="preview-save"
            >
              {update.isPending && !sending ? "Saving…" : "Save for later"}
            </Button>
          ) : null}
          <Button
            onClick={() => void handleSend()}
            disabled={!canSend}
            data-testid="preview-send"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            {changed ? "Save & send" : `Send in ${CHANNEL_LABEL[channel]}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
