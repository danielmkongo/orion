import apiClient from './client';

export const telemetryApi = {
  latest: (deviceId: string) =>
    apiClient.get(`/telemetry/latest`, { params: { deviceId } }).then(r => r.data),

  series: (deviceId: string, field: string, from?: string, to?: string, limit?: number) =>
    apiClient.get<{ field: string; deviceId: string; data: Array<{ ts: string; value: number }> }>(
      '/telemetry/series',
      { params: { deviceId, field, from, to, limit } }
    ).then(r => r.data),

  query: (params: { deviceId?: string; from?: string; to?: string; limit?: number }) =>
    apiClient.get('/telemetry', { params }).then(r => r.data),

  locationHistory: (deviceId: string, from?: string, to?: string, limit?: number) =>
    apiClient.get<{ deviceId: string; data: Array<{ location: { lat: number; lng: number }; timestamp: string }> }>(
      '/telemetry/location-history',
      { params: { deviceId, from, to, limit } }
    ).then(r => r.data),
};
