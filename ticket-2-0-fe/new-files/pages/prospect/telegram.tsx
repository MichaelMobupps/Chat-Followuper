import { Send, Sparkles, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function ProspectTelegramPage() {
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Prospect</span>
          <ArrowRight className="h-3 w-3" />
          <Send className="h-3 w-3" />
          <span>Telegram</span>
        </div>
        <h1
          className="text-2xl font-semibold tracking-tight"
          data-testid="page-title"
        >
          Prospect contacts via Telegram
        </h1>
        <p className="text-sm text-muted-foreground">
          Source new prospects in bulk and reach them on Telegram.
        </p>
      </header>

      <Card>
        <CardContent className="p-8 space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            <span>Coming in ticket 2.6</span>
          </div>
          <h2 className="text-lg font-semibold">Parity with WhatsApp prospect flow</h2>
          <p className="text-sm text-muted-foreground">
            Same URL ingest, same multi-company discovery, same multi-select grid. Ships after WhatsApp prospect (2.3) and the bulk pipeline (2.4) are stable.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
