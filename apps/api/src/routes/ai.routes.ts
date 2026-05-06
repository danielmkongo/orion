import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { aiService } from '../services/ai.service.js';
import { Device } from '../models/Device.js';
import { DeviceTemplate } from '../models/DeviceTemplate.js';

const HARDWARE_LABELS: Record<string, string> = {
  'esp32-wifi':    'ESP32 + WiFi',
  'esp32-ppp':     'ESP32 + SIMCom GSM (PPP)',
  'esp32-at':      'ESP32 + GSM (AT commands)',
  'arduino-sim800':'Arduino + SIM800 (AT commands)',
  'pico-w':        'Raspberry Pi Pico W (MicroPython)',
};

export async function aiRoutes(app: FastifyInstance) {
  /* ── GET /ai/status — check if AI is available ──────────────────── */
  app.get('/ai/status', { preHandler: authenticate }, async (_req, reply) => {
    return reply.send({ configured: aiService.isConfigured() });
  });

  /* ── POST /ai/codegen — generate firmware for a device ──────────── */
  app.post('/ai/codegen', { preHandler: authenticate }, async (req, reply) => {
    if (!aiService.isConfigured()) {
      return reply.code(503).send({ error: 'AI not configured — add GEMINI_API_KEY to environment' });
    }

    const { deviceId, hardware, config: hwConfig = {} } = req.body as {
      deviceId: string;
      hardware: string;
      config?: Record<string, string | number>;
    };

    if (!deviceId || !hardware) {
      return reply.code(400).send({ error: 'deviceId and hardware are required' });
    }

    if (!HARDWARE_LABELS[hardware]) {
      return reply.code(400).send({ error: `Unknown hardware: ${hardware}` });
    }

    const device = await Device.findOne({ _id: deviceId, orgId: req.user.orgId });
    if (!device) return reply.code(404).send({ error: 'Device not found' });

    // Resolve schema fields from template (if any)
    let fields: Array<{ key: string; unit?: string }> = [];
    if (device.templateId) {
      const tpl = await DeviceTemplate.findById(device.templateId);
      if (tpl) {
        fields = tpl.fields
          .filter(f => !f.isLatitude && !f.isLongitude && !f.isAltitude && !f.isSpeed && !f.isHeading)
          .map(f => ({ key: f.key, unit: f.unit }));
      }
    }

    const apiBase = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 7001}`;

    const code = await aiService.generateFirmware({
      deviceName:    device.name,
      deviceApiKey:  device.apiKey,
      apiBase,
      hardware,
      hardwareLabel: HARDWARE_LABELS[hardware],
      fields,
      config: {
        intervalSeconds: 60,
        ...hwConfig,
      },
    });

    return reply.send({ code });
  });

  /* ── POST /ai/report — generate an AI diagnostic report ─────────── */
  app.post('/ai/report', { preHandler: authenticate }, async (req, reply) => {
    if (!aiService.isConfigured()) {
      return reply.code(503).send({ error: 'AI not configured — add GEMINI_API_KEY to environment' });
    }

    const { deviceId, periodLabel, fields } = req.body as {
      deviceId: string;
      periodLabel: string;
      fields: Array<{ key: string; values: number[]; unit?: string }>;
    };

    if (!deviceId || !periodLabel || !fields?.length) {
      return reply.code(400).send({ error: 'deviceId, periodLabel, and fields are required' });
    }

    const device = await Device.findOne({ _id: deviceId, orgId: req.user.orgId });
    if (!device) return reply.code(404).send({ error: 'Device not found' });

    const report = await aiService.generateReport({
      deviceName: device.name,
      periodLabel,
      fields,
    });

    return reply.send(report);
  });
}
