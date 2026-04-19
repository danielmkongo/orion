import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { authService } from '../services/auth.service.js';
import { authenticate } from '../middleware/auth.js';
import { User } from '../models/User.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (req, reply) => {
    const { email, password, name, orgName } = req.body as any;
    if (!email || !password || !name || !orgName) {
      return reply.code(400).send({ error: 'Missing required fields' });
    }
    try {
      const tokens = await authService.register({ email, password, name, orgName });
      return reply.code(201).send(tokens);
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.post('/auth/login', async (req, reply) => {
    const { email, password } = req.body as any;
    if (!email || !password) {
      return reply.code(400).send({ error: 'Missing email or password' });
    }
    try {
      const result = await authService.login({ email, password });
      return reply.send(result);
    } catch (e: any) {
      return reply.code(401).send({ error: e.message });
    }
  });

  app.post('/auth/refresh', async (req, reply) => {
    const { refreshToken } = req.body as any;
    if (!refreshToken) return reply.code(400).send({ error: 'Missing refresh token' });
    try {
      const tokens = await authService.refreshTokens(refreshToken);
      return reply.send(tokens);
    } catch (e: any) {
      return reply.code(401).send({ error: e.message });
    }
  });

  app.post('/auth/logout', { preHandler: authenticate }, async (req, reply) => {
    await authService.logout(req.user.sub);
    return reply.send({ ok: true });
  });

  app.get('/auth/me', { preHandler: authenticate }, async (req, reply) => {
    const user = await User.findById(req.user.sub).select('-passwordHash -refreshTokenHash').lean();
    if (!user) return reply.code(404).send({ error: 'User not found' });
    return reply.send(user);
  });

  app.patch('/auth/me', { preHandler: authenticate }, async (req, reply) => {
    const { name } = req.body as any;
    if (!name || typeof name !== 'string') return reply.code(400).send({ error: 'Missing name' });
    const user = await User.findByIdAndUpdate(
      req.user.sub,
      { $set: { name } },
      { new: true }
    ).select('-passwordHash -refreshTokenHash').lean();
    if (!user) return reply.code(404).send({ error: 'User not found' });
    return reply.send(user);
  });

  app.patch('/auth/password', { preHandler: authenticate }, async (req, reply) => {
    const { currentPassword, newPassword } = req.body as any;
    if (!currentPassword || !newPassword) return reply.code(400).send({ error: 'Missing fields' });
    if (newPassword.length < 8) return reply.code(400).send({ error: 'Password must be at least 8 characters' });
    const user = await User.findById(req.user.sub);
    if (!user) return reply.code(404).send({ error: 'User not found' });
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return reply.code(401).send({ error: 'Current password is incorrect' });
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();
    return reply.send({ ok: true });
  });
}
