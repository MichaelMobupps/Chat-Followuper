/**
 * Edit-followup dialog — Ticket 2.5-FE.
 *
 * PATCHes a single followup. Empty fields are not sent (server treats
 * absence as "leave alone"). At least one field must be provided
 * before the Save button enables.
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { usePatchFollowup } from "@/hooks/use-followups";
import {
  FOLLOWUP_EDITABLE_STATUSES,
  type Followup,
  type FollowupEditableStatus,
  type PatchFollowupInput,
} from "@/lib/api/followups";
import { ApiError } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  followup: Followup | null;
}

/**
 * Convert an ISO timestamp to the value format expected by
 * <input type="datetime-local"> (YYYY-MM-DDTHH:mm, no seconds, no tz).
 * Returns the empty string when input is null/invalid.
 */
function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/**
 * Convert a datetime-local value (local time, no tz) back to an ISO
 * string with the user's offset. The BE schema requires offset-bearing
 * ISO (z.string().datetime({ offset: true })).
 */
function datetimeLocalToIso(value: string): string {
  // new Date(value) parses local time when the string lacks a 'Z' / offset.
  const d = new Date(value);
  return d.toISOString();
}

export function EditFollowupDialog({ open, onOpenChange, followup }: Props) {
  const { toast } = useToast();
  const patchMutation = usePatchFollowup();

  const [body, setBody] = useState("");
  const [scheduled, setScheduled] = useState("");
  const [status, setStatus] = useState<FollowupEditableStatus | "">("");

  useEffect(() => {
    if (followup) {
      setBody(followup.generatedMessage ?? "");
      setScheduled(isoToDatetimeLocal(followup.scheduledAt));
      setStatus(
        FOLLOWUP_EDITABLE_STATUSES.includes(
          followup.status as FollowupEditableStatus,
        )
          ? (followup.status as FollowupEditableStatus)
          : "",
      );
    }
  }, [followup]);

  if (!followup) return null;

  const initialBody = followup.generatedMessage ?? "";
  const initialScheduled = isoToDatetimeLocal(followup.scheduledAt);
  const initialStatus = followup.status;

  const changedBody = body !== initialBody;
  const changedScheduled = scheduled !== initialScheduled;
  // Use length-based check instead of `status !== ""`. TS narrows the
  // literal `""` away from the union after the captured `changedStatus`
  // is read inside a closure, which broke the second `!== ""` check on
  // line 110. `.length > 0` reads back as `boolean` and side-steps the
  // narrowing tangle.
  const statusIsSet = status.length > 0;
  const changedStatus = statusIsSet && status !== initialStatus;
  const anyChange = changedBody || changedScheduled || changedStatus;

  function handleSave() {
    // Local non-null copy. The early `if (!followup) return null` at
    // the top of the component narrows the JSX path but TS does not
    // carry that narrowing into closures captured from this scope.
    const fu = followup;
    if (!fu) return;

    const patch: PatchFollowupInput = {};
    if (changedBody) patch.generatedMessage = body;
    if (changedScheduled && scheduled) {
      patch.scheduledAt = datetimeLocalToIso(scheduled);
    }
    if (changedStatus && status.length > 0) {
      patch.status = status as FollowupEditableStatus;
    }

    if (Object.keys(patch).length === 0) {
      onOpenChange(false);
      return;
    }

    patchMutation.mutate(
      { followupId: fu.id, input: patch },
      {
        onSuccess: () => {
          toast({
            title: "Follow-up updated",
            description: `Stage ${fu.stage} saved.`,
          });
          onOpenChange(false);
        },
        onError: (err) => {
          const description =
            err instanceof ApiError
              ? `${err.status} ${err.code ?? err.message}`
              : (err as Error).message;
          toast({
            title: "Could not save follow-up",
            description,
          });
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        data-testid="edit-followup-dialog"
      >
        <DialogHeader>
          <DialogTitle>Edit stage {followup.stage} follow-up</DialogTitle>
          <DialogDescription>
            Adjust the message body, the scheduled send time, or the status.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-followup-body">Message</Label>
            <Textarea
              id="edit-followup-body"
              value={body}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                setBody(e.target.value)
              }
              rows={8}
              data-testid="edit-followup-body"
              placeholder="(no message generated yet)"
            />
            <p className="text-xs text-muted-foreground">
              {body.length} characters
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-followup-scheduled">Scheduled at</Label>
              <Input
                id="edit-followup-scheduled"
                type="datetime-local"
                value={scheduled}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setScheduled(e.target.value)
                }
                data-testid="edit-followup-scheduled"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-followup-status">Status</Label>
              <Select
                value={status === "" ? initialStatus : status}
                onValueChange={(v) =>
                  setStatus(v as FollowupEditableStatus)
                }
              >
                <SelectTrigger
                  id="edit-followup-status"
                  data-testid="edit-followup-status"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOLLOWUP_EDITABLE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={patchMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!anyChange || patchMutation.isPending}
            data-testid="edit-followup-save"
          >
            {patchMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
