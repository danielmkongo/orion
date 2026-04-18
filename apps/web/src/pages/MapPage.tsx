import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { devicesApi } from '@/api/devices';
import { telemetryApi } from '@/api/telemetry';
import { useSocket } from '@/hooks/useSocket';
import { cn, timeAgo, categoryIcon, statusColor } from '@/lib/utils';
import { Search, Layers, Filter, X, MapPin, Activity, Navigation, History } from 'lucide-react';
import { Link } from 'react-router-dom';

// Fix Leaflet default icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function createDeviceIcon(category: string, status: string, isSelected: boolean) {
  const emoji = categoryIcon(category);
  const color = status === 'online' ? '#10b981' : status === 'error' ? '#f43f5e' : '#64748b';
  const size = isSelected ? 44 : 36;
  const border = isSelected ? `3px solid ${color}` : `2px solid ${color}`;
  const shadow = isSelected ? `0 0 0 4px ${color}20, 0 4px 16px rgba(0,0,0,0.5)` : '0 2px 8px rgba(0,0,0,0.4)';

  return L.divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:rgba(15,16,33,0.95);border:${border};
      display:flex;align-items:center;justify-content:center;
      font-size:${isSelected ? 20 : 16}px;
      box-shadow:${shadow};
      transition:all 0.2s ease;
    ">${emoji}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    className: '',
  });
}

