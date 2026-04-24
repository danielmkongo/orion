import type { FastifyInstance } from 'fastify';
import { Device } from '../models/Device.js';
import { Telemetry } from '../models/Telemetry.js';
import { requirePermission } from '../middleware/auth.js';

function escapeCSV(val: unknown): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowToCSV(cols: string[], obj: Record<string, unknown>): string {
  return cols.map(c => escapeCSV(obj[c])).join(',');
}

export async function exportRoutes(app: FastifyInstance) {
  app.get('/export/devices-csv', { preHandler: requirePermission('devices:read') }, async (req, reply) => {
    const devices = await Device.find({ orgId: req.user.orgId }).lean() as any[];

    const cols = ['_id', 'name', 'serialNumber', 'type', 'status', 'lastSeenAt', 'createdAt'];
    const header = cols.join(',');
    const rows = devices.map(d => rowToCSV(cols, d));
    const csv = [header, ...rows].join('\n');

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="devices.csv"');
    return reply.send(csv);
  });

  app.get('/export/telemetry-csv', { preHandler: requirePermission('devices:read') }, async (req, reply) => {
    const { deviceId, from, to } = req.query as any;
    const filter: Record<string, unknown> = { orgId: req.user.orgId };
    if (deviceId) filter.deviceId = deviceId;
    if (from || to) {
      filter.timestamp = {};
      if (from) (filter.timestamp as any).$gte = new Date(from);
      if (to)   (filter.timestamp as any).$lte = new Date(to);
    }

    const docs = await Telemetry.find(filter)
      .sort({ timestamp: -1 })
      .limit(50_000)
      .lean() as any[];

    if (!docs.length) {
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename="telemetry.csv"');
      return reply.send('deviceId,timestamp,fields\n');
    }

    // Collect all field keys
    const fieldKeys = new Set<string>();
    for (const d of docs) {
      if (d.fields) for (const k of Object.keys(d.fields)) fieldKeys.add(k);
    }
    const cols = ['deviceId', 'timestamp', ...Array.from(fieldKeys)];
    const header = cols.join(',');
    const rows = docs.map(d => {
      const flat: Record<string, unknown> = {
        deviceId: d.deviceId,
        timestamp: d.timestamp?.toISOString?.() ?? d.timestamp,
        ...d.fields,
      };
      return rowToCSV(cols, flat);
    });

    const csv = [header, ...rows].join('\n');
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="telemetry.csv"');
    return reply.send(csv);
  });
}
