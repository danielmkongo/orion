import { Schema, model, Document } from 'mongoose';
import type { DeviceCategory, DeviceStatus, DeviceProtocol, DevicePayloadFormat } from '@orion/shared';

export interface IDevice extends Document {
  orgId: Schema.Types.ObjectId;
  projectId?: Schema.Types.ObjectId;
  name: string;
  description?: string;
  serialNumber?: string;
  category: DeviceCategory;
  status: DeviceStatus;
  templateId?: Schema.Types.ObjectId;
  protocol: DeviceProtocol;
  payloadFormat: DevicePayloadFormat;
  apiKey: string;
  tags: string[];
  attributes: Array<{ key: string; value: unknown; type: string }>;
  location?: {
    lat: number;
    lng: number;
    alt?: number;
    speed?: number;
    heading?: number;
    accuracy?: number;
    timestamp: Date;
  };
  firmwareVersion?: string;
  hardwareVersion?: string;
  lastSeenAt?: Date;
  firstSeenAt?: Date;
  meta: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceSchema = new Schema<IDevice>(
  {
    orgId: { type: Schema.Types.ObjectId, required: true, ref: 'Organization', index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
    name: { type: String, required: true, trim: true },
    description: String,
    serialNumber: String,
    category: {
      type: String,
      enum: ['telemetry', 'environmental', 'energy', 'water', 'pump', 'gateway', 'tracker', 'mobile', 'fixed', 'research', 'industrial', 'custom'],
      default: 'custom',
    },
    status: {
      type: String,
      enum: ['online', 'offline', 'idle', 'error', 'provisioning', 'decommissioned'],
      default: 'provisioning',
    },
    templateId: { type: Schema.Types.ObjectId, ref: 'DeviceTemplate' },
    protocol: {
      type: String,
      enum: ['mqtt', 'http', 'websocket', 'tcp', 'udp', 'coap', 'custom'],
      default: 'http',
    },
    payloadFormat: {
      type: String,
      enum: ['json', 'xml', 'csv', 'raw'],
      default: 'json',
    },
    apiKey: { type: String, required: true, unique: true, index: true },
    tags: { type: [String], default: [] },
    attributes: {
      type: [{ key: String, value: Schema.Types.Mixed, type: String }],
      default: [],
    },
    location: {
      lat: Number,
      lng: Number,
      alt: Number,
      speed: Number,
      heading: Number,
      accuracy: Number,
      timestamp: Date,
    },
    firmwareVersion: String,
    hardwareVersion: String,
    lastSeenAt: Date,
    firstSeenAt: Date,
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

DeviceSchema.index({ orgId: 1, status: 1 });
DeviceSchema.index({ orgId: 1, category: 1 });
DeviceSchema.index({ orgId: 1, tags: 1 });
DeviceSchema.index({ 'location.lat': 1, 'location.lng': 1 });

export const Device = model<IDevice>('Device', DeviceSchema);
