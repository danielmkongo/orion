export type FirmwareStatus = 'uploading' | 'ready' | 'deprecated' | 'archived';

export interface FirmwareVersion {
  id: string;
  orgId: string;
  name: string;
  version: string;
  description?: string;
  fileUrl: string;
  fileSizeBytes: number;
  checksum: string;
  checksumAlgorithm: 'sha256' | 'md5' | 'crc32';
  targetCategory?: string;
  targetTemplateId?: string;
  releaseNotes?: string;
  status: FirmwareStatus;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export type OtaJobStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled'
  | 'rolled_back';

export type OtaDeviceStatus =
  | 'pending'
  | 'downloading'
  | 'installing'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'rolled_back';

export interface OtaDeviceProgress {
  deviceId: string;
  status: OtaDeviceStatus;
  progress?: number;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface OtaJob {
  id: string;
  orgId: string;
  name: string;
  firmwareId: string;
  deviceIds: string[];
  rolloutPercent: number;
  status: OtaJobStatus;
  deviceProgress: OtaDeviceProgress[];
  scheduledFor?: string;
  startedAt?: string;
  completedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  rollbackFirmwareId?: string;
}