function LiveMarkers({ devices, selectedId, onSelect }: {
  devices: any[]; selectedId: string | null; onSelect: (d: any) => void;
}) {
  const map = useMap();
  const { on } = useSocket();
  const [positions, setPositions] = useState<Record<string, { lat: number; lng: number }>>({});

  useEffect(() => {
    const unsub = on('location.update', (event: any) => {
      const { deviceId, lat, lng } = event.data ?? event;
      if (deviceId && lat && lng) {
        setPositions(prev => ({ ...prev, [deviceId]: { lat, lng } }));
      }
    });
    return unsub;
  }, [on]);

  return (
    <>
      {devices.map(device => {
        if (!device.location?.lat) return null;
        const live = positions[device._id];
        const lat = live?.lat ?? device.location.lat;
        const lng = live?.lng ?? device.location.lng;
        const isSelected = device._id === selectedId;

        return (
          <Marker
            key={device._id}
            position={[lat, lng]}
            icon={createDeviceIcon(device.category, device.status, isSelected)}
            eventHandlers={{ click: () => onSelect(device) }}
          >
            <Popup>
              <div className="font-sans">
                <div className="flex items-center gap-2 mb-2">
                  <span className={cn('w-2 h-2 rounded-full',
                    device.status === 'online' ? 'bg-emerald-400' :
                    device.status === 'error' ? 'bg-rose-400' : 'bg-slate-500'
                  )} />
                  <strong className="text-sm">{device.name}</strong>
                </div>
                <p className="text-xs text-gray-400 capitalize mb-1">{device.category} · {device.status}</p>
                <p className="text-xs text-gray-500">
                  {lat.toFixed(5)}, {lng.toFixed(5)}
                </p>
                {device.location?.speed && (
                  <p className="text-xs text-gray-500">{device.location.speed.toFixed(1)} km/h</p>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

function RouteTrail({ points }: { points: Array<{ lat: number; lng: number }> }) {
  if (points.length < 2) return null;
  const positions = points.map(p => [p.lat, p.lng] as [number, number]);
  return <Polyline positions={positions} color="#6272f2" weight={2.5} opacity={0.8} dashArray="6 4" />;
}

export function MapPage() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedDevice, setSelectedDevice] = useState<any | null>(null);
  const [showRoute, setShowRoute] = useState(false);
  const mapRef = useRef<any>(null);

  const { data: devicesData } = useQuery({
    queryKey: ['devices', 'map'],
    queryFn: () => devicesApi.list({ limit: 500 }),
    refetchInterval: 30_000,
  });

  const { data: routeData } = useQuery({
    queryKey: ['location-history', selectedDevice?._id],
    queryFn: () => telemetryApi.locationHistory(selectedDevice._id, undefined, undefined, 200),
    enabled: !!selectedDevice && showRoute,
  });

  const allDevices = devicesData?.devices ?? [];
  const devicesWithLocation = allDevices.filter((d: any) => d.location?.lat);

  const filtered = devicesWithLocation.filter((d: any) => {
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter !== 'all' && d.category !== categoryFilter) return false;
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    return true;
  });

  const categories = ['all', ...new Set(devicesWithLocation.map((d: any) => d.category))];
  const routePoints = (routeData?.data ?? []).map((p: any) => p.location).filter(Boolean);

  function flyToDevice(device: any) {
    if (device.location?.lat && mapRef.current) {
      mapRef.current.flyTo([device.location.lat, device.location.lng], 15, { duration: 1.5 });
    }
  }

  const center: [number, number] = devicesWithLocation[0]?.location
    ? [devicesWithLocation[0].location.lat, devicesWithLocation[0].location.lng]
    : [1.3521, 103.8198];

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* Left panel */}
      <div className="w-72 xl:w-80 shrink-0 flex flex-col bg-surface-1 border-r border-surface-border overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-surface-border">
          <h2 className="text-sm font-semibold text-slate-200 mb-3">Map & Tracking</h2>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search devices..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field pl-8 text-xs py-2"
            />
          </div>
          <div className="flex gap-1.5">
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="flex-1 bg-surface-3 border border-surface-border rounded-lg px-2 py-1.5 text-xs text-slate-300"
            >
              {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All types' : c}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="flex-1 bg-surface-3 border border-surface-border rounded-lg px-2 py-1.5 text-xs text-slate-300"
            >
              {['all', 'online', 'offline'].map(s => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}
            </select>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 border-b border-surface-border">
          <div className="p-3 text-center border-r border-surface-border">
            <p className="text-lg font-bold text-slate-200">{devicesWithLocation.length}</p>
            <p className="text-[10px] text-slate-500">on map</p>
          </div>
          <div className="p-3 text-center border-r border-surface-border">
            <p className="text-lg font-bold text-emerald-400">{allDevices.filter((d: any) => d.status === 'online').length}</p>
            <p className="text-[10px] text-slate-500">online</p>
          </div>
          <div className="p-3 text-center">
            <p className="text-lg font-bold text-orion-400">{allDevices.filter((d: any) => d.category === 'tracker').length}</p>
            <p className="text-[10px] text-slate-500">trackers</p>
          </div>
        </div>

        {/* Device list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.map((device: any) => (
            <button
              key={device._id}
              onClick={() => { setSelectedDevice(device); flyToDevice(device); }}
              className={cn(
                'w-full flex items-center gap-2.5 p-3 border-b border-surface-border/50 text-left hover:bg-surface-3/50 transition-colors',
                selectedDevice?._id === device._id ? 'bg-orion-600/10 border-l-2 border-l-orion-500' : ''
              )}
            >
              <span className="text-sm leading-none">{categoryIcon(device.category)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-200 truncate">{device.name}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {device.location?.lat?.toFixed(4)}, {device.location?.lng?.toFixed(4)}
                </p>
              </div>
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0',
                device.status === 'online' ? 'bg-emerald-400' :
                device.status === 'error' ? 'bg-rose-400' : 'bg-slate-500'
              )} />
            </button>
          ))}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          center={center}
          zoom={11}
          className="w-full h-full"
          ref={mapRef}
          zoomControl={false}
        >
          <TileLayer
            attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <LiveMarkers
            devices={filtered}
            selectedId={selectedDevice?._id ?? null}
            onSelect={(d) => setSelectedDevice(d)}
          />
          {showRoute && routePoints.length > 0 && <RouteTrail points={routePoints} />}
        </MapContainer>

        {/* Device info overlay */}
        <AnimatePresence>
          {selectedDevice && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 w-96 bg-surface-2/95 backdrop-blur border border-surface-border rounded-2xl shadow-elevated z-[500]"
            >
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{categoryIcon(selectedDevice.category)}</span>
                    <div>
                      <p className="font-semibold text-slate-200">{selectedDevice.name}</p>
                      <p className="text-xs text-slate-500 capitalize">{selectedDevice.category} · {selectedDevice.status}</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedDevice(null)} className="text-slate-500 hover:text-slate-300">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-surface-3 rounded-xl p-3">
                    <p className="text-[10px] text-slate-500 mb-0.5">Coordinates</p>
                    <p className="text-xs font-mono text-slate-300">
                      {selectedDevice.location?.lat?.toFixed(5)}, {selectedDevice.location?.lng?.toFixed(5)}
                    </p>
                  </div>
                  <div className="bg-surface-3 rounded-xl p-3">
                    <p className="text-[10px] text-slate-500 mb-0.5">Last Seen</p>
                    <p className="text-xs text-slate-300">
                      {selectedDevice.lastSeenAt ? timeAgo(selectedDevice.lastSeenAt) : 'Unknown'}
                    </p>
                  </div>
                  {selectedDevice.location?.speed != null && (
                    <div className="bg-surface-3 rounded-xl p-3">
                      <p className="text-[10px] text-slate-500 mb-0.5">Speed</p>
                      <p className="text-xs font-semibold text-orion-300">{selectedDevice.location.speed.toFixed(1)} km/h</p>
                    </div>
                  )}
                  {selectedDevice.location?.heading != null && (
                    <div className="bg-surface-3 rounded-xl p-3">
                      <p className="text-[10px] text-slate-500 mb-0.5">Heading</p>
                      <p className="text-xs font-semibold text-orion-300">{selectedDevice.location.heading.toFixed(0)}°</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    to={`/devices/${selectedDevice._id}`}
                    className="btn-primary flex-1 text-xs py-2"
                  >
                    <Activity className="w-3.5 h-3.5" /> Device Details
                  </Link>
                  {selectedDevice.category === 'tracker' && (
                    <button
                      onClick={() => setShowRoute(!showRoute)}
                      className={cn('btn-secondary text-xs py-2 px-3', showRoute ? 'border-orion-500 text-orion-300' : '')}
                    >
                      <History className="w-3.5 h-3.5" /> {showRoute ? 'Hide' : 'Route'}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
