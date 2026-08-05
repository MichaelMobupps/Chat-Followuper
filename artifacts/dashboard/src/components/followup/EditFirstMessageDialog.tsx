/**
 * Edit-first-message dialog (edit-before-send).
 *
 * A not-yet-sent prospect has NO follow-up rows yet — follow-ups are only
 * seeded after the first message is sent (scheduleFollowupsAfterFirstSend).
 * So the follow-up list's per-row Edit (pencil) had nothing to open and was a
 * dead button in that state. But the prospect DOES already carry a generated
 * first message (shown in the row's "Message preview"), and the SDR reasonably
 * wants to review / tweak it before it goes out.
 *
 * This dialog edits that first message directly — `prospects.firstMessageBody`
 * via PATCH /prospects/:id (UpdateProspectInput already admits the field). It
 * invalidates the ["followups"] cache on success so the row preview refreshes.
 *
 * Once follow-ups exist, the pencil edits those instead (EditFollowupDialog);
 * this dialog is strictly the pre-first-send path.
 */
import { useEffect, useState, type ChangeEvent } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { useUpdateProspect } from "@/hooks/use-prospects";
import { useInvalidateFollowups } from "@/hooks/use-followups";
import type { FollowupListProspect } from "@/lib/api/followups";
import { ApiError } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospect: FollowupListProspect | null;
}

export function EditFirstMessageDialog({ open, onOpenChange, prospect }: Props) {
  const { toast } = useToast();
  const update = useUpdateProspect();
  const invalidateFollowups = useInvalidateFollowups();

  const [body, setBody] = useState("");

  useEffect(() => {
    if (prospect) setBody(prospect.firstMessageBody ?? "");
  }, [prospect]);

  if (!prospect) return null;

  const initialBody = prospect.firstMessageBody ?? "";
  // Trim-compare so pure whitespace edits don't enable Save; the BE requires
  // a non-empty body (min(1)), so also block saving an all-blank message.
  const trimmed = body.trim();
  const changed = body !== initialBody;
  const canSave = changed && trimmed.length > 0;

  function handleSave() {
    const p = prospect;
    if (!p || !canSave) return;

    update.mutate(
      { id: p.id, input: { firstMessageBody: body } },
      {
        onSuccess: () => {
          void invalidateFollowups();
          toast({
            title: "Message updated",
            description: `First message saved for ${
              p.prospectName ?? "this prospect"
            }.`,
          });
          onOpenChange(false);
        },
        onError: (err) => {
          const description =
            err instanceof ApiError
              ? `${err.status} ${err.code ?? err.message}`
              : (err as Error).message;
          toast({ title: "Could not save message", description });
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        data-testid="edit-first-message-dialog"
      >
        <DialogHeader>
          <DialogTitle>Edit first message</DialogTitle>
          <DialogDescription>
            Review or tweak the generated first message before it goes out.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="edit-first-message-body">Message</Label>
          <Textarea
            id="edit-first-message-body"
            value={body}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
              setBody(e.target.value)
            }
            rows={10}
            // Mirror the BE cap (prospects.ts firstMessageBody max 20000) so a
            // long paste is capped client-side instead of round-tripping to a 400.
            maxLength={20000}
            data-testid="edit-first-message-body"
            placeholder="(no message generated yet)"
          />
          <p className="text-xs text-muted-foreground">
            {body.length} characters
          </p>
          {/* The first message isn't sent from the follow-up page — send-next
              needs a scheduled follow-up, which only exists after the first
              send. Set expectations so the edit doesn't dead-end here. */}
          <p className="text-xs text-muted-foreground">
            This is the first message. Your edit is saved now — send it from{" "}
            <span className="font-medium text-foreground">Today</span> or{" "}
            <span className="font-medium text-foreground">Contacts</span>.
            Follow-ups are scheduled automatically after the first send.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={update.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave || update.isPending}
            data-testid="edit-first-message-save"
          >
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
