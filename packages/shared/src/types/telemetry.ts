export interface TelemetryPoint {
  deviceId: string;
  timestamp: string;
  fields: Record<string, TelemetryValue>;
  location?: {
    lat: number;
    lng: number;
    alt?: number;
    speed?: number;
    heading?: number;
    accuracy?: number;
  };
  meta?: Record<string, unknown>;
}

export type TelemetryValue = number | string | boolean | null;

export interface TelemetryQuery {
  deviceId?: string;
  deviceIds?: string[];
  from?: string;
  to?: string;
  fields?: string[];
  limit?: number;
  offset?: number;
  aggregation?: TelemetryAggregation;
  interval?: string;
  tags?: string[];
}

export type TelemetryAggregation = 'mean' | 'max' | 'min' | 'sum' | 'count' | 'last' | 'first';

export interface TelemetrySeries {
  field: string;
  deviceId: string;
  points: Array<{ ts: string; value: TelemetryValue }>;
}

export interface TelemetryIngestionPayload {
  deviceId?: string;
  apiKey?: string;
  timestamp?: string;
  data: Record<string, unknown>;
  raw?: string;
}

export interface LocationPoint {
  deviceId: string;
  lat: number;
  lng: number;
  alt?: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
  timestamp: string;
}

export interface RouteSegment {
  deviceId: string;
  points: LocationPoint[];
  from: string;
  to: string;
  distanceMeters?: number;
}
