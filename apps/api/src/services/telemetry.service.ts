import { Telemetry } from '../models/Telemetry.js';
import { Device } from '../models/Device.js';
import type { TelemetryPoint, TelemetryQuery } from '@orion/shared';
import { ruleEngineService } from './rule-engine.service.js';

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

function coerceNumericStrings(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) ? Number(v) : v;
  }
  return out;
}

export class TelemetryService {
  async ingest(deviceId: string, orgId: string, point: TelemetryPoint): Promise<void> {
    // Coerce numeric strings to numbers so charts work regardless of device serialization
    const coercedFields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(point.fields)) {
      if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) {
        coercedFields[k] = Number(v);
      } else {
        coercedFields[k] = v;
      }
    }

    const location = point.location ?? extractLocation(coercedFields as Record<string, unknown>);

    const doc = {
      deviceId,
      orgId,
      timestamp: new Date(point.timestamp),
      fields: coercedFields,
      location,
      meta: point.meta ?? {},
    };

    await Telemetry.create(doc);

    const updatePayload: Record<string, unknown> = {
      lastSeenAt: new Date(),
      lastDataAt: new Date(point.timestamp),
      status: 'online',
    };
    if (location) {
      updatePayload.location = { ...location, timestamp: new Date(point.timestamp) };
    }

    const device = await Device.findOneAndUpdate(
      { _id: deviceId },
      { $set: updatePayload },
      { new: true }
    ).lean() as any;

    if (device) {
      ruleEngineService.evaluate(orgId, deviceId, point.fields, device).catch(() => {});
    }
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
    const doc = await Telemetry.findOne({ deviceId, orgId })
      .sort({ timestamp: -1 })
      .lean() as any;
    if (doc?.fields) doc.fields = coerceNumericStrings(doc.fields);
    return doc;
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

    return docs.map(d => {
      const v = (d as any).fields[field];
      return {
        ts: (d as any).timestamp,
        value: (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) ? Number(v) : v,
      };
    });
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

  async renameField(deviceId: string, orgId: string, oldKey: string, newKey: string): Promise<number> {
    if (!oldKey || !newKey || oldKey === newKey) return 0;
    const result = await Telemetry.updateMany(
      { deviceId, orgId, [`fields.${oldKey}`]: { $exists: true } },
      { $rename: { [`fields.${oldKey}`]: `fields.${newKey}` } }
    );
    return (result as any).modifiedCount ?? 0;
  }
}

export const telemetryService = new TelemetryService();
