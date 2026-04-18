import { Schema, model, Document } from 'mongoose';

export interface IDashboard extends Document {
  orgId: Schema.Types.ObjectId;
  name: string;
  description?: string;
  widgets: unknown[];
  isPublic: boolean;
  isPinned: boolean;
  createdBy: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  meta: Record<string, unknown>;
}

const WidgetPositionSchema = new Schema(
  { x: Number, y: Number, w: Number, h: Number },
  { _id: false }
);

const WidgetSchema = new Schema(
  {
    id: String,
    type: String,
    title: String,
    description: String,
    position: WidgetPositionSchema,
    dataSources: [Schema.Types.Mixed],
    config: { type: Schema.Types.Mixed, default: {} },
    refreshInterval: Number,
  },
  { _id: false }
);

const DashboardSchema = new Schema<IDashboard>(
  {
    orgId: { type: Schema.Types.ObjectId, required: true, ref: 'Organization', index: true },
    name: { type: String, required: true },
    description: String,
    widgets: { type: [WidgetSchema], default: [] },
    isPublic: { type: Boolean, default: false },
    isPinned: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const Dashboard = model<IDashboard>('Dashboard', DashboardSchema);
