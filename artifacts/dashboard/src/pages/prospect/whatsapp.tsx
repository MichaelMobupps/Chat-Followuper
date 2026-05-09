import { Link } from "wouter";
import { MessageCircle, Sparkles, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Placeholder for the new Prospect → WhatsApp page.
 * Real implementation lands in ticket 2.3-FE.
 *
 * For now: a friendly stub that explains what's coming and links to
 * the legacy /seeder flow so SDRs can keep working during the rebuild.
 */
export default function ProspectWhatsAppPage() {
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Prospect</span>
          <ArrowRight className="h-3 w-3" />
          <MessageCircle className="h-3 w-3" />
          <span>WhatsApp</span>
        </div>
        <h1
          className="text-2xl font-semibold tracking-tight"
          data-testid="page-title"
        >
          Prospect contacts via WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground">
          Source new prospects in bulk from URLs and reach them on WhatsApp.
        </p>
      </header>

      <Card>
        <CardContent className="p-8 space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4" />
              <span>Coming in ticket 2.3-FE</span>
            </div>
            <h2 className="text-lg font-semibold">What this page will do</h2>
            <ol className="text-sm space-y-2 list-decimal pl-5 text-muted-foreground">
              <li>
                Paste or upload a list of URLs — Play Store, App Store, or company website.
              </li>
              <li>
                System resolves each URL to a brand domain.
              </li>
              <li>
                System finds people at each company who have direct phone numbers in Apollo, filtered to relevant titles and seniorities.
              </li>
              <li>
                You see a flat multi-select grid of candidates across all companies. No reveal credits spent yet.
              </li>
              <li>
                Tick the people you want. Choose draft-only or auto-send. System reveals only the ones you ticked.
              </li>
            </ol>
          </div>

          <div className="border-t pt-4 space-y-3">
            <h3 className="text-sm font-semibold">In the meantime</h3>
            <p className="text-sm text-muted-foreground">
              The single-prospect Seeder flow still works for one-off prospect creation.
            </p>
            <Link href="/seeder">
              <Button variant="outline" data-testid="link-legacy-seeder">
                Open Seeder (legacy)
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
