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

const DEVICE_SEEDS = [
  { name: 'Tracker Alpha-01', category: 'tracker', protocol: 'mqtt', lat: 1.3521, lng: 103.8198, tags: ['fleet', 'vehicle'] },
  { name: 'Tracker Alpha-02', category: 'tracker', protocol: 'mqtt', lat: 1.2832, lng: 103.8520, tags: ['fleet', 'vehicle'] },
  { name: 'Env Sensor B1', category: 'environmental', protocol: 'http', lat: 1.3644, lng: 103.9915, tags: ['environment', 'indoor'] },
  { name: 'Env Sensor B2', category: 'environmental', protocol: 'http', lat: 1.3000, lng: 103.7800, tags: ['environment', 'outdoor'] },
  { name: 'Energy Meter C1', category: 'energy', protocol: 'mqtt', lat: 1.3521, lng: 103.8500, tags: ['energy', 'site-a'] },
  { name: 'Energy Meter C2', category: 'energy', protocol: 'mqtt', lat: 1.3100, lng: 103.8200, tags: ['energy', 'site-b'] },
  { name: 'Water Level D1', category: 'water', protocol: 'http', lat: 1.3200, lng: 103.8600, tags: ['water', 'tank'] },
  { name: 'Pump Controller E1', category: 'pump', protocol: 'mqtt', lat: 1.3300, lng: 103.8400, tags: ['pump', 'control'] },
  { name: 'Gateway GW-01', category: 'gateway', protocol: 'mqtt', lat: 1.3521, lng: 103.8198, tags: ['gateway'] },
  { name: 'Solar Controller S1', category: 'energy', protocol: 'http', lat: 1.2900, lng: 103.7700, tags: ['solar', 'energy'] },
  { name: 'Field Unit F1', category: 'mobile', protocol: 'http', lat: 1.3700, lng: 103.8100, tags: ['mobile', 'field'] },
  { name: 'Research Node R1', category: 'research', protocol: 'http', lat: 1.3400, lng: 103.8300, tags: ['research'] },
];

function randBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function generateTelemetry(deviceId: string, orgId: string, category: string, lat: number, lng: number, count = 200) {
  const now = Date.now();
  const points = [];

  for (let i = count; i >= 0; i--) {
    const ts = new Date(now - i * 5 * 60 * 1000); // every 5 minutes
    const fields: Record<string, number | string | boolean> = {};
    const location = {
      lat: lat + randBetween(-0.005, 0.005),
      lng: lng + randBetween(-0.005, 0.005),
      speed: randBetween(0, 80),
      heading: randBetween(0, 360),
    };

    switch (category) {
      case 'tracker':
      case 'mobile':
        fields.speed = parseFloat(randBetween(0, 80).toFixed(1));
        fields.heading = parseFloat(randBetween(0, 360).toFixed(0));
        fields.battery = parseFloat(randBetween(10, 100).toFixed(0));
        fields.satellites = Math.floor(randBetween(4, 12));
        break;
      case 'environmental':
        fields.temperature = parseFloat(randBetween(18, 35).toFixed(1));
        fields.humidity = parseFloat(randBetween(30, 90).toFixed(1));
        fields.pressure = parseFloat(randBetween(995, 1020).toFixed(1));
        fields.co2 = parseFloat(randBetween(350, 1200).toFixed(0));
        fields.pm25 = parseFloat(randBetween(0, 150).toFixed(1));
        break;
      case 'energy':
        fields.voltage = parseFloat(randBetween(215, 240).toFixed(1));
        fields.current = parseFloat(randBetween(0, 50).toFixed(2));
        fields.power = parseFloat(randBetween(0, 10000).toFixed(0));
        fields.energy_kwh = parseFloat(randBetween(0, 500).toFixed(2));
        fields.frequency = parseFloat(randBetween(49.8, 50.2).toFixed(2));
        break;
      case 'water':
        fields.level_cm = parseFloat(randBetween(0, 200).toFixed(1));
        fields.flow_lpm = parseFloat(randBetween(0, 100).toFixed(2));
        fields.temperature = parseFloat(randBetween(15, 30).toFixed(1));
        fields.ph = parseFloat(randBetween(6.5, 8.5).toFixed(2));
        break;
      case 'pump':
        fields.rpm = parseFloat(randBetween(0, 3000).toFixed(0));
        fields.pressure_bar = parseFloat(randBetween(0, 10).toFixed(2));
        fields.flow_lpm = parseFloat(randBetween(0, 200).toFixed(1));
        fields.temperature = parseFloat(randBetween(20, 80).toFixed(1));
        fields.status = Math.random() > 0.1 ? 1 : 0;
        break;
      case 'research':
        fields.channel_1 = parseFloat(randBetween(-5, 5).toFixed(4));
        fields.channel_2 = parseFloat(randBetween(-5, 5).toFixed(4));
        fields.channel_3 = parseFloat(randBetween(0, 3.3).toFixed(4));
        fields.channel_4 = parseFloat(randBetween(0, 1).toFixed(4));
        fields.sample_rate_hz = 100;
        break;
      default:
        fields.value = parseFloat(randBetween(0, 100).toFixed(2));
        fields.rssi = Math.floor(randBetween(-100, -40));
    }

    points.push({
      deviceId: new mongoose.Types.ObjectId(deviceId),
      orgId: new mongoose.Types.ObjectId(orgId),
      timestamp: ts,
      fields,
      location: (category === 'tracker' || category === 'mobile') ? location : undefined,
      meta: {},
    });
  }
  return points;
}

