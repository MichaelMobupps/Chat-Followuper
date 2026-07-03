import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ApiError } from "@/lib/api";
import {
  getUserPreferences,
  patchUserPreferences,
  type PreferredChannel,
} from "@/lib/api/user-extras";

export function UserPreferencesPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [preferredChannel, setPreferredChannel] = useState<string>("none");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");

  const prefs = useQuery({
    queryKey: ["user-preferences"],
    queryFn: getUserPreferences,
  });

  useEffect(() => {
    if (!prefs.data) return;
    setPreferredChannel(prefs.data.preferredChannel ?? "none");
    setMessageTemplate(prefs.data.messageTemplate ?? "");
    setQuietStart(
      prefs.data.quietHoursStart != null
        ? String(prefs.data.quietHoursStart)
        : "",
    );
    setQuietEnd(
      prefs.data.quietHoursEnd != null
        ? String(prefs.data.quietHoursEnd)
        : "",
    );
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
    const start = quietStart.trim() === "" ? null : Number(quietStart);
    const end = quietEnd.trim() === "" ? null : Number(quietEnd);
    if (
      (start != null && (start < 0 || start > 23)) ||
      (end != null && (end < 0 || end > 23))
    ) {
      toast({
        title: "Invalid quiet hours",
        description: "Use hours 0–23.",
        variant: "destructive",
      });
      return;
    }

    save.mutate({
      preferredChannel:
        preferredChannel === "none"
          ? null
          : (preferredChannel as PreferredChannel),
      messageTemplate: messageTemplate.trim() || null,
      quietHoursStart: start,
      quietHoursEnd: end,
    });
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-base font-medium">
            <SlidersHorizontal className="h-4 w-4" />
            User preferences
          </h2>
          <p className="text-xs text-muted-foreground max-w-xl">
            Default channel, optional message template snippet, and quiet hours
            when reminders should not fire.
          </p>
        </div>

        <div className="grid gap-4 max-w-lg">
          <div className="space-y-2">
            <Label>Preferred channel</Label>
            <Select value={preferredChannel} onValueChange={setPreferredChannel}>
              <SelectTrigger data-testid="pref-channel">
                <SelectValue placeholder="No preference" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No preference</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="telegram">Telegram</SelectItem>
              </SelectContent>
            </Select>
          </div>

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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="quiet-start">Quiet hours start</Label>
              <Input
                id="quiet-start"
                type="number"
                min={0}
                max={23}
                placeholder="22"
                value={quietStart}
                onChange={(e) => setQuietStart(e.target.value)}
                data-testid="pref-quiet-start"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quiet-end">Quiet hours end</Label>
              <Input
                id="quiet-end"
                type="number"
                min={0}
                max={23}
                placeholder="8"
                value={quietEnd}
                onChange={(e) => setQuietEnd(e.target.value)}
                data-testid="pref-quiet-end"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Hours in your local timezone (0–23). Leave blank to disable.
          </p>
        </div>

        <Button
          onClick={handleSave}
          disabled={save.isPending || prefs.isLoading}
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