export type WidgetType =
  | 'line-chart'
  | 'area-chart'
  | 'bar-chart'
  | 'scatter-chart'
  | 'gauge'
  | 'pie-chart'
  | 'kpi-card'
  | 'map'
  | 'table'
  | 'alert-list'
  | 'log-stream'
  | 'status-grid'
  | 'timeline'
  | 'heatmap'
  | 'histogram';

export interface WidgetPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetDataSource {
  deviceId?: string;
  deviceIds?: string[];
  tags?: string[];
  field: string;
  fields?: string[];
  from?: string;
  to?: string;
  aggregation?: string;
  interval?: string;
  limit?: number;
}

export interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  description?: string;
  position: WidgetPosition;
  dataSources: WidgetDataSource[];
  config: Record<string, unknown>;
  refreshInterval?: number;
}

export interface Dashboard {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  widgets: Widget[];
  isPublic: boolean;
  isPinned: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  meta?: Record<string, unknown>;
}

export interface DashboardCreateInput {
  name: string;
  description?: string;
  widgets?: Widget[];
  isPublic?: boolean;
}
