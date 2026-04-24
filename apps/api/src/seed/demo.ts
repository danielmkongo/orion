/**
 * Demo data seed — targets the admin user's org.
 * Wipes all org data then repopulates with realistic devices + telemetry.
 *
 * Usage:
 *   DEMO_EMAIL=admin@vortan.io pnpm --filter @orion/api tsx src/seed/demo.ts
 *   (DEMO_EMAIL defaults to admin@vortan.io)
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { config } from '../config/index.js';
import { Organization } from '../models/Organization.js';
import { User } from '../models/User.js';
import { Device } from '../models/Device.js';
import { Telemetry } from '../models/Telemetry.js';
import { Dashboard } from '../models/Dashboard.js';
import { Alert } from '../models/Alert.js';
import { Rule } from '../models/Rule.js';
import { Firmware } from '../models/Firmware.js';
import { OtaJob } from '../models/OtaJob.js';
import { Geofence } from '../models/Geofence.js';
import { Command } from '../models/Command.js';
import { Share } from '../models/Share.js';
import { Page } from '../models/Page.js';

const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'admin@vortan.io';
const DEMO_PASS  = process.env.DEMO_PASS  ?? 'demo1234';

/* ── Device catalogue ───────────────────────────────────────────────── */
const DEVICES = [
  // Fleet trackers
  { name: 'TZ-DAR-001 · Delivery Truck',     category: 'tracker',       protocol: 'mqtt', lat: -6.7924, lng: 39.2083, fw: '3.1.2', tags: ['fleet', 'dar-es-salaam'] },
  { name: 'TZ-DAR-002 · Cargo Van',           category: 'tracker',       protocol: 'mqtt', lat: -6.8160, lng: 39.2803, fw: '3.1.2', tags: ['fleet', 'dar-es-salaam'] },
  { name: 'TZ-ARU-010 · Field Service Unit',  category: 'tracker',       protocol: 'mqtt', lat: -3.3869, lng: 36.6830, fw: '3.0.5', tags: ['fleet', 'arusha'] },
  { name: 'TZ-MWZ-015 · Logistics Truck',     category: 'tracker',       protocol: 'mqtt', lat: -8.9094, lng: 33.4607, fw: '3.1.2', tags: ['fleet', 'mwanza'] },
  // Environmental sensors
  { name: 'Kinondoni — Air Quality Station',  category: 'environmental', protocol: 'http', lat: -6.7791, lng: 39.2290, fw: '2.0.3', tags: ['environment', 'dar-es-salaam', 'air'] },
  { name: 'Kariakoo Market — Climate Node',   category: 'environmental', protocol: 'http', lat: -6.8160, lng: 39.2840, fw: '2.0.3', tags: ['environment', 'dar-es-salaam'] },
  { name: 'Port Authority — Weather Station', category: 'environmental', protocol: 'http', lat: -6.8235, lng: 39.2972, fw: '2.0.1', tags: ['environment', 'port', 'dar-es-salaam'] },
  // Energy meters
  { name: 'Mikocheni Grid Meter A',            category: 'energy',        protocol: 'mqtt', lat: -6.7634, lng: 39.2572, fw: '1.5.0', tags: ['energy', 'grid', 'dar-es-salaam'] },
  { name: 'Masaki Substation Monitor',         category: 'energy',        protocol: 'mqtt', lat: -6.7550, lng: 39.2750, fw: '1.5.0', tags: ['energy', 'grid'] },
  { name: 'Ubungo Solar Array',                category: 'energy',        protocol: 'http', lat: -6.8000, lng: 39.1900, fw: '1.4.2', tags: ['energy', 'solar'] },
  // Water / infrastructure
  { name: 'Msimbazi River Level Gauge',        category: 'water',         protocol: 'http', lat: -6.8320, lng: 39.2600, fw: '1.2.0', tags: ['water', 'flood', 'dar-es-salaam'] },
  { name: 'Mwananyamala Pump Station',         category: 'pump',          protocol: 'mqtt', lat: -6.7700, lng: 39.2400, fw: '2.3.1', tags: ['pump', 'water', 'dar-es-salaam'] },
  // Gateways
  { name: 'Tegeta Industrial Gateway',         category: 'gateway',       protocol: 'mqtt', lat: -6.7100, lng: 39.2200, fw: '5.0.2', tags: ['gateway', 'industrial'] },
  { name: 'Dar Port Logistics Hub',            category: 'gateway',       protocol: 'mqtt', lat: -6.8190, lng: 39.2990, fw: '5.0.2', tags: ['gateway', 'port'] },
  // Research
  { name: 'UDSM Research Node α',              category: 'research',      protocol: 'http', lat: -6.7763, lng: 39.2292, fw: '0.9.1', tags: ['research', 'university'] },
] as const;

