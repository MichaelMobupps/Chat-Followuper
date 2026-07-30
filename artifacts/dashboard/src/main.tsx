import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import { ROUTER_BASE } from "./lib/config";
import "./index.css";

// TODO.md open item 1 — the generated API client (lib/api-client-react) bakes
// "/api/..." into every request URL at codegen time, from `baseUrl: "/api"` in
// lib/api-spec/orval.config.ts. AuthGate runs through that client, so under a
// non-root BASE_PATH the session check would call the wrong path and every
// page would read as unauthenticated.
//
// Resolved here rather than in the generated files: `custom-fetch` already
// exposes setBaseUrl(), and it prepends the value to any request path that
// starts with "/". Pointing it at the base makes "/api/auth/me" resolve to
// "/chat/api/auth/me" at runtime, so no generated file changes, no codegen
// run, and orval's baseUrl stays "/api" — the client keeps working unchanged
// for any other consumer.
//
// Darkness: at the default base ROUTER_BASE is "", which setBaseUrl treats as
// "no base" (it stores null), so every request URL is byte-for-byte what it
// is today. This runs before createRoot, so no hook can fire a request first.
setBaseUrl(ROUTER_BASE);

createRoot(document.getElementById("root")!).render(<App />);
