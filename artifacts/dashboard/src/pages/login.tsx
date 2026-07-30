import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-current-user";
import { apiPath } from "@/lib/config";

const ERROR_MESSAGES: Record<string, string> = {
  domain_not_allowed:
    "That Google account is not on the allowed domain list. Please sign in with your @mobupps.com account.",
  email_not_verified:
    "Your Google account email is not verified. Please verify it and try again.",
  oauth_denied: "Sign-in was cancelled. Please try again.",
  oauth_state_invalid:
    "The sign-in link expired or was invalid. Please try again.",
  oauth_invalid_response: "Google returned an invalid response. Please try again.",
  oauth_token_exchange_failed:
    "We could not complete sign-in with Google. Please try again.",
  oauth_userinfo_failed:
    "We could not read your Google profile. Please try again.",
  oauth_callback_failed:
    "Something went wrong while signing you in. Please try again.",
  oauth_start_failed: "Could not start the Google sign-in flow. Please try again.",
  user_upsert_failed: "Could not create your user record. Please contact support.",
};

export default function LoginPage() {
  const state = useCurrentUser();
  const [, navigate] = useLocation();
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) setErrorCode(err);
  }, []);

  useEffect(() => {
    if (state.status === "authenticated") {
      navigate("/", { replace: true });
    }
  }, [state.status, navigate]);

  function handleSignIn() {
    // Browser navigates the top frame to the OAuth start endpoint, which
    // 302-redirects to Google. Cannot use fetch() here.
    window.location.assign(apiPath("/auth/google/start"));
  }

  const errorMessage =
    errorCode != null
      ? (ERROR_MESSAGES[errorCode] ??
        "Sign-in failed. Please try again.")
      : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <h1
            className="text-xl font-semibold tracking-tight"
            data-testid="login-title"
          >
            Chat Followuper
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in with your MobUpps Google account.
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            data-testid="login-error"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {errorMessage}
          </div>
        )}

        <Button
          type="button"
          className="w-full"
          onClick={handleSignIn}
          disabled={state.status === "loading"}
          data-testid="button-sign-in-google"
        >
          Sign in with Google
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Identity only — no Gmail access is requested.
        </p>
      </div>
    </div>
  );
}
