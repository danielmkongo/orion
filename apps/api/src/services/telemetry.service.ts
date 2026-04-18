import { Telemetry } from '../models/Telemetry.js';
import { Device } from '../models/Device.js';
import type { TelemetryPoint, TelemetryQuery } from '@orion/shared';

const LAT_KEYS = new Set(['lat', 'latitude', 'Lat', 'Latitude']);
const LNG_KEYS = new Set(['lng', 'lon', 'long', 'longitude', 'Lng', 'Lon', 'Long', 'Longitude']);
const ALT_KEYS = new Set(['alt', 'altitude', 'Alt', 'Altitude']);
const SPEED_KEYS = new Set(['speed', 'Speed', 'spd']);
const HEADING_KEYS = new Set(['heading', 'Heading', 'course', 'Course', 'bearing', 'Bearing']);

export function extractLocation(fields: Record<string, unknown>): {
  lat?: number; lng?: number; alt?: number; speed?: number; heading?: number; accuracy?: number
} | undefined {
  let lat: number | undefined;
  let lng: number | undefined;
  let alt: number | undefined;
  let speed: number | undefined;
  let heading: number | undefined;
  let accuracy: number | undefined;

  for (const [key, val] of Object.entries(fields)) {
    const n = typeof val === 'number' ? val : parseFloat(String(val));
    if (isNaN(n)) continue;
    if (LAT_KEYS.has(key)) lat = n;
    else if (LNG_KEYS.has(key)) lng = n;
    else if (ALT_KEYS.has(key)) alt = n;
    else if (SPEED_KEYS.has(key)) speed = n;
    else if (HEADING_KEYS.has(key)) heading = n;
    else if (key === 'accuracy' || key === 'acc') accuracy = n;
  }

  if (lat !== undefined && lng !== undefined) {
    return { lat, lng, alt, speed, heading, accuracy };
  }
  return undefined;
}

export class TelemetryService {
  async ingest(deviceId: string, orgId: string, point: TelemetryPoint): Promise<void> {
    const location = point.location ?? extractLocation(point.fields);

    const doc = {
      deviceId,
      orgId,
      timestamp: new Date(point.timestamp),
      fields: point.fields,
      location,
      meta: point.meta ?? {},
    };

    await Telemetry.create(doc);

    const updatePayload: Record<string, unknown> = {
      lastSeenAt: new Date(),
      status: 'online',
    };
    if (location) {
      updatePayload.location = { ...location, timestamp: new Date(point.timestamp) };
    }

    await Device.updateOne({ _id: deviceId }, { $set: updatePayload });
  }

  async query(orgId: string, q: TelemetryQuery) {
    const filter: Record<string, unknown> = { orgId };

    if (q.deviceId) filter.deviceId = q.deviceId;
    if (q.deviceIds?.length) filter.deviceId = { $in: q.deviceIds };

    if (q.from || q.to) {
      filter.timestamp = {};
      if (q.from) (filter.timestamp as any).$gte = new Date(q.from);
      if (q.to) (filter.timestamp as any).$lte = new Date(q.to);
    }

    const docs = await Telemetry.find(filter)
      .sort({ timestamp: -1 })
      .limit(q.limit ?? 500)
      .skip(q.offset ?? 0)
      .lean();

    return docs;
  }

  async getLatest(deviceId: string, orgId: string) {
    return Telemetry.findOne({ deviceId, orgId })
      .sort({ timestamp: -1 })
      .lean();
  }

  async getLocationHistory(deviceId: string, orgId: string, from?: string, to?: string, limit = 1000) {
    const filter: Record<string, unknown> = {
      deviceId,
      orgId,
      'location.lat': { $exists: true },
    };

    if (from || to) {
      filter.timestamp = {};
      if (from) (filter.timestamp as any).$gte = new Date(from);
      if (to) (filter.timestamp as any).$lte = new Date(to);
    }

    return Telemetry.find(filter)
      .sort({ timestamp: 1 })
      .limit(limit)
      .select('location timestamp -_id')
      .lean();
  }

  async getSeries(deviceId: string, orgId: string, field: string, from: string, to: string, limit = 1000) {
    const docs = await Telemetry.find({
      deviceId,
      orgId,
      timestamp: { $gte: new Date(from), $lte: new Date(to) },
      [`fields.${field}`]: { $exists: true },
    })
      .sort({ timestamp: 1 })
      .limit(limit)
      .select(`fields.${field} timestamp -_id`)
      .lean();

    return docs.map(d => ({
      ts: (d as any).timestamp,
      value: (d as any).fields[field],
    }));
  }

  async getMultiDeviceSeries(deviceIds: string[], orgId: string, field: string, from: string, to: string, limit = 500) {
    const docs = await Telemetry.find({
      deviceId: { $in: deviceIds },
      orgId,
      timestamp: { $gte: new Date(from), $lte: new Date(to) },
      [`fields.${field}`]: { $exists: true },
    })
      .sort({ timestamp: 1 })
      .limit(limit)
      .select(`deviceId fields.${field} timestamp -_id`)
      .lean();

    const grouped: Record<string, Array<{ ts: Date; value: unknown }>> = {};
    for (const d of docs) {
      const devId = String((d as any).deviceId);
      if (!grouped[devId]) grouped[devId] = [];
      grouped[devId].push({ ts: (d as any).timestamp, value: (d as any).fields[field] });
    }
    return grouped;
  }
}

export const telemetryService = new TelemetryService();
