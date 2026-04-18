import type { FastifyInstance } from 'fastify';
import { deviceService } from '../services/device.service.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

export async function deviceRoutes(app: FastifyInstance) {
  app.get('/devices', { preHandler: requirePermission('devices:read') }, async (req, reply) => {
    const { status, category, tags, search, limit, offset } = req.query as any;
    const result = await deviceService.list(req.user.orgId, {
      status,
      category,
      tags: tags ? (Array.isArray(tags) ? tags : [tags]) : undefined,
      search,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
    });
    return reply.send(result);
  });

  app.get('/devices/stats', { preHandler: requirePermission('devices:read') }, async (req, reply) => {
    const stats = await deviceService.getStats(req.user.orgId);
    return reply.send(stats);
  });

  app.get('/devices/:id', { preHandler: requirePermission('devices:read') }, async (req, reply) => {
    const { id } = req.params as any;
    const device = await deviceService.getById(id, req.user.orgId);
    if (!device) return reply.code(404).send({ error: 'Device not found' });
    return reply.send(device);
  });

  app.post('/devices', { preHandler: requirePermission('devices:write') }, async (req, reply) => {
    const device = await deviceService.create(req.user.orgId, req.body as any);
    return reply.code(201).send(device);
  });

  app.patch('/devices/:id', { preHandler: requirePermission('devices:write') }, async (req, reply) => {
    const { id } = req.params as any;
    const device = await deviceService.update(id, req.user.orgId, req.body as any);
    if (!device) return reply.code(404).send({ error: 'Device not found' });
    return reply.send(device);
  });

  app.delete('/devices/:id', { preHandler: requirePermission('devices:delete') }, async (req, reply) => {
    const { id } = req.params as any;
    const ok = await deviceService.delete(id, req.user.orgId);
    if (!ok) return reply.code(404).send({ error: 'Device not found' });
    return reply.send({ ok: true });
  });

  app.post('/devices/:id/regenerate-key', { preHandler: requirePermission('devices:write') }, async (req, reply) => {
    const { id } = req.params as any;
    const newKey = await deviceService.regenerateApiKey(id, req.user.orgId);
    return reply.send({ apiKey: newKey });
  });
}
