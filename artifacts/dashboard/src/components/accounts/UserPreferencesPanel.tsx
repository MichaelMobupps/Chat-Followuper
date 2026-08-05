/**
 * Message-template panel (Accounts page).
 *
 * DE-DUPED (Reminders & schedule, 2026-07-09): this panel used to ALSO edit
 * preferred channel + Pushover quiet hours — the exact fields
 * <PushoverSettings/> edits on the same page via a different endpoint, so the
 * two forms could clobber each other's just-saved values on refetch. Those
 * fields now have a single owner (PushoverSettings, also mounted on the new
 * /reminders page); this panel keeps only its unique field, the message
 * template. The /users/me/preferences PATCH still accepts the removed fields
 * for API compatibility.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ApiError } from "@/lib/api";
import {
import { appPath } from "@/lib/config";
  getUserPreferences,
  patchUserPreferences,
} from "@/lib/api/user-extras";

export function UserPreferencesPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [messageTemplate, setMessageTemplate] = useState("");

  const prefs = useQuery({
    queryKey: ["user-preferences"],
    queryFn: getUserPreferences,
  });

  useEffect(() => {
    if (!prefs.data) return;
    setMessageTemplate(prefs.data.messageTemplate ?? "");
  }, [prefs.data]);

  const save = useMutation({
    mutationFn: patchUserPreferences,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["user-preferences"] });
      toast({ title: "Preferences saved" });
    },
    onError: (err: ApiError) => {
      toast({
        title: "Could not save preferences",
        description: err.code ?? err.message,
        variant: "destructive",
      });
    },
  });

  function handleSave() {
    save.mutate({ messageTemplate: messageTemplate.trim() || null });
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-base font-medium">
            <SlidersHorizontal className="h-4 w-4" />
            Message template
          </h2>
          <p className="text-xs text-muted-foreground max-w-xl">
            Optional sign-off appended to every generated message. Preferred
            channel and reminder quiet hours moved to{" "}
            <a href={appPath("/reminders")} className="underline">
              Reminders &amp; schedule
            </a>
            .
          </p>
        </div>

        <div className="grid gap-4 max-w-lg">
          <div className="space-y-2">
            <Label htmlFor="message-template">Message template (optional)</Label>
            <Textarea
              id="message-template"
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              placeholder="e.g. Hi {{name}}, following up on…"
              rows={3}
              data-testid="pref-template"
            />
          </div>
        </div>

        {prefs.isError ? (
          <p className="text-xs text-destructive" role="alert">
            Couldn't load your saved preferences. Saving is disabled so your
            existing settings aren't overwritten.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => void prefs.refetch()}
            >
              Retry
            </button>
          </p>
        ) : null}

        <Button
          onClick={handleSave}
          // FE2: never allow a save until preferences have actually loaded —
          // otherwise a failed GET leaves the form at empty defaults and Save
          // would PATCH nulls over the user's real settings.
          disabled={save.isPending || prefs.isLoading || prefs.isError || !prefs.data}
          data-testid="pref-save"
        >
          {save.isPending ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : null}
          Save preferences
        </Button>
      </CardContent>
    </Card>
  );
}