/* ── Telemetry generator ─────────────────────────────────────────────── */
function rand(min: number, max: number, dp = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(dp));
}

function wave(i: number, offset: number, amp: number, base: number) {
  return parseFloat((base + Math.sin((i + offset) / 8) * amp + Math.cos((i + offset) / 20) * amp * 0.4).toFixed(2));
}

function genTelemetry(deviceId: string, orgId: string, d: typeof DEVICES[number], count = 288) {
  const now = Date.now();
  const offset = d.name.charCodeAt(0);
  const points = [];

  for (let i = count; i >= 0; i--) {
    const ts = new Date(now - i * 5 * 60 * 1000);
    const fields: Record<string, number | string | boolean> = {};
    const hasLocation = d.category === 'tracker';
    const location = hasLocation ? {
      lat:     d.lat + rand(-0.008, 0.008, 6),
      lng:     d.lng + rand(-0.008, 0.008, 6),
      speed:   wave(i, offset, 25, 45),
      heading: rand(0, 360, 0),
    } : undefined;

    switch (d.category) {
      case 'tracker':
        fields.speed    = wave(i, offset, 25, 45);
        fields.heading  = rand(0, 360, 0);
        fields.battery  = wave(i, offset, 15, 72);
        fields.satellites = Math.floor(rand(6, 14, 0));
        fields.hdop     = rand(0.8, 2.5);
        break;
      case 'environmental':
        fields.temperature = wave(i, offset, 4, 27);
        fields.humidity    = wave(i, offset, 12, 65);
        fields.pressure    = wave(i, offset, 3, 1008);
        fields.co2         = wave(i, offset, 150, 680);
        fields.pm25        = wave(i, offset, 20, 35);
        fields.pm10        = wave(i, offset, 30, 55);
        break;
      case 'energy':
        fields.voltage     = wave(i, offset, 4, 228);
        fields.current     = wave(i, offset, 8, 18);
        fields.power       = wave(i, offset, 1200, 4100);
        fields.energy_kwh  = wave(i, offset, 30, 140);
        fields.frequency   = wave(i, offset, 0.15, 50.0);
        fields.power_factor = rand(0.85, 0.99);
        break;
      case 'water':
        fields.level_cm    = wave(i, offset, 30, 120);
        fields.flow_lpm    = wave(i, offset, 15, 40);
        fields.temperature = wave(i, offset, 2, 22);
        fields.ph          = wave(i, offset, 0.4, 7.2);
        fields.turbidity   = wave(i, offset, 5, 12);
        break;
      case 'pump':
        fields.rpm          = wave(i, offset, 300, 1800);
        fields.pressure_bar = wave(i, offset, 1.5, 4.2);
        fields.flow_lpm     = wave(i, offset, 20, 90);
        fields.temperature  = wave(i, offset, 8, 45);
        fields.vibration    = rand(0.1, 2.5);
        fields.running      = Math.random() > 0.08 ? 1 : 0;
        break;
      case 'gateway':
        fields.connected_devices = Math.floor(wave(i, offset, 3, 8));
        fields.uptime_h     = parseFloat((i * 5 / 60).toFixed(2));
        fields.cpu_pct      = wave(i, offset, 15, 28);
        fields.mem_pct      = wave(i, offset, 10, 52);
        fields.rssi         = wave(i, offset, 8, -62);
        break;
      case 'research':
        fields.channel_1 = wave(i, offset, 1.5, 0);
        fields.channel_2 = wave(i, offset + 30, 1.2, 0);
        fields.channel_3 = rand(0, 3.3);
        fields.channel_4 = rand(0, 1);
        fields.sample_rate_hz = 100;
        break;
      default:
        fields.value = rand(0, 100);
        fields.rssi  = rand(-90, -40, 0);
    }

    points.push({
      deviceId: new mongoose.Types.ObjectId(deviceId),
      orgId:    new mongoose.Types.ObjectId(orgId),
      timestamp: ts,
      fields,
      location,
      meta: {},
    });
  }
  return points;
}

