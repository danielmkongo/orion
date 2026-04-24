import type { FastifyInstance } from 'fastify';
import { Firmware } from '../models/Firmware.js';
import { OtaJob } from '../models/OtaJob.js';
import { Device } from '../models/Device.js';
import { requirePermission } from '../middleware/auth.js';
import { createWriteStream, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { pipeline } from 'stream/promises';
import path from 'path';
import { nanoid } from 'nanoid';

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads', 'firmware');
mkdirSync(UPLOADS_DIR, { recursive: true });

function semverGt(a: string, b: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const [a1, a2, a3] = parse(a);
  const [b1, b2, b3] = parse(b);
  if (a1 !== b1) return a1 > b1;
  if (a2 !== b2) return a2 > b2;
  return a3 > b3;
}

export async function otaRoutes(app: FastifyInstance) {
  /* ── Firmware list ── */
  app.get('/firmware', { preHandler: requirePermission('devices:read') }, async (req, reply) => {
    const { status } = req.query as any;
    const filter: any = { orgId: req.user.orgId };
    if (status && status !== 'all') filter.status = status;
    const firmware = await Firmware.find(filter).sort({ uploadedAt: -1 }).lean();
    return reply.send({ data: firmware });
  });

  /* ── Create firmware (JSON or multipart) ── */
  app.post('/firmware', { preHandler: requirePermission('devices:write') }, async (req, reply) => {
    const contentType = req.headers['content-type'] ?? '';

    if (contentType.includes('multipart/form-data')) {
      const parts = req.parts();
      const fields: Record<string, string> = {};
      let fileUrl: string | undefined;
      let checksum: string | undefined;
      let size = 0;

      for await (const part of parts) {
        if (part.type === 'file') {
          const ext = path.extname(part.filename ?? '.bin');
          const filename = `${req.user.orgId}-${nanoid(8)}${ext}`;
          const dest = path.join(UPLOADS_DIR, filename);
          const hash = createHash('md5');
          const ws = createWriteStream(dest);

          await pipeline(
            part.file,
            async function* (source) {
              for await (const chunk of source) {
                hash.update(chunk);
                size += chunk.length;
                yield chunk;
              }
            },
            ws
          );

          const publicPath = process.env.API_BASE_URL ?? '';
          fileUrl = `${publicPath}/uploads/firmware/${filename}`;
          checksum = hash.digest('hex');
          fields.size = `${Math.round(size / 1024)} KB`;
        } else {
          fields[(part as any).fieldname] = (part as any).value;
        }
      }

      const fw = await Firmware.create({ ...fields, orgId: req.user.orgId, fileUrl, checksum });
      return reply.code(201).send(fw);
    }

    // Plain JSON (external fileUrl provided)
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

  /* ── Device version-check (no auth — device uses apiKey) ── */
  app.get('/ota/check', async (req, reply) => {
    const { serialNumber, version, apiKey } = req.query as any;
    if (!serialNumber || !version || !apiKey) {
      return reply.code(400).send({ error: 'serialNumber, version, and apiKey required' });
    }

    const device = await Device.findOne({ serialNumber, apiKey }).lean() as any;
    if (!device) return reply.code(401).send({ error: 'Invalid credentials' });

    const fw = await Firmware.findOne({ orgId: device.orgId, status: 'active' })
      .sort({ uploadedAt: -1 })
      .lean() as any;

    if (!fw || !semverGt(fw.version, version)) {
      return reply.send({ update: false });
    }

    return reply.send({
      update: true,
      version: fw.version,
      url: fw.fileUrl,
      checksum: fw.checksum,
    });
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
