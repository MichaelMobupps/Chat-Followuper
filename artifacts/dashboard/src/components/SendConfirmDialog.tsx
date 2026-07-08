import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  recordSendIntent,
  type SendIntentChannel,
} from "@/lib/api/whatsapp";

export type PendingSendConfirm = {
  prospectId: string;
  followupId: number | null;
  channel: SendIntentChannel;
};

type SendConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: PendingSendConfirm | null;
  bulkMode?: boolean;
  onRecorded?: () => void;
  onError?: (message: string) => void;
};

export function SendConfirmDialog({
  open,
  onOpenChange,
  pending,
  bulkMode = false,
  onRecorded,
  onError,
}: SendConfirmDialogProps) {
  const [recording, setRecording] = useState(false);

  async function handleConfirmSent() {
    if (bulkMode || !pending) {
      onOpenChange(false);
      return;
    }

    setRecording(true);
    try {
      await recordSendIntent(pending.prospectId, {
        followupId: pending.followupId,
        channel: pending.channel,
      });
      onRecorded?.();
      onOpenChange(false);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Could not record send");
    } finally {
      setRecording(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (recording) return;
    onOpenChange(next);
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {bulkMode
              ? "Press Send in each chat"
              : "Did you press Send in the app?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {/* F-A: LinkedIn is clipboard-only (no prefill) — the copy is
                channel-specific so it isn't misleading. */}
            {pending?.channel === "linkedin"
              ? bulkMode
                ? "Each LinkedIn profile opened and the message was copied. Followuper only tracks delivery after you paste it and send in LinkedIn for each contact."
                : "The LinkedIn profile opened and the message was copied. Followuper only tracks delivery after you paste it and send in LinkedIn."
              : bulkMode
                ? "Each chat opened with your message prefilled. Followuper only tracks delivery after you tap Send in WhatsApp or Telegram for each contact."
                : "The chat opened with your message prefilled. Followuper only tracks delivery after you tap Send in WhatsApp or Telegram."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {bulkMode ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Got it
            </Button>
          ) : (
            <>
              <AlertDialogCancel disabled={recording}>Not yet</AlertDialogCancel>
              <Button
                type="button"
                disabled={recording || !pending}
                onClick={() => void handleConfirmSent()}
              >
                {recording ? "Saving…" : "Yes, I sent it"}
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}