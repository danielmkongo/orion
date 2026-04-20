import { Geofence, type IGeofence } from '../models/Geofence.js';
import { Alert } from '../models/Alert.js';
import { realtimeService } from './realtime.service.js';

interface LatLng { lat: number; lng: number; }

function haversineDistance(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function pointInPolygon(pt: LatLng, polygon: LatLng[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    const intersects =
      yi > pt.lat !== yj > pt.lat &&
      pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// In-memory fence state: deviceId → Set of geofenceIds currently inside
const deviceState = new Map<string, Set<string>>();

class GeofenceService {
  async list(orgId: string) {
    return Geofence.find({ orgId }).sort({ createdAt: -1 }).lean();
  }

  async create(orgId: string, data: Partial<IGeofence>) {
    return Geofence.create({ ...data, orgId });
  }

  async update(id: string, orgId: string, data: Partial<IGeofence>) {
    return Geofence.findOneAndUpdate({ _id: id, orgId }, { $set: data }, { new: true });
  }

  async remove(id: string, orgId: string) {
    return Geofence.findOneAndDelete({ _id: id, orgId });
  }

  async toggle(id: string, orgId: string) {
    const gf = await Geofence.findOne({ _id: id, orgId });
    if (!gf) return null;
    gf.active = !gf.active;
    return gf.save();
  }

  async checkTransitions(deviceId: string, orgId: string, location: LatLng): Promise<void> {
    const geofences = await Geofence.find({ orgId, active: true }).lean();
    if (!geofences.length) return;

    if (!deviceState.has(deviceId)) deviceState.set(deviceId, new Set());
    const prevInside = deviceState.get(deviceId)!;

    for (const gf of geofences) {
      if (gf.deviceIds.length > 0 && !gf.deviceIds.includes(deviceId)) continue;

      const gfId = String(gf._id);
      let inside = false;

      if (gf.type === 'circle' && gf.center && gf.radius) {
        inside = haversineDistance(location, gf.center) <= gf.radius;
      } else if (gf.type === 'polygon' && (gf.coordinates?.length ?? 0) >= 3) {
        inside = pointInPolygon(location, gf.coordinates!);
      }

      const wasInside = prevInside.has(gfId);

      if (inside && !wasInside) {
        prevInside.add(gfId);
        if (gf.alertOnEnter) await this.fireAlert(orgId, deviceId, gf, 'enter');
      } else if (!inside && wasInside) {
        prevInside.delete(gfId);
        if (gf.alertOnExit) await this.fireAlert(orgId, deviceId, gf, 'exit');
      }
    }
  }

  private async fireAlert(
    orgId: string,
    deviceId: string,
    gf: { _id: unknown; name: string },
    event: 'enter' | 'exit',
  ): Promise<void> {
    const verb = event === 'enter' ? 'entered' : 'exited';
    const alert = await Alert.create({
      orgId,
      deviceId,
      severity: 'warning',
      status: 'active',
      title: `Geofence ${verb}: ${gf.name}`,
      message: `Device ${verb} geofence zone "${gf.name}"`,
      context: { geofenceId: String(gf._id), geofenceName: gf.name, event },
    });
    realtimeService.emitAlert(orgId, alert.toObject());
  }
}

export const geofenceService = new GeofenceService();
