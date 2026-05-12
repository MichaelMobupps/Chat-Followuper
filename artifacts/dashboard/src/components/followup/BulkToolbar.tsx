/**
 * Bulk toolbar — Ticket 2.5-FE.
 *
 * Shown above the row list when one or more rows are selected, plus an
 * always-visible "Archive all in current filter" action when the
 * filter status is one of replied / no_reply / paused (the BE-allowed
 * filter targets for the mode:"filter" bulk archive).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/hooks/use-toast";
import {
  useBulkArchiveFollowups,
  useBulkPauseProspects,
} from "@/hooks/use-followups";
import {
  type ListStatus,
  type SupportedChannel,
} from "@/lib/api/followups";
import { ApiError } from "@/lib/api";
import { Pause, Play, Trash2, ListChecks } from "lucide-react";

interface Props {
  channel: SupportedChannel;
  status: ListStatus;
  selectedProspectIds: string[];
  onClearSelection: () => void;
}

const FILTER_ARCHIVABLE: ReadonlySet<ListStatus> = new Set<ListStatus>([
  "replied",
  "no_reply",
  "paused",
]);

export function BulkToolbar({
  channel,
  status,
  selectedProspectIds,
  onClearSelection,
}: Props) {
  const { toast } = useToast();
  const bulkPause = useBulkPauseProspects();
  const bulkArchive = useBulkArchiveFollowups();
  const [confirmAction, setConfirmAction] = useState<
    null | "archive_selected" | "archive_filter"
  >(null);

  const hasSelection = selectedProspectIds.length > 0;
  const canArchiveFilter = FILTER_ARCHIVABLE.has(status);

  function runPause(paused: boolean) {
    if (selectedProspectIds.length === 0) return;
    bulkPause.mutate(
      { prospectIds: selectedProspectIds, paused },
      {
        onSuccess: (data) => {
          toast({
            title: paused ? "Paused" : "Resumed",
            description: `${data.updated} prospect(s) updated.`,
          });
          onClearSelection();
        },
        onError: (err) => {
          toast({
            title: "Bulk update failed",
            description:
              err instanceof ApiError
                ? `${err.status} ${err.code ?? err.message}`
                : (err as Error).message,
          });
        },
      },
    );
  }

  function runArchiveSelected() {
    if (selectedProspectIds.length === 0) return;
    bulkArchive.mutate(
      { mode: "prospect_ids", prospectIds: selectedProspectIds },
      {
        onSuccess: (data) => {
          toast({
            title: "Archived",
            description: `${data.archived} prospect(s) deleted.`,
          });
          onClearSelection();
          setConfirmAction(null);
        },
        onError: (err) => {
          toast({
            title: "Archive failed",
            description:
              err instanceof ApiError
                ? `${err.status} ${err.code ?? err.message}`
                : (err as Error).message,
          });
          setConfirmAction(null);
        },
      },
    );
  }

  function runArchiveFilter() {
    if (!canArchiveFilter) return;
    bulkArchive.mutate(
      {
        mode: "filter",
        channel,
        filter: status as "replied" | "no_reply" | "paused",
      },
      {
        onSuccess: (data) => {
          toast({
            title: "Archived",
            description: `${data.archived} prospect(s) deleted from the current filter.`,
          });
          onClearSelection();
          setConfirmAction(null);
        },
        onError: (err) => {
          toast({
            title: "Archive failed",
            description:
              err instanceof ApiError
                ? `${err.status} ${err.code ?? err.message}`
                : (err as Error).message,
          });
          setConfirmAction(null);
        },
      },
    );
  }

  const busy = bulkPause.isPending || bulkArchive.isPending;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm"
      data-testid="bulk-toolbar"
    >
      <div className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-muted-foreground" />
        <span>
          {hasSelection
            ? `${selectedProspectIds.length} selected`
            : "Select rows to act in bulk"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => runPause(true)}
          disabled={!hasSelection || busy}
          data-testid="bulk-pause"
        >
          <Pause className="h-3.5 w-3.5 mr-1.5" />
          Pause
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => runPause(false)}
          disabled={!hasSelection || busy}
          data-testid="bulk-resume"
        >
          <Play className="h-3.5 w-3.5 mr-1.5" />
          Resume
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setConfirmAction("archive_selected")}
          disabled={!hasSelection || busy}
          data-testid="bulk-archive-selected"
        >
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          Archive selected
        </Button>

        {canArchiveFilter && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirmAction("archive_filter")}
            disabled={busy}
            data-testid="bulk-archive-filter"
          >
            Archive all {status.replace("_", " ")}
          </Button>
        )}
      </div>

      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "archive_filter"
                ? `Archive all "${status.replace("_", " ")}" prospects?`
                : `Archive ${selectedProspectIds.length} prospect(s)?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This is a hard delete. Follow-ups and conversation history for
              these prospects are removed too. There is no undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={
                confirmAction === "archive_filter"
                  ? runArchiveFilter
                  : runArchiveSelected
              }
              disabled={busy}
            >
              {busy ? "Archiving…" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
