export type CommandStatus =
  | 'pending'
  | 'sent'
  | 'acknowledged'
  | 'executed'
  | 'failed'
  | 'timeout'
  | 'cancelled';

export interface DeviceCommand {
  id: string;
  deviceId: string;
  orgId: string;
  issuedBy: string;
  name: string;
  payload?: Record<string, unknown>;
  status: CommandStatus;
  sentAt?: string;
  acknowledgedAt?: string;
  executedAt?: string;
  failedAt?: string;
  response?: Record<string, unknown>;
  errorMessage?: string;
  retries: number;
  maxRetries: number;
  scheduledFor?: string;
  ttl?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommandCreateInput {
  deviceId: string;
  name: string;
  payload?: Record<string, unknown>;
  scheduledFor?: string;
  ttl?: number;
  maxRetries?: number;
}

export interface CommandAck {
  commandId: string;
  deviceId: string;
  status: 'acknowledged' | 'executed' | 'failed';
  response?: Record<string, unknown>;
  errorMessage?: string;
}
