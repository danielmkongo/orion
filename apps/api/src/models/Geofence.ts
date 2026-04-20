import { Schema, model, Document } from 'mongoose';

interface LatLng {
  lat: number;
  lng: number;
}

export interface IGeofence extends Document {
  orgId: Schema.Types.ObjectId;
  name: string;
  description?: string;
  type: 'circle' | 'polygon';
  center?: LatLng;
  radius?: number;
  coordinates?: LatLng[];
  color: string;
  active: boolean;
  alertOnEnter: boolean;
  alertOnExit: boolean;
  deviceIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

const LatLngSchema = new Schema<LatLng>({ lat: Number, lng: Number }, { _id: false });

const GeofenceSchema = new Schema<IGeofence>(
  {
    orgId:         { type: Schema.Types.ObjectId, required: true, ref: 'Organization', index: true },
    name:          { type: String, required: true },
    description:   String,
    type:          { type: String, enum: ['circle', 'polygon'], required: true },
    center:        LatLngSchema,
    radius:        Number,
    coordinates:   [LatLngSchema],
    color:         { type: String, default: '#FF5B1F' },
    active:        { type: Boolean, default: true },
    alertOnEnter:  { type: Boolean, default: true },
    alertOnExit:   { type: Boolean, default: false },
    deviceIds:     { type: [String], default: [] },
  },
  { timestamps: true }
);

GeofenceSchema.index({ orgId: 1, active: 1 });

export const Geofence = model<IGeofence>('Geofence', GeofenceSchema);
