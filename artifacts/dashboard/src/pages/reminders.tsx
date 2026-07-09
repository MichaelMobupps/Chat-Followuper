/**
 * Reminders & schedule — consolidated settings page (2026-07-09).
 *
 * The timing knobs used to be scattered: cadence/send-window/digest-hour hid
 * behind a small "Sequence config" button on each per-channel follow-up page,
 * and Pushover config lived on Accounts in two overlapping panels. This page
 * is the one conspicuous place for all of it:
 *   1. Follow-up cadence & send window — the existing SequenceConfigPanel
 *      (single source of truth; mounted here, not duplicated).
 *   2. Email digest days — NEW per-user day-of-week control (the digest
 *      previously sent every day); hour + timezone stay in Sequence config.
 *   3. Pushover mobile reminders — key, preferred channel, quiet hours, and
 *      the NEW per-user reminder hour + days.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ApiError } from "@/lib/api";
import {
  getNotificationSettings,
  patchNotificationSettings,
} from "@/lib/api/notification-settings";
import { PushoverSettings } from "@/components/PushoverSettings";
import { SequenceConfigPanel } from "@/components/followup/SequenceConfigPanel";
import { WeekdayPicker } from "@/components/WeekdayPicker";

function DigestScheduleCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  const settings = useQuery({
    queryKey: ["notification-settings"],
    queryFn: getNotificationSettings,
  });

  useEffect(() => {
    if (!settings.data) return;
    setDays(settings.data.digestDays ?? [0, 1, 2, 3, 4, 5, 6]);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: patchNotificationSettings,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["notification-settings"],
      });
      toast({ title: "Digest days saved" });
    },
    onError: (err: ApiError) => {
      toast({
        title: "Could not save digest days",
        description: err.code ?? err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-base font-medium">
            <Mail className="h-4 w-4" />
            Email digest days
          </h2>
          <p className="text-xs text-muted-foreground max-w-xl">
            Which days the daily follow-up digest email may send. The digest
            <strong> hour and timezone</strong> are configured in Sequence
            config above.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Send the digest on</Label>
          <WeekdayPicker
            value={days}
            onChange={setDays}
            data-testid="digest-days"
          />
        </div>
        <Button
          onClick={() => save.mutate({ digestDays: days })}
          disabled={save.isPending || settings.isLoading || settings.isError}
          data-testid="digest-days-save"
        >
          {save.isPending ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : null}
          Save digest days
        </Button>
      </CardContent>
    </Card>
  );
}

export default function RemindersPage() {
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1
          className="text-2xl font-semibold tracking-tight flex items-center gap-2"
          data-testid="page-title"
        >
          <CalendarClock className="h-6 w-6" />
          Reminders &amp; schedule
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Everything that controls WHEN Chat Followuper nudges you: follow-up
          cadence and send window, the daily email digest, and Pushover mobile
          reminders.
        </p>
      </header>

      <Card>
        <CardContent className="flex items-center justify-between gap-4 p-6">
          <div className="space-y-1">
            <h2 className="text-base font-medium">
              Follow-up cadence &amp; send window
            </h2>
            <p className="text-xs text-muted-foreground max-w-xl">
              Stages, days between follow-ups, send days, send-hour window, and
              the digest hour + timezone.
            </p>
          </div>
          <SequenceConfigPanel />
        </CardContent>
      </Card>

      <DigestScheduleCard />

      <PushoverSettings />
    </section>
  );
}
