import apiClient from './client';
import type { Device, DeviceCreateInput, DeviceUpdateInput } from '@orion/shared';

interface ListDevicesParams {
  status?: string;
  category?: string;
  tags?: string[];
  search?: string;
  limit?: number;
  offset?: number;
}

export const devicesApi = {
  list: (params?: ListDevicesParams) =>
    apiClient.get<{ devices: Device[]; total: number }>('/devices', { params }).then(r => r.data),

  stats: () =>
    apiClient.get<{ total: number; online: number; offline: number; byCategory: Array<{ _id: string; count: number }> }>('/devices/stats').then(r => r.data),

  get: (id: string) =>
    apiClient.get<Device>(`/devices/${id}`).then(r => r.data),

  create: (input: DeviceCreateInput) =>
    apiClient.post<Device>('/devices', input).then(r => r.data),

  update: (id: string, input: DeviceUpdateInput) =>
    apiClient.patch<Device>(`/devices/${id}`, input).then(r => r.data),

  delete: (id: string) =>
    apiClient.delete(`/devices/${id}`).then(r => r.data),

  regenerateKey: (id: string) =>
    apiClient.post<{ apiKey: string }>(`/devices/${id}/regenerate-key`).then(r => r.data),
};
