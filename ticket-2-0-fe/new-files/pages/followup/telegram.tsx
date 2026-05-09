import { Send, Sparkles, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function FollowupTelegramPage() {
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Follow up</span>
          <ArrowRight className="h-3 w-3" />
          <Send className="h-3 w-3" />
          <span>Telegram</span>
        </div>
        <h1
          className="text-2xl font-semibold tracking-tight"
          data-testid="page-title"
        >
          Follow up on Telegram
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage open Telegram conversations and the follow-up sequence.
        </p>
      </header>

      <Card>
        <CardContent className="p-8 space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            <span>Coming in ticket 2.6</span>
          </div>
          <h2 className="text-lg font-semibold">Parity with WhatsApp follow-up flow</h2>
          <p className="text-sm text-muted-foreground">
            Same list, same filters, same sequence configuration. Ships alongside the Telegram prospect page once the WhatsApp side is stable.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
