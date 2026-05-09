import { useState } from "react";
import {
  Search,
  Loader2,
  ArrowLeft,
  Building2,
  User,
  Mail,
  Phone,
  Linkedin,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  useSearchOrg,
  useSearchPeople,
  useRevealContact,
} from "@/hooks/use-apollo";
import type {
  ApolloOrgSummary,
  ApolloPersonSummary,
  ApolloRevealedContact,
} from "@/lib/api/apollo";

type Stage =
  | { name: "brand-search" }
  | { name: "org-list"; orgs: ApolloOrgSummary[] }
  | { name: "people-list"; org: ApolloOrgSummary; people: ApolloPersonSummary[] }
  | { name: "reveal-confirm"; org: ApolloOrgSummary; person: ApolloPersonSummary }
  | {
      name: "revealed";
      org: ApolloOrgSummary;
      person: ApolloPersonSummary;
      contact: ApolloRevealedContact;
    };

export interface ApolloDiscoveryResult {
  contact: ApolloRevealedContact;
  org: ApolloOrgSummary;
  person: ApolloPersonSummary;
}

interface Props {
  onComplete: (result: ApolloDiscoveryResult) => void;
  onCancel: () => void;
}

/**
 * 3-stage Apollo picker rendered inside a Dialog from the parent.
 * On reveal-confirm, the `Use this contact` action emits an
 * ApolloDiscoveryResult and the parent is responsible for closing the
 * dialog and pre-filling the seeder form.
 */
