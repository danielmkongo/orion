import dgram from 'node:dgram';
import { deviceService } from './device.service.js';
import { telemetryService } from './telemetry.service.js';
import { realtimeService } from './realtime.service.js';

const UDP_PORT = parseInt(process.env.UDP_PORT ?? '8884');

function coerce(val: string | undefined): string | number | boolean {
  if (!val) return '';
  if (val === 'true') return true;
  if (val === 'false') return false;
  const n = Number(val);
  return !isNaN(n) ? n : val;
}

function parseFields(payload: string): Record<string, number | string | boolean> {
  const fields: Record<string, number | string | boolean> = {};
  try {
    const parsed = JSON.parse(payload);
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') fields[k] = v;
    }
  } catch {
    for (const pair of payload.split('&')) {
      const [k, v] = pair.split('=');
      if (k?.trim()) fields[k.trim()] = coerce(v?.trim());
    }
  }
  return fields;
}

export function startUdpServer(): dgram.Socket {
  const server = dgram.createSocket('udp4');

  server.on('message', async msg => {
    const text = msg.toString().trim();
    // Packet format: {apiKey}|{payload}
    const sep = text.indexOf('|');
    if (sep === -1) return;

    const apiKey  = text.slice(0, sep).trim();
    const payload = text.slice(sep + 1).trim();
    if (!apiKey || !payload) return;

    const device = await deviceService.getByApiKey(apiKey);
    if (!device) return;

    const fields = parseFields(payload);
    if (!Object.keys(fields).length) return;

    const ts       = new Date().toISOString();
    const deviceId = String((device as any)._id);
    const orgId    = String((device as any).orgId);
    await telemetryService.ingest(deviceId, orgId, { deviceId, timestamp: ts, fields });
    realtimeService.emitTelemetry(orgId, deviceId, fields, undefined, ts);
  });

  server.on('error', err => console.error('UDP error:', err.message));

  server.bind(UDP_PORT, () => console.log(`📻 UDP server listening on port ${UDP_PORT}`));
  return server;
}
