import type { FastifyInstance } from 'fastify';
import { Rule } from '../models/Rule.js';
import { requirePermission } from '../middleware/auth.js';

export async function rulesRoutes(app: FastifyInstance) {
  app.get('/rules', { preHandler: requirePermission('rules:read') }, async (req, reply) => {
    const rules = await Rule.find({ orgId: req.user.orgId }).sort({ createdAt: -1 }).lean();
    return reply.send({ data: rules });
  });

  app.get('/rules/:id', { preHandler: requirePermission('rules:read') }, async (req, reply) => {
    const { id } = req.params as any;
    const rule = await Rule.findOne({ _id: id, orgId: req.user.orgId }).lean();
    if (!rule) return reply.code(404).send({ error: 'Rule not found' });
    return reply.send(rule);
  });

  app.post('/rules', { preHandler: requirePermission('rules:write') }, async (req, reply) => {
    const body = req.body as any;
    const rule = await Rule.create({
      ...body,
      orgId: req.user.orgId,
      createdBy: req.user.sub,
    });
    return reply.code(201).send(rule);
  });

  app.patch('/rules/:id', { preHandler: requirePermission('rules:write') }, async (req, reply) => {
    const { id } = req.params as any;
    const rule = await Rule.findOneAndUpdate(
      { _id: id, orgId: req.user.orgId },
      { $set: req.body as any },
      { new: true }
    );
    if (!rule) return reply.code(404).send({ error: 'Rule not found' });
    return reply.send(rule);
  });

  app.delete('/rules/:id', { preHandler: requirePermission('rules:write') }, async (req, reply) => {
    const { id } = req.params as any;
    await Rule.deleteOne({ _id: id, orgId: req.user.orgId });
    return reply.send({ ok: true });
  });

  app.post('/rules/:id/toggle', { preHandler: requirePermission('rules:write') }, async (req, reply) => {
    const { id } = req.params as any;
    const rule = await Rule.findOne({ _id: id, orgId: req.user.orgId });
    if (!rule) return reply.code(404).send({ error: 'Rule not found' });
    rule.isEnabled = !rule.isEnabled;
    await rule.save();
    return reply.send(rule);
  });
}
