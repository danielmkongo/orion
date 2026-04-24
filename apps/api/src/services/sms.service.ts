const NEXTSMS_USERNAME = process.env.NEXTSMS_USERNAME ?? 'Vortan';
const NEXTSMS_PASSWORD = process.env.NEXTSMS_PASSWORD ?? '!Baguvix0';
const NEXTSMS_SENDER_ID = process.env.NEXTSMS_SENDER_ID ?? '';

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key) => vars[key] ?? '');
}

export class SmsService {
  async send(to: string, message: string, vars: Record<string, string> = {}): Promise<void> {
    if (!NEXTSMS_USERNAME || !NEXTSMS_PASSWORD) {
      console.warn('[sms] No NextSMS credentials configured');
      return;
    }

    const text = interpolate(message, vars);
    const auth = Buffer.from(`${NEXTSMS_USERNAME}:${NEXTSMS_PASSWORD}`).toString('base64');

    const body: Record<string, string> = { to, text };
    if (NEXTSMS_SENDER_ID) body.from = NEXTSMS_SENDER_ID;

    const res = await fetch('https://messaging.nextsms.co.tz/api/sms/v1/text/single', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`NextSMS error ${res.status}: ${text}`);
    }
  }
}

export const smsService = new SmsService();
