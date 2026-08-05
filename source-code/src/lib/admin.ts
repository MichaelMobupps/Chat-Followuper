/**
 * Admin allowlist.
 *
 * Who counts as an admin is controlled by the ADMIN_EMAILS environment
 * variable (comma-separated), mirroring how ALLOWED_LOGIN_DOMAINS controls
 * who may log in. This needs no database role and no migration, and changing
 * the admins is a settings edit. Everyone not in the list is a salesperson
 * and stays fully isolated to their own data.
 */
function adminEmails(): string[] {
  const raw = process.env["ADMIN_EMAILS"] ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.trim().toLowerCase());
}
