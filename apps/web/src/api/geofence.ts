import apiClient from './client';

export interface Geofence {
  _id: string;
  orgId: string;
  name: string;
  description?: string;
  type: 'circle' | 'polygon';
  center?: { lat: number; lng: number };
  radius?: number;
  coordinates?: { lat: number; lng: number }[];
  color: string;
  active: boolean;
  alertOnEnter: boolean;
  alertOnExit: boolean;
  deviceIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type GeofenceCreate = Omit<Geofence, '_id' | 'orgId' | 'createdAt' | 'updatedAt'>;

export const geofenceApi = {
  list: () =>
    apiClient.get<{ data: Geofence[] }>('/geofences').then(r => r.data.data),

  create: (data: GeofenceCreate) =>
    apiClient.post<Geofence>('/geofences', data).then(r => r.data),

  update: (id: string, data: Partial<GeofenceCreate>) =>
    apiClient.patch<Geofence>(`/geofences/${id}`, data).then(r => r.data),

  remove: (id: string) =>
    apiClient.delete(`/geofences/${id}`).then(r => r.data),

  toggle: (id: string) =>
    apiClient.post<Geofence>(`/geofences/${id}/toggle`).then(r => r.data),
};
