import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCampaigns } from "@/hooks/use-campaigns";

const NO_CAMPAIGN = "__none__";

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  testIdPrefix?: string;
}

/**
 * Dropdown over the user's active campaigns. Includes a "No campaign"
 * option (the default). Reuses the campaigns API + hook from FE-A.
 */
export function CampaignSelector({
  value,
  onChange,
  disabled,
  testIdPrefix = "campaign-selector",
}: Props) {
  const { data: campaigns, isLoading, error } = useCampaigns({
    includeArchived: false,
  });

  if (isLoading) {
    return (
      <div
        className="flex items-center gap-2 text-sm text-muted-foreground"
        data-testid={`${testIdPrefix}-loading`}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading campaigns…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="text-sm text-destructive"
        data-testid={`${testIdPrefix}-error`}
      >
        Could not load campaigns: {error.message}
      </div>
    );
  }

  return (
    <Select
      value={value ?? NO_CAMPAIGN}
      onValueChange={(v) => onChange(v === NO_CAMPAIGN ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger data-testid={testIdPrefix}>
        <SelectValue placeholder="No campaign" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_CAMPAIGN}>No campaign</SelectItem>
        {campaigns?.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
