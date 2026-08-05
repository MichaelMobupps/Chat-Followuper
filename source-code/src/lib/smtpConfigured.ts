/** True when SMTP credentials are present for outbound email. */
export function isSmtpConfigured(): boolean {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  return !!user && !!pass;
}