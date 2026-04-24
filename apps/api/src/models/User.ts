import { Schema, model, Document } from 'mongoose';
import type { UserRole } from '@orion/shared';

export interface INotifPrefs {
  critical: boolean;
  offline: boolean;
  rules: boolean;
  ota: boolean;
  commands: boolean;
}

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
  notifPrefs: INotifPrefs;
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
    notifPrefs: {
      critical: { type: Boolean, default: true },
      offline:  { type: Boolean, default: true },
      rules:    { type: Boolean, default: true },
      ota:      { type: Boolean, default: false },
      commands: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

UserSchema.index({ orgId: 1 });
UserSchema.index({ email: 1, orgId: 1 });

export const User = model<IUser>('User', UserSchema);
