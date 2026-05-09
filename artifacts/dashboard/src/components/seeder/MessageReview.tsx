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
  onDone: () => void;
  isRegenerating?: boolean;
}

/**
 * Shows the generated subject + body. Body is editable locally so the
 * SDR can tweak phrasing before copying to send, but edits do NOT
 * persist back to the prospect — the server only sets first_message_body
 * via the generate-message route.
 *
 * To persist a different message: refine the brief and regenerate.
 *
 * Future ticket: extend PATCH to accept first_message_body for manual
 * edits. Out of scope for FE-B-1.
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

  useEffect(() => {
    setBody(result.message);
    setOriginalBody(result.message);
  }, [result.message]);

  const isEdited = body !== originalBody;

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
                <span className="text-xs text-amber-600">
                  Local edits — not persisted. Use Copy, or refine the brief and regenerate.
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
          onClick={onDone}
          disabled={isRegenerating}
          data-testid="button-message-done"
        >
          Done
        </Button>
      </div>
    </div>
  );
}
