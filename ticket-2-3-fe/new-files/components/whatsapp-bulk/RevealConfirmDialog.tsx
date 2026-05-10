import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Candidate } from "./CandidateGrid";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: Candidate[];
  onConfirm: () => void;
}

export function RevealConfirmDialog({
  open,
  onOpenChange,
  selected,
  onConfirm,
}: Props) {
  const yes = selected.filter((c) => c.person.directPhoneStatus === "yes").length;
  const maybe = selected.filter((c) => c.person.directPhoneStatus === "maybe").length;
  const totalCredits = yes * 1 + maybe * 8;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="reveal-confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Reveal {selected.length} contact{selected.length === 1 ? "" : "s"}?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                This will spend Apollo credits and create prospect records.
                Apollo credits are not refunded if a reveal fails.
              </p>
              <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Sync reveals (phone cached):</span>
                  <span className="font-mono">
                    {yes} × 1 = {yes} credits
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Async reveals (bulk_match):</span>
                  <span className="font-mono">
                    {maybe} × 8 = {maybe * 8} credits
                  </span>
                </div>
                <div className="flex justify-between border-t pt-1 mt-1 font-medium">
                  <span>Total:</span>
                  <span className="font-mono" data-testid="confirm-total-credits">
                    {totalCredits} credits
                  </span>
                </div>
              </div>
              {maybe > 0 && (
                <p className="text-xs text-muted-foreground">
                  {maybe} async reveal{maybe === 1 ? "" : "s"} will not return
                  immediately. Apollo's webhook delivers the phone number(s)
                  later (typically within minutes); these prospects appear as
                  "phone reveal pending" until then.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-confirm-cancel">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            data-testid="button-confirm-go"
          >
            Reveal &amp; save
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
