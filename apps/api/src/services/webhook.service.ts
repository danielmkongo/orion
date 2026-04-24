const RFC1918 = [
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^127\.\d+\.\d+\.\d+$/,
  /^::1$/,
  /^localhost$/i,
  /^0\.0\.0\.0$/,
];

function isPrivate(host: string): boolean {
  return RFC1918.some(re => re.test(host));
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key) => vars[key] ?? '');
}

export interface WebhookConfig {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export class WebhookService {
  async dispatch(config: WebhookConfig, vars: Record<string, string> = {}): Promise<void> {
    const url = interpolate(config.url, vars);

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Webhook: invalid URL "${url}"`);
    }

    if (parsed.protocol !== 'https:') throw new Error('Webhook: only HTTPS URLs allowed');
    if (isPrivate(parsed.hostname)) throw new Error(`Webhook: SSRF guard blocked "${parsed.hostname}"`);

    const method = (config.method ?? 'POST').toUpperCase();
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...config.headers };
    const body = config.body ? interpolate(config.body, vars) : undefined;

    const delays = [0, 1000, 2000, 4000];
    let lastErr: unknown;
    for (let i = 0; i < 3; i++) {
      if (delays[i]) await new Promise(r => setTimeout(r, delays[i]));
      try {
        const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(10_000) });
        if (res.ok) return;
        lastErr = new Error(`Webhook HTTP ${res.status}`);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }
}

export const webhookService = new WebhookService();
