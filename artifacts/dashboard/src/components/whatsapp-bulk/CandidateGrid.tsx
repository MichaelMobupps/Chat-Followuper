import { useMemo, useState } from "react";
import { Phone, Mail, Linkedin, ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type {
  ApolloOrgSummary,
  ApolloPersonSummary,
} from "@/lib/api/apollo";

const REVEAL_COST_YES = 8;
const REVEAL_COST_MAYBE = 8;

export interface Candidate {
  person: ApolloPersonSummary;
  org: ApolloOrgSummary;
  sourceUrl: string;
}

interface Props {
  candidates: Candidate[];
  onBack: () => void;
  onConfirm: (selected: Candidate[]) => void;
}

interface Filters {
  hideNoPhone: boolean;
  showMaybe: boolean;
  hasEmail: boolean;
  search: string;
  country: string;
}

export function CandidateGrid({ candidates, onBack, onConfirm }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>({
    hideNoPhone: true,
    showMaybe: false,
    hasEmail: true,
    search: "",
    country: "",
  });

  const countries = useMemo(() => {
    const set = new Set<string>();
    for (const c of candidates) {
      if (c.person.country) set.add(c.person.country);
    }
    return Array.from(set).sort();
  }, [candidates]);

  const filtered = useMemo(() => {
    return candidates.filter((c) => {
      const p = c.person;
      if (filters.hideNoPhone && p.directPhoneStatus === "no") return false;
      if (!filters.showMaybe && p.directPhoneStatus === "maybe") return false;
      if (filters.hasEmail && !p.hasEmail) return false;
      if (filters.country && p.country !== filters.country) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hay = [
          p.firstName ?? "",
          p.lastNameObfuscated ?? "",
          p.title ?? "",
          c.org.name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [candidates, filters]);

  // Selectable = filtered rows that aren't no-phone. Apollo charges 8c
  // per reveal regardless, so revealing a "no" candidate is pure waste —
  // they're rendered for visibility (when hideNoPhone toggle is OFF) but
  // not selectable.
  const selectable = useMemo(
    () => filtered.filter((c) => c.person.directPhoneStatus !== "no"),
    [filtered],
  );

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const allSelectableSelected = selectable.every((c) => prev.has(c.person.id));
      const next = new Set(prev);
      if (allSelectableSelected) {
        for (const c of selectable) next.delete(c.person.id);
      } else {
        for (const c of selectable) next.add(c.person.id);
      }
      return next;
    });
  }

  const selectedCandidates = useMemo(
    () =>
      candidates.filter(
        (c) =>
          selected.has(c.person.id) &&
          c.person.directPhoneStatus !== "no" &&
          c.person.existingProspectId == null,
      ),
    [candidates, selected],
  );

  const cost = useMemo(() => {
    let yesCount = 0,
      maybeCount = 0,
      freeCount = 0;
    for (const c of selectedCandidates) {
      // existingPhone takes precedence — these candidates skip reveal
      // paths in processOne, contributing zero to credit cost.
      if (c.person.existingPhone) freeCount++;
      else if (c.person.directPhoneStatus === "yes") yesCount++;
      else if (c.person.directPhoneStatus === "maybe") maybeCount++;
    }
    return {
      yes: yesCount,
      maybe: maybeCount,
      free: freeCount,
      total: yesCount * REVEAL_COST_YES + maybeCount * REVEAL_COST_MAYBE,
    };
  }, [selectedCandidates]);

  const canConfirm = selectedCandidates.length > 0;

  return (
    <section className="space-y-4" data-testid="candidate-grid">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Pick contacts</h2>
          <p className="text-xs text-muted-foreground">
            {filtered.length} of {candidates.length} candidates · select to
            reveal
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          data-testid="button-grid-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </header>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="grid-search" className="text-xs">
                Search
              </Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  id="grid-search"
                  placeholder="name, title, company"
                  value={filters.search}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                  className="pl-7"
                  data-testid="input-grid-search"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grid-country" className="text-xs">
                Country
              </Label>
              <select
                id="grid-country"
                value={filters.country}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, country: e.target.value }))
                }
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                data-testid="select-country"
              >
                <option value="">All countries</option>
                {countries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col justify-between space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="hide-no" className="text-xs cursor-pointer">
                  Hide no-phone
                </Label>
                <Switch
                  id="hide-no"
                  checked={filters.hideNoPhone}
                  onCheckedChange={(v) =>
                    setFilters((f) => ({ ...f, hideNoPhone: v }))
                  }
                  data-testid="switch-hide-no"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="show-maybe" className="text-xs cursor-pointer">
                  Show "maybe" (8 credits)
                </Label>
                <Switch
                  id="show-maybe"
                  checked={filters.showMaybe}
                  onCheckedChange={(v) =>
                    setFilters((f) => ({ ...f, showMaybe: v }))
                  }
                  data-testid="switch-show-maybe"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="has-email" className="text-xs cursor-pointer">
                  Has email
                </Label>
                <Switch
                  id="has-email"
                  checked={filters.hasEmail}
                  onCheckedChange={(v) =>
                    setFilters((f) => ({ ...f, hasEmail: v }))
                  }
                  data-testid="switch-has-email"
                />
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground border-t pt-2 leading-relaxed">
            <span className="font-medium text-green-700 dark:text-green-400">yes</span>{" "}
            = Apollo has this phone (high success on reveal).{" "}
            <span className="font-medium text-amber-700 dark:text-amber-400">maybe</span>{" "}
            = Apollo will search async (lower success, same 8c cost). Both
            non-refundable. Hover badges for detail.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="border-b px-4 py-2 flex items-center gap-3 text-xs">
            <Checkbox
              checked={
                selectable.length > 0 &&
                selectable.every((c) => selected.has(c.person.id))
              }
              onCheckedChange={toggleAllVisible}
              disabled={selectable.length === 0}
              data-testid="checkbox-select-all"
            />
            <span className="text-muted-foreground">
              Select all selectable ({selectable.length}
              {selectable.length !== filtered.length
                ? ` of ${filtered.length}, ${filtered.length - selectable.length} no-phone skipped`
                : ""}
              )
            </span>
          </div>
          <div className="max-h-[480px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-12">
                No candidates match the current filters.
              </div>
            ) : (
              filtered.map((c) => (
                <CandidateRow
                  key={c.person.id}
                  candidate={c}
                  selected={selected.has(c.person.id)}
                  onToggle={() => toggleOne(c.person.id)}
                />
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 bg-background border-t pt-3 -mx-8 px-8 pb-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-0.5">
            <p className="text-sm font-medium" data-testid="selection-summary">
              {selectedCandidates.length} selected
              {selectedCandidates.length > 0 && (
                <>
                  {" · "}
                  <span className="text-muted-foreground font-normal">
                    Est. {cost.total} credits ({cost.yes + cost.maybe}{" "}
                    × {REVEAL_COST_YES}c, non-refundable
                    {cost.free > 0
                      ? ` · ${cost.free} already revealed (free)`
                      : ""}
                    )
                  </span>
                </>
              )}
            </p>
          </div>
          <Button
            disabled={!canConfirm}
            onClick={() => onConfirm(selectedCandidates)}
            data-testid="button-confirm-reveal"
          >
            Reveal & save {selectedCandidates.length || ""}
          </Button>
        </div>
      </div>
    </section>
  );
}

function CandidateRow({
  candidate,
  selected,
  onToggle,
}: {
  candidate: Candidate;
  selected: boolean;
  onToggle: () => void;
}) {
  const { person, org } = candidate;
  const noPhone = person.directPhoneStatus === "no";
  const isAlreadyProspect = person.existingProspectId != null;
  const notSelectable = noPhone || isAlreadyProspect;
  const notSelectableReason = isAlreadyProspect
    ? "Already a prospect — already in your list"
    : noPhone
    ? "Apollo has no phone for this person — not selectable"
    : undefined;
  const displayName =
    [person.firstName, person.lastNameObfuscated].filter(Boolean).join(" ") ||
    person.name ||
    "(no name)";
  return (
    <div
      className={
        notSelectable
          ? "flex items-start gap-3 px-4 py-2.5 border-b last:border-b-0 opacity-60 cursor-not-allowed"
          : `flex items-start gap-3 px-4 py-2.5 border-b last:border-b-0 hover-elevate cursor-pointer ${
              selected ? "bg-accent/40" : ""
            }`
      }
      onClick={notSelectable ? undefined : onToggle}
      data-testid={`candidate-row-${person.id}`}
      title={notSelectableReason}
    >
      <Checkbox
        checked={selected && !notSelectable}
        onCheckedChange={notSelectable ? undefined : onToggle}
        onClick={(e) => e.stopPropagation()}
        className="mt-1"
        disabled={notSelectable}
        data-testid={`checkbox-${person.id}`}
      />
      <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-3">
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{displayName}</div>
          <div className="text-xs text-muted-foreground truncate">
            {person.title ?? "(no title)"}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-sm truncate">{org.name ?? "(no company)"}</div>
          <div className="text-xs text-muted-foreground truncate">
            {[person.city, person.country].filter(Boolean).join(", ")}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <PhoneBadge
            status={person.directPhoneStatus}
            existingPhone={person.existingPhone}
          />
          {person.hasEmail && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Mail className="h-3 w-3" />
              email
            </Badge>
          )}
          {person.linkedinUrl && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Linkedin className="h-3 w-3" />
              li
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function PhoneBadge({
  status,
  existingPhone,
}: {
  status: "yes" | "maybe" | "no";
  existingPhone: string | null;
}) {
  // existingPhone takes precedence over status — Apollo already revealed
  // this contact in our account, no credit cost on use.
  if (existingPhone) {
    return (
      <Badge
        variant="outline"
        className="gap-1 text-[10px] border-emerald-500 text-emerald-700 dark:text-emerald-400"
        title="Apollo has this phone already revealed in your account — free to use, no credit charge"
      >
        <Phone className="h-3 w-3" />
        ready (free)
      </Badge>
    );
  }
  if (status === "yes") {
    return (
      <Badge
        variant="outline"
        className="gap-1 text-[10px] border-green-500 text-green-700 dark:text-green-400"
        title="Apollo has this phone in their DB — high success rate on reveal"
      >
        <Phone className="h-3 w-3" />
        yes ({REVEAL_COST_YES}c)
      </Badge>
    );
  }
  if (status === "maybe") {
    return (
      <Badge
        variant="outline"
        className="gap-1 text-[10px] border-amber-500 text-amber-700 dark:text-amber-400"
        title="Apollo doesn't have this phone — will search async, lower success rate, same 8c cost"
      >
        <Phone className="h-3 w-3" />
        maybe ({REVEAL_COST_MAYBE}c)
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 text-[10px] text-muted-foreground"
      title="Apollo has no phone for this person and will not search"
    >
      <Phone className="h-3 w-3" />
      no
    </Badge>
  );
}
