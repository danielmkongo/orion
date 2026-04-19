// @ts-ignore — coap ships no TS declarations; types are 'any'
import coap from 'coap';
import { deviceService } from './device.service.js';
import { telemetryService } from './telemetry.service.js';
import { realtimeService } from './realtime.service.js';
import { commandService } from './command.service.js';

const COAP_PORT = parseInt(process.env.COAP_PORT ?? '5683');

function coerce(val: string | undefined): string | number | boolean {
  if (!val) return '';
  if (val === 'true') return true;
  if (val === 'false') return false;
  const n = Number(val);
  return !isNaN(n) ? n : val;
}

function parsePayload(raw: string, format: string): Record<string, unknown> {
  try {
    switch (format) {
      case 'csv': {
        const lines = raw.trim().split('\n');
        if (lines.length < 2) return {};
        const keys = lines[0].split(',').map((s: string) => s.trim());
        const vals = lines[1].split(',').map((s: string) => s.trim());
        return Object.fromEntries(keys.map((k: string, i: number) => [k, coerce(vals[i])]));
      }
      case 'raw':
        return Object.fromEntries(raw.split('&').map((p: string) => { const [k, v] = p.split('='); return [k.trim(), coerce(v?.trim())]; }));
      case 'xml': {
        const obj: Record<string, unknown> = {};
        for (const m of raw.matchAll(/<(\w+)>([^<]*)<\/\1>/g)) obj[m[1]] = coerce(m[2]);
        return obj;
      }
      default:
        return JSON.parse(raw);
    }
  } catch {
    return {};
  }
}

export function startCoapServer() {
  const server = coap.createServer();

  server.on('request', async (req: any, res: any) => {
    const [pathname, qs] = (req.url as string).split('?');
    const params = new URLSearchParams(qs ?? '');

    try {
      if (req.method === 'POST' && pathname === '/telemetry') {
        const apiKey = (req.headers?.['x-api-key'] as string) ?? params.get('apiKey');
        if (!apiKey) { res.code = '4.01'; res.end(); return; }

        const device = await deviceService.getByApiKey(apiKey);
        if (!device) { res.code = '4.03'; res.end(); return; }

        const body = parsePayload(req.payload?.toString() ?? '{}', (device as any).payloadFormat ?? 'json');
        const fields: Record<string, number | string | boolean> = {};
        for (const [k, v] of Object.entries(body)) {
          if (k !== 'api_key' && (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean')) {
            fields[k] = v;
          }
        }

        if (Object.keys(fields).length) {
          const ts       = new Date().toISOString();
          const deviceId = String((device as any)._id);
          const orgId    = String((device as any).orgId);
          await telemetryService.ingest(deviceId, orgId, { deviceId, timestamp: ts, fields });
          realtimeService.emitTelemetry(orgId, deviceId, fields, undefined, ts);
        }

        res.code = '2.04'; // Changed
        res.end(JSON.stringify({ ok: true }));

      } else if (req.method === 'GET' && pathname === '/commands/pending') {
        const apiKey = params.get('apiKey');
        if (!apiKey) { res.code = '4.01'; res.end(); return; }

        const device = await deviceService.getByApiKey(apiKey);
        if (!device) { res.code = '4.03'; res.end(); return; }

        const cmds = await commandService.getPending(String((device as any)._id));
        res.code = '2.05'; // Content
        res.end(JSON.stringify({ commands: cmds }));

      } else if (req.method === 'POST' && pathname === '/commands/ack') {
        const apiKey = params.get('apiKey');
        if (!apiKey) { res.code = '4.01'; res.end(); return; }

        const device = await deviceService.getByApiKey(apiKey);
        if (!device) { res.code = '4.03'; res.end(); return; }

        const body = JSON.parse(req.payload?.toString() ?? '{}');
        await commandService.acknowledge(body.commandId, String((device as any)._id), body.status ?? 'executed', body.response, body.errorMessage);
        res.code = '2.04';
        res.end(JSON.stringify({ ok: true }));

      } else {
        res.code = '4.04';
        res.end();
      }
    } catch (err: any) {
      res.code = '5.00';
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  server.listen(COAP_PORT, () => console.log(`🌐 CoAP server listening on UDP port ${COAP_PORT}`));
  return server;
}
