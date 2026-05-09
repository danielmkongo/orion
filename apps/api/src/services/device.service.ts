import { nanoid } from 'nanoid';
import { Types } from 'mongoose';
import { Device, IDevice } from '../models/Device.js';
import { Telemetry } from '../models/Telemetry.js';
import type { DeviceCreateInput, DeviceUpdateInput } from '@orion/shared';

const ONLINE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function applyEffectiveStatus(device: any): any {
  if (!device) return device;
  const lastSeen = device.lastSeenAt ? new Date(device.lastSeenAt).getTime() : 0;
  const isRecent = lastSeen > 0 && Date.now() - lastSeen < ONLINE_WINDOW_MS;
  return { ...device, status: isRecent ? 'online' : 'offline' };
}

export class DeviceService {
  async list(orgId: string, filters: { status?: string; category?: string; tags?: string[]; search?: string; limit?: number; offset?: number }) {
    const query: Record<string, unknown> = { orgId };

    if (filters.category) query.category = filters.category;
    if (filters.tags?.length) query.tags = { $in: filters.tags };
    if (filters.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { serialNumber: { $regex: filters.search, $options: 'i' } },
        { description: { $regex: filters.search, $options: 'i' } },
      ];
    }

    const [devices, total] = await Promise.all([
      Device.find(query)
        .skip(filters.offset ?? 0)
        .limit(filters.limit ?? 50)
        .sort({ updatedAt: -1 })
        .lean(),
      Device.countDocuments(query),
    ]);

    const mapped = devices.map(applyEffectiveStatus);
    const filtered = filters.status ? mapped.filter((d: any) => d.status === filters.status) : mapped;
    return { devices: filtered, total: filters.status ? filtered.length : total };
  }

  async getById(id: string, orgId: string): Promise<IDevice | null> {
    const doc = await Device.findOne({ _id: id, orgId }).lean() as any;
    return applyEffectiveStatus(doc);
  }

  async getByApiKey(apiKey: string): Promise<IDevice | null> {
    return Device.findOne({ apiKey }).lean() as any;
  }

  async create(orgId: string, input: DeviceCreateInput): Promise<IDevice> {
    const apiKey = `dev_${nanoid(32)}`;
    const device = await Device.create({
      ...input,
      orgId,
      apiKey,
      tags: input.tags ?? [],
      attributes: input.attributes ?? [],
    });
    return device.toObject();
  }

  async update(id: string, orgId: string, input: DeviceUpdateInput): Promise<IDevice | null> {
    return Device.findOneAndUpdate({ _id: id, orgId }, { $set: input }, { new: true }).lean() as any;
  }

  async delete(id: string, orgId: string): Promise<boolean> {
    const res = await Device.deleteOne({ _id: id, orgId });
    return res.deletedCount > 0;
  }

  async markSeen(deviceId: string): Promise<void> {
    const now = new Date();
    await Device.updateOne(
      { _id: deviceId },
      {
        $set: { lastSeenAt: now, status: 'online' },
        $setOnInsert: { firstSeenAt: now },
      }
    );
  }

  async updateLocation(deviceId: string, location: { lat: number; lng: number; alt?: number; speed?: number; heading?: number; accuracy?: number }): Promise<void> {
    await Device.updateOne(
      { _id: deviceId },
      {
        $set: {
          location: { ...location, timestamp: new Date() },
          lastSeenAt: new Date(),
          status: 'online',
        },
      }
    );
  }

  async getStats(orgId: string) {
    const onlineThreshold = new Date(Date.now() - ONLINE_WINDOW_MS);
    const [total, online, byCategory] = await Promise.all([
      Device.countDocuments({ orgId }),
      Device.countDocuments({ orgId, lastSeenAt: { $gte: onlineThreshold } }),
      Device.aggregate([
        { $match: { orgId: new Types.ObjectId(orgId) } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
    ]);

    return { total, online, offline: total - online, byCategory };
  }

  async regenerateApiKey(deviceId: string, orgId: string): Promise<string> {
    const newKey = `dev_${nanoid(32)}`;
    await Device.updateOne({ _id: deviceId, orgId }, { $set: { apiKey: newKey } });
    return newKey;
  }
}

export const deviceService = new DeviceService();
