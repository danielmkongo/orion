import { Schema, model, Document } from 'mongoose';

export interface IOrganization extends Document {
  name: string;
  slug: string;
  logoUrl?: string;
  plan: 'free' | 'pro' | 'enterprise';
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    logoUrl: String,
    plan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
    settings: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const Organization = model<IOrganization>('Organization', OrganizationSchema);
