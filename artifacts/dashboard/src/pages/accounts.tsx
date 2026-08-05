import { useMutation } from "@tanstack/react-query";
import { Loader2, Mail } from "lucide-react";
import { TestChannelMessage } from "@/components/TestChannelMessage";
import { PushoverSettings } from "@/components/PushoverSettings";
import { UserPreferencesPanel } from "@/components/accounts/UserPreferencesPanel";
import { HealthCheckPanel } from "@/components/accounts/HealthCheckPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ApiError } from "@/lib/api";
import { postTestDigest } from "@/lib/api/user-extras";

export default function AccountsPage() {
  const { toast } = useToast();

  const testDigest = useMutation({
    mutationFn: postTestDigest,
    onSuccess: (data) => {
      toast({
        title: "Test digest sent",
        description: data.message ?? "Check your inbox.",
      });
    },
    onError: (err: ApiError) => {
      toast({
        title: "Could not send test digest",
        description: err.code ?? err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1
          className="text-2xl font-semibold tracking-tight"
          data-testid="page-title"
        >
          Accounts
        </h1>
        <p className="text-sm text-muted-foreground">
          Mobile reminders, preferences, health checks, and account settings.
        </p>
      </header>

      <UserPreferencesPanel />
      <HealthCheckPanel />

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-base font-medium">
              <Mail className="h-4 w-4" />
              Email digest
            </h2>
            <p className="text-xs text-muted-foreground max-w-xl">
              Send yourself a one-off copy of the daily follow-up digest email.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => testDigest.mutate()}
            disabled={testDigest.isPending}
            data-testid="test-digest"
          >
            {testDigest.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Mail className="h-4 w-4 mr-1" />
            )}
            Send test digest email
          </Button>
        </CardContent>
      </Card>

      <PushoverSettings />
      <TestChannelMessage />
    </section>
  );
}