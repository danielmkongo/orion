import { Schema, model, Document } from 'mongoose';
import type { CommandStatus } from '@orion/shared';

export interface ICommand extends Document {
  deviceId: Schema.Types.ObjectId;
  orgId: Schema.Types.ObjectId;
  issuedBy: Schema.Types.ObjectId;
  name: string;
  payload: Record<string, unknown>;
  status: CommandStatus;
  sentAt?: Date;
  acknowledgedAt?: Date;
  executedAt?: Date;
  failedAt?: Date;
  response?: Record<string, unknown>;
  errorMessage?: string;
  retries: number;
  maxRetries: number;
  scheduledFor?: Date;
  ttl?: number;
  createdAt: Date;
  updatedAt: Date;
}

const CommandSchema = new Schema<ICommand>(
  {
    deviceId: { type: Schema.Types.ObjectId, required: true, ref: 'Device', index: true },
    orgId: { type: Schema.Types.ObjectId, required: true, ref: 'Organization', index: true },
    issuedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    name: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['pending', 'sent', 'acknowledged', 'executed', 'failed', 'timeout', 'cancelled'],
      default: 'pending',
    },
    sentAt: Date,
    acknowledgedAt: Date,
    executedAt: Date,
    failedAt: Date,
    response: Schema.Types.Mixed,
    errorMessage: String,
    retries: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 },
    scheduledFor: Date,
    ttl: { type: Number, default: 300 },
  },
  { timestamps: true }
);

CommandSchema.index({ deviceId: 1, createdAt: -1 });
CommandSchema.index({ orgId: 1, status: 1 });

export const Command = model<ICommand>('Command', CommandSchema);
