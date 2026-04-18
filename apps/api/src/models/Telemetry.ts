import { Schema, model, Document } from 'mongoose';

export interface ITelemetry extends Document {
  deviceId: Schema.Types.ObjectId;
  orgId: Schema.Types.ObjectId;
  timestamp: Date;
  fields: Record<string, number | string | boolean | null>;
  location?: {
    lat: number;
    lng: number;
    alt?: number;
    speed?: number;
    heading?: number;
    accuracy?: number;
  };
  meta: Record<string, unknown>;
}

const TelemetrySchema = new Schema<ITelemetry>(
  {
    deviceId: { type: Schema.Types.ObjectId, required: true, ref: 'Device', index: true },
    orgId: { type: Schema.Types.ObjectId, required: true, ref: 'Organization', index: true },
    timestamp: { type: Date, required: true },
    fields: { type: Schema.Types.Mixed, required: true },
    location: {
      lat: Number,
      lng: Number,
      alt: Number,
      speed: Number,
      heading: Number,
      accuracy: Number,
    },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: false }
);

TelemetrySchema.index({ deviceId: 1, timestamp: -1 });
TelemetrySchema.index({ orgId: 1, timestamp: -1 });
TelemetrySchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // 90 day TTL default

export const Telemetry = model<ITelemetry>('Telemetry', TelemetrySchema);
