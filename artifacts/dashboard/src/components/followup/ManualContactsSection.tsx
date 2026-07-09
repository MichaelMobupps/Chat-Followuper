/**
 * Manual Contacts Section — Ticket 2.7-FE.
 *
 * Sits between the channel page header and the existing follow-ups
 * table. The toggle controls whether manual ingest is exposed for this
 * channel. When on, an "+ Add contact" button opens the dialog.
 *
 * Visual states map to the Beacon design framework's Ignite pattern
 * (see beacon-design-framework.html, "Ignite — three states, one rule"):
 *
 *   Off (Resting)     — muted border, no glow. Toggle visible.
 *   Off + hover       — Illuminated treatment: soft ignite aura on the
 *                       toggle so the SDR knows the surface is alive.
 *   On (Beacon)       — Persistent ignite glow on the section frame
 *                       and the toggle. Add button visible.
 *
 * Tokens are scoped locally via inline style + Tailwind arbitrary values.
 * When the dashboard adopts the full Beacon token set in :root, this
 * component can be simplified to bare var(--bcn-ignite*) references.
 *
 * "Recent contacts" surface is intentionally not in this ticket.
 * Manually-ingested prospects flow into the existing follow-ups table
 * via the BE's standard pipeline; the SDR sees them there after the
 * first message is generated. A dedicated "recent ingests" panel can
 * land in a follow-up ticket if usage warrants.
 */
import { useState } from "react";
import { Plus, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  useManualIngestSettings,
  useToggleManualIngest,
} from "@/hooks/use-manual-ingest";
import {
  type ManualIngestChannel,
} from "@/lib/api/manual-ingest";
import { ApiError } from "@/lib/api";
import { AddManualContactDialog } from "./AddManualContactDialog";
import { BulkAddDialog } from "./BulkAddDialog";
import { cn } from "@/lib/utils";

interface Props {
  channel: ManualIngestChannel;
}

// Beacon Ignite tokens scoped to this component. Mirrors the minimum
// viable set from beacon-design-framework.html. Pulled into a constant
// so the same values can be referenced in inline style and Tailwind
// arbitrary-value classes without drift.
const IGNITE = {
  base: "#00F5D4",
  bright: "#4FFFE3",
  aura: "rgba(0, 245, 212, 0.35)",
  dim: "rgba(0, 245, 212, 0.12)",
  glowSoft: "0 0 0 1px rgba(0,245,212,.18), 0 0 20px rgba(0,245,212,.18)",
  glowMedium: "0 0 0 1px rgba(0,245,212,.35), 0 0 28px rgba(0,245,212,.32)",
} as const;

const CHANNEL_NAME: Record<ManualIngestChannel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  linkedin: "LinkedIn",
};

export function ManualContactsSection({ channel }: Props) {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const settings = useManualIngestSettings();
  const toggle = useToggleManualIngest();

  if (settings.isLoading) {
    return <Skeleton className="h-14 w-full" />;
  }

  // 401 / not-authenticated and similar — surface the error inline but
  // don't crash the page. The follow-ups list below still works for
  // already-known prospects.
  if (settings.isError) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        Could not load manual ingest settings:{" "}
        {settings.error instanceof ApiError
          ? settings.error.code ?? settings.error.message
          : (settings.error as Error).message}
      </div>
    );
  }

  const channels = settings.data?.manualIngestChannels ?? [];
  const enabled = channels.includes(channel);

  function handleToggle(next: boolean) {
    toggle.mutate(
      { channel, enabled: next },
      {
        onError: (err) => {
          const apiCode = err instanceof ApiError ? err.code : undefined;
          toast({
            title: "Could not update manual ingest settings",
            description:
              err instanceof ApiError
                ? `${err.status} ${apiCode ?? err.message}`
                : (err as Error).message,
          });
        },
      },
    );
  }

  // Visual state mapping per Beacon's Ignite pattern:
  //   Off: bare. Standard muted treatment.
  //   On:  Beacon. Persistent glow on the section frame; toggle adopts
  //        ignite color via the switch's [data-state="checked"] selector.
  // The "Illuminated" middle treatment shows on hover when off (CSS
  // :hover handles it without React state).
  return (
    <div
      data-testid="manual-contacts-section"
      data-ignite-state={enabled ? "beacon" : "resting"}
      className={cn(
        "group relative rounded-md border bg-card px-4 py-3 transition-all duration-200",
        enabled
          ? "border-[rgba(0,245,212,0.55)]"
          : "border-border hover:border-[rgba(0,245,212,0.35)]",
      )}
      style={
        enabled
          ? { boxShadow: IGNITE.glowMedium }
          : undefined
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Sparkles
            className={cn(
              "h-4 w-4 transition-colors",
              enabled
                ? "text-[#4FFFE3]"
                : "text-muted-foreground group-hover:text-[#4FFFE3]",
            )}
          />
          <div className="space-y-0.5">
            <Label
              htmlFor={`manual-ingest-toggle-${channel}`}
              className={cn(
                "text-sm font-semibold transition-colors cursor-pointer",
                enabled && "text-[#4FFFE3]",
              )}
            >
              Manual contacts
            </Label>
            <p className="text-xs text-muted-foreground">
              {enabled
                ? `Add people you're already in touch with on ${CHANNEL_NAME[channel]}. They flow into the queue with the rest.`
                : `Off. Flip on to add ${CHANNEL_NAME[channel]} contacts who aren't from Apollo.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {enabled && (
            <Button
              size="sm"
              variant="default"
              onClick={() => setAddOpen(true)}
              data-testid="manual-add-button"
              style={{
                boxShadow: IGNITE.glowSoft,
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add contact
            </Button>
          )}
          {enabled && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBulkOpen(true)}
              data-testid="manual-add-many-button"
              style={{
                boxShadow: IGNITE.glowSoft,
              }}
            >
              <Users className="h-4 w-4 mr-1" />
              Add many
            </Button>
          )}
          <Switch
            id={`manual-ingest-toggle-${channel}`}
            checked={enabled}
            disabled={toggle.isPending}
            onCheckedChange={handleToggle}
            data-testid="manual-ingest-toggle"
            // Tailwind's [data-state=checked] selector keys the ignite color
            // off the Switch's internal state. The arbitrary-value classes
            // here override the shadcn default checked color (primary).
            className="data-[state=checked]:bg-[#00F5D4]"
          />
        </div>
      </div>

      <AddManualContactDialog
        channel={channel}
        open={addOpen}
        onOpenChange={setAddOpen}
      />

      <BulkAddDialog
        channel={channel}
        open={bulkOpen}
        onOpenChange={setBulkOpen}
      />
    </div>
  );
}
