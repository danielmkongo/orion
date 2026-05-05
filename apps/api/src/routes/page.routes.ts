import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { authenticate } from '../middleware/auth.js';
import { Page } from '../models/Page.js';
import { Share } from '../models/Share.js';
import { Organization } from '../models/Organization.js';
import { Geofence } from '../models/Geofence.js';
import { deviceService } from '../services/device.service.js';
import { telemetryService } from '../services/telemetry.service.js';

export async function pageRoutes(app: FastifyInstance) {

  /* ── List org pages ──────────────────────────────────────────── */
  app.get('/pages', { preHandler: authenticate }, async (req, reply) => {
    const pages = await Page.find({ orgId: req.user.orgId }).sort({ createdAt: -1 }).lean();
    return reply.send({ data: pages });
  });

  /* ── Create page ─────────────────────────────────────────────── */
  app.post('/pages', { preHandler: authenticate }, async (req, reply) => {
    const { name, description } = req.body as any;
    if (!name) return reply.code(400).send({ error: 'name required' });
    const page = await Page.create({
      orgId: req.user.orgId,
      name,
      description,
      widgets: [],
      createdBy: req.user.sub,
    });
    return reply.code(201).send(page);
  });

  /* ── Get single page ─────────────────────────────────────────── */
  app.get('/pages/:id', { preHandler: authenticate }, async (req, reply) => {
    const page = await Page.findOne({ _id: (req.params as any).id, orgId: req.user.orgId }).lean();
    if (!page) return reply.code(404).send({ error: 'Not found' });
    return reply.send(page);
  });

  /* ── Update page (name, description, widgets) ────────────────── */
  app.patch('/pages/:id', { preHandler: authenticate }, async (req, reply) => {
    const page = await Page.findOneAndUpdate(
      { _id: (req.params as any).id, orgId: req.user.orgId },
      { $set: req.body as any },
      { new: true }
    );
    if (!page) return reply.code(404).send({ error: 'Not found' });
    return reply.send(page);
  });

  /* ── Delete page ─────────────────────────────────────────────── */
  app.delete('/pages/:id', { preHandler: authenticate }, async (req, reply) => {
    const page = await Page.findOneAndDelete({ _id: (req.params as any).id, orgId: req.user.orgId });
    if (!page) return reply.code(404).send({ error: 'Not found' });
    // Clean up any share record
    if (page.shareToken) await Share.deleteOne({ token: page.shareToken });
    return reply.send({ ok: true });
  });

  /* ── Publish page → generate share token ─────────────────────── */
  app.post('/pages/:id/publish', { preHandler: authenticate }, async (req, reply) => {
    const existing = await Page.findOne({ _id: (req.params as any).id, orgId: req.user.orgId });
    if (!existing) return reply.code(404).send({ error: 'Not found' });

    const { expiresSeconds } = (req.body as any) ?? {};
    const expiresAt = expiresSeconds ? new Date(Date.now() + expiresSeconds * 1000) : null;

    // If already published, update the expiry on the existing share record
    if (existing.shareToken) {
      if (expiresSeconds !== undefined) {
        await Share.findOneAndUpdate({ token: existing.shareToken }, { $set: { expiresAt } });
      }
      const share = await Share.findOne({ token: existing.shareToken }).lean();
      return reply.send({ token: existing.shareToken, expiresAt: share?.expiresAt ?? null });
    }

    const token = nanoid(21);
    await Share.create({
      orgId: req.user.orgId,
      type: 'page',
      resourceId: existing._id,
      sections: [],
      token,
      createdBy: req.user.sub,
      expiresAt,
    });
    existing.shareToken = token;
    await existing.save();
    return reply.send({ token, expiresAt });
  });

  /* ── Live preview data (authenticated) — same shape as public endpoint ── */
  app.get('/pages/:id/preview', { preHandler: authenticate }, async (req, reply) => {
    const page = await Page.findOne({ _id: (req.params as any).id, orgId: req.user.orgId }).lean();
    if (!page) return reply.code(404).send({ error: 'Not found' });

    const org = await Organization.findById(page.orgId).select('name logoUrl').lean().catch(() => null);
    const orgId = String(page.orgId);

    const widgetData: Record<string, unknown> = {};
    await Promise.all(
      page.widgets.map(async w => {
        try {
          if (['kpi_card', 'data_table', 'level', 'progress_bar'].includes(w.type)) {
            if (w.deviceId) widgetData[w.id] = await telemetryService.getLatest(w.deviceId, orgId);
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
          } else if (w.type === 'gauge') {
            if (w.deviceId) widgetData[w.id] = await telemetryService.getLatest(w.deviceId, orgId);
          } else if (['line_chart', 'bar_chart'].includes(w.type)) {
            if (w.deviceId && w.field) {
              const rangeMs = w.rangeMs ?? 24 * 3600_000;
              widgetData[w.id] = await telemetryService.getSeries(
                w.deviceId, orgId, w.field,
                new Date(Date.now() - rangeMs).toISOString(), new Date().toISOString(), 500
              );
            }
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
          }
        } catch { /* non-fatal */ }
      })
    );

    return reply.send({
      page,
      widgetData,
      org: org ? { name: org.name, logoUrl: org.logoUrl } : null,
    });
  });

  /* ── Unpublish page → revoke share token ─────────────────────── */
  app.delete('/pages/:id/publish', { preHandler: authenticate }, async (req, reply) => {
    const page = await Page.findOne({ _id: (req.params as any).id, orgId: req.user.orgId });
    if (!page) return reply.code(404).send({ error: 'Not found' });
    if (page.shareToken) {
      await Share.deleteOne({ token: page.shareToken });
      page.shareToken = undefined;
      await page.save();
    }
    return reply.send({ ok: true });
  });
}
