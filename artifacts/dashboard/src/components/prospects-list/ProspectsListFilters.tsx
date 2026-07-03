import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type {
  ListProspectsParams,
  ProspectStatus,
  ListChannel,
  ListSortCol,
} from "@/lib/api/prospects";

const STATUS_OPTIONS: { value: ProspectStatus; label: string }[] = [
  { value: "ready", label: "Ready" },
  { value: "draft", label: "Draft" },
  { value: "phone-pending", label: "Phone pending" },
  { value: "sent", label: "Sent" },
  { value: "phone-blocked", label: "Phone blocked" },
  { value: "phone-no-match", label: "No phone" },
  { value: "phone-expired", label: "Unreachable" },
];

const CHANNEL_OPTIONS: { value: ListChannel; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
  { value: "teams", label: "Teams" },
];

const SORT_OPTIONS: { value: ListSortCol; label: string }[] = [
  { value: "createdAt", label: "Created" },
  { value: "updatedAt", label: "Updated" },
  { value: "prospectName", label: "Name" },
];

interface Props {
  params: ListProspectsParams;
  onChange: (next: ListProspectsParams) => void;
}

export function ProspectsListFilters({ params, onChange }: Props) {
  // FE12: debounce the free-text search so we don't fire a backend query on
  // every keystroke. Local state keeps typing responsive; the committed
  // `search` param (which triggers the fetch) updates 300ms after the last
  // keystroke. Kept in sync when `params.search` changes externally (clearAll).
  const [searchInput, setSearchInput] = useState(params.search ?? "");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSearchInput(params.search ?? "");
  }, [params.search]);

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  function onSearchChange(value: string) {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      patch("search", value || undefined);
    }, 300);
  }

  function patch<K extends keyof ListProspectsParams>(
    key: K,
    value: ListProspectsParams[K] | undefined,
  ) {
    const next = { ...params };
    if (value === undefined || value === null || value === "") {
      delete next[key];
    } else {
      next[key] = value;
    }
    // Whenever a filter changes, reset to page 1 — keeping the user on
    // page 5 of a now-narrower result set is disorienting.
    if (key !== "page" && key !== "perPage" && key !== "sortBy" && key !== "sortDir") {
      next.page = 1;
    }
    onChange(next);
  }

  function clearAll() {
    onChange({});
  }

  const hasFilters =
    params.status ||
    params.channel ||
    params.country ||
    params.search ||
    (params.sortBy && params.sortBy !== "createdAt") ||
    (params.sortDir && params.sortDir !== "desc");

  return (
    <Card data-testid="prospects-filters">
      <CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-4 space-y-1.5">
            <Label htmlFor="filter-search" className="text-xs">
              Search
            </Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                id="filter-search"
                placeholder="name, company"
                value={searchInput}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-7"
                data-testid="input-search"
              />
            </div>
          </div>

          <div className="md:col-span-3 space-y-1.5">
            <Label htmlFor="filter-status" className="text-xs">
              Status
            </Label>
            <select
              id="filter-status"
              value={params.status ?? ""}
              onChange={(e) =>
                patch("status", (e.target.value || undefined) as ProspectStatus | undefined)
              }
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              data-testid="select-status"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2 space-y-1.5">
            <Label htmlFor="filter-channel" className="text-xs">
              Channel
            </Label>
            <select
              id="filter-channel"
              value={params.channel ?? ""}
              onChange={(e) =>
                patch("channel", (e.target.value || undefined) as ListChannel | undefined)
              }
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              data-testid="select-channel"
            >
              <option value="">All</option>
              {CHANNEL_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-1 space-y-1.5">
            <Label htmlFor="filter-country" className="text-xs">
              Country
            </Label>
            <Input
              id="filter-country"
              placeholder="IN"
              maxLength={2}
              value={params.country ?? ""}
              onChange={(e) =>
                patch("country", e.target.value.toUpperCase() || undefined)
              }
              data-testid="input-country"
            />
          </div>

          <div className="md:col-span-2 space-y-1.5">
            <Label htmlFor="filter-sort" className="text-xs">
              Sort by
            </Label>
            <div className="flex gap-1.5">
              <select
                id="filter-sort"
                value={params.sortBy ?? "createdAt"}
                onChange={(e) => patch("sortBy", e.target.value as ListSortCol)}
                className="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
                data-testid="select-sort"
              >
                {SORT_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="px-2"
                onClick={() =>
                  patch(
                    "sortDir",
                    (params.sortDir ?? "desc") === "desc" ? "asc" : "desc",
                  )
                }
                data-testid="button-sort-dir"
              >
                {(params.sortDir ?? "desc") === "desc" ? "↓" : "↑"}
              </Button>
            </div>
          </div>
        </div>

        {hasFilters && (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAll}
              data-testid="button-clear-filters"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Clear filters
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
