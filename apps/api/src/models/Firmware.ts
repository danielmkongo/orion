import mongoose, { Schema, Document } from 'mongoose';

export interface IFirmware extends Document {
  orgId: mongoose.Types.ObjectId;
  name: string;
  version: string;
  category: string;
  size: string;
  status: 'active' | 'deprecated' | 'archived' | 'ready';
  changelog?: string;
  devices: number;
  uploadedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FirmwareSchema = new Schema<IFirmware>({
  orgId:      { type: Schema.Types.ObjectId, required: true, ref: 'Organization' },
  name:       { type: String, required: true },
  version:    { type: String, required: true },
  category:   { type: String, required: true, default: 'custom' },
  size:       { type: String, default: '0 KB' },
  status:     { type: String, enum: ['active', 'deprecated', 'archived', 'ready'], default: 'ready' },
  changelog:  { type: String },
  devices:    { type: Number, default: 0 },
  uploadedAt: { type: Date, default: Date.now },
}, { timestamps: true });

export const Firmware = mongoose.model<IFirmware>('Firmware', FirmwareSchema);
