import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import { BASE_PATH, ROUTER_BASE } from "./lib/config";
import { outOfBaseRedirectTarget } from "./lib/basePath";
import "./index.css";

// Post-cutover fix for TODO open item 7's "blank page at /". Once BASE_PATH
// is set, this origin serves the prefixed build at *every* path — the
// dashboard's static service answers "/" and old deep links with an
// index.html whose assets resolve under the prefix — so the bundle runs, but
// the router base is the prefix while window.location is not under it, no
// route matches, and the page renders empty. Those addresses are exactly the
// pre-cutover ones users have bookmarked and been mailed.
//
// Repair: hop to the same path under the base before mounting anything, query
// and fragment intact ("/" → "/chat/", "/login?e=x" → "/chat/login?e=x").
// location.replace, not assign, so the dead address doesn't pollute history.
//
// Darkness: at the default base outOfBaseRedirectTarget returns null for
// every address (pinned by basePath.test.ts), so this block is a no-op and
// the app boots exactly as before.
const redirectTarget = outOfBaseRedirectTarget(
  BASE_PATH,
  window.location.pathname,
  window.location.search + window.location.hash,
);
if (redirectTarget !== null) {
  window.location.replace(redirectTarget);
  // Deliberately do not mount: an app rendered at an out-of-base location
  // fires AuthGate's own navigate(), whose pushState would race the pending
  // replace(). The blank frame lasts only for the hop.
} else {
  // TODO.md open item 1 — the generated API client (lib/api-client-react)
  // bakes "/api/..." into every request URL at codegen time, from
  // `baseUrl: "/api"` in lib/api-spec/orval.config.ts. AuthGate runs through
  // that client, so under a non-root BASE_PATH the session check would call
  // the wrong path and every page would read as unauthenticated.
  //
  // Resolved here rather than in the generated files: `custom-fetch` already
  // exposes setBaseUrl(), and it prepends the value to any request path that
  // starts with "/". Pointing it at the base makes "/api/auth/me" resolve to
  // "/chat/api/auth/me" at runtime, so no generated file changes, no codegen
  // run, and orval's baseUrl stays "/api" — the client keeps working
  // unchanged for any other consumer.
  //
  // Darkness: at the default base ROUTER_BASE is "", which setBaseUrl treats
  // as "no base" (it stores null), so every request URL is byte-for-byte what
  // it is today. This runs before createRoot, so no hook can fire a request
  // first.
  setBaseUrl(ROUTER_BASE);

  createRoot(document.getElementById("root")!).render(<App />);
}
