import mongoose, { Schema, Document } from 'mongoose';

export interface IOtaJob extends Document {
  orgId: mongoose.Types.ObjectId;
  name: string;
  firmwareId: mongoose.Types.ObjectId;
  firmwareVersion: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  total: number;
  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const OtaJobSchema = new Schema<IOtaJob>({
  orgId:           { type: Schema.Types.ObjectId, required: true, ref: 'Organization' },
  name:            { type: String, required: true },
  firmwareId:      { type: Schema.Types.ObjectId, required: true, ref: 'Firmware' },
  firmwareVersion: { type: String, required: true },
  status:          { type: String, enum: ['pending', 'in_progress', 'completed', 'failed'], default: 'pending' },
  progress:        { type: Number, default: 0 },
  total:           { type: Number, default: 1 },
  startedAt:       { type: Date, default: Date.now },
  completedAt:     { type: Date },
}, { timestamps: true });

export const OtaJob = mongoose.model<IOtaJob>('OtaJob', OtaJobSchema);
