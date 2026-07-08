import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ApiError } from "@/lib/api";
import {
  getNotificationSettings,
  patchNotificationSettings,
  postTestPushover,
  type NotificationSettingsPatch,
  type PreferredChannel,
} from "@/lib/api/notification-settings";

export function PushoverSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [userKey, setUserKey] = useState("");
  // F-B: local edit state for the three new fields. Kept as strings for the
  // number inputs so a cleared field is "" (null on save), never NaN.
  const [preferredChannel, setPreferredChannel] =
    useState<PreferredChannel>("whatsapp");
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");

  const settings = useQuery({
    queryKey: ["notification-settings"],
    queryFn: getNotificationSettings,
  });

  // F-B: seed the local fields once settings load (and re-seed after a save
  // refetches). Editing before a save never gets clobbered since the query
  // isn't refetching then.
  useEffect(() => {
    if (!settings.data) return;
    setPreferredChannel(settings.data.preferredChannel ?? "whatsapp");
    setQuietStart(
      settings.data.pushoverQuietHourStart == null
        ? ""
        : String(settings.data.pushoverQuietHourStart),
    );
    setQuietEnd(
      settings.data.pushoverQuietHourEnd == null
        ? ""
        : String(settings.data.pushoverQuietHourEnd),
    );
  }, [settings.data]);

  // API7: the raw key is never sent back, so the input starts (and stays) empty
  // like a password field. A blank input means "leave the saved key unchanged";
  // clearing is done via the explicit "Disable" button, not by saving blank.

  const save = useMutation({
    mutationFn: patchNotificationSettings,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notification-settings"] });
      toast({ title: "Pushover settings saved" });
    },
    onError: (err: ApiError) => {
      toast({
        title: "Could not save Pushover key",
        description: err.code ?? err.message,
        variant: "destructive",
      });
    },
  });

  const test = useMutation({
    mutationFn: postTestPushover,
    onSuccess: () => {
      toast({
        title: "Test notification sent",
        description: "Check your phone — tap the notification to verify the link opens.",
      });
    },
    onError: (err: ApiError) => {
      toast({
        title: "Test notification failed",
        description: err.code ?? err.message,
        variant: "destructive",
      });
    },
  });

  const appConfigured = settings.data?.pushoverAppConfigured ?? false;
  const trimmed = userKey.trim();
  const keyValid = trimmed === "" || /^[A-Za-z0-9]{30}$/.test(trimmed);

  // F-B: quiet hours are optional; when present they must be whole 0-23 hours.
  const quietStartNum = quietStart === "" ? null : Number(quietStart);
  const quietEndNum = quietEnd === "" ? null : Number(quietEnd);
  const hourValid = (n: number | null) =>
    n === null || (Number.isInteger(n) && n >= 0 && n <= 23);
  const quietValid = hourValid(quietStartNum) && hourValid(quietEndNum);

  function handleSave() {
    // FE2: never save over a key we couldn't load. A blank key field means "no
    // change" (the raw key is never shown) — only include pushoverUserKey when
    // the user typed a new one. Clearing the key goes through handleDisable.
    if (!settings.data) return;
    const patch: NotificationSettingsPatch = {
      preferredChannel,
      pushoverQuietHourStart: quietStartNum,
      pushoverQuietHourEnd: quietEndNum,
    };
    if (trimmed !== "") patch.pushoverUserKey = trimmed;
    save.mutate(patch);
  }

  function handleDisable() {
    setUserKey("");
    save.mutate({ pushoverUserKey: null });
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-base font-medium">
            <Bell className="h-4 w-4" />
            Pushover mobile reminders
          </h2>
          <p className="text-xs text-muted-foreground max-w-xl">
            Get follow-up reminders on your phone in addition to the daily email.
            Each notification includes a <strong>Follow up</strong> link that opens
            WhatsApp or Telegram with the message already in the compose box — tap
            send in the app to deliver.
          </p>
        </div>

        {!appConfigured ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Pushover is not configured on the server yet (missing{" "}
            <code className="text-xs">PUSHOVER_APP_TOKEN</code>). Ask your admin
            to create a Pushover application for Chat Followuper.
          </p>
        ) : null}

        <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
          <li>
            Install{" "}
            <a
              href="https://pushover.net/clients"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#4FFFE3] hover:underline inline-flex items-center gap-0.5"
            >
              Pushover on your phone
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
          <li>
            Copy your <strong>User Key</strong> from{" "}
            <a
              href="https://pushover.net/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#4FFFE3] hover:underline"
            >
              pushover.net
            </a>{" "}
            (after logging in)
          </li>
          <li>Paste it below and send a test notification</li>
        </ol>

        <div className="space-y-2 max-w-md">
          <Label htmlFor="pushover-user-key">Your Pushover User Key</Label>
          <Input
            id="pushover-user-key"
            placeholder="30-character key from pushover.net"
            value={userKey}
            onChange={(e) => setUserKey(e.target.value)}
            className="font-mono text-xs"
            data-testid="pushover-user-key"
          />
          {settings.data?.pushoverUserKeyMasked && !userKey ? (
            <p className="text-xs text-muted-foreground">
              Saved: {settings.data.pushoverUserKeyMasked}
            </p>
          ) : null}
          {!keyValid ? (
            <p className="text-xs text-destructive">
              User key must be exactly 30 letters and numbers.
            </p>
          ) : null}
        </div>

        {/* F-B: preferred channel + quiet hours. */}
        <div className="space-y-2 max-w-md">
          <Label htmlFor="preferred-channel">Preferred channel</Label>
          <select
            id="preferred-channel"
            value={preferredChannel}
            onChange={(e) =>
              setPreferredChannel(e.target.value as PreferredChannel)
            }
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            data-testid="preferred-channel"
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="telegram">Telegram</option>
            <option value="linkedin">LinkedIn</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3 max-w-md">
          <div className="space-y-2">
            <Label htmlFor="quiet-start">Quiet hours start (local hour)</Label>
            <Input
              id="quiet-start"
              type="number"
              min={0}
              max={23}
              placeholder="0–23"
              value={quietStart}
              onChange={(e) => setQuietStart(e.target.value)}
              data-testid="quiet-start"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quiet-end">Quiet hours end (local hour)</Label>
            <Input
              id="quiet-end"
              type="number"
              min={0}
              max={23}
              placeholder="0–23"
              value={quietEnd}
              onChange={(e) => setQuietEnd(e.target.value)}
              data-testid="quiet-end"
            />
          </div>
        </div>
        {!quietValid ? (
          <p className="text-xs text-destructive">
            Quiet hours must be whole numbers between 0 and 23.
          </p>
        ) : null}

        {settings.isError ? (
          <p className="text-xs text-destructive" role="alert">
            Couldn't load your Pushover settings. Saving is disabled so your
            saved key isn't overwritten.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => void settings.refetch()}
            >
              Retry
            </button>
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleSave}
            // FE2: block Save until settings have loaded — a failed GET leaves
            // the key field empty and Save would PATCH over the saved values.
            // F-B: Save now also persists preferred channel + quiet hours, so a
            // blank key no longer blocks it (a blank key is left unchanged).
            disabled={
              !keyValid ||
              !quietValid ||
              save.isPending ||
              settings.isLoading ||
              settings.isError ||
              !settings.data
            }
            data-testid="pushover-save"
          >
            {save.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : null}
            Save settings
          </Button>
          <Button
            variant="outline"
            onClick={() => test.mutate()}
            disabled={
              !appConfigured ||
              !settings.data?.pushoverEnabled ||
              test.isPending
            }
            data-testid="pushover-test"
          >
            {test.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Bell className="h-4 w-4 mr-1" />
            )}
            Send test notification
          </Button>
          {settings.data?.pushoverEnabled ? (
            <Button
              variant="ghost"
              className="text-muted-foreground"
              onClick={handleDisable}
              disabled={save.isPending}
            >
              Disable
            </Button>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          Reminders are sent on <strong>weekdays only</strong> (Mon–Fri) at{" "}
          <strong>12:00 midday GMT+2</strong> — separate from your email digest.
          One notification per due follow-up. Tap → browser opens →
          WhatsApp/Telegram with message prefilled.
        </p>
      </CardContent>
    </Card>
  );
}