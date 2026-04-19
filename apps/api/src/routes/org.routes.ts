import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { Organization } from '../models/Organization.js';

export async function orgRoutes(app: FastifyInstance) {
  app.get('/org', { preHandler: authenticate }, async (req, reply) => {
    const org = await Organization.findById(req.user.orgId).lean();
    if (!org) return reply.code(404).send({ error: 'Organization not found' });
    return reply.send(org);
  });

  app.patch('/org', { preHandler: authenticate }, async (req, reply) => {
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return reply.code(403).send({ error: 'Admin access required' });
    }
    const { name, settings } = req.body as any;
    const update: Record<string, unknown> = {};
    if (name && typeof name === 'string') update.name = name.trim();
    if (settings && typeof settings === 'object') update.settings = settings;

    const org = await Organization.findByIdAndUpdate(
      req.user.orgId,
      { $set: update },
      { new: true }
    ).lean();
    if (!org) return reply.code(404).send({ error: 'Organization not found' });
    return reply.send(org);
  });
}
