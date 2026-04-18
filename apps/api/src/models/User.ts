import { Schema, model, Document } from 'mongoose';
import type { UserRole } from '@orion/shared';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  orgId: Schema.Types.ObjectId;
  avatarUrl?: string;
  lastLoginAt?: Date;
  isActive: boolean;
  refreshTokenHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ['super_admin', 'admin', 'operator', 'viewer', 'researcher', 'technician'],
      default: 'viewer',
    },
    orgId: { type: Schema.Types.ObjectId, required: true, ref: 'Organization' },
    avatarUrl: String,
    lastLoginAt: Date,
    isActive: { type: Boolean, default: true },
    refreshTokenHash: String,
  },
  { timestamps: true }
);

UserSchema.index({ orgId: 1 });
UserSchema.index({ email: 1, orgId: 1 });

export const User = model<IUser>('User', UserSchema);