export function ApolloPicker({ onComplete, onCancel }: Props) {
  const [stage, setStage] = useState<Stage>({ name: "brand-search" });
  const [brand, setBrand] = useState("");
  const [country, setCountry] = useState("");
  const [titlesInput, setTitlesInput] = useState("");

  const searchOrg = useSearchOrg();
  const searchPeople = useSearchPeople();
  const reveal = useRevealContact();

  function handleSearchOrg() {
    if (!brand.trim()) return;
    searchOrg.mutate(
      {
        brand: brand.trim(),
        country: country.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          setStage({ name: "org-list", orgs: data.orgs });
        },
      },
    );
  }

  function handlePickOrg(org: ApolloOrgSummary) {
    const titles = titlesInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    searchPeople.mutate(
      { orgId: org.id, titles: titles.length > 0 ? titles : undefined },
      {
        onSuccess: (data) => {
          setStage({ name: "people-list", org, people: data.people });
        },
      },
    );
  }

  function handlePickPerson(person: ApolloPersonSummary) {
    if (stage.name !== "people-list") return;
    setStage({ name: "reveal-confirm", org: stage.org, person });
  }

  function handleConfirmReveal() {
    if (stage.name !== "reveal-confirm") return;
    const { org, person } = stage;
    reveal.mutate(person.id, {
      onSuccess: (data) => {
        setStage({
          name: "revealed",
          org,
          person,
          contact: data.contact,
        });
      },
    });
  }

  function handleUseContact() {
    if (stage.name !== "revealed") return;
    onComplete({ contact: stage.contact, org: stage.org, person: stage.person });
  }

  function back() {
    if (stage.name === "org-list") setStage({ name: "brand-search" });
    else if (stage.name === "people-list")
      setStage({ name: "org-list", orgs: searchOrg.data?.orgs ?? [] });
    else if (stage.name === "reveal-confirm")
      setStage({
        name: "people-list",
        org: stage.org,
        people: searchPeople.data?.people ?? [],
      });
    else if (stage.name === "revealed")
      setStage({
        name: "reveal-confirm",
        org: stage.org,
        person: stage.person,
      });
  }

  return (
    <div className="space-y-4" data-testid="apollo-picker">
      <PickerHeader stage={stage.name} />

      {stage.name === "brand-search" && (
        <div className="space-y-3" data-testid="apollo-stage-brand">
          <div className="space-y-2">
            <Label htmlFor="apollo-brand">Brand or company name</Label>
            <Input
              id="apollo-brand"
              placeholder="e.g. Probo"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearchOrg()}
              data-testid="input-apollo-brand"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="apollo-country">Country (optional)</Label>
              <Input
                id="apollo-country"
                placeholder="IN"
                maxLength={2}
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
                data-testid="input-apollo-country"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apollo-titles">Title filters (optional)</Label>
              <Input
                id="apollo-titles"
                placeholder="UA Manager, Head of Growth"
                value={titlesInput}
                onChange={(e) => setTitlesInput(e.target.value)}
                data-testid="input-apollo-titles"
              />
            </div>
          </div>
          {searchOrg.error && (
            <ErrorBanner message={searchOrg.error.message} />
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={onCancel}
              data-testid="button-apollo-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSearchOrg}
              disabled={!brand.trim() || searchOrg.isPending}
              data-testid="button-apollo-search-org"
            >
              {searchOrg.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Search
            </Button>
          </div>
        </div>
      )}

      {stage.name === "org-list" && (
        <div className="space-y-3" data-testid="apollo-stage-orgs">
          {stage.orgs.length === 0 ? (
            <EmptyState
              message={`No organizations found for "${brand}".`}
              suggestion="Try a different brand name or remove the country filter."
            />
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {stage.orgs.map((org) => (
                <OrgRow
                  key={org.id}
                  org={org}
                  onPick={() => handlePickOrg(org)}
                  isPicking={
                    searchPeople.isPending &&
                    searchPeople.variables?.orgId === org.id
                  }
                />
              ))}
            </div>
          )}
          {searchPeople.error && (
            <ErrorBanner message={searchPeople.error.message} />
          )}
          <div className="flex justify-between gap-2 pt-2">
            <Button
              variant="outline"
              onClick={back}
              data-testid="button-apollo-back"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button
              variant="outline"
              onClick={onCancel}
              data-testid="button-apollo-cancel"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {stage.name === "people-list" && (
        <div className="space-y-3" data-testid="apollo-stage-people">
          <div className="text-sm text-muted-foreground">
            Showing people at <strong>{stage.org.name}</strong>
            {titlesInput && (
              <> with titles matching: <em>{titlesInput}</em></>
            )}
          </div>
          {stage.people.length === 0 ? (
            <EmptyState
              message="No people found."
              suggestion="Try without title filters, or pick a different organization."
            />
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {stage.people.map((person) => (
                <PersonRow
                  key={person.id}
                  person={person}
                  onPick={() => handlePickPerson(person)}
                />
              ))}
            </div>
          )}
          <div className="flex justify-between gap-2 pt-2">
            <Button
              variant="outline"
              onClick={back}
              data-testid="button-apollo-back"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button
              variant="outline"
              onClick={onCancel}
              data-testid="button-apollo-cancel"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {stage.name === "reveal-confirm" && (
        <div className="space-y-3" data-testid="apollo-stage-reveal-confirm">
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="font-semibold">
                {stage.person.name ??
                  `${stage.person.firstName ?? ""} ${stage.person.lastName ?? ""}`.trim() ??
                  "(unnamed)"}
              </div>
              {stage.person.title && (
                <div className="text-sm">{stage.person.title}</div>
              )}
              <div className="text-sm text-muted-foreground">
                {stage.org.name}
              </div>
            </CardContent>
          </Card>
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm">
            <strong>Reveal will consume 1 Apollo credit.</strong> Phone may or
            may not be available — Apollo doesn&apos;t have phone numbers for
            every contact. Email and LinkedIn URL are usually available.
          </div>
          {reveal.error && <ErrorBanner message={reveal.error.message} />}
          <div className="flex justify-between gap-2 pt-2">
            <Button
              variant="outline"
              onClick={back}
              disabled={reveal.isPending}
              data-testid="button-apollo-back"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button
              onClick={handleConfirmReveal}
              disabled={reveal.isPending}
              data-testid="button-apollo-confirm-reveal"
            >
              {reveal.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Reveal contact
            </Button>
          </div>
        </div>
      )}

      {stage.name === "revealed" && (
        <div className="space-y-3" data-testid="apollo-stage-revealed">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">Reveal complete</span>
          </div>
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="font-semibold">
                {stage.contact.name ??
                  `${stage.contact.firstName ?? ""} ${stage.contact.lastName ?? ""}`.trim()}
              </div>
              {stage.contact.title && (
                <div className="text-sm text-muted-foreground">
                  {stage.contact.title}
                  {stage.contact.organizationName &&
                    ` · ${stage.contact.organizationName}`}
                </div>
              )}
              <ContactField
                icon={Phone}
                label="Phone"
                value={stage.contact.phone}
                emptyHint="Apollo doesn't have a phone for this contact. You can fill it manually in the form."
                testId="apollo-contact-phone"
              />
              <ContactField
                icon={Mail}
                label="Email"
                value={stage.contact.email}
                testId="apollo-contact-email"
              />
              <ContactField
                icon={Linkedin}
                label="LinkedIn"
                value={stage.contact.linkedinUrl}
                testId="apollo-contact-linkedin"
              />
            </CardContent>
          </Card>
          {!stage.contact.phone && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm">
              <AlertTriangle className="h-4 w-4 inline mr-2 -mt-0.5 text-amber-700" />
              No phone available. You&apos;ll need to enter one manually in the
              form to save the prospect.
            </div>
          )}
          <div className="flex justify-between gap-2 pt-2">
            <Button
              variant="outline"
              onClick={back}
              data-testid="button-apollo-back"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Pick someone else
            </Button>
            <Button
              onClick={handleUseContact}
              data-testid="button-apollo-use-contact"
            >
              Use this contact
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const STAGE_LABELS: Record<Stage["name"], string> = {
  "brand-search": "1. Find a company",
  "org-list": "2. Pick an organization",
  "people-list": "3. Pick a person",
  "reveal-confirm": "4. Confirm reveal",
  revealed: "5. Reveal complete",
};

function PickerHeader({ stage }: { stage: Stage["name"] }) {
  return (
    <p className="text-xs text-muted-foreground" data-testid="apollo-stage-label">
      {STAGE_LABELS[stage]}
    </p>
  );
}

function OrgRow({
  org,
  onPick,
  isPicking,
}: {
  org: ApolloOrgSummary;
  onPick: () => void;
  isPicking: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={isPicking}
      className="w-full text-left p-3 rounded-md border border-border hover-elevate flex items-start gap-3 disabled:opacity-50"
      data-testid={`apollo-org-${org.id}`}
    >
      <Building2 className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{org.name ?? "(no name)"}</div>
        {org.shortDescription && (
          <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
            {org.shortDescription}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {org.industry && <Badge variant="outline">{org.industry}</Badge>}
          {typeof org.estimatedNumEmployees === "number" && (
            <Badge variant="outline">
              {org.estimatedNumEmployees.toLocaleString()} emp
            </Badge>
          )}
          {org.country && <Badge variant="outline">{org.country}</Badge>}
          {org.primaryDomain && (
            <Badge variant="outline">{org.primaryDomain}</Badge>
          )}
        </div>
      </div>
      {isPicking && (
        <Loader2 className="h-4 w-4 mt-1 animate-spin text-muted-foreground" />
      )}
    </button>
  );
}

function PersonRow({
  person,
  onPick,
}: {
  person: ApolloPersonSummary;
  onPick: () => void;
}) {
  const displayName =
    person.name ??
    `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim() ??
    "(unnamed)";
  return (
    <button
      type="button"
      onClick={onPick}
      className="w-full text-left p-3 rounded-md border border-border hover-elevate flex items-start gap-3"
      data-testid={`apollo-person-${person.id}`}
    >
      <User className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{displayName}</div>
        {person.title && (
          <div className="text-sm text-muted-foreground truncate">
            {person.title}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {person.country && <Badge variant="outline">{person.country}</Badge>}
          {person.linkedinUrl && (
            <Badge variant="outline">
              <Linkedin className="h-3 w-3 mr-1 inline" />
              LinkedIn
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}

function ContactField({
  icon: Icon,
  label,
  value,
  emptyHint,
  testId,
}: {
  icon: typeof Phone;
  label: string;
  value: string | null;
  emptyHint?: string;
  testId: string;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        {value ? (
          <div className="font-mono text-sm break-all" data-testid={testId}>
            {value}
          </div>
        ) : (
          <div
            className="text-sm text-muted-foreground italic"
            data-testid={`${testId}-empty`}
          >
            Not available{emptyHint ? `. ${emptyHint}` : "."}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  message,
  suggestion,
}: {
  message: string;
  suggestion: string;
}) {
  return (
    <div className="border border-dashed rounded-md p-8 text-center text-sm text-muted-foreground">
      <p>{message}</p>
      <p className="mt-2">{suggestion}</p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      data-testid="apollo-error"
    >
      {message}
    </div>
  );
}
