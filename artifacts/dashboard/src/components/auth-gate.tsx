import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

type Props = {
  children: ReactNode;
};

export function AuthGate({ children }: Props) {
  const state = useCurrentUser();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (state.status === "unauthenticated") {
      navigate("/login", { replace: true });
    }
  }, [state.status, navigate]);

  if (state.status === "loading") {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-background"
        data-testid="auth-gate-loading"
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-background p-8"
        data-testid="auth-gate-error"
      >
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-lg font-semibold">Could not reach the server</h1>
          <p className="text-sm text-muted-foreground">
            We were unable to verify your session. Please refresh the page.
          </p>
          <p className="text-xs text-muted-foreground/70">
            {state.error.message}
          </p>
        </div>
      </div>
    );
  }

  if (state.status === "unauthenticated") {
    return null;
  }

  return <>{children}</>;
}

export default AuthGate;
