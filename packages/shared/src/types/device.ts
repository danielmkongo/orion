export type DeviceCategory =
  | 'telemetry'
  | 'environmental'
  | 'energy'
  | 'water'
  | 'pump'
  | 'gateway'
  | 'tracker'
  | 'mobile'
  | 'fixed'
  | 'research'
  | 'industrial'
  | 'custom';

export type DeviceStatus = 'online' | 'offline' | 'idle' | 'error' | 'provisioning' | 'decommissioned';

export type DeviceProtocol = 'mqtt' | 'http' | 'websocket' | 'tcp' | 'udp' | 'coap' | 'custom';

export type DevicePayloadFormat = 'json' | 'csv' | 'xml' | 'raw' | 'msgpack' | 'cbor' | 'protobuf' | 'binary' | 'custom';

export interface DeviceLocation {
  lat: number;
  lng: number;
  alt?: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
  timestamp: string;
}

export interface DeviceAttribute {
  key: string;
  value: string | number | boolean;
  type: 'string' | 'number' | 'boolean';
}

export interface DeviceTemplate {
  id: string;
  name: string;
  category: DeviceCategory;
  description?: string;
  fields: FieldDefinition[];
  payloadFormat: DevicePayloadFormat;
  protocol: DeviceProtocol;
  iconKey?: string;
  color?: string;
}

export interface FieldDefinition {
  key: string;
  label: string;
  unit?: string;
  type: 'number' | 'string' | 'boolean' | 'location' | 'timestamp';
  isLatitude?: boolean;
  isLongitude?: boolean;
  isAltitude?: boolean;
  isSpeed?: boolean;
  isHeading?: boolean;
  chartable?: boolean;
  color?: string;
}

export interface Device {
  id: string;
  orgId: string;
  projectId?: string;
  name: string;
  description?: string;
  serialNumber?: string;
  category: DeviceCategory;
  status: DeviceStatus;
  templateId?: string;
  protocol: DeviceProtocol;
  payloadFormat: DevicePayloadFormat;
  tags: string[];
  attributes: DeviceAttribute[];
  location?: DeviceLocation;
  firmwareVersion?: string;
  hardwareVersion?: string;
  lastSeenAt?: string;
  firstSeenAt?: string;
  createdAt: string;
  updatedAt: string;
  meta?: Record<string, unknown>;
}

export interface DeviceCreateInput {
  name: string;
  description?: string;
  serialNumber?: string;
  category: DeviceCategory;
  templateId?: string;
  protocol: DeviceProtocol;
  payloadFormat: DevicePayloadFormat;
  tags?: string[];
  attributes?: DeviceAttribute[];
  projectId?: string;
}

export interface DeviceUpdateInput {
  name?: string;
  description?: string;
  serialNumber?: string;
  category?: DeviceCategory;
  status?: DeviceStatus;
  tags?: string[];
  attributes?: DeviceAttribute[];
  firmwareVersion?: string;
  hardwareVersion?: string;
  meta?: Record<string, unknown>;
}
