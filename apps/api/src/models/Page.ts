import { Schema, model, Document } from 'mongoose';

export type WidgetType =
  | 'kpi_card'
  | 'line_chart'
  | 'bar_chart'
  | 'gauge'
  | 'map'
  | 'data_table'
  | 'status_grid';

export interface IWidget {
  id: string;
  type: WidgetType;
  title: string;
  deviceId?: string;
  deviceIds?: string[];
  field?: string;
  rangeMs?: number;
  config: Record<string, unknown>;
  position: { x: number; y: number; w: number; h: number };
}

export interface IPage extends Document {
  orgId: Schema.Types.ObjectId;
  name: string;
  description?: string;
  widgets: IWidget[];
  shareToken?: string;
  allowExports: boolean;
  createdBy: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PositionSchema = new Schema(
  { x: Number, y: Number, w: Number, h: Number },
  { _id: false }
);

const WidgetSchema = new Schema<IWidget>(
  {
    id:        { type: String, required: true },
    type:      { type: String, enum: ['kpi_card','line_chart','bar_chart','gauge','map','data_table','status_grid','control_panel'], required: true },
    title:     { type: String, required: true },
    deviceId:  String,
    deviceIds: [String],
    field:     String,
    rangeMs:   Number,
    config:    { type: Schema.Types.Mixed, default: {} },
    position:  PositionSchema,
  },
  { _id: false }
);

const PageSchema = new Schema<IPage>(
  {
    orgId:       { type: Schema.Types.ObjectId, required: true, ref: 'Organization', index: true },
    name:        { type: String, required: true },
    description: String,
    widgets:     { type: [WidgetSchema], default: [] },
    shareToken:    { type: String, index: true, sparse: true },
    allowExports:  { type: Boolean, default: false },
    createdBy:     { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  },
  { timestamps: true }
);

export const Page = model<IPage>('Page', PageSchema);
