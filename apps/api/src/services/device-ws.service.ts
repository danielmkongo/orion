import type { FastifyInstance } from 'fastify';
import { deviceService } from './device.service.js';
import { telemetryService } from './telemetry.service.js';
import { realtimeService } from './realtime.service.js';
import { commandBus } from './command-bus.js';
import { Command } from '../models/Command.js';

/** Map deviceId → live WebSocket connection. */
const connections = new Map<string, any>();

export async function registerDeviceWs(app: FastifyInstance) {
  // Route lives at GET /ws?apiKey=… (outside /api/v1 prefix)
  (app as any).get('/ws', { websocket: true }, async (socket: any, req: any) => {
    const apiKey = (req.query as any)?.apiKey as string | undefined;
    if (!apiKey) { socket.close(4001, 'API key required'); return; }

    const device = await deviceService.getByApiKey(apiKey);
    if (!device) { socket.close(4003, 'Invalid API key'); return; }

    const deviceId = String((device as any)._id);
    const orgId    = String((device as any).orgId);
    connections.set(deviceId, socket);

    socket.on('message', async (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'telemetry') {
          const fields: Record<string, number | string | boolean> = {};
          const src = msg.data ?? msg;
          for (const [k, v] of Object.entries(src)) {
            if (k !== 'type' && (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean')) {
              fields[k] = v;
            }
          }
          const ts = msg.timestamp ?? new Date().toISOString();
          await telemetryService.ingest(deviceId, orgId, { deviceId, timestamp: ts, fields });
          realtimeService.emitTelemetry(orgId, deviceId, fields, undefined, ts);
        } else if (msg.type === 'ack') {
          const { commandService } = await import('./command.service.js');
          const status = msg.status ?? 'executed';
          await commandService.acknowledge(msg.commandId, deviceId, status, msg.response, msg.errorMessage);
        }
      } catch { /* ignore malformed frames */ }
    });

    socket.on('close', () => connections.delete(deviceId));
    socket.on('error', () => connections.delete(deviceId));
  });

  // Push commands to connected devices
  commandBus.on('command.created', async ({ deviceId, command }: any) => {
    const ws = connections.get(deviceId);
    if (!ws || ws.readyState !== 1 /* OPEN */) return;

    ws.send(JSON.stringify({
      type: 'command',
      commandId: String(command._id),
      name: command.name,
      payload: command.payload ?? {},
    }));

    await Command.findByIdAndUpdate(command._id, { $set: { status: 'sent', sentAt: new Date() } });
  });
}
