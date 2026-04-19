import net from 'node:net';
import { deviceService } from './device.service.js';
import { telemetryService } from './telemetry.service.js';
import { realtimeService } from './realtime.service.js';
import { commandBus } from './command-bus.js';
import { Command } from '../models/Command.js';

const TCP_PORT = parseInt(process.env.TCP_PORT ?? '8883');

function coerce(val: string | undefined): string | number | boolean {
  if (!val) return '';
  if (val === 'true') return true;
  if (val === 'false') return false;
  const n = Number(val);
  return !isNaN(n) ? n : val;
}

function parseFields(raw: string): Record<string, number | string | boolean> {
  const fields: Record<string, number | string | boolean> = {};
  try {
    const parsed = JSON.parse(raw);
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') fields[k] = v;
    }
  } catch {
    for (const pair of raw.split('&')) {
      const [k, v] = pair.split('=');
      if (k?.trim()) fields[k.trim()] = coerce(v?.trim());
    }
  }
  return fields;
}

export function startTcpServer(): net.Server {
  const server = net.createServer(socket => {
    let device: any = null;
    let buf = '';

    const onCommand = async ({ deviceId, command }: any) => {
      if (!device || String(device._id) !== deviceId) return;
      socket.write(`CMD:${command._id}:${JSON.stringify({ name: command.name, payload: command.payload ?? {} })}\n`);
      await Command.findByIdAndUpdate(command._id, { $set: { status: 'sent', sentAt: new Date() } });
    };

    socket.on('data', async chunk => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (!device) {
          device = await deviceService.getByApiKey(trimmed);
          if (!device) { socket.write('ERR:invalid_key\n'); socket.destroy(); return; }
          socket.write('OK\n');
          commandBus.on('command.created', onCommand);
        } else if (trimmed.startsWith('ACK:')) {
          // ACK:{commandId}:{status}
          const rest = trimmed.slice(4).split(':');
          if (rest.length >= 2) {
            const { commandService } = await import('./command.service.js');
            await commandService.acknowledge(rest[0], String(device._id), (rest[1] as any) ?? 'executed');
          }
        } else {
          const fields = parseFields(trimmed);
          if (Object.keys(fields).length) {
            const ts = new Date().toISOString();
            const deviceId = String(device._id);
            const orgId    = String(device.orgId);
            await telemetryService.ingest(deviceId, orgId, { deviceId, timestamp: ts, fields });
            realtimeService.emitTelemetry(orgId, deviceId, fields, undefined, ts);
          }
        }
      }
    });

    socket.on('close', () => commandBus.off('command.created', onCommand));
    socket.on('error', () => { commandBus.off('command.created', onCommand); socket.destroy(); });
  });

  server.listen(TCP_PORT, () => console.log(`🔌 TCP server listening on port ${TCP_PORT}`));
  return server;
}
