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
} from "@/lib/api/notification-settings";

export function PushoverSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [userKey, setUserKey] = useState("");

  const settings = useQuery({
    queryKey: ["notification-settings"],
    queryFn: getNotificationSettings,
  });

  useEffect(() => {
    if (settings.data?.pushoverUserKey) {
      setUserKey(settings.data.pushoverUserKey);
    }
  }, [settings.data?.pushoverUserKey]);

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

  function handleSave() {
    save.mutate({
      pushoverUserKey: trimmed === "" ? null : trimmed,
    });
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

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleSave}
            disabled={!keyValid || save.isPending || settings.isLoading}
            data-testid="pushover-save"
          >
            {save.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : null}
            Save key
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