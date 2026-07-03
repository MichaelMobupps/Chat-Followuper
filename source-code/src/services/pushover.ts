/**
 * Pushover notification client for mobile follow-up reminders.
 *
 * Each sales rep stores their Pushover User Key on their account.
 * The app-level token (PUSHOVER_APP_TOKEN) is shared across Mobupps.
 *
 * @see https://pushover.net/api
 */

const PUSHOVER_API = "https://api.pushover.net/1/messages.json";
const USER_KEY_RE = /^[A-Za-z0-9]{30}$/;

export function isPushoverAppConfigured(): boolean {
  const token = process.env.PUSHOVER_APP_TOKEN?.trim();
  return !!token && token.length === 30;
}

export function isValidPushoverUserKey(key: string): boolean {
  return USER_KEY_RE.test(key.trim());
}

export interface PushoverMessageInput {
  userKey: string;
  message: string;
  title?: string;
  url?: string;
  urlTitle?: string;
  /** 0 = normal, 1 = high (bypasses quiet hours on device) */
  priority?: 0 | 1;
}

export async function sendPushover(
  input: PushoverMessageInput,
): Promise<void> {
  const token = process.env.PUSHOVER_APP_TOKEN?.trim();
  if (!token) {
    throw new Error("pushover_not_configured");
  }
  if (!isValidPushoverUserKey(input.userKey)) {
    throw new Error("invalid_pushover_user_key");
  }

  const body = new URLSearchParams({
    token,
    user: input.userKey.trim(),
    message: input.message,
  });
  if (input.title) body.set("title", input.title);
  if (input.url) body.set("url", input.url);
  if (input.urlTitle) body.set("url_title", input.urlTitle);
  if (input.priority !== undefined) {
    body.set("priority", String(input.priority));
  }

  const res = await fetch(PUSHOVER_API, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`pushover_api_error:${res.status}:${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as { status?: number; errors?: string[] };
  if (json.status !== 1) {
    throw new Error(
      `pushover_rejected:${(json.errors ?? ["unknown"]).join(",")}`,
    );
  }
}