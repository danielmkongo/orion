import { nanoid } from 'nanoid';
import { Types } from 'mongoose';
import { Device, IDevice } from '../models/Device.js';
import { Telemetry } from '../models/Telemetry.js';
import type { DeviceCreateInput, DeviceUpdateInput } from '@orion/shared';

export class DeviceService {
  async list(orgId: string, filters: { status?: string; category?: string; tags?: string[]; search?: string; limit?: number; offset?: number }) {
    const query: Record<string, unknown> = { orgId };

    if (filters.status) query.status = filters.status;
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

    return { devices, total };
  }

  async getById(id: string, orgId: string): Promise<IDevice | null> {
    return Device.findOne({ _id: id, orgId }).lean() as any;
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
    const [total, online, offline, byCategory] = await Promise.all([
      Device.countDocuments({ orgId }),
      Device.countDocuments({ orgId, status: 'online' }),
      Device.countDocuments({ orgId, status: 'offline' }),
      Device.aggregate([
        { $match: { orgId: new Types.ObjectId(orgId) } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
    ]);

    return { total, online, offline, byCategory };
  }

  async regenerateApiKey(deviceId: string, orgId: string): Promise<string> {
    const newKey = `dev_${nanoid(32)}`;
    await Device.updateOne({ _id: deviceId, orgId }, { $set: { apiKey: newKey } });
    return newKey;
  }
}

export const deviceService = new DeviceService();
