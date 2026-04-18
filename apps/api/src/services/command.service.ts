import { Command } from '../models/Command.js';
import type { CommandCreateInput } from '@orion/shared';
import { realtimeService } from './realtime.service.js';

export class CommandService {
  async create(orgId: string, userId: string, input: CommandCreateInput) {
    const cmd = await Command.create({
      deviceId: input.deviceId,
      orgId,
      issuedBy: userId,
      name: input.name,
      payload: input.payload ?? {},
      maxRetries: input.maxRetries ?? 3,
      scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : undefined,
      ttl: input.ttl ?? 300,
    });

    realtimeService.emit({
      type: 'command.sent',
      orgId,
      deviceId: input.deviceId,
      timestamp: new Date().toISOString(),
      data: { commandId: cmd.id, name: cmd.name, deviceId: input.deviceId },
    });

    return cmd.toObject();
  }

  async list(orgId: string, deviceId?: string, limit = 50) {
    const filter: Record<string, unknown> = { orgId };
    if (deviceId) filter.deviceId = deviceId;
    return Command.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  }

  async acknowledge(commandId: string, deviceId: string, status: 'acknowledged' | 'executed' | 'failed', response?: object, errorMessage?: string) {
    const now = new Date();
    const update: Record<string, unknown> = { status };

    if (status === 'acknowledged') update.acknowledgedAt = now;
    if (status === 'executed') { update.acknowledgedAt = now; update.executedAt = now; }
    if (status === 'failed') { update.failedAt = now; update.errorMessage = errorMessage; }
    if (response) update.response = response;

    const cmd = await Command.findOneAndUpdate(
      { _id: commandId, deviceId },
      { $set: update },
      { new: true }
    );

    if (cmd) {
      realtimeService.emit({
        type: status === 'executed' ? 'command.executed' : status === 'failed' ? 'command.failed' : 'command.acknowledged',
        orgId: cmd.orgId.toString(),
        deviceId,
        timestamp: new Date().toISOString(),
        data: { commandId, status, response, errorMessage },
      });
    }

    return cmd;
  }

  async cancel(commandId: string, orgId: string) {
    return Command.findOneAndUpdate(
      { _id: commandId, orgId, status: { $in: ['pending', 'sent'] } },
      { $set: { status: 'cancelled' } },
      { new: true }
    );
  }
}

export const commandService = new CommandService();
