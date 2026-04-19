import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  APIProvider, Map, AdvancedMarker, InfoWindow, useMap,
} from '@vis.gl/react-google-maps';
import { Search, MapPin, Navigation2, X, ExternalLink, AlertTriangle, Layers } from 'lucide-react';
import { devicesApi } from '@/api/devices';
import { useSocket } from '@/hooks/useSocket';
import { timeAgo, getCategoryIconInfo } from '@/lib/utils';
import { Link } from 'react-router-dom';
import type { Device } from '@orion/shared';

const GMAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

/* ─── No API key placeholder ──────────────────────── */
function NoApiKey() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-10">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <MapPin size={24} className="text-primary" />
      </div>
      <h3 className="text-[17px] font-semibold text-foreground mb-2">Google Maps key required</h3>
      <p className="text-[14px] text-muted-foreground max-w-sm mb-5">
        Add your key to <code className="font-mono text-primary text-[13px] bg-primary/5 px-1.5 py-0.5 rounded">apps/web/.env</code>:
      </p>
      <div className="card p-4 font-mono text-[13px] text-foreground bg-muted/40 text-left w-full max-w-sm">
        VITE_GOOGLE_MAPS_API_KEY=your_key_here
      </div>
    </div>
  );
}

/* ─── Map controller (inside APIProvider) ─────────── */
function MapController({
  focusTarget,
  onFocusDone,
}: {
  focusTarget: { lat: number; lng: number } | null;
  onFocusDone: () => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !focusTarget) return;
    map.panTo(focusTarget);
    map.setZoom(15);
    onFocusDone();
  }, [map, focusTarget, onFocusDone]);

  return null;
}

/* ─── Device marker ───────────────────────────────── */
function DeviceMarker({
  device, selected, onSelect, liveIds,
}: {
  device: Device; selected: boolean;
  onSelect: (d: Device | null) => void; liveIds: Set<string>;
}) {
  const id = (device as any)._id ?? device.id;
  const isLive = liveIds.has(id);
  const position = device.location ? { lat: device.location.lat, lng: device.location.lng } : null;
  if (!position) return null;

  const { Icon, color } = getCategoryIconInfo(device.category);

  const dotColor =
    device.status === 'online' ? '#22c55e' :
    device.status === 'error'  ? '#ef4444' : '#9ca3af';

  return (
    <AdvancedMarker position={position} onClick={() => onSelect(selected ? null : device)}>
      <div
        className="relative cursor-pointer"
        style={{ transform: selected ? 'scale(1.25)' : 'scale(1)', transition: 'transform 0.2s ease' }}
      >
        {/* Pulse ring for live */}
        {isLive && (
          <div
            className="absolute inset-0 rounded-full animate-ping opacity-40"
            style={{ backgroundColor: dotColor }}
          />
        )}
        {/* Marker body */}
        <div
          className={`w-10 h-10 rounded-full border-[2.5px] flex items-center justify-center shadow-lg backdrop-blur-sm ${isLive ? 'animate-pulse' : ''}`}
          style={{ backgroundColor: `${color}20`, borderColor: selected ? color : dotColor }}
        >
          <Icon size={17} style={{ color }} />
        </div>
        {/* Status dot */}
        <div
          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white"
          style={{ backgroundColor: dotColor }}
        />
      </div>
    </AdvancedMarker>
  );
}

