import { useState } from "react";
import { Users } from "lucide-react";
import { useProspectsList } from "@/hooks/use-prospects-list";
import { ProspectsListFilters } from "@/components/prospects-list/ProspectsListFilters";
import { ProspectsListTable } from "@/components/prospects-list/ProspectsListTable";
import type { ListProspectsParams } from "@/lib/api/prospects";

const DEFAULT_PARAMS: ListProspectsParams = {
  page: 1,
  perPage: 25,
  sortBy: "createdAt",
  sortDir: "desc",
};

export default function ProspectsPage() {
  const [params, setParams] = useState<ListProspectsParams>(DEFAULT_PARAMS);
  const query = useProspectsList(params);

  const total = query.data?.total ?? 0;

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          <span>Prospects</span>
        </div>
        <h1
          className="text-2xl font-semibold tracking-tight"
          data-testid="page-title"
        >
          Prospects
        </h1>
        <p className="text-sm text-muted-foreground">
          Everyone you've sourced — phones revealed, messages drafted, ready or
          waiting on async reveal.{" "}
          <span data-testid="page-total">
            {total > 0 ? `${total} total.` : ""}
          </span>
        </p>
      </header>

      <ProspectsListFilters params={params} onChange={setParams} />

      <ProspectsListTable
        data={query.data}
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        page={params.page ?? 1}
        perPage={params.perPage ?? 25}
        onPageChange={(p) => setParams((prev) => ({ ...prev, page: p }))}
      />
    </section>
  );
}
