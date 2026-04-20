import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { geofenceService } from '../services/geofence.service.js';

export async function geofenceRoutes(app: FastifyInstance) {
  app.get('/geofences', { preHandler: authenticate }, async (req, reply) => {
    const data = await geofenceService.list(req.user.orgId);
    return reply.send({ data });
  });

  app.post('/geofences', { preHandler: authenticate }, async (req, reply) => {
    const gf = await geofenceService.create(req.user.orgId, req.body as any);
    return reply.code(201).send(gf);
  });

  app.patch('/geofences/:id', { preHandler: authenticate }, async (req, reply) => {
    const gf = await geofenceService.update(
      (req.params as any).id,
      req.user.orgId,
      req.body as any,
    );
    if (!gf) return reply.code(404).send({ error: 'Not found' });
    return reply.send(gf);
  });

  app.delete('/geofences/:id', { preHandler: authenticate }, async (req, reply) => {
    await geofenceService.remove((req.params as any).id, req.user.orgId);
    return reply.send({ ok: true });
  });

  app.post('/geofences/:id/toggle', { preHandler: authenticate }, async (req, reply) => {
    const gf = await geofenceService.toggle((req.params as any).id, req.user.orgId);
    if (!gf) return reply.code(404).send({ error: 'Not found' });
    return reply.send(gf);
  });
}
