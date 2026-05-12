/**
 * Status badge — Ticket 2.5-FE.
 * Maps the BE-derived `uiStatus` to a small colored badge.
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  not_yet_sent: {
    label: "Not yet sent",
    className: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  },
  sent: {
    label: "Sent",
    className: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  },
  replied: {
    label: "Replied",
    className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  },
  no_reply: {
    label: "No reply",
    className: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  },
  paused: {
    label: "Paused",
    className: "bg-zinc-200 text-zinc-700 hover:bg-zinc-200",
  },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_STYLES[status] ?? {
    label: status,
    className: "bg-slate-100 text-slate-700",
  };
  return (
    <Badge
      variant="secondary"
      className={cn("font-normal", cfg.className)}
      data-testid={`status-${status}`}
    >
      {cfg.label}
    </Badge>
  );
}
