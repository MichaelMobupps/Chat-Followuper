import {
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  FileText,
  MessageSquare,
  Send as SendIcon,
  ExternalLink,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useChannelLink } from "@/hooks/use-whatsapp";
import type {
  ProspectListItem,
  ProspectStatus,
  ListProspectsResponse,
} from "@/lib/api/prospects";
import { ApiError } from "@/lib/api";
import { useLocation } from "wouter";

interface Props {
  data: ListProspectsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  page: number;
  perPage: number;
  onPageChange: (page: number) => void;
}

export function ProspectsListTable({
  data,
  isLoading,
  isError,
  error,
  page,
  perPage,
  onPageChange,
}: Props) {
  if (isError) {
    return (
      <Card data-testid="prospects-list-error">
        <CardContent className="p-8 text-center space-y-2">
          <AlertTriangle className="h-6 w-6 text-destructive mx-auto" />
          <div className="text-sm font-medium">Could not load prospects</div>
          <div className="text-xs text-muted-foreground">
            {error?.message ?? "Unknown error"}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading && !data) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
          Loading prospects…
        </CardContent>
      </Card>
    );
  }

  const prospects = data?.prospects ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  if (prospects.length === 0) {
    return (
      <Card data-testid="prospects-list-empty">
        <CardContent className="p-12 text-center space-y-2">
          <FileText className="h-6 w-6 text-muted-foreground mx-auto" />
          <div className="text-sm font-medium">No prospects yet</div>
          <div className="text-xs text-muted-foreground">
            Create some via the Prospect: WhatsApp or Prospect: Telegram pages.
            Or adjust your filters above.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3" data-testid="prospects-list-table">
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-xs">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Name</th>
                  <th className="text-left font-medium px-4 py-2.5">Company / title</th>
                  <th className="text-left font-medium px-4 py-2.5">Country</th>
                  <th className="text-left font-medium px-4 py-2.5">Channel</th>
                  <th className="text-left font-medium px-4 py-2.5">Status</th>
                  <th className="text-left font-medium px-4 py-2.5">Created</th>
                  <th className="text-right font-medium px-4 py-2.5">Action</th>
                </tr>
              </thead>
              <tbody>
                {prospects.map((p) => (
                  <ProspectRow key={p.id} prospect={p} />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div data-testid="pagination-summary">
          Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of{" "}
          {total}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1 || isLoading}
            data-testid="button-prev-page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Prev
          </Button>
          <span className="px-2" data-testid="pagination-current">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages || isLoading}
            data-testid="button-next-page"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProspectRow({ prospect }: { prospect: ProspectListItem }) {
  const [, navigate] = useLocation();
  return (
    <tr
      className="border-b last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer focus-visible:outline-none focus-visible:bg-muted/30 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
      // FE9: rows navigate on click but were keyboard-inaccessible (WCAG 2.1.1).
      // Make the row a focusable button-like control with Enter/Space handling.
      role="button"
      tabIndex={0}
      aria-label={`Open details for ${prospect.prospectName ?? "prospect"}`}
      onClick={(e) => {
        // Don't navigate when the click originated inside the action
        // button cell — that has its own handler (open WhatsApp link
        // mutation, etc). Walk up the event target to the closest <td>
        // and check its data-action attribute.
        const cell = (e.target as HTMLElement).closest("td[data-action]");
        if (cell) return;
        navigate(`/prospects/${prospect.id}`);
      }}
      onKeyDown={(e) => {
        // Only act when the row itself is focused — let controls inside action
        // cells (buttons/links) handle their own Enter/Space.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(`/prospects/${prospect.id}`);
        }
      }}
      data-testid={`row-${prospect.id}`}
    >
      <td className="px-4 py-2.5 align-top">
        <div className="font-medium truncate max-w-xs">
          {prospect.prospectName ?? "(no name)"}
        </div>
      </td>
      <td className="px-4 py-2.5 align-top">
        <div className="truncate max-w-xs">{prospect.company ?? "—"}</div>
        <div className="text-xs text-muted-foreground truncate max-w-xs">
          {prospect.title ?? ""}
        </div>
        {prospect.firstMessageBody && (
          <div
            className="mt-1 flex items-start gap-1 text-xs text-muted-foreground/80 italic max-w-xs"
            title={prospect.firstMessageBody}
          >
            <MessageSquare className="h-3 w-3 flex-shrink-0 mt-0.5" />
            <span className="truncate">{prospect.firstMessageBody}</span>
          </div>
        )}
      </td>
      <td className="px-4 py-2.5 align-top">
        <span className="text-xs">{prospect.country ?? "—"}</span>
      </td>
      <td className="px-4 py-2.5 align-top">
        <span className="text-xs capitalize">
          {prospect.firstMessageChannel ?? "—"}
        </span>
      </td>
      <td className="px-4 py-2.5 align-top">
        <StatusBadge status={prospect.status} />
      </td>
      <td className="px-4 py-2.5 align-top">
        <span className="text-xs text-muted-foreground">
          {formatRelativeDate(prospect.createdAt)}
        </span>
      </td>
      <td className="px-4 py-2.5 align-top text-right" data-action="true">
        <ActionButton prospect={prospect} />
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: ProspectStatus }) {
  const config: Record<
    ProspectStatus,
    { label: string; icon: typeof CheckCircle2; cls: string }
  > = {
    sent: {
      label: "Sent",
      icon: SendIcon,
      cls: "border-blue-500 text-blue-700 dark:text-blue-400",
    },
    ready: {
      label: "Ready",
      icon: CheckCircle2,
      cls: "border-green-500 text-green-700 dark:text-green-400",
    },
    draft: {
      label: "Draft",
      icon: FileText,
      cls: "border-muted-foreground text-muted-foreground",
    },
    "phone-pending": {
      label: "Phone pending",
      icon: Clock,
      cls: "border-amber-500 text-amber-700 dark:text-amber-400",
    },
    "phone-blocked": {
      label: "Geo-blocked",
      icon: XCircle,
      cls: "border-destructive text-destructive",
    },
    "phone-no-match": {
      label: "No phone",
      icon: XCircle,
      cls: "border-destructive text-destructive",
    },
    "phone-expired": {
      label: "Unreachable",
      icon: XCircle,
      cls: "border-destructive text-destructive",
    },
  };
  const c = config[status];
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={`gap-1 text-[10px] ${c.cls}`}>
      <Icon className="h-3 w-3" />
      {c.label}
    </Badge>
  );
}

function ActionButton({ prospect }: { prospect: ProspectListItem }) {
  const { toast } = useToast();
  const { mutate, isPending } = useChannelLink();

  const channel =
    prospect.firstMessageChannel === "telegram" ? "telegram" : "whatsapp";

  if (
    prospect.status === "ready" &&
    (prospect.firstMessageChannel === "whatsapp" ||
      prospect.firstMessageChannel === "telegram")
  ) {
    const label = channel === "telegram" ? "Telegram" : "WhatsApp";
    return (
      <Button
        size="sm"
        disabled={isPending}
        onClick={() =>
          mutate(
            { prospectId: prospect.id, channel },
            {
              onSuccess: (data) => {
                const w = window.open(data.url, "_blank", "noopener,noreferrer");
                if (!w) {
                  toast({
                    title: "Browser blocked the popup",
                    description:
                      "Allow popups for this site, or copy the link manually.",
                    variant: "destructive",
                  });
                }
              },
              onError: (err) => {
                toast({
                  title: `Could not open ${label} link`,
                  description: err.code ?? err.message,
                  variant: "destructive",
                });
              },
            },
          )
        }
        data-testid={`button-action-${prospect.id}`}
      >
        <ExternalLink className="h-3.5 w-3.5 mr-1" />
        Open {label}
      </Button>
    );
  }

  if (prospect.status === "ready") {
    return (
      <Button size="sm" variant="outline" disabled>
        Open ({prospect.firstMessageChannel})
      </Button>
    );
  }

  return <span className="text-xs text-muted-foreground">—</span>;
}

function formatRelativeDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / 86_400_000);
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return d.toLocaleDateString();
  } catch {
    return iso.slice(0, 10);
  }
}
