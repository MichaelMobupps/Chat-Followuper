/**
 * Direct Anthropic SDK client.
 *
 * This module talks to api.anthropic.com directly with ANTHROPIC_API_KEY.
 * Single source of credentials, single import site, clearer error messages.
 */
import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  // Fail loudly at boot rather than on first request — a missing API key is
  // a config problem, not a runtime problem, and should be visible immediately
  // in the deploy logs.
  throw new Error(
    "ANTHROPIC_API_KEY is not set. Add it as a Replit Secret for both the " +
      "workspace and the deployment. Get a key at https://console.anthropic.com/",
  );
}

export const anthropic = new Anthropic({
  apiKey,
  // Reasonable network timeouts. The SDK default is 10min, way too long for
  // a user-facing follow-up pipeline. If a request is still pending after 60s,
  // it's better to fail and let our retry layer try again.
  timeout: 60 * 1000,
  maxRetries: 0, // We implement our own retry logic with visibility and logging.
});
