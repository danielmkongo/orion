import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { Organization } from '../models/Organization.js';
import { Device } from '../models/Device.js';
import { Telemetry } from '../models/Telemetry.js';
import { Alert } from '../models/Alert.js';
import { Rule } from '../models/Rule.js';
import { OtaJob } from '../models/OtaJob.js';
import { Firmware } from '../models/Firmware.js';
import { Share } from '../models/Share.js';
import { Page } from '../models/Page.js';
import { User } from '../models/User.js';
import { Geofence } from '../models/Geofence.js';
import { Command } from '../models/Command.js';

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

  app.delete('/org', { preHandler: authenticate }, async (req, reply) => {
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return reply.code(403).send({ error: 'Admin access required' });
    }
    const orgId = req.user.orgId;

    await Promise.all([
      Device.deleteMany({ orgId }),
      Telemetry.deleteMany({ orgId }),
      Alert.deleteMany({ orgId }),
      Rule.deleteMany({ orgId }),
      OtaJob.deleteMany({ orgId }),
      Firmware.deleteMany({ orgId }),
      Share.deleteMany({ orgId }),
      Page.deleteMany({ orgId }),
      Geofence.deleteMany({ orgId }),
      Command.deleteMany({ orgId }),
    ]);
    await User.deleteMany({ orgId });
    await Organization.findByIdAndDelete(orgId);

    return reply.send({ ok: true });
  });
}
