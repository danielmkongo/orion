import { Schema, model, Document } from 'mongoose';

export interface IShare extends Document {
  orgId: Schema.Types.ObjectId;
  type: 'device' | 'page';
  resourceId: Schema.Types.ObjectId;
  sections: string[];
  token: string;
  label?: string;
  createdBy: Schema.Types.ObjectId;
  createdAt: Date;
}

const ShareSchema = new Schema<IShare>(
  {
    orgId:      { type: Schema.Types.ObjectId, required: true, ref: 'Organization', index: true },
    type:       { type: String, enum: ['device', 'page'], required: true },
    resourceId: { type: Schema.Types.ObjectId, required: true },
    sections:   { type: [String], default: [] },
    token:      { type: String, required: true, unique: true, index: true },
    label:      String,
    createdBy:  { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Share = model<IShare>('Share', ShareSchema);
