import mqtt from 'mqtt';
import { Device } from '../models/Device.js';
import { Command } from '../models/Command.js';
import { telemetryService } from './telemetry.service.js';
import { realtimeService } from './realtime.service.js';
import { commandBus } from './command-bus.js';

const BROKER_URL = process.env.MQTT_BROKER_URL ?? 'mqtt://45.79.206.183:1883';

function coerce(val: string | undefined): string | number | boolean {
  if (val === undefined) return '';
  if (val === 'true') return true;
  if (val === 'false') return false;
  const n = Number(val);
  if (!isNaN(n) && val !== '') return n;
  return val;
}

function parsePayload(raw: string, format: string): Record<string, unknown> {
  try {
    switch (format) {
      case 'csv': {
        const lines = raw.trim().split('\n');
        if (lines.length < 2) return {};
        const keys = lines[0].split(',').map(s => s.trim());
        const vals = lines[1].split(',').map(s => s.trim());
        return Object.fromEntries(keys.map((k, i) => [k, coerce(vals[i])]));
      }
      case 'raw':
        return Object.fromEntries(raw.split('&').map(p => { const [k, v] = p.split('='); return [k.trim(), coerce(v?.trim())]; }));
      case 'xml': {
        const obj: Record<string, unknown> = {};
        for (const m of raw.matchAll(/<(\w+)>([^<]*)<\/\1>/g)) obj[m[1]] = coerce(m[2]);
        return obj;
      }
      default:
        return JSON.parse(raw);
    }
  } catch {
    return {};
  }
}

function formatPayload(data: Record<string, unknown>, format: string): string {
  switch (format) {
    case 'xml': return `<command>\n${Object.entries(data).map(([k, v]) => `  <${k}>${v}</${k}>`).join('\n')}\n</command>`;
    case 'csv': { const keys = Object.keys(data); return `${keys.join(',')}\n${keys.map(k => data[k]).join(',')}`; }
    case 'raw': return Object.entries(data).map(([k, v]) => `${k}=${v}`).join('&');
    default: return JSON.stringify(data);
  }
}

class MqttService {
  private client: mqtt.MqttClient | null = null;

  start() {
    this.client = mqtt.connect(BROKER_URL, {
      clientId: `orion-bridge-${Math.random().toString(16).slice(2, 10)}`,
      clean: true,
      reconnectPeriod: 5_000,
      connectTimeout: 10_000,
    });

    this.client.on('connect', () => {
      console.log(`📡 MQTT connected to ${BROKER_URL}`);
      // Topics: /{serial}/data and /{serial}/commands/{cmdId}/ack
      this.client!.subscribe('+/+/data', { qos: 1 });
      this.client!.subscribe('+/+/commands/+/ack', { qos: 1 });
    });

    this.client.on('message', (topic, message) => {
      this.handleMessage(topic, message.toString()).catch(() => {});
    });

    this.client.on('error', err => console.error('MQTT error:', err.message));
    this.client.on('reconnect', () => console.log('MQTT reconnecting…'));

    commandBus.on('command.created', ({ deviceId, command }: any) => {
      this.deliverCommand(deviceId, command).catch(() => {});
    });
  }

  private async handleMessage(topic: string, raw: string) {
    // topic format: /{serial}/data  →  split('/') = ['', serial, 'data']
    const parts = topic.split('/');

    if (parts[parts.length - 1] === 'data') {
      const serial = parts[parts.length - 2];
      await this.handleTelemetry(serial, raw);
    } else if (parts[parts.length - 1] === 'ack') {
      // /{serial}/commands/{commandId}/ack
      const serial    = parts[parts.length - 4];
      const commandId = parts[parts.length - 2];
      await this.handleAck(serial, commandId, raw);
    }
  }

  private async handleTelemetry(serial: string, raw: string) {
    const device = await Device.findOne({ serialNumber: serial }).lean() as any;
    if (!device) return;

    const body = parsePayload(raw, device.payloadFormat ?? 'json');
    // Optional apiKey verification
    if (body.api_key && body.api_key !== device.apiKey) return;

    const fields: Record<string, number | string | boolean> = {};
    for (const [k, v] of Object.entries(body)) {
      if (k !== 'api_key' && k !== 'timestamp' && (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean')) {
        fields[k] = v;
      }
    }
    if (!Object.keys(fields).length) return;

    const ts = (body.timestamp as string) ?? new Date().toISOString();
    const deviceId = String(device._id);
    const orgId = String(device.orgId);
    await telemetryService.ingest(deviceId, orgId, { deviceId, timestamp: ts, fields });
    realtimeService.emitTelemetry(orgId, deviceId, fields, undefined, ts);
  }

  private async handleAck(serial: string, commandId: string, raw: string) {
    const device = await Device.findOne({ serialNumber: serial }).lean() as any;
    if (!device) return;

    const body = parsePayload(raw, device.payloadFormat ?? 'json');
    const { commandService } = await import('./command.service.js');
    const status = (body.status as 'acknowledged' | 'executed' | 'failed') ?? 'executed';
    await commandService.acknowledge(commandId, String(device._id), status, body.response as any, body.errorMessage as string);
  }

  async deliverCommand(deviceId: string, command: any) {
    if (!this.client?.connected) return;

    const device = await Device.findById(deviceId).lean() as any;
    if (!device) return;

    const serial = device.serialNumber ?? String(device._id).slice(-8);
    const topic = `/${serial}/commands`;
    const payload = formatPayload(
      { commandId: String(command._id), name: command.name, payload: JSON.stringify(command.payload ?? {}) },
      device.payloadFormat ?? 'json'
    );

    this.client.publish(topic, payload, { qos: 1 });
    await Command.findByIdAndUpdate(command._id, { $set: { status: 'sent', sentAt: new Date() } });
  }

  isConnected() {
    return this.client?.connected ?? false;
  }
}

export const mqttService = new MqttService();
