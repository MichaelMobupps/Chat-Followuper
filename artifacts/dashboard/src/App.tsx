import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { AuthGate } from "@/components/auth-gate";
import LoginPage from "@/pages/login";
import TodayPage from "@/pages/today";
import SeederPage from "@/pages/seeder";
import ProspectsPage from "@/pages/prospects";
import FollowupsPage from "@/pages/followups";
import ActivityPage from "@/pages/activity";
import AccountsPage from "@/pages/accounts";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  return (
    <AuthGate>
      <Layout>
        <Switch>
          <Route path="/" component={TodayPage} />
          <Route path="/seeder" component={SeederPage} />
          <Route path="/prospects" component={ProspectsPage} />
          <Route path="/followups" component={FollowupsPage} />
          <Route path="/activity" component={ActivityPage} />
          <Route path="/accounts" component={AccountsPage} />
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
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
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
