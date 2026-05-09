import { MessageCircle, Sparkles, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function FollowupWhatsAppPage() {
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Follow up</span>
          <ArrowRight className="h-3 w-3" />
          <MessageCircle className="h-3 w-3" />
          <span>WhatsApp</span>
        </div>
        <h1
          className="text-2xl font-semibold tracking-tight"
          data-testid="page-title"
        >
          Follow up on WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage open WhatsApp conversations and the follow-up sequence.
        </p>
      </header>

      <Card>
        <CardContent className="p-8 space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            <span>Coming in ticket 2.5-FE</span>
          </div>
          <h2 className="text-lg font-semibold">What this page will do</h2>
          <ul className="text-sm space-y-1.5 list-disc pl-5 text-muted-foreground">
            <li>List existing WhatsApp prospects with status filters: not yet sent, sent, replied, no-reply, paused.</li>
            <li>Per-prospect actions: send next follow-up, mark replied, archive, edit message.</li>
            <li>Bulk actions: archive all replied, pause sequence for selected.</li>
            <li>Sequence configuration: number of follow-ups, days between, doctrine variant per stage.</li>
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
