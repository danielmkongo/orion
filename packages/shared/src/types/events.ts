export type RealtimeEventType =
  | 'telemetry.update'
  | 'device.online'
  | 'device.offline'
  | 'device.status_change'
  | 'command.sent'
  | 'command.acknowledged'
  | 'command.executed'
  | 'command.failed'
  | 'alert.created'
  | 'alert.resolved'
  | 'ota.progress'
  | 'ota.completed'
  | 'location.update'
  | 'geofence.enter'
  | 'geofence.exit'
  | 'rule.fired';

export interface RealtimeEvent<T = unknown> {
  type: RealtimeEventType;
  orgId: string;
  deviceId?: string;
  timestamp: string;
  data: T;
}

export interface TelemetryUpdateEvent {
  deviceId: string;
  fields: Record<string, number | string | boolean | null>;
  location?: {
    lat: number;
    lng: number;
    alt?: number;
    speed?: number;
    heading?: number;
  };
  timestamp: string;
}

export interface DeviceStatusEvent {
  deviceId: string;
  status: 'online' | 'offline' | 'error';
  timestamp: string;
}

export interface LocationUpdateEvent {
  deviceId: string;
  lat: number;
  lng: number;
  alt?: number;
  speed?: number;
  heading?: number;
  timestamp: string;
}
