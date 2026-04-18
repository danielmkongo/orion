export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved' | 'suppressed';

export interface Alert {
  id: string;
  orgId: string;
  deviceId?: string;
  ruleId?: string;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  context?: Record<string, unknown>;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Geofence {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  type: 'circle' | 'polygon';
  center?: { lat: number; lng: number };
  radius?: number;
  polygon?: Array<{ lat: number; lng: number }>;
  isActive: boolean;
  triggerOnEnter: boolean;
  triggerOnExit: boolean;
  deviceIds?: string[];
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}
