import apiClient from './client';
import type { User, Organization } from '@orion/shared';

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<{ accessToken: string; refreshToken: string; expiresIn: number; user: User }>(
      '/auth/login', { email, password }
    ).then(r => r.data),

  register: (email: string, password: string, name: string, orgName: string) =>
    apiClient.post<{ accessToken: string; refreshToken: string; expiresIn: number }>(
      '/auth/register', { email, password, name, orgName }
    ).then(r => r.data),

  me: () =>
    apiClient.get<User>('/auth/me').then(r => r.data),

  updateMe: (name: string) =>
    apiClient.patch<User>('/auth/me', { name }).then(r => r.data),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.patch<{ ok: boolean }>('/auth/password', { currentPassword, newPassword }).then(r => r.data),

  logout: () =>
    apiClient.post('/auth/logout').then(r => r.data),

  refresh: (refreshToken: string) =>
    apiClient.post<{ accessToken: string; refreshToken: string }>(
      '/auth/refresh', { refreshToken }
    ).then(r => r.data),
};

export const orgApi = {
  get: () =>
    apiClient.get<Organization>('/org').then(r => r.data),

  update: (data: { name?: string; settings?: Record<string, unknown> }) =>
    apiClient.patch<Organization>('/org', data).then(r => r.data),
};
