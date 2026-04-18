export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'operator'
  | 'viewer'
  | 'researcher'
  | 'technician';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  orgId: string;
  avatarUrl?: string;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  plan: 'free' | 'pro' | 'enterprise';
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  orgName: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  orgId: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export type Permission =
  | 'devices:read'
  | 'devices:write'
  | 'devices:delete'
  | 'telemetry:read'
  | 'telemetry:write'
  | 'commands:send'
  | 'commands:read'
  | 'dashboards:read'
  | 'dashboards:write'
  | 'rules:read'
  | 'rules:write'
  | 'ota:read'
  | 'ota:write'
  | 'users:read'
  | 'users:write'
  | 'reports:read'
  | 'reports:write'
  | 'org:read'
  | 'org:write'
  | 'audit:read';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_admin: [
    'devices:read', 'devices:write', 'devices:delete',
    'telemetry:read', 'telemetry:write',
    'commands:send', 'commands:read',
    'dashboards:read', 'dashboards:write',
    'rules:read', 'rules:write',
    'ota:read', 'ota:write',
    'users:read', 'users:write',
    'reports:read', 'reports:write',
    'org:read', 'org:write',
    'audit:read',
  ],
  admin: [
    'devices:read', 'devices:write', 'devices:delete',
    'telemetry:read', 'telemetry:write',
    'commands:send', 'commands:read',
    'dashboards:read', 'dashboards:write',
    'rules:read', 'rules:write',
    'ota:read', 'ota:write',
    'users:read', 'users:write',
    'reports:read', 'reports:write',
    'org:read',
    'audit:read',
  ],
  operator: [
    'devices:read', 'devices:write',
    'telemetry:read', 'telemetry:write',
    'commands:send', 'commands:read',
    'dashboards:read', 'dashboards:write',
    'rules:read',
    'ota:read',
    'reports:read',
    'org:read',
  ],
  researcher: [
    'devices:read',
    'telemetry:read',
    'dashboards:read', 'dashboards:write',
    'reports:read', 'reports:write',
    'org:read',
  ],
  technician: [
    'devices:read', 'devices:write',
    'telemetry:read',
    'commands:send', 'commands:read',
    'ota:read', 'ota:write',
    'org:read',
  ],
  viewer: [
    'devices:read',
    'telemetry:read',
    'dashboards:read',
    'reports:read',
    'org:read',
  ],
};
