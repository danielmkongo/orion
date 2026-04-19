import type { FastifyInstance } from 'fastify';
import { telemetryService } from '../services/telemetry.service.js';
import { deviceService } from '../services/device.service.js';
import { realtimeService } from '../services/realtime.service.js';
import { requirePermission } from '../middleware/auth.js';

export async function telemetryRoutes(app: FastifyInstance) {
  // Authenticated data ingest via HTTP (for testing / HTTP devices)
  // Auth accepted as: X-API-Key header, ?apiKey query param, or api_key in JSON body
  app.post('/telemetry/ingest', async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    const apiKey =
      (req.headers['x-api-key'] as string) ??
      (req.query as any).apiKey ??
      (typeof body?.api_key === 'string' ? body.api_key : undefined);

    if (!apiKey) return reply.code(401).send({ error: 'API key required' });

    const device = await deviceService.getByApiKey(apiKey);
    if (!device) return reply.code(401).send({ error: 'Invalid API key' });

    const timestamp = (body.timestamp as string) ?? new Date().toISOString();
    const fields: Record<string, number | string | boolean | null> = {};

    // Flatten top-level scalar values; strip auth/meta fields
    const RESERVED = new Set(['api_key', 'timestamp', 'device_id']);
    for (const [k, v] of Object.entries(body)) {
      if (!RESERVED.has(k) && (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean')) {
        fields[k] = v as number | string | boolean;
      }
    }

    const point = { deviceId: String(device._id), timestamp, fields };
    await telemetryService.ingest(String(device._id), String(device.orgId), point);

    const loc = (telemetryService as any).extractLocation?.(fields);
    realtimeService.emitTelemetry(String(device.orgId), String(device._id), fields, loc, timestamp);

    return reply.send({ ok: true, ts: timestamp });
  });

  app.get('/telemetry', { preHandler: requirePermission('telemetry:read') }, async (req, reply) => {
    const q = req.query as any;
    const docs = await telemetryService.query(req.user.orgId, {
      deviceId: q.deviceId,
      from: q.from,
      to: q.to,
      fields: q.fields ? q.fields.split(',') : undefined,
      limit: q.limit ? parseInt(q.limit) : 200,
      offset: q.offset ? parseInt(q.offset) : 0,
    });
    return reply.send({ data: docs, count: docs.length });
  });

  app.get('/telemetry/latest', { preHandler: requirePermission('telemetry:read') }, async (req, reply) => {
    const { deviceId } = req.query as any;
    if (!deviceId) return reply.code(400).send({ error: 'deviceId required' });
    const doc = await telemetryService.getLatest(deviceId, req.user.orgId);
    return reply.send(doc ?? null);
  });

  app.get('/telemetry/series', { preHandler: requirePermission('telemetry:read') }, async (req, reply) => {
    const { deviceId, field, from, to, limit } = req.query as any;
    if (!deviceId || !field) return reply.code(400).send({ error: 'deviceId and field required' });
    const series = await telemetryService.getSeries(
      deviceId, req.user.orgId, field,
      from ?? new Date(Date.now() - 24 * 3600_000).toISOString(),
      to ?? new Date().toISOString(),
      limit ? parseInt(limit) : 1000
    );
    return reply.send({ field, deviceId, data: series });
  });

  app.get('/telemetry/location-history', { preHandler: requirePermission('telemetry:read') }, async (req, reply) => {
    const { deviceId, from, to, limit } = req.query as any;
    if (!deviceId) return reply.code(400).send({ error: 'deviceId required' });
    const history = await telemetryService.getLocationHistory(
      deviceId, req.user.orgId, from, to, limit ? parseInt(limit) : 1000
    );
    return reply.send({ deviceId, data: history });
  });
}
