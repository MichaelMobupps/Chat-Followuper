import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { AuthGate } from "@/components/auth-gate";
import LoginPage from "@/pages/login";
import TodayPage from "@/pages/today";
import ContactsPage from "@/pages/contacts";
import SeederPage from "@/pages/seeder";
import CampaignsPage from "@/pages/campaigns";
import CampaignDetailPage from "@/pages/campaign-detail";
import ProspectWhatsAppPage from "@/pages/prospect/whatsapp";
import ProspectTelegramPage from "@/pages/prospect/telegram";
import FollowupWhatsAppPage from "@/pages/followup/whatsapp";
import FollowupTelegramPage from "@/pages/followup/telegram";
// F-A: LinkedIn follow-up page.
import FollowupLinkedInPage from "@/pages/followup/linkedin";
import ProspectsPage from "@/pages/prospects";
import ProspectDetailPage from "@/pages/prospect-detail";
import FollowupsPage from "@/pages/followups";
import ActivityPage from "@/pages/activity";
import AccountsPage from "@/pages/accounts";
import RemindersPage from "@/pages/reminders";
import AdminOpsPage from "@/pages/admin-ops";
import NotFound from "@/pages/not-found";
import { ROUTER_BASE } from "@/lib/config";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  return (
    <AuthGate>
      <Layout>
        <Switch>
          <Route path="/" component={TodayPage} />
          <Route path="/contacts" component={ContactsPage} />
          <Route path="/seeder" component={SeederPage} />
          <Route path="/campaigns" component={CampaignsPage} />
          <Route path="/campaigns/:id" component={CampaignDetailPage} />
          <Route path="/prospect/whatsapp" component={ProspectWhatsAppPage} />
          <Route path="/prospect/telegram" component={ProspectTelegramPage} />
          <Route path="/followup/whatsapp" component={FollowupWhatsAppPage} />
          <Route path="/followup/telegram" component={FollowupTelegramPage} />
          {/* F-A: LinkedIn follow-up route. */}
          <Route path="/followup/linkedin" component={FollowupLinkedInPage} />
          <Route path="/prospects" component={ProspectsPage} />
          <Route path="/prospects/:id" component={ProspectDetailPage} />
          <Route path="/followups" component={FollowupsPage} />
          <Route path="/activity" component={ActivityPage} />
          <Route path="/accounts" component={AccountsPage} />
          <Route path="/reminders" component={RemindersPage} />
          <Route path="/admin/ops" component={AdminOpsPage} />
          <Route component={NotFound} />
        </Switch>
      </Layout>
    </AuthGate>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={ROUTER_BASE}>
          <Switch>
            <Route path="/login" component={LoginPage} />
            <Route component={ProtectedRoutes} />
          </Switch>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
