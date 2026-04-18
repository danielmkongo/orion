import { Schema, model, Document } from 'mongoose';

export interface IRule extends Document {
  orgId: Schema.Types.ObjectId;
  name: string;
  description?: string;
  triggerType: string;
  deviceIds: Schema.Types.ObjectId[];
  tags: string[];
  conditions: Array<{
    field: string;
    operator: string;
    value: unknown;
    duration?: number;
  }>;
  conditionLogic: 'and' | 'or';
  actions: Array<{ type: string; config: Record<string, unknown> }>;
  isEnabled: boolean;
  cooldownSeconds: number;
  priority: string;
  createdBy: Schema.Types.ObjectId;
  lastFiredAt?: Date;
  fireCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const RuleSchema = new Schema<IRule>(
  {
    orgId: { type: Schema.Types.ObjectId, required: true, ref: 'Organization', index: true },
    name: { type: String, required: true },
    description: String,
    triggerType: { type: String, required: true },
    deviceIds: [{ type: Schema.Types.ObjectId, ref: 'Device' }],
    tags: [String],
    conditions: [
      {
        field: String,
        operator: String,
        value: Schema.Types.Mixed,
        duration: Number,
        _id: false,
      },
    ],
    conditionLogic: { type: String, enum: ['and', 'or'], default: 'and' },
    actions: [{ type: Schema.Types.Mixed }],
    isEnabled: { type: Boolean, default: true },
    cooldownSeconds: { type: Number, default: 300 },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    createdBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    lastFiredAt: Date,
    fireCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Rule = model<IRule>('Rule', RuleSchema);
