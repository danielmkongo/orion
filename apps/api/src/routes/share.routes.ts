import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { authenticate } from '../middleware/auth.js';
import { Share } from '../models/Share.js';
import { Page } from '../models/Page.js';
import { Geofence } from '../models/Geofence.js';
import { Organization } from '../models/Organization.js';
import { deviceService } from '../services/device.service.js';
import { telemetryService } from '../services/telemetry.service.js';
import { commandService } from '../services/command.service.js';

export async function shareRoutes(app: FastifyInstance) {

  /* ── Authenticated: create a share ──────────────────────────── */
  app.post('/share', { preHandler: authenticate }, async (req, reply) => {
    const { type, resourceId, sections = [], label, expiresSeconds } = req.body as any;
    if (!type || !resourceId) return reply.code(400).send({ error: 'type and resourceId required' });

    const expiresAt = expiresSeconds ? new Date(Date.now() + expiresSeconds * 1000) : null;
    const token = nanoid(21);
    const share = await Share.create({
      orgId: req.user.orgId,
      type,
      resourceId,
      sections,
      token,
      label,
      createdBy: req.user.sub,
      expiresAt,
    });
    return reply.code(201).send({ token, id: share._id, expiresAt });
  });

  /* ── Authenticated: list org shares ─────────────────────────── */
  app.get('/share', { preHandler: authenticate }, async (req, reply) => {
    const shares = await Share.find({ orgId: req.user.orgId }).sort({ createdAt: -1 }).lean();
    return reply.send({ data: shares });
  });

  /* ── Authenticated: revoke a share ──────────────────────────── */
  app.delete('/share/:token', { preHandler: authenticate }, async (req, reply) => {
    const { token } = req.params as any;
    const result = await Share.deleteOne({ token, orgId: req.user.orgId });
    if (result.deletedCount === 0) return reply.code(404).send({ error: 'Not found' });
    return reply.send({ ok: true });
  });

  /* ── Authenticated: extend/update share expiry ───────────────── */
  app.patch('/share/:token', { preHandler: authenticate }, async (req, reply) => {
    const { token } = req.params as any;
    const { expiresSeconds } = req.body as any;
    const expiresAt = expiresSeconds ? new Date(Date.now() + expiresSeconds * 1000) : null;
    const result = await Share.findOneAndUpdate(
      { token, orgId: req.user.orgId },
      { $set: { expiresAt } },
      { new: true }
    );
    if (!result) return reply.code(404).send({ error: 'Not found' });
    return reply.send({ ok: true, expiresAt: result.expiresAt });
  });

  /* ── Public: resolve share token → device data ───────────────── */
  app.get('/public/device/:token', async (req, reply) => {
    const { token } = req.params as any;
    const share = await Share.findOne({ token, type: 'device' }).lean();
    if (!share) return reply.code(404).send({ error: 'Share not found' });
    if (share.expiresAt && new Date() > share.expiresAt) {
      return reply.code(410).send({ error: 'Share link has expired', expired: true });
    }

    const device = await deviceService.getById(String(share.resourceId), String(share.orgId));
    if (!device) return reply.code(404).send({ error: 'Device not found' });

    // Strip sensitive fields before returning
    const { apiKey: _key, ...safeDevice } = (device as any).toObject?.() ?? device;

    const result: Record<string, unknown> = { device: safeDevice, sections: share.sections };

    if (share.sections.includes('metrics') || share.sections.includes('chart')) {
      result.latest = await telemetryService.getLatest(String(share.resourceId), String(share.orgId));
    }

    if (share.sections.includes('history')) {
      const cmds = await commandService.list(String(share.orgId), String(share.resourceId), 50);
      result.commandHistory = (cmds as any[]).slice(0, 50).map(c => ({
        _id: c._id, name: c.name, status: c.status,
        createdAt: c.createdAt, completedAt: c.completedAt,
      }));
    }

    return reply.send(result);
  });

  /* ── Public: telemetry series for shared device ──────────────── */
  app.get('/public/device/:token/series', async (req, reply) => {
    const { token } = req.params as any;
    const { field, from, to, limit } = req.query as any;

    const share = await Share.findOne({ token, type: 'device' }).lean();
    if (!share) return reply.code(404).send({ error: 'Share not found' });
    if (share.expiresAt && new Date() > share.expiresAt) {
      return reply.code(410).send({ error: 'Share link has expired', expired: true });
    }
    if (!share.sections.includes('chart')) return reply.code(403).send({ error: 'Chart not shared' });
    if (!field) return reply.code(400).send({ error: 'field required' });

    const series = await telemetryService.getSeries(
      String(share.resourceId), String(share.orgId), field,
      from ?? new Date(Date.now() - 24 * 3600_000).toISOString(),
      to ?? new Date().toISOString(),
      limit ? parseInt(limit) : 500
    );
    return reply.send({ field, data: series });
  });

  /* ── Public: resolve share token → page data ─────────────────── */
  app.get('/public/page/:token', async (req, reply) => {
    const { token } = req.params as any;

    // Try Share model first (from page.routes publish), then Page.shareToken directly
    const share = await Share.findOne({ token, type: 'page' }).lean();
    if (share?.expiresAt && new Date() > share.expiresAt) {
      return reply.code(410).send({ error: 'Share link has expired', expired: true });
    }
    const page = share
      ? await Page.findOne({ _id: share.resourceId }).lean()
      : await Page.findOne({ shareToken: token }).lean();

    if (!page) return reply.code(404).send({ error: 'Page not found' });

    // Fetch org info for branding
    const org = await Organization.findById(page.orgId).select('name logoUrl').lean().catch(() => null);

    // Fetch widget data in parallel
    const widgetData: Record<string, unknown> = {};
    await Promise.all(
      page.widgets.map(async w => {
        try {
          const orgId = String(page.orgId);

          // Single-device latest value
          if (['kpi_card', 'data_table', 'level', 'progress_bar'].includes(w.type)) {
            if (w.deviceId) {
              widgetData[w.id] = await telemetryService.getLatest(w.deviceId, orgId);
            }

          // Stat card: latest + sparkline series
          } else if (w.type === 'stat_card') {
            if (w.deviceId) {
              const latest = await telemetryService.getLatest(w.deviceId, orgId);
              let series = null;
              if (w.field) {
                const rangeMs = w.rangeMs ?? 86_400_000;
                series = await telemetryService.getSeries(w.deviceId, orgId, w.field,
                  new Date(Date.now() - rangeMs).toISOString(), new Date().toISOString(), 50);
              }
              widgetData[w.id] = { latest, series };
            }

          // Gauge: latest (same as kpi_card, consistent with builder)
          } else if (w.type === 'gauge') {
            if (w.deviceId) {
              widgetData[w.id] = await telemetryService.getLatest(w.deviceId, orgId);
            }

          // Time-series charts
          } else if (['line_chart', 'bar_chart'].includes(w.type)) {
            if (w.deviceId && w.field) {
              const rangeMs = w.rangeMs ?? 24 * 3600_000;
              widgetData[w.id] = await telemetryService.getSeries(
                w.deviceId, orgId, w.field,
                new Date(Date.now() - rangeMs).toISOString(), new Date().toISOString(), 500
              );
            }

          // Scatter chart: two series paired by timestamp
          } else if (w.type === 'scatter_chart') {
            const xField = w.config?.xField as string;
            const yField = w.config?.yField as string;
            if (w.deviceId && xField && yField) {
              const rangeMs = w.rangeMs ?? 24 * 3600_000;
              const from = new Date(Date.now() - rangeMs).toISOString();
              const to = new Date().toISOString();
              const [xData, yData] = await Promise.all([
                telemetryService.getSeries(w.deviceId, orgId, xField, from, to, 300),
                telemetryService.getSeries(w.deviceId, orgId, yField, from, to, 300),
              ]);
              widgetData[w.id] = { xField, yField, xData, yData };
            }

          // Multi-line chart: fetch each configured series
          } else if (w.type === 'multi_line_chart') {
            const seriesCfg: any[] = (w.config?.series as any[]) ?? [];
            const rangeMs = w.rangeMs ?? 24 * 3600_000;
            const from = new Date(Date.now() - rangeMs).toISOString();
            const to = new Date().toISOString();
            const results = await Promise.all(
              seriesCfg.map(async (s: any) => {
                if (!s.deviceId || !s.field) return null;
                const data = await telemetryService.getSeries(s.deviceId, orgId, s.field, from, to, 300);
                return { name: s.label || s.field, color: s.color || '#3b82f6', data };
              })
            );
            widgetData[w.id] = results.filter(Boolean);

          // Map & status grid: device objects + geofences
          } else if (w.type === 'status_grid' || w.type === 'map') {
            const ids = (w.deviceIds?.length ? w.deviceIds : null) ?? (w.deviceId ? [w.deviceId] : []);
            const devices = await Promise.all(
              ids.map(id => deviceService.getById(id, orgId).then(d => {
                if (!d) return null;
                const obj = (d as any).toObject?.() ?? d;
                const { apiKey: _k, ...safe } = obj;
                return safe;
              }))
            );
            if (w.type === 'map') {
              const geofences = ids.length
                ? await Geofence.find({ orgId: page.orgId, active: true, deviceIds: { $in: ids } }).lean()
                : [];
              widgetData[w.id] = { devices: devices.filter(Boolean), geofences };
            } else {
              widgetData[w.id] = devices;
            }

          // text, separator: no data needed
          }
        } catch { /* widget data fetch failure is non-fatal */ }
      })
    );

    return reply.send({
      page,
      widgetData,
      org: org ? { name: org.name, logoUrl: org.logoUrl } : null,
    });
  });
}
