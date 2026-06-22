import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null = null;

/**
 * One Workspace mailbox over SMTP. Env:
 *   SMTP_HOST   default smtp.gmail.com
 *   SMTP_PORT   default 587 (STARTTLS); 465 uses implicit TLS
 *   SMTP_USER   the sending mailbox, e.g. followups@mobupps.com
 *   SMTP_PASS   an app password for that mailbox (mailbox has 2FA on)
 *   FOLLOWUP_FROM optional display From; defaults to SMTP_USER
 */
function getTransport(): Transporter {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST ?? "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    throw new Error(
      "SMTP_USER and SMTP_PASS are required to send follow-up reminder emails.",
    );
  }
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return transporter;
}

export async function sendMail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const from = process.env.FOLLOWUP_FROM ?? process.env.SMTP_USER!;
  await getTransport().sendMail({ from, to, subject, html });
}
