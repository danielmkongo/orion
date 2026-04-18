import type { FastifyInstance } from 'fastify';
import { Dashboard } from '../models/Dashboard.js';
import { requirePermission } from '../middleware/auth.js';
import { nanoid } from 'nanoid';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/dashboards', { preHandler: requirePermission('dashboards:read') }, async (req, reply) => {
    const dashboards = await Dashboard.find({ orgId: req.user.orgId })
      .sort({ isPinned: -1, updatedAt: -1 })
      .lean();
    return reply.send({ data: dashboards });
  });

  app.get('/dashboards/:id', { preHandler: requirePermission('dashboards:read') }, async (req, reply) => {
    const { id } = req.params as any;
    const d = await Dashboard.findOne({ _id: id, orgId: req.user.orgId }).lean();
    if (!d) return reply.code(404).send({ error: 'Dashboard not found' });
    return reply.send(d);
  });

  app.post('/dashboards', { preHandler: requirePermission('dashboards:write') }, async (req, reply) => {
    const body = req.body as any;
    const d = await Dashboard.create({
      orgId: req.user.orgId,
      name: body.name,
      description: body.description,
      widgets: (body.widgets ?? []).map((w: any) => ({ ...w, id: w.id ?? nanoid(8) })),
      isPublic: body.isPublic ?? false,
      isPinned: body.isPinned ?? false,
      createdBy: req.user.sub,
    });
    return reply.code(201).send(d);
  });

  app.patch('/dashboards/:id', { preHandler: requirePermission('dashboards:write') }, async (req, reply) => {
    const { id } = req.params as any;
    const body = req.body as any;
    const d = await Dashboard.findOneAndUpdate(
      { _id: id, orgId: req.user.orgId },
      { $set: body },
      { new: true }
    );
    if (!d) return reply.code(404).send({ error: 'Dashboard not found' });
    return reply.send(d);
  });

  app.delete('/dashboards/:id', { preHandler: requirePermission('dashboards:write') }, async (req, reply) => {
    const { id } = req.params as any;
    await Dashboard.deleteOne({ _id: id, orgId: req.user.orgId });
    return reply.send({ ok: true });
  });
}
