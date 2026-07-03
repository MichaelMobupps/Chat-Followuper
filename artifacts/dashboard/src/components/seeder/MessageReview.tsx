import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Copy, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { GenerateMessageResult } from "@/lib/api/seeder";

interface Props {
  result: GenerateMessageResult;
  onRegenerate: () => void | Promise<void>;
  /** Called with the (possibly edited) body; the caller persists it. */
  onDone: (editedBody: string) => void | Promise<void>;
  isRegenerating?: boolean;
}

/**
 * Shows the generated subject + body. The body is editable so the SDR can
 * tweak phrasing before sending. FE13: manual edits are now PERSISTED — on
 * Done the caller PATCHes first_message_body (the prospects PATCH route accepts
 * it), so the send flow (deep link uses the server's first_message_body)
 * reflects exactly what the SDR sees here, instead of silently discarding edits.
 */
export function MessageReview({
  result,
  onRegenerate,
  onDone,
  isRegenerating,
}: Props) {
  const { toast } = useToast();
  const [body, setBody] = useState(result.message);
  const [originalBody, setOriginalBody] = useState(result.message);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setBody(result.message);
    setOriginalBody(result.message);
  }, [result.message]);

  const isEdited = body !== originalBody;

  async function handleDone() {
    try {
      setIsSaving(true);
      await onDone(body);
    } finally {
      setIsSaving(false);
    }
  }

  function handleCopy() {
    void navigator.clipboard.writeText(body).then(
      () => toast({ title: "Copied to clipboard" }),
      () =>
        toast({
          title: "Could not copy",
          description: "Browser blocked clipboard access.",
          variant: "destructive",
        }),
    );
  }

  return (
    <div className="space-y-6" data-testid="message-review">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center justify-between gap-4">
            <span>Generated message</span>
            <span className="text-xs font-normal normal-case tracking-normal">
              ${result.costUsd?.toFixed?.(4) ?? "—"} ·{" "}
              {result.iterations} iter
              {typeof result.finalOverallScore === "number" &&
                ` · score ${result.finalOverallScore.toFixed(2)}`}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {result.subject && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Subject</Label>
              <p className="text-sm font-medium" data-testid="message-subject">
                {result.subject}
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Body</Label>
              {isEdited && (
                <span className="text-xs text-muted-foreground">
                  Edited — your changes will be saved when you click Done.
                </span>
              )}
            </div>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="font-mono text-sm"
              data-testid="input-message-body"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              data-testid="button-message-copy"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRegenerate}
              disabled={isRegenerating}
              data-testid="button-message-regenerate"
            >
              {isRegenerating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Regenerate (~$0.15)
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleDone}
          disabled={isRegenerating || isSaving}
          data-testid="button-message-done"
        >
          {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Done
        </Button>
      </div>
    </div>
  );
}
