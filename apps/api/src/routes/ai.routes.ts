import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { aiService, rateLimiter } from '../services/ai.service.js';
import { checkDailyLimit, incrementDailyUsage, DAILY_LIMIT } from './generated-code.routes.js';
import { Device } from '../models/Device.js';
import { DeviceTemplate } from '../models/DeviceTemplate.js';
import { config } from '../config/index.js';

const HARDWARE_LABELS: Record<string, string> = {
  'espressif-wifi':       'Espressif + WiFi',
  'espressif-simcom-ppp': 'Espressif + SIMCom - PPP',
  'espressif-simcom-at':  'Espressif + SIMCom - AT',
  'arduino-simcom-at':    'Arduino + SIMCom - AT',
  'raspberry-pi':         'Raspberry Pi',
};

function orionError(err: any): { status: number; message: string } {
  const s = err?.status ?? err?.response?.status ?? 0;
  if (s === 429) return { status: 429, message: 'Orion AI capacity reached. Please wait a moment.' };
  return { status: 502, message: `Orion AI error: ${err?.message ?? String(err)}` };
}

async function buildFirmwareReq(deviceId: string, orgId: string, hardware: string, hwConfig: Record<string, string | number>) {
  const device = await Device.findOne({ _id: deviceId, orgId });
  if (!device) return null;

  let fields: Array<{ key: string; unit?: string }> = [];
  if (device.templateId) {
    const tpl = await DeviceTemplate.findById(device.templateId);
    if (tpl) {
      fields = tpl.fields
        .filter(f => !f.isLatitude && !f.isLongitude && !f.isAltitude && !f.isSpeed && !f.isHeading)
        .map(f => ({ key: f.key, unit: f.unit }));
    }
  }

  const apiBase = process.env.API_BASE_URL ?? `http://localhost:${config.port}`;
  const apiHost = apiBase.replace(/^https?:\/\//, '').replace(/\/.*/, '');
  const mqttBroker = (config.mqttBrokerUrl ?? '').replace(/^mqtt:\/\//, '').replace(/:.*/, '');
  const serial = device.serialNumber ?? String(device._id).slice(-8);

  return {
    deviceName:    device.name,
    deviceApiKey:  device.apiKey,
    serialNumber:  serial,
    apiBase,
    apiHost,
    mqttBroker,
    tcpPort:  config.tcpPort,
    udpPort:  config.udpPort,
    coapPort: config.coapPort,
    protocol: device.protocol ?? 'http',
    hardware,
    hardwareLabel: HARDWARE_LABELS[hardware],
    fields,
    config: { intervalSeconds: 60, ...hwConfig },
  };
}

export async function aiRoutes(app: FastifyInstance) {

  /* ── GET /ai/status ─────────────────────────────────────────────── */
  app.get('/ai/status', { preHandler: authenticate }, async (_req, reply) => {
    return reply.send({ configured: aiService.isConfigured() });
  });

  /* ── POST /ai/codegen (non-streaming, kept for compat) ──────────── */
  app.post('/ai/codegen', { preHandler: authenticate }, async (req, reply) => {
    if (!aiService.isConfigured()) return reply.code(503).send({ error: 'Orion AI is not configured' });
    const { deviceId, hardware, config: hwConfig = {} } = req.body as any;
    if (!deviceId || !hardware) return reply.code(400).send({ error: 'deviceId and hardware are required' });
    if (!HARDWARE_LABELS[hardware]) return reply.code(400).send({ error: `Unknown hardware: ${hardware}` });

    const fwReq = await buildFirmwareReq(deviceId, req.user.orgId, hardware, hwConfig);
    if (!fwReq) return reply.code(404).send({ error: 'Device not found' });

    try {
      const code = await aiService.generateFirmware(fwReq);
      return reply.send({ code });
    } catch (err: any) {
      const { status, message } = orionError(err);
      return reply.code(status).send({ error: message });
    }
  });

  /* ── POST /ai/codegen/stream (SSE) ──────────────────────────────── */
  app.post('/ai/codegen/stream', { preHandler: authenticate }, async (req, reply) => {
    if (!aiService.isConfigured()) return reply.code(503).send({ error: 'Orion AI is not configured' });

    // Per-user daily limit
    const userId = req.user.sub;
    const { allowed, remaining } = checkDailyLimit(userId);
    if (!allowed) {
      return reply.code(429).send({
        error: `Daily limit of ${DAILY_LIMIT} generations reached. Resets at midnight UTC.`,
      });
    }

    const { deviceId, hardware, config: hwConfig = {} } = req.body as any;
    if (!deviceId || !hardware) return reply.code(400).send({ error: 'deviceId and hardware are required' });
    if (!HARDWARE_LABELS[hardware]) return reply.code(400).send({ error: `Unknown hardware: ${hardware}` });

    const fwReq = await buildFirmwareReq(deviceId, req.user.orgId, hardware, hwConfig);
    if (!fwReq) return reply.code(404).send({ error: 'Device not found' });

    // Switch to raw SSE mode
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.hijack();

    const send = (data: object) => {
      try { reply.raw.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
    };

    let cancelled = false;
    req.raw.on('close', () => { cancelled = true; });

    try {
      // Notify client if queue is backing up
      const waiting = rateLimiter.waiting;
      if (waiting > 0) {
        const est = Math.ceil((waiting * 60) / 14) + 3;
        send({ type: 'queued', position: waiting, estimatedSeconds: est, remaining });
      }

      for await (const chunk of aiService.generateFirmwareStream(fwReq)) {
        if (cancelled) { send({ type: 'cancelled' }); return; }
        send({ type: 'chunk', text: chunk });
      }
      // Only count a completed generation — errors and cancels don't consume quota
      incrementDailyUsage(userId);
      send({ type: 'done', remaining: remaining - 1 });
    } catch (err: any) {
      const { message } = orionError(err);
      send({ type: 'error', message });
    } finally {
      reply.raw.end();
    }
  });

  /* ── POST /ai/report ─────────────────────────────────────────────── */
  app.post('/ai/report', { preHandler: authenticate }, async (req, reply) => {
    if (!aiService.isConfigured()) return reply.code(503).send({ error: 'Orion AI is not configured' });
    const { deviceId, periodLabel, fields } = req.body as any;
    if (!deviceId || !periodLabel || !fields?.length) {
      return reply.code(400).send({ error: 'deviceId, periodLabel, and fields are required' });
    }
    const device = await Device.findOne({ _id: deviceId, orgId: req.user.orgId });
    if (!device) return reply.code(404).send({ error: 'Device not found' });
    try {
      const report = await aiService.generateReport({ deviceName: device.name, periodLabel, fields });
      return reply.send(report);
    } catch (err: any) {
      const { status, message } = orionError(err);
      return reply.code(status).send({ error: message });
    }
  });
}
