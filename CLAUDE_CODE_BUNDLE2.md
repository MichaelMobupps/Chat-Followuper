# Claude Code Work Order - Chat Followupper Bundle 2 (Switchable Base Path)

Paste everything below the line into Claude Code in the Chat Followupper Repl. Prerequisites: Bundle 1 and M1 merged (both are).

---

You are executing Bundle 2 of the Chat Followupper migration, defined in ROADMAP.md. The Standing Bundle Ritual applies in full and in order. Work on branch `bundle-2-base-path`.

## Goal

Make the app fully servable under a URL prefix (the gateway will forward tools.mobupps.net/chat to it), controlled entirely by the BASE_PATH and PUBLIC_URL env vars from Bundle 1. THE DARKNESS RULE: with both env vars unset, the app's behavior must remain byte-for-byte identical to today. Every change in this bundle activates only when BASE_PATH is set to something other than "/".

## Scope

1. Generated API client: TODO.md open item 1. `lib/api-client-react` hardcodes `baseUrl: "/api"` via orval codegen, and AuthGate runs through it, so this is the cutover blocker. Make the client's base resolve from the Bundle 1 config at runtime (prefer wiring it through the existing custom-fetch over editing generated files; if the orval config must change and files be regenerated, verify the regenerated diff contains only the base change). With BASE_PATH unset, requests must remain exactly "/api/...".
2. Frontend base: Vite `base` and the wouter Router base derive from BASE_PATH at build/runtime. Asset URLs, Route/Link/navigate targets, and index.html references must all resolve under the prefix. Bundle 1 noted these flow from the base already; verify that holds when the base is not "/".
3. Backend under prefix: every route the browser reaches must work under BASE_PATH: API mounts, the SPA catch-all serving index.html for deep links under the prefix, and the OAuth callback path. A request to the bare prefix without trailing slash gets redirected to prefix with slash.
4. Redirects: all server-side redirects (the /login pair, post-login /, the /followup/whatsapp fallback) become prefix-aware.
5. Cookies: when and only when BASE_PATH is set and not "/", the session cookie is issued under the name `cf_session` with path set to BASE_PATH. With BASE_PATH unset, the current cookie name and path remain untouched, so dark stays dark; the one-time logout happens at cutover only.
6. Outgoing links and registrations: digest email links and the Google OAuth redirect URI construction must derive from PUBLIC_URL (Bundle 1 centralized them; verify under non-default values). Do not change what is registered at Google or Apollo; that happens at cutover and is already recorded in TODO.md.

## Out of scope

Database anything. Scheduler timing. The 14 unknown migrations. Dependency additions beyond what orval regeneration itself requires (record any such requirement in the ledger).

## Ritual reminders specific to this bundle

- Blast radius statement first, into the TODO.md ledger and chat.
- Gates: typecheck, tests, build. Add cheap unit tests for the path-resolution helpers (base joining, redirect prefixing) so the behavior is pinned in both modes.
- Godlike audit across technical, security, and end-user framings until a clean round. Security framing must specifically re-check: no open redirects via BASE_PATH values (the M1-era normalizeBasePath fix must still hold), and no cookie scoped wider than BASE_PATH.
- Smoke, two runs required:
  a. DARK RUN: env unset. Boot, probe the same 17-endpoint baseline from Bundle 1, byte-identical expected. Login redirect still to /login. Cookie name unchanged.
  b. LIT RUN: BASE_PATH=/chat/ and PUBLIC_URL=https://tools.mobupps.net/chat set in the shell for the process only (do not write them into Replit Secrets). Boot, then verify: main page at /chat/, a deep link under /chat/ hard-loads via the catch-all, assets resolve with zero 404s, API calls go to /chat/api and succeed, login redirect goes to /chat/login, cookie is cf_session with path /chat/, and a generated digest link (dry-run or log inspection, send nothing) contains https://tools.mobupps.net/chat.
- Auto-fix in scope; out-of-scope findings to TODO.md.
- Ledger entry, merge `bundle-2-base-path` to main, push both. Nothing deployed, restarted, or published.

## Hard rules

Unchanged from Bundle 1: no destructive git, no force-push, no broad process kills, no deploys, no secret changes, halt after 3 failed attempts on one cause, ask when ambiguous.
