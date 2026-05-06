import { Schema, model, Document } from 'mongoose';

export interface IGeneratedCode extends Document {
  orgId: Schema.Types.ObjectId;
  deviceId: Schema.Types.ObjectId;
  name: string;
  hardware: string;
  protocol: string;
  code: string;
  createdAt: Date;
  updatedAt: Date;
}

const GeneratedCodeSchema = new Schema<IGeneratedCode>(
  {
    orgId:    { type: Schema.Types.ObjectId, required: true, ref: 'Organization', index: true },
    deviceId: { type: Schema.Types.ObjectId, required: true, ref: 'Device', index: true },
    name:     { type: String, required: true, trim: true },
    hardware: { type: String, required: true },
    protocol: { type: String, required: true },
    code:     { type: String, required: true },
  },
  { timestamps: true }
);

export const GeneratedCode = model<IGeneratedCode>('GeneratedCode', GeneratedCodeSchema);
