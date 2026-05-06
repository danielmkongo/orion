import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../middleware/auth.js';
import { GeneratedCode } from '../models/GeneratedCode.js';

/* ── Per-user daily generation limit ────────────────────────────────
   Stored in-memory; resets at UTC midnight. Upgrade to Redis if needed. */
const dailyUsage = new Map<string, { date: string; count: number }>();
export const DAILY_LIMIT = 30;

function today() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

export function checkDailyLimit(userId: string): { allowed: boolean; remaining: number } {
  const date  = today();
  const entry = dailyUsage.get(userId);
  if (!entry || entry.date !== date) {
    dailyUsage.set(userId, { date, count: 0 });
    return { allowed: true, remaining: DAILY_LIMIT };
  }
  const remaining = DAILY_LIMIT - entry.count;
  return { allowed: remaining > 0, remaining };
}

export function incrementDailyUsage(userId: string) {
  const date  = today();
  const entry = dailyUsage.get(userId) ?? { date, count: 0 };
  if (entry.date !== date) { entry.date = date; entry.count = 0; }
  entry.count++;
  dailyUsage.set(userId, entry);
}

export async function generatedCodeRoutes(app: FastifyInstance) {

  /* List saved code for a device */
  app.get('/generated-codes', { preHandler: requirePermission('devices:read') }, async (req, reply) => {
    const { deviceId } = req.query as any;
    if (!deviceId) return reply.code(400).send({ error: 'deviceId is required' });
    const items = await GeneratedCode.find({ deviceId, orgId: req.user.orgId })
      .select('name hardware protocol createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .lean();
    return reply.send(items);
  });

  /* Get single saved code (with full code content) */
  app.get('/generated-codes/:id', { preHandler: requirePermission('devices:read') }, async (req, reply) => {
    const { id } = req.params as any;
    const item = await GeneratedCode.findOne({ _id: id, orgId: req.user.orgId }).lean();
    if (!item) return reply.code(404).send({ error: 'Not found' });
    return reply.send(item);
  });

  /* Save a generated code snippet */
  app.post('/generated-codes', { preHandler: requirePermission('devices:write') }, async (req, reply) => {
    const { deviceId, name, hardware, protocol, code } = req.body as any;
    if (!deviceId || !name || !hardware || !protocol || !code) {
      return reply.code(400).send({ error: 'deviceId, name, hardware, protocol, and code are required' });
    }
    const item = await GeneratedCode.create({ orgId: req.user.orgId, deviceId, name, hardware, protocol, code });
    return reply.code(201).send(item);
  });

  /* Update (rename or edit code) */
  app.patch('/generated-codes/:id', { preHandler: requirePermission('devices:write') }, async (req, reply) => {
    const { id } = req.params as any;
    const { name, code } = req.body as any;
    const update: any = {};
    if (name !== undefined) update.name = name;
    if (code !== undefined) update.code = code;
    const item = await GeneratedCode.findOneAndUpdate(
      { _id: id, orgId: req.user.orgId },
      { $set: update },
      { new: true }
    );
    if (!item) return reply.code(404).send({ error: 'Not found' });
    return reply.send(item);
  });

  /* Delete */
  app.delete('/generated-codes/:id', { preHandler: requirePermission('devices:write') }, async (req, reply) => {
    const { id } = req.params as any;
    const deleted = await GeneratedCode.findOneAndDelete({ _id: id, orgId: req.user.orgId });
    if (!deleted) return reply.code(404).send({ error: 'Not found' });
    return reply.send({ ok: true });
  });
}
