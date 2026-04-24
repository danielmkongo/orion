import type { FastifyInstance } from 'fastify';
import { User } from '../models/User.js';
import { Organization } from '../models/Organization.js';
import { requirePermission, authenticate } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';
import { emailService } from '../services/email.service.js';

const APP_URL = process.env.APP_URL ?? 'https://orion.vortan.io';

export async function usersRoutes(app: FastifyInstance) {
  app.get('/users', { preHandler: requirePermission('users:read') }, async (req, reply) => {
    const users = await User.find({ orgId: req.user.orgId, isActive: true })
      .select('-passwordHash -refreshTokenHash')
      .sort({ createdAt: -1 })
      .lean();
    return reply.send({ data: users });
  });

  app.post('/users/invite', { preHandler: requirePermission('users:write') }, async (req, reply) => {
    const { email, name, role } = req.body as any;
    if (!email || !name || !role) return reply.code(400).send({ error: 'Missing fields' });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return reply.code(409).send({ error: 'User already exists' });

    const tempPassword = Math.random().toString(36).slice(-10);
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const user = await User.create({
      email: email.toLowerCase(),
      passwordHash,
      name,
      role,
      orgId: req.user.orgId,
    });

    const org = await Organization.findById(req.user.orgId).select('name').lean() as any;
    emailService.send(
      { to: email, subject: `Invited to ${org?.name ?? 'Orion'} on Orion`, body: `Hi ${name},\n\nYou've been added to ${org?.name ?? 'Orion'}.\nTemporary password: ${tempPassword}\n\nLogin at: ${APP_URL}/login` },
      {}
    ).catch(() => {});

    return reply.code(201).send({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tempPassword,
    });
  });

  app.patch('/users/:id', { preHandler: requirePermission('users:write') }, async (req, reply) => {
    const { id } = req.params as any;
    const { name, role, isActive } = req.body as any;
    const user = await User.findOneAndUpdate(
      { _id: id, orgId: req.user.orgId },
      { $set: { name, role, isActive } },
      { new: true }
    ).select('-passwordHash -refreshTokenHash');
    if (!user) return reply.code(404).send({ error: 'User not found' });
    return reply.send(user);
  });

  app.patch('/users/me/notifications', { preHandler: authenticate }, async (req, reply) => {
    const updates = req.body as Record<string, boolean>;
    const allowed = ['critical', 'offline', 'rules', 'ota', 'commands'];
    const set: Record<string, boolean> = {};
    for (const key of allowed) {
      if (typeof updates[key] === 'boolean') set[`notifPrefs.${key}`] = updates[key];
    }
    if (!Object.keys(set).length) return reply.code(400).send({ error: 'No valid preferences provided' });
    const user = await User.findByIdAndUpdate(req.user.sub, { $set: set }, { new: true })
      .select('notifPrefs');
    return reply.send({ notifPrefs: user?.notifPrefs });
  });

  app.delete('/users/:id', { preHandler: requirePermission('users:write') }, async (req, reply) => {
    const { id } = req.params as any;
    if (id === req.user.sub) return reply.code(400).send({ error: 'Cannot delete yourself' });
    await User.updateOne({ _id: id, orgId: req.user.orgId }, { isActive: false });
    return reply.send({ ok: true });
  });
}
