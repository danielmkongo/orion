import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { authenticate } from '../middleware/auth.js';
import { Page } from '../models/Page.js';
import { Share } from '../models/Share.js';

export async function pageRoutes(app: FastifyInstance) {

  /* ── List org pages ──────────────────────────────────────────── */
  app.get('/pages', { preHandler: authenticate }, async (req, reply) => {
    const pages = await Page.find({ orgId: req.user.orgId }).sort({ createdAt: -1 }).lean();
    return reply.send({ data: pages });
  });

  /* ── Create page ─────────────────────────────────────────────── */
  app.post('/pages', { preHandler: authenticate }, async (req, reply) => {
    const { name, description } = req.body as any;
    if (!name) return reply.code(400).send({ error: 'name required' });
    const page = await Page.create({
      orgId: req.user.orgId,
      name,
      description,
      widgets: [],
      createdBy: req.user.sub,
    });
    return reply.code(201).send(page);
  });

  /* ── Get single page ─────────────────────────────────────────── */
  app.get('/pages/:id', { preHandler: authenticate }, async (req, reply) => {
    const page = await Page.findOne({ _id: (req.params as any).id, orgId: req.user.orgId }).lean();
    if (!page) return reply.code(404).send({ error: 'Not found' });
    return reply.send(page);
  });

  /* ── Update page (name, description, widgets) ────────────────── */
  app.patch('/pages/:id', { preHandler: authenticate }, async (req, reply) => {
    const page = await Page.findOneAndUpdate(
      { _id: (req.params as any).id, orgId: req.user.orgId },
      { $set: req.body as any },
      { new: true }
    );
    if (!page) return reply.code(404).send({ error: 'Not found' });
    return reply.send(page);
  });

  /* ── Delete page ─────────────────────────────────────────────── */
  app.delete('/pages/:id', { preHandler: authenticate }, async (req, reply) => {
    const page = await Page.findOneAndDelete({ _id: (req.params as any).id, orgId: req.user.orgId });
    if (!page) return reply.code(404).send({ error: 'Not found' });
    // Clean up any share record
    if (page.shareToken) await Share.deleteOne({ token: page.shareToken });
    return reply.send({ ok: true });
  });

  /* ── Publish page → generate share token ─────────────────────── */
  app.post('/pages/:id/publish', { preHandler: authenticate }, async (req, reply) => {
    const existing = await Page.findOne({ _id: (req.params as any).id, orgId: req.user.orgId });
    if (!existing) return reply.code(404).send({ error: 'Not found' });

    // Reuse existing token if already published
    if (existing.shareToken) {
      return reply.send({ token: existing.shareToken });
    }

    const token = nanoid(21);
    await Share.create({
      orgId: req.user.orgId,
      type: 'page',
      resourceId: existing._id,
      sections: [],
      token,
      createdBy: req.user.sub,
    });
    existing.shareToken = token;
    await existing.save();
    return reply.send({ token });
  });

  /* ── Unpublish page → revoke share token ─────────────────────── */
  app.delete('/pages/:id/publish', { preHandler: authenticate }, async (req, reply) => {
    const page = await Page.findOne({ _id: (req.params as any).id, orgId: req.user.orgId });
    if (!page) return reply.code(404).send({ error: 'Not found' });
    if (page.shareToken) {
      await Share.deleteOne({ token: page.shareToken });
      page.shareToken = undefined;
      await page.save();
    }
    return reply.send({ ok: true });
  });
}
