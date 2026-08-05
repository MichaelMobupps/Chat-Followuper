/**
 * Canonical public base URL for digest emails, follow-up open links, and OAuth.
 * Accepts APP_PUBLIC_URL or PUBLIC_BASE_URL (legacy .env.example name).
 */
export function appPublicUrl(): string {
  const u = process.env.APP_PUBLIC_URL ?? process.env.PUBLIC_BASE_URL;
  if (!u) {
    throw new Error(
      "APP_PUBLIC_URL (or PUBLIC_BASE_URL) is required for public links.",
    );
  }
  return u.replace(/\/+$/, "");
}