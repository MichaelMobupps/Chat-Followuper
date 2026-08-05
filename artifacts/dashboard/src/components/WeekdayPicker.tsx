/**
 * WeekdayPicker — compact toggle-chip row for day-of-week selections
 * (Reminders & schedule, 2026-07-09). Days use 0=Sun..6=Sat to match the
 * BE arrays (users.pushover_days / users.digest_days). Selecting no days is
 * allowed — it means "never" (a deliberate off-switch the BE accepts).
 */
import { cn } from "@/lib/utils";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

interface Props {
  value: number[];
  onChange: (days: number[]) => void;
  disabled?: boolean;
  "data-testid"?: string;
}

export function WeekdayPicker({ value, onChange, disabled, ...rest }: Props) {
  function toggle(day: number) {
    onChange(
      value.includes(day)
        ? value.filter((d) => d !== day)
        : [...value, day].sort((a, b) => a - b),
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5" data-testid={rest["data-testid"]}>
      {DAY_LABELS.map((label, day) => {
        const active = value.includes(day);
        return (
          <button
            key={label}
            type="button"
            disabled={disabled}
            onClick={() => toggle(day)}
            aria-pressed={active}
            className={cn(
              "h-8 w-11 rounded-md border text-xs font-medium transition-colors",
              active
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-input bg-background text-muted-foreground hover:text-foreground",
              disabled && "opacity-50 pointer-events-none",
            )}
          >
            {label}
          </button>
        );
      })}
      {value.length === 0 ? (
        <span className="self-center text-xs text-amber-600 dark:text-amber-400">
          No days selected — these reminders are off.
        </span>
      ) : null}
    </div>
  );
}
