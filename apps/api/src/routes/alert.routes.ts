import type { FastifyInstance } from 'fastify';
import { Alert } from '../models/Alert.js';
import { requirePermission } from '../middleware/auth.js';
import { realtimeService } from '../services/realtime.service.js';

export async function alertRoutes(app: FastifyInstance) {
  app.get('/alerts', { preHandler: requirePermission('telemetry:read') }, async (req, reply) => {
    const { status, severity, deviceId, limit, offset } = req.query as any;
    const filter: Record<string, unknown> = { orgId: req.user.orgId };
    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (deviceId) filter.deviceId = deviceId;

    const [alerts, total] = await Promise.all([
      Alert.find(filter).sort({ createdAt: -1 }).limit(parseInt(limit) || 50).skip(parseInt(offset) || 0).lean(),
      Alert.countDocuments(filter),
    ]);
    return reply.send({ data: alerts, total });
  });

  app.post('/alerts/:id/acknowledge', { preHandler: requirePermission('telemetry:read') }, async (req, reply) => {
    const { id } = req.params as any;
    const alert = await Alert.findOneAndUpdate(
      { _id: id, orgId: req.user.orgId },
      { $set: { status: 'acknowledged', acknowledgedBy: req.user.sub, acknowledgedAt: new Date() } },
      { new: true }
    );
    if (!alert) return reply.code(404).send({ error: 'Alert not found' });
    return reply.send(alert);
  });

  app.post('/alerts/:id/resolve', { preHandler: requirePermission('telemetry:read') }, async (req, reply) => {
    const { id } = req.params as any;
    const alert = await Alert.findOneAndUpdate(
      { _id: id, orgId: req.user.orgId },
      { $set: { status: 'resolved', resolvedAt: new Date() } },
      { new: true }
    );
    if (!alert) return reply.code(404).send({ error: 'Alert not found' });
    return reply.send(alert);
  });
}
