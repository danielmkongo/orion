import type { FastifyInstance } from 'fastify';
import { commandService } from '../services/command.service.js';
import { requirePermission, authenticate } from '../middleware/auth.js';

export async function commandRoutes(app: FastifyInstance) {
  app.get('/commands', { preHandler: requirePermission('commands:read') }, async (req, reply) => {
    const { deviceId, limit } = req.query as any;
    const cmds = await commandService.list(req.user.orgId, deviceId, limit ? parseInt(limit) : 50);
    return reply.send({ data: cmds });
  });

  app.post('/commands', { preHandler: requirePermission('commands:send') }, async (req, reply) => {
    const cmd = await commandService.create(req.user.orgId, req.user.sub, req.body as any);
    return reply.code(201).send(cmd);
  });

  app.post('/commands/:id/cancel', { preHandler: requirePermission('commands:send') }, async (req, reply) => {
    const { id } = req.params as any;
    const cmd = await commandService.cancel(id, req.user.orgId);
    if (!cmd) return reply.code(404).send({ error: 'Command not found or cannot be cancelled' });
    return reply.send(cmd);
  });

  // Device-side: poll for pending commands
  app.get('/commands/pending', async (req, reply) => {
    const apiKey = (req.headers['x-api-key'] as string) ?? (req.query as any).apiKey;
    if (!apiKey) return reply.code(401).send({ error: 'API key required' });

    const { deviceService } = await import('../services/device.service.js');
    const device = await deviceService.getByApiKey(apiKey);
    if (!device) return reply.code(401).send({ error: 'Invalid API key' });

    const cmds = await commandService.getPending(String((device as any)._id));
    return reply.send({ commands: cmds });
  });

  // Device-side: acknowledge a command
  app.post('/commands/ack', async (req, reply) => {
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) return reply.code(401).send({ error: 'API key required' });

    const { commandId, deviceId, status, response, errorMessage } = req.body as any;
    const cmd = await commandService.acknowledge(commandId, deviceId, status, response, errorMessage);
    if (!cmd) return reply.code(404).send({ error: 'Command not found' });
    return reply.send({ ok: true });
  });
}