/* ─── Main page ───────────────────────────────────── */
export function MapPage() {
  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState<Device | null>(null);
  const [liveIds, setLiveIds]     = useState<Set<string>>(new Set());
  const [mapType, setMapType]     = useState<'satellite' | 'roadmap'>('satellite');
  const [focusTarget, setFocus]   = useState<{ lat: number; lng: number } | null>(null);
  const { on } = useSocket();

  const { data: devicesData, isLoading } = useQuery({
    queryKey: ['devices', 'all'],
    queryFn: () => devicesApi.list({ limit: 500 }),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const unsub = on<any>('location.update', (e) => {
      const id = e?.deviceId ?? e?.data?.deviceId;
      if (!id) return;
      setLiveIds(prev => new Set([...prev, id]));
      setTimeout(() => setLiveIds(prev => { const n = new Set(prev); n.delete(id); return n; }), 4_000);
    });
    return () => unsub();
  }, [on]);

  const allDevices   = devicesData?.devices ?? [];
  const withLocation = allDevices.filter(d => d.location?.lat && d.location?.lng);
  const filtered     = withLocation.filter(d =>
    !search || d.name.toLowerCase().includes(search.toLowerCase())
  );

  const onlineCount = withLocation.filter(d => d.status === 'online').length;
  const defaultCenter = withLocation.length > 0
    ? { lat: withLocation[0].location!.lat, lng: withLocation[0].location!.lng }
    : { lat: 20, lng: 0 };

  const focusDevice = useCallback((device: any) => {
    if (!device.location) return;
    setSelected(device);
    setFocus({ lat: device.location.lat, lng: device.location.lng });
  }, []);

  return (
    <div className="flex h-[calc(100vh-116px)] gap-0 rounded-xl overflow-hidden border border-border">
      {/* ── Map (dominant) ── */}
      <div className="flex-1 relative overflow-hidden">
        {!GMAPS_API_KEY ? (
          <NoApiKey />
        ) : (
          <APIProvider apiKey={GMAPS_API_KEY}>
            <MapController
              focusTarget={focusTarget}
              onFocusDone={() => setFocus(null)}
            />
            <Map
              defaultCenter={defaultCenter}
              defaultZoom={withLocation.length > 0 ? 10 : 2}
              gestureHandling="greedy"
              disableDefaultUI={false}
              mapId="orion-fleet-map"
              mapTypeId={mapType}
              style={{ width: '100%', height: '100%' }}
            >
              {filtered.map((device: any) => (
                <DeviceMarker
                  key={device._id ?? device.id}
                  device={device}
                  selected={!!selected && ((selected as any)._id ?? selected.id) === (device._id ?? device.id)}
                  onSelect={setSelected}
                  liveIds={liveIds}
                />
              ))}

              {selected && selected.location && (
                <InfoWindow
                  position={{ lat: selected.location.lat, lng: selected.location.lng }}
                  onCloseClick={() => setSelected(null)}
                >
                  <div className="p-2 min-w-[190px] font-sans">
                    <div className="flex items-start gap-2 mb-2">
                      <div>
                        <p className="font-semibold text-[13px] text-gray-900 leading-tight">{selected.name}</p>
                        <p className="text-[11px] capitalize text-gray-500">{selected.status} · {selected.category}</p>
                      </div>
                    </div>
                    <div className="text-[11px] text-gray-500 space-y-0.5 mb-3">
                      <p>{selected.location.lat.toFixed(6)}, {selected.location.lng.toFixed(6)}</p>
                      {selected.lastSeenAt && <p>Last seen {timeAgo(selected.lastSeenAt)}</p>}
                    </div>
                    <Link
                      to={`/devices/${(selected as any)._id ?? selected.id}`}
                      className="text-[12px] font-medium text-orange-600 flex items-center gap-1 hover:underline"
                    >
                      View device <ExternalLink size={10} />
                    </Link>
                  </div>
                </InfoWindow>
              )}
            </Map>

            {/* Map type toggle */}
            <button
              onClick={() => setMapType(t => t === 'satellite' ? 'roadmap' : 'satellite')}
              className="absolute bottom-6 left-4 bg-surface/90 backdrop-blur-sm border border-border rounded-xl px-3 py-2 flex items-center gap-2 text-[12px] font-medium text-foreground shadow-lg hover:bg-surface transition-colors z-10"
            >
              <Layers size={13} className="text-primary" />
              {mapType === 'satellite' ? 'Roadmap' : 'Satellite'}
            </button>
          </APIProvider>
        )}

        {/* Live tracking badge */}
        {liveIds.size > 0 && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-surface/90 backdrop-blur-sm border border-border rounded-full px-3 py-1.5 text-[12px] font-medium text-foreground shadow z-10">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            {liveIds.size} device{liveIds.size !== 1 ? 's' : ''} moving
          </div>
        )}

        {/* No location notice */}
        {!isLoading && allDevices.length > 0 && withLocation.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
            <div className="text-center p-8">
              <AlertTriangle size={24} className="text-amber-500 mx-auto mb-3" />
              <p className="text-[15px] font-semibold text-foreground">No location data</p>
              <p className="text-[13px] text-muted-foreground mt-1">Enable location on a device to see it on the map</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Device panel (right, docked) ── */}
      <div className="w-80 flex-shrink-0 flex flex-col border-l border-border bg-surface">
        {/* Stats */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-semibold text-foreground">Device Map</span>
            <span className="badge badge-primary">{withLocation.length} pinned</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-muted rounded-xl p-3 text-center">
              <p className="text-[18px] font-semibold text-green-600 dark:text-green-400">{onlineCount}</p>
              <p className="text-[11px] text-muted-foreground">Online</p>
            </div>
            <div className="bg-muted rounded-xl p-3 text-center">
              <p className="text-[18px] font-semibold text-muted-foreground">{withLocation.length - onlineCount}</p>
              <p className="text-[11px] text-muted-foreground">Offline</p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-border">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              className="input !pl-9"
              placeholder="Search devices…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Device list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="p-3 space-y-2">
              {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-12 w-full rounded-lg" />)}
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="p-8 text-center">
              <MapPin size={20} className="text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-[13px] text-muted-foreground">
                {search ? 'No matches' : 'No devices with location'}
              </p>
            </div>
          )}
          {filtered.map((device: any) => {
            const id = device._id ?? device.id;
            const isSelected = selected && ((selected as any)._id ?? selected.id) === id;
            const { Icon, color } = getCategoryIconInfo(device.category);

            return (
              <button
                key={id}
                onClick={() => focusDevice(device)}
                className={`w-full flex items-center gap-3 px-4 py-3 border-b border-border/40 last:border-0 transition-colors text-left ${
                  isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'
                }`}
              >
                <span className={`status-dot flex-shrink-0 ${
                  device.status === 'online' ? 'status-dot-online' :
                  device.status === 'error'  ? 'status-dot-error'  : 'status-dot-offline'
                }`} />
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${color}15` }}
                >
                  <Icon size={14} style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-medium truncate ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                    {device.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {device.location
                      ? `${device.location.lat.toFixed(4)}, ${device.location.lng.toFixed(4)}`
                      : 'No location'}
                  </p>
                </div>
                {liveIds.has(id) && (
                  <Navigation2 size={11} className="text-green-500 flex-shrink-0 animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
