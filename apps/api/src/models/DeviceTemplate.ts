import { Schema, model, Document } from 'mongoose';

export interface IDeviceTemplate extends Document {
  orgId: Schema.Types.ObjectId;
  name: string;
  description?: string;
  category: string;
  fields: Array<{
    key: string;
    label: string;
    unit?: string;
    type: string;
    isLatitude?: boolean;
    isLongitude?: boolean;
    isAltitude?: boolean;
    isSpeed?: boolean;
    isHeading?: boolean;
    chartable?: boolean;
    color?: string;
  }>;
  payloadFormat: string;
  protocol: string;
  iconKey?: string;
  color?: string;
  isSystem: boolean;
  createdBy: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FieldDefSchema = new Schema(
  {
    key: String,
    label: String,
    unit: String,
    type: String,
    isLatitude: Boolean,
    isLongitude: Boolean,
    isAltitude: Boolean,
    isSpeed: Boolean,
    isHeading: Boolean,
    chartable: Boolean,
    color: String,
  },
  { _id: false }
);

const DeviceTemplateSchema = new Schema<IDeviceTemplate>(
  {
    orgId: { type: Schema.Types.ObjectId, required: true, ref: 'Organization', index: true },
    name: { type: String, required: true },
    description: String,
    category: { type: String, required: true },
    fields: [FieldDefSchema],
    payloadFormat: { type: String, default: 'json' },
    protocol: { type: String, default: 'http' },
    iconKey: String,
    color: String,
    isSystem: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  },
  { timestamps: true }
);

export const DeviceTemplate = model<IDeviceTemplate>('DeviceTemplate', DeviceTemplateSchema);
