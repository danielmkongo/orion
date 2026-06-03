import { Schema, model, Document } from 'mongoose';

/**
 * Captures EVERY hit on /telemetry/ingest, including malformed JSON, bad auth,
 * oversized payloads — anything the device's HTTP client sent over the wire.
 * Used by the Raw payloads viewer for full-fidelity device debugging.
 *
 * - deviceId is best-effort: when the body can't be parsed or the API key is
 *   missing/invalid, the request is still logged with deviceId=null.
 * - rawBody is truncated to 16 KB to bound storage.
 * - 7-day TTL — these are debug records, not durable telemetry.
 */
export interface IIngestLog extends Document {
  deviceId: Schema.Types.ObjectId | null;
  orgId: Schema.Types.ObjectId | null;
  apiKey: string | null;
  status: number;
  contentType: string | null;
  contentLength: number | null;
  rawBody: string | null;
  parsedBody: Record<string, unknown> | null;
  parseError: string | null;
  responseError: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

const IngestLogSchema = new Schema<IIngestLog>(
  {
    deviceId:      { type: Schema.Types.ObjectId, ref: 'Device', default: null, index: true },
    orgId:         { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
    apiKey:        { type: String, default: null },
    status:        { type: Number, required: true, index: true },
    contentType:   { type: String, default: null },
    contentLength: { type: Number, default: null },
    rawBody:       { type: String, default: null, maxlength: 16 * 1024 },
    parsedBody:    { type: Schema.Types.Mixed, default: null },
    parseError:    { type: String, default: null },
    responseError: { type: String, default: null },
    ip:            { type: String, default: null },
    userAgent:     { type: String, default: null },
    createdAt:     { type: Date, default: Date.now },
  },
  { timestamps: false }
);

IngestLogSchema.index({ deviceId: 1, createdAt: -1 });
IngestLogSchema.index({ apiKey: 1, createdAt: -1 });
// 7-day TTL — these are debug captures, not telemetry history
IngestLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

export const IngestLog = model<IIngestLog>('IngestLog', IngestLogSchema);
