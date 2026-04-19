import type { FastifyInstance } from 'fastify';
import { Firmware } from '../models/Firmware.js';
import { OtaJob } from '../models/OtaJob.js';
import { requirePermission } from '../middleware/auth.js';

export async function otaRoutes(app: FastifyInstance) {
  /* ── Firmware ── */
  app.get('/firmware', { preHandler: requirePermission('devices:read') }, async (req, reply) => {
    const { status } = req.query as any;
    const filter: any = { orgId: req.user.orgId };
    if (status && status !== 'all') filter.status = status;
    const firmware = await Firmware.find(filter).sort({ uploadedAt: -1 }).lean();
    return reply.send({ data: firmware });
  });

  app.post('/firmware', { preHandler: requirePermission('devices:write') }, async (req, reply) => {
    const body = req.body as any;
    const fw = await Firmware.create({ ...body, orgId: req.user.orgId });
    return reply.code(201).send(fw);
  });

  app.patch('/firmware/:id', { preHandler: requirePermission('devices:write') }, async (req, reply) => {
    const { id } = req.params as any;
    const fw = await Firmware.findOneAndUpdate(
      { _id: id, orgId: req.user.orgId },
      { $set: req.body as any },
      { new: true }
    );
    if (!fw) return reply.code(404).send({ error: 'Firmware not found' });
    return reply.send(fw);
  });

  app.delete('/firmware/:id', { preHandler: requirePermission('devices:write') }, async (req, reply) => {
    const { id } = req.params as any;
    await Firmware.findOneAndDelete({ _id: id, orgId: req.user.orgId });
    return reply.send({ ok: true });
  });

  /* ── OTA Jobs ── */
  app.get('/ota-jobs', { preHandler: requirePermission('devices:read') }, async (req, reply) => {
    const jobs = await OtaJob.find({ orgId: req.user.orgId }).sort({ startedAt: -1 }).lean();
    return reply.send({ data: jobs });
  });

  app.post('/ota-jobs', { preHandler: requirePermission('devices:write') }, async (req, reply) => {
    const { name, firmwareId } = req.body as any;
    const fw = await Firmware.findOne({ _id: firmwareId, orgId: req.user.orgId });
    if (!fw) return reply.code(404).send({ error: 'Firmware not found' });
    const job = await OtaJob.create({
      orgId: req.user.orgId, name,
      firmwareId: fw._id, firmwareVersion: fw.version,
      status: 'pending', progress: 0, total: fw.devices || 1,
      startedAt: new Date(),
    });
    return reply.code(201).send(job);
  });

  app.patch('/ota-jobs/:id', { preHandler: requirePermission('devices:write') }, async (req, reply) => {
    const { id } = req.params as any;
    const job = await OtaJob.findOneAndUpdate(
      { _id: id, orgId: req.user.orgId },
      { $set: req.body as any },
      { new: true }
    );
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    return reply.send(job);
  });
}
