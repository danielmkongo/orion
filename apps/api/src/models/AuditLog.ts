import { Schema, model, Document } from 'mongoose';

export interface IAuditLog extends Document {
  orgId: Schema.Types.ObjectId;
  userId?: Schema.Types.ObjectId;
  action: string;
  resource: string;
  resourceId?: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    orgId: { type: Schema.Types.ObjectId, required: true, ref: 'Organization', index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    resource: { type: String, required: true },
    resourceId: String,
    details: { type: Schema.Types.Mixed, default: {} },
    ipAddress: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ orgId: 1, createdAt: -1 });
AuditLogSchema.index({ orgId: 1, resource: 1, createdAt: -1 });

export const AuditLog = model<IAuditLog>('AuditLog', AuditLogSchema);