async function seed() {
  await mongoose.connect(config.mongoUri);
  console.log('[seed] Connected to MongoDB');

  // Clear existing demo data
  await Promise.all([
    Organization.deleteMany({}),
    User.deleteMany({}),
    Device.deleteMany({}),
    Telemetry.deleteMany({}),
    Dashboard.deleteMany({}),
    Alert.deleteMany({}),
    Rule.deleteMany({}),
  ]);

  // Create demo org
  const org = await Organization.create({
    name: 'Vortan Demo',
    slug: 'vortan-demo',
    plan: 'pro',
  });

  // Create admin user
  const passwordHash = await bcrypt.hash('demo1234', 12);
  const adminUser = await User.create({
    email: 'admin@vortan.io',
    passwordHash,
    name: 'Admin User',
    role: 'admin',
    orgId: org._id,
    isActive: true,
  });

  // Create additional users
  await User.create([
    { email: 'operator@vortan.io', passwordHash, name: 'Field Operator', role: 'operator', orgId: org._id, isActive: true },
    { email: 'researcher@vortan.io', passwordHash, name: 'Research Lead', role: 'researcher', orgId: org._id, isActive: true },
    { email: 'viewer@vortan.io', passwordHash, name: 'Dashboard Viewer', role: 'viewer', orgId: org._id, isActive: true },
  ]);

  // Create devices
  const createdDevices = [];
  for (const seed of DEVICE_SEEDS) {
    const device = await Device.create({
      orgId: org._id,
      name: seed.name,
      category: seed.category,
      protocol: seed.protocol,
      payloadFormat: 'json',
      apiKey: `dev_${nanoid(32)}`,
      tags: seed.tags,
      status: Math.random() > 0.2 ? 'online' : 'offline',
      location: {
        lat: seed.lat,
        lng: seed.lng,
        timestamp: new Date(),
      },
      attributes: [],
      meta: {},
      lastSeenAt: new Date(Date.now() - Math.random() * 3600_000),
      firstSeenAt: new Date(Date.now() - 30 * 24 * 3600_000),
    });
    createdDevices.push({ device, seed });
  }

  // Generate telemetry
  console.log('[seed] Generating telemetry data...');
  for (const { device, seed } of createdDevices) {
    const points = generateTelemetry(
      String(device._id),
      String(org._id),
      seed.category,
      seed.lat,
      seed.lng
    );
    await Telemetry.insertMany(points);
  }

  // Create sample alerts
  const envDevice = createdDevices.find(d => d.seed.category === 'environmental');
  if (envDevice) {
    await Alert.create([
      {
        orgId: org._id,
        deviceId: envDevice.device._id,
        severity: 'warning',
        status: 'active',
        title: 'High Temperature Detected',
        message: 'Temperature exceeds threshold of 30°C on Env Sensor B1',
        context: { field: 'temperature', value: 34.2, threshold: 30 },
      },
      {
        orgId: org._id,
        deviceId: envDevice.device._id,
        severity: 'info',
        status: 'resolved',
        title: 'CO₂ Level Normalised',
        message: 'CO₂ returned below 800 ppm threshold',
        context: { field: 'co2', value: 750, threshold: 800 },
        resolvedAt: new Date(),
      },
    ]);
  }

  // Create a tracker alert
  const tracker = createdDevices.find(d => d.seed.category === 'tracker');
  if (tracker) {
    await Alert.create({
      orgId: org._id,
      deviceId: tracker.device._id,
      severity: 'critical',
      status: 'active',
      title: 'Tracker Left Geofence',
      message: 'Tracker Alpha-01 has exited the Singapore perimeter geofence',
      context: { geofenceId: 'sg-perimeter', lat: 1.4210, lng: 103.9100 },
    });
  }

  // Create sample rules
  await Rule.create([
    {
      orgId: org._id,
      name: 'High Temperature Alert',
      description: 'Alert when temperature exceeds 30°C',
      triggerType: 'telemetry',
      tags: ['environment'],
      conditions: [{ field: 'temperature', operator: 'gt', value: 30 }],
      conditionLogic: 'and',
      actions: [{ type: 'alert', config: { severity: 'warning', title: 'High Temperature' } }],
      isEnabled: true,
      cooldownSeconds: 300,
      priority: 'medium',
      createdBy: adminUser._id,
      fireCount: 3,
    },
    {
      orgId: org._id,
      name: 'Device Offline Alert',
      description: 'Alert when any device goes offline for more than 5 minutes',
      triggerType: 'device_status',
      conditions: [{ field: 'status', operator: 'eq', value: 'offline', duration: 300 }],
      conditionLogic: 'and',
      actions: [
        { type: 'alert', config: { severity: 'error', title: 'Device Offline' } },
        { type: 'notification', config: { channel: 'email' } },
      ],
      isEnabled: true,
      cooldownSeconds: 600,
      priority: 'high',
      createdBy: adminUser._id,
      fireCount: 7,
    },
    {
      orgId: org._id,
      name: 'Low Battery Warning',
      description: 'Warn when tracker battery drops below 15%',
      triggerType: 'telemetry',
      tags: ['fleet'],
      conditions: [{ field: 'battery', operator: 'lt', value: 15 }],
      conditionLogic: 'and',
      actions: [{ type: 'alert', config: { severity: 'warning', title: 'Low Battery' } }],
      isEnabled: true,
      cooldownSeconds: 3600,
      priority: 'low',
      createdBy: adminUser._id,
      fireCount: 1,
    },
  ]);

  // Create a default dashboard
  await Dashboard.create({
    orgId: org._id,
    name: 'Operations Overview',
    description: 'Main operational dashboard for fleet and environment monitoring',
    isPinned: true,
    isPublic: false,
    createdBy: adminUser._id,
    widgets: [
      {
        id: nanoid(8),
        type: 'kpi-card',
        title: 'Total Devices',
        position: { x: 0, y: 0, w: 3, h: 2 },
        dataSources: [{ field: 'count', deviceIds: [] }],
        config: { metric: 'devices.total', icon: 'cpu' },
      },
      {
        id: nanoid(8),
        type: 'kpi-card',
        title: 'Online Devices',
        position: { x: 3, y: 0, w: 3, h: 2 },
        dataSources: [{ field: 'count', deviceIds: [] }],
        config: { metric: 'devices.online', icon: 'wifi', color: 'green' },
      },
      {
        id: nanoid(8),
        type: 'kpi-card',
        title: 'Active Alerts',
        position: { x: 6, y: 0, w: 3, h: 2 },
        dataSources: [{ field: 'count', deviceIds: [] }],
        config: { metric: 'alerts.active', icon: 'bell', color: 'red' },
      },
      {
        id: nanoid(8),
        type: 'map',
        title: 'Device Locations',
        position: { x: 0, y: 2, w: 8, h: 6 },
        dataSources: [],
        config: { showAllDevices: true, center: [1.3521, 103.8198], zoom: 11 },
      },
      {
        id: nanoid(8),
        type: 'line-chart',
        title: 'Environmental Temperature',
        position: { x: 0, y: 8, w: 6, h: 4 },
        dataSources: [{ tags: ['environment'], field: 'temperature' }],
        config: { unit: '°C', color: '#f97316' },
      },
      {
        id: nanoid(8),
        type: 'area-chart',
        title: 'Power Consumption',
        position: { x: 6, y: 8, w: 6, h: 4 },
        dataSources: [{ tags: ['energy'], field: 'power' }],
        config: { unit: 'W', color: '#3b82f6' },
      },
    ],
  });

  console.log('\n✅ Seed complete!');
  console.log('─────────────────────────────────');
  console.log('  Organization : Vortan Demo');
  console.log('  Admin email  : admin@vortan.io');
  console.log('  Password     : demo1234');
  console.log('  Devices      :', createdDevices.length);
  console.log('─────────────────────────────────\n');

  await mongoose.disconnect();
}

seed().catch(e => {
  console.error('[seed] Error:', e);
  process.exit(1);
});
