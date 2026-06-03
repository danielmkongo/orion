import type { FastifyInstance } from 'fastify';
import { telemetryService } from '../services/telemetry.service.js';
import { deviceService } from '../services/device.service.js';
import { realtimeService } from '../services/realtime.service.js';
import { requirePermission } from '../middleware/auth.js';
import { IngestLog } from '../models/IngestLog.js';

export async function telemetryRoutes(app: FastifyInstance) {
  // Capture every hit on /telemetry/ingest — including malformed JSON, missing API key, oversized payloads —
  // into IngestLog so the Raw payloads panel can show full HTTP-level device debugging.
  app.addHook('onResponse', async (req, reply) => {
    const url = req.url.split('?')[0];
    if (req.method !== 'POST' || !url.endsWith('/telemetry/ingest')) return;
    try {
      const rawBody = ((req as any).rawBody as string | undefined) ?? null;
      const parsedBody = (typeof req.body === 'object' && req.body !== null) ? (req.body as Record<string, unknown>) : null;
      const apiKey =
        (req.headers['x-api-key'] as string | undefined) ??
        ((req.query as any)?.apiKey as string | undefined) ??
        (parsedBody && typeof parsedBody.api_key === 'string' ? (parsedBody.api_key as string) : null);
      // Resolve device best-effort (may be null if api key missing/invalid or body unparseable)
      let deviceId: any = null, orgId: any = null;
      if (apiKey) {
        try {
          const dev = await deviceService.getByApiKey(apiKey);
          if (dev) { deviceId = (dev as any)._id; orgId = (dev as any).orgId; }
        } catch { /* ignore lookup errors */ }
      }
      const status = reply.statusCode;
      const parseError = ((req as any).validationError?.message
        ?? (status === 400 && !parsedBody && rawBody ? 'Body parse failed (malformed JSON)' : null)) as string | null;
      const responseError = status >= 400 ? (((reply as any)._payloadErr as string) ?? null) : null;
      const ip = (req.ip ?? (req.headers['x-forwarded-for'] as string) ?? null);
      const userAgent = (req.headers['user-agent'] as string) ?? null;
      const contentType = (req.headers['content-type'] as string) ?? null;
      const contentLength = req.headers['content-length'] ? parseInt(req.headers['content-length'] as string, 10) : null;

      // Truncate huge bodies to bound storage
      const truncatedBody = rawBody && rawBody.length > 15_000
        ? `${rawBody.slice(0, 15_000)}…[truncated ${rawBody.length - 15_000}B]`
        : rawBody;

      await IngestLog.create({
        deviceId, orgId, apiKey,
        status, contentType, contentLength,
        rawBody: truncatedBody,
        parsedBody,
        parseError,
        responseError,
        ip, userAgent,
      });
    } catch (err) {
      // Logging must never break ingest itself
      req.log.warn({ err }, 'IngestLog write failed');
    }
  });

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

    const rawTs = body.timestamp as string | undefined;
    const hasTzMarker = !!rawTs && (rawTs.endsWith('Z') || /[+\-]\d{2}:\d{2}$/.test(rawTs));
    // For 'wallclock' devices (default): bare timestamps are device-local wall-clock — append Z so the
    //   digits become a "fake-UTC" anchor in storage. The display layer reinterprets using device.timezone.
    // For 'utc' devices: trust only timestamps that already declare a TZ; otherwise fall back to server-now
    //   (a bare string here means firmware mis-config — refuse to silently mislabel it).
    const tsFormat = (device as any).timestampFormat ?? 'wallclock';
    let normTs: string | undefined;
    if (tsFormat === 'utc') {
      normTs = hasTzMarker ? rawTs : undefined;
    } else {
      normTs = rawTs && !hasTzMarker ? rawTs + 'Z' : rawTs;
    }
    const timestamp = (normTs && !isNaN(new Date(normTs).getTime()))
      ? new Date(normTs).toISOString()
      : new Date().toISOString();
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

    if (loc?.lat && loc?.lng) {
      const { geofenceService } = await import('../services/geofence.service.js');
      geofenceService.checkTransitions(String(device._id), String(device.orgId), loc).catch(() => {});
    }

    // If device uses HTTP response-mode command delivery, include oldest pending command
    const cmdMode = (device as any).meta?.channelConfig?.cmdMode;
    if (cmdMode === 'response') {
      const { commandService } = await import('../services/command.service.js');
      const pending = await commandService.getPending(String(device._id));
      if (pending.length) {
        return reply.send({ ok: true, ts: timestamp, command: pending[0] });
      }
    }

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

  // Device debug log — full HTTP-level capture of every ingest hit (including malformed JSON and rejected requests)
  app.get('/telemetry/ingest-log', { preHandler: requirePermission('telemetry:read') }, async (req, reply) => {
    const q = req.query as any;
    if (!q.deviceId) return reply.code(400).send({ error: 'deviceId required' });
    const limit = q.limit ? Math.min(500, parseInt(q.limit)) : 100;
    const filter: Record<string, unknown> = { deviceId: q.deviceId, orgId: req.user.orgId };
    if (q.status) filter.status = parseInt(q.status);
    const docs = await IngestLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    // Mask API keys before sending
    const masked = docs.map((d: any) => ({
      ...d,
      apiKey: d.apiKey ? `${String(d.apiKey).slice(0, 8)}…${String(d.apiKey).slice(-4)}` : null,
    }));
    return reply.send({ data: masked, count: masked.length });
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
