const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? '587');
const SMTP_USER = process.env.SMTP_USER ?? '';
const SMTP_PASS = process.env.SMTP_PASS ?? '';
const SMTP_FROM = process.env.SMTP_FROM ?? 'noreply@orion.app';

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key) => vars[key] ?? '');
}

export interface EmailPayload {
  to: string;
  subject: string;
  body: string;
}

async function sendViaResend(payload: EmailPayload): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: SMTP_FROM,
      to: [payload.to],
      subject: payload.subject,
      text: payload.body,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend error ${res.status}: ${text}`);
  }
}

async function sendViaSMTP(payload: EmailPayload): Promise<void> {
  const nodemailer = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transport.sendMail({ from: SMTP_FROM, to: payload.to, subject: payload.subject, text: payload.body });
}

export class EmailService {
  async send(payload: EmailPayload, vars: Record<string, string> = {}): Promise<void> {
    const resolved: EmailPayload = {
      to: payload.to,
      subject: interpolate(payload.subject, vars),
      body: interpolate(payload.body, vars),
    };

    if (RESEND_API_KEY) {
      await sendViaResend(resolved);
      return;
    }
    if (SMTP_HOST) {
      await sendViaSMTP(resolved);
      return;
    }
    console.warn('[email] No email provider configured (set RESEND_API_KEY or SMTP_HOST)');
  }
}

export const emailService = new EmailService();