/* ── Main ─────────────────────────────────────────────────────────────── */
async function seed() {
  await mongoose.connect(config.mongoUri);
  console.log('[demo-seed] Connected to MongoDB');

  // Find or create admin user
  let admin = await User.findOne({ email: DEMO_EMAIL });
  let org: any;

  if (admin) {
    org = await Organization.findById(admin.orgId);
    if (!org) {
      console.error('[demo-seed] Admin user found but org missing');
      process.exit(1);
    }
    console.log(`[demo-seed] Found existing admin: ${admin.email} → org: ${org.name}`);
  } else {
    org = await Organization.create({ name: 'Vortan', slug: 'vortan', plan: 'pro' });
    const passwordHash = await bcrypt.hash(DEMO_PASS, 12);
    admin = await User.create({
      email: DEMO_EMAIL, passwordHash, name: 'Platform Admin',
      role: 'super_admin', orgId: org._id, isActive: true,
    });
    console.log(`[demo-seed] Created new admin: ${DEMO_EMAIL} / ${DEMO_PASS}`);
  }

  const orgId = String(org._id);

  // Wipe org data
  console.log('[demo-seed] Clearing existing org data…');
  await Promise.all([
    Device.deleteMany({ orgId }),
    Telemetry.deleteMany({ orgId }),
    Alert.deleteMany({ orgId }),
    Rule.deleteMany({ orgId }),
    Firmware.deleteMany({ orgId }),
    OtaJob.deleteMany({ orgId }),
    Dashboard.deleteMany({ orgId }),
    Geofence.deleteMany({ orgId }),
    Command.deleteMany({ orgId }),
    Share.deleteMany({ orgId }),
    Page.deleteMany({ orgId }),
  ]);

  // Create devices
  console.log('[demo-seed] Creating devices…');
  const STATUSES = ['online', 'online', 'online', 'online', 'offline', 'idle'] as const;
  const created: Array<{ device: any; spec: typeof DEVICES[number] }> = [];

  for (const spec of DEVICES) {
    const device = await Device.create({
      orgId, name: spec.name, category: spec.category,
      protocol: spec.protocol, payloadFormat: 'json',
      apiKey: `dev_${nanoid(32)}`,
      serialNumber: `SN-${nanoid(8).toUpperCase()}`,
      tags: [...spec.tags],
      firmwareVersion: spec.fw,
      hardwareVersion: '1.0',
      status: STATUSES[Math.floor(Math.random() * STATUSES.length)],
      location: { lat: spec.lat, lng: spec.lng, timestamp: new Date() },
      attributes: [],
      meta: {},
      lastSeenAt: new Date(Date.now() - Math.random() * 3600_000),
      firstSeenAt: new Date(Date.now() - 60 * 24 * 3600_000),
    });
    created.push({ device, spec });
  }

  // Generate telemetry
  console.log('[demo-seed] Generating telemetry (288 pts × 15 devices = 4 320 docs)…');
  for (const { device, spec } of created) {
    const points = genTelemetry(String(device._id), orgId, spec);
    await Telemetry.insertMany(points);
  }

  // ── Alerts ────────────────────────────────────────────────────────────
  const envDev  = created.find(d => d.spec.category === 'environmental')?.device;
  const tracker = created.find(d => d.spec.category === 'tracker')?.device;
  const pump    = created.find(d => d.spec.category === 'pump')?.device;
  const water   = created.find(d => d.spec.category === 'water')?.device;

  await Alert.insertMany([
    { orgId, deviceId: envDev?._id,  severity: 'warning',  status: 'active',       title: 'High CO₂ Level',           message: 'Kariakoo Market CO₂ exceeds 900 ppm — check ventilation',    context: { field: 'co2', value: 962, threshold: 900 } },
    { orgId, deviceId: envDev?._id,  severity: 'info',     status: 'resolved',     title: 'PM2.5 Normalised',          message: 'Air quality returned to safe levels',                         context: { field: 'pm25', value: 22, threshold: 35 }, resolvedAt: new Date() },
    { orgId, deviceId: tracker?._id, severity: 'critical', status: 'active',       title: 'Geofence Breach',           message: 'TZ-DAR-001 exited Dar es Salaam delivery zone',               context: { lat: -6.9100, lng: 39.3200 } },
    { orgId, deviceId: tracker?._id, severity: 'warning',  status: 'acknowledged', title: 'Low Battery',               message: 'TZ-DAR-002 battery at 12% — charge soon',                     context: { field: 'battery', value: 12, threshold: 15 }, acknowledgedBy: admin._id, acknowledgedAt: new Date() },
    { orgId, deviceId: pump?._id,    severity: 'error',    status: 'active',       title: 'Pump Vibration Anomaly',    message: 'Mwananyamala pump vibration exceeds safe threshold (2.1 g)',  context: { field: 'vibration', value: 2.1, threshold: 2.0 } },
    { orgId, deviceId: water?._id,   severity: 'warning',  status: 'active',       title: 'River Level Rising',        message: 'Msimbazi River level up 28 cm in last hour — monitor flood risk', context: { field: 'level_cm', value: 168, baseline: 120 } },
  ]);

  // ── Rules ─────────────────────────────────────────────────────────────
  await Rule.insertMany([
    {
      orgId, name: 'High Temperature Alert',
      description: 'Alert when ambient temperature exceeds 33°C at any env sensor',
      triggerType: 'telemetry', tags: ['environment'],
      conditions: [{ field: 'temperature', operator: 'gt', value: 33 }],
      conditionLogic: 'and',
      actions: [
        { type: 'alert',  config: { severity: 'warning', title: 'High Temperature', message: 'Temperature {{value}}°C on {{device.name}}' } },
        { type: 'sms',    config: { phone: '+255700000000', message: 'ORION ALERT: {{device.name}} temp {{value}}°C at {{timestamp}}' } },
      ],
      isEnabled: true, cooldownSeconds: 600, priority: 'medium', createdBy: admin._id, fireCount: 4,
    },
    {
      orgId, name: 'CO₂ Threshold Breach',
      description: 'Notify when CO₂ exceeds 900 ppm in any Kariakoo area sensor',
      triggerType: 'telemetry', tags: ['environment', 'air'],
      conditions: [{ field: 'co2', operator: 'gt', value: 900 }],
      conditionLogic: 'and',
      actions: [
        { type: 'alert',   config: { severity: 'warning', title: 'CO₂ Alert', message: 'CO₂ level {{value}} ppm — check ventilation at {{device.name}}' } },
        { type: 'webhook', config: { url: 'https://hooks.slack.com/example', body: '{"text":"CO₂ alert: {{value}} ppm at {{device.name}}"}' } },
      ],
      isEnabled: true, cooldownSeconds: 900, priority: 'medium', createdBy: admin._id, fireCount: 2,
    },
    {
      orgId, name: 'Tracker Low Battery',
      description: 'Warn when fleet tracker battery drops below 15%',
      triggerType: 'telemetry', tags: ['fleet'],
      conditions: [{ field: 'battery', operator: 'lt', value: 15 }],
      conditionLogic: 'and',
      actions: [{ type: 'alert', config: { severity: 'warning', title: 'Low Battery — {{device.name}}', message: 'Battery at {{value}}% — schedule charging' } }],
      isEnabled: true, cooldownSeconds: 3600, priority: 'low', createdBy: admin._id, fireCount: 1,
    },
    {
      orgId, name: 'Pump Vibration Anomaly',
      description: 'Alert when pump vibration exceeds safe operating threshold',
      triggerType: 'telemetry', tags: ['pump'],
      conditions: [{ field: 'vibration', operator: 'gt', value: 2.0 }],
      conditionLogic: 'and',
      actions: [
        { type: 'alert',   config: { severity: 'error', title: 'Pump Vibration Anomaly', message: 'Vibration at {{value}} g on {{device.name}}' } },
        { type: 'command', config: { name: 'emergency_stop', payload: {} } },
      ],
      isEnabled: true, cooldownSeconds: 120, priority: 'high', createdBy: admin._id, fireCount: 0,
    },
    {
      orgId, name: 'Power Overconsumption',
      description: 'Flag when grid meter power exceeds 9 kW',
      triggerType: 'telemetry', tags: ['energy'],
      conditions: [{ field: 'power', operator: 'gt', value: 9000 }],
      conditionLogic: 'and',
      actions: [{ type: 'alert', config: { severity: 'warning', title: 'High Power Draw', message: '{{device.name}} drawing {{value}} W' } }],
      isEnabled: false, cooldownSeconds: 300, priority: 'low', createdBy: admin._id, fireCount: 0,
    },
  ]);

  // ── Firmware ──────────────────────────────────────────────────────────
  const fwTracker = await Firmware.create({ orgId, name: 'Fleet Tracker OS', version: '3.1.2', category: 'tracker', size: '312 KB', status: 'active', devices: 4, changelog: 'Improved GPS fix time, reduced power by 18%. Geofence engine v2.', uploadedAt: new Date('2024-12-01') });
  const fwTrackerOld = await Firmware.create({ orgId, name: 'Fleet Tracker OS', version: '3.0.5', category: 'tracker', size: '298 KB', status: 'deprecated', devices: 0, changelog: 'Geofencing support, MQTT QoS 2.', uploadedAt: new Date('2024-09-15') });
  const fwEnv = await Firmware.create({ orgId, name: 'Env Sensor FW', version: '2.0.3', category: 'environmental', size: '98 KB', status: 'active', devices: 3, changelog: 'CO₂ sensor recalibration, PM2.5 rolling average.', uploadedAt: new Date('2024-11-20') });
  const fwGw  = await Firmware.create({ orgId, name: 'Gateway OS', version: '5.0.2', category: 'gateway', size: '1.4 MB', status: 'active', devices: 2, changelog: 'Security hardening, TLS 1.3, edge compute module.', uploadedAt: new Date('2025-01-08') });
  const fwGwOld = await Firmware.create({ orgId, name: 'Gateway OS', version: '5.0.0', category: 'gateway', size: '1.3 MB', status: 'archived', devices: 0, changelog: 'Legacy gateway build.', uploadedAt: new Date('2024-07-01') });

  // ── OTA Jobs ──────────────────────────────────────────────────────────
  await OtaJob.insertMany([
    { orgId, name: 'Fleet Tracker OS — December Rollout', firmwareId: fwTracker._id, firmwareVersion: fwTracker.version, status: 'completed', progress: 4, total: 4, startedAt: new Date('2024-12-03T08:00:00Z'), completedAt: new Date('2024-12-03T09:22:00Z') },
    { orgId, name: 'Env Sensor FW — November Update',     firmwareId: fwEnv._id,     firmwareVersion: fwEnv.version,     status: 'completed', progress: 3, total: 3, startedAt: new Date('2024-11-22T10:00:00Z'), completedAt: new Date('2024-11-22T10:48:00Z') },
    { orgId, name: 'Gateway OS v5.0.2 Rollout',           firmwareId: fwGw._id,      firmwareVersion: fwGw.version,      status: 'in_progress', progress: 1, total: 2, startedAt: new Date() },
    { orgId, name: 'Tracker Rollback to 3.0.5',           firmwareId: fwTrackerOld._id, firmwareVersion: fwTrackerOld.version, status: 'failed', progress: 1, total: 1, startedAt: new Date('2024-10-10T07:00:00Z') },
  ]);

  // ── Dashboard ─────────────────────────────────────────────────────────
  await Dashboard.create({
    orgId, name: 'Operations Overview',
    description: 'Live fleet, environment, and infrastructure monitoring for Dar es Salaam',
    isPinned: true, isPublic: false, createdBy: admin._id,
    widgets: [
      { id: nanoid(8), type: 'kpi-card', title: 'Total Devices',   position: { x: 0, y: 0, w: 3, h: 2 }, dataSources: [], config: { metric: 'devices.total', icon: 'cpu' } },
      { id: nanoid(8), type: 'kpi-card', title: 'Online',          position: { x: 3, y: 0, w: 3, h: 2 }, dataSources: [], config: { metric: 'devices.online', icon: 'wifi', color: 'green' } },
      { id: nanoid(8), type: 'kpi-card', title: 'Active Alerts',   position: { x: 6, y: 0, w: 3, h: 2 }, dataSources: [], config: { metric: 'alerts.active', icon: 'bell', color: 'red' } },
      { id: nanoid(8), type: 'map',      title: 'Device Map',      position: { x: 0, y: 2, w: 8, h: 6 }, dataSources: [], config: { showAllDevices: true, center: [-6.8, 39.28], zoom: 12 } },
    ],
  });

  // ── Geofences ─────────────────────────────────────────────────────────
  await Geofence.insertMany([
    {
      orgId, name: 'Dar es Salaam Delivery Zone',
      description: 'Primary delivery zone for TZ-DAR fleet', type: 'polygon',
      coordinates: [{ lat: -6.78, lng: 39.20 }, { lat: -6.78, lng: 39.32 }, { lat: -6.87, lng: 39.32 }, { lat: -6.87, lng: 39.20 }],
      deviceIds: [], tags: ['fleet'], color: '#FF5B1F', active: true,
    },
    {
      orgId, name: 'Port Exclusion Zone',
      description: 'No fleet vehicles beyond this boundary without clearance', type: 'circle',
      center: { lat: -6.8235, lng: 39.2972 }, radius: 500,
      deviceIds: [], tags: ['fleet', 'port'], color: '#EF4444', active: true,
    },
  ]);

  console.log('\n✅  Demo seed complete!');
  console.log('─────────────────────────────────────────');
  console.log('  Org              :', org.name);
  console.log('  Admin email      :', DEMO_EMAIL);
  console.log('  Password         :', DEMO_PASS);
  console.log('  Devices created  :', DEVICES.length);
  console.log('  Telemetry points :', DEVICES.length * 289);
  console.log('─────────────────────────────────────────\n');

  await mongoose.disconnect();
}

seed().catch(e => {
  console.error('[demo-seed] Fatal:', e);
  process.exit(1);
});
