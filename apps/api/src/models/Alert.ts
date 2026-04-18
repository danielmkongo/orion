import { Schema, model, Document } from 'mongoose';
import type { AlertSeverity, AlertStatus } from '@orion/shared';

export interface IAlert extends Document {
  orgId: Schema.Types.ObjectId;
  deviceId?: Schema.Types.ObjectId;
  ruleId?: Schema.Types.ObjectId;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  context: Record<string, unknown>;
  acknowledgedBy?: Schema.Types.ObjectId;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AlertSchema = new Schema<IAlert>(
  {
    orgId: { type: Schema.Types.ObjectId, required: true, ref: 'Organization', index: true },
    deviceId: { type: Schema.Types.ObjectId, ref: 'Device' },
    ruleId: { type: Schema.Types.ObjectId, ref: 'Rule' },
    severity: { type: String, enum: ['info', 'warning', 'error', 'critical'], required: true },
    status: { type: String, enum: ['active', 'acknowledged', 'resolved', 'suppressed'], default: 'active' },
    title: { type: String, required: true },
    message: { type: String, required: true },
    context: { type: Schema.Types.Mixed, default: {} },
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    acknowledgedAt: Date,
    resolvedAt: Date,
  },
  { timestamps: true }
);

AlertSchema.index({ orgId: 1, status: 1, createdAt: -1 });
AlertSchema.index({ orgId: 1, severity: 1 });
AlertSchema.index({ deviceId: 1, createdAt: -1 });

export const Alert = model<IAlert>('Alert', AlertSchema);
