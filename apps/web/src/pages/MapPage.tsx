import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { APIProvider, Map, AdvancedMarker, InfoWindow } from '@vis.gl/react-google-maps';
import { Satellite, Layers, Mountain } from 'lucide-react';
import { devicesApi } from '@/api/devices';
import { MapPin } from 'lucide-react';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const MAP_ID = import.meta.env.VITE_GOOGLE_MAP_ID || '';

interface Device {
  _id: string;
  id: string;
  name: string;
  status: 'online' | 'offline' | 'idle' | 'error';
  category: string;
  location?: { lat: number; lng: number };
}

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'online': return 'hsl(var(--good))';
    case 'error': return 'hsl(var(--bad))';
    case 'idle': return 'hsl(var(--warn))';
    default: return 'hsl(var(--muted-fg))';
  }
};

const getStatusDot = (status: string): string => {
  switch (status) {
    case 'online': return 'dot-online';
    case 'error': return 'dot-error';
    case 'idle': return 'dot-warn';
    default: return 'dot-offline';
  }
};

function DeviceMarker({ device, onInfoWindowOpen, openDeviceId }: {
  device: Device;
  onInfoWindowOpen: (id: string) => void;
  openDeviceId: string | null;
}) {
  if (!device.location?.lat || !device.location?.lng) return null;

  const color = getStatusColor(device.status);
  const isOpen = openDeviceId === (device._id || device.id);

  return (
    <AdvancedMarker
      position={{ lat: device.location.lat, lng: device.location.lng }}
      onClick={() => onInfoWindowOpen(device._id || device.id)}
    >
      <div
        style={{
          width: '32px',
          height: '32px',
          backgroundColor: color,
          borderRadius: '50%',
          border: '3px solid white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: `0 2px 8px rgba(0,0,0,0.3), 0 0 0 4px ${color}88`,
          transition: 'transform 0.2s',
        }}
        className="hover:scale-110"
      >
        <div
          style={{
            width: '8px',
            height: '8px',
            backgroundColor: 'white',
            borderRadius: '50%',
          }}
        />
      </div>

      {isOpen && (
        <InfoWindow onCloseClick={() => onInfoWindowOpen(null)}>
          <div style={{ padding: '12px', minWidth: '200px' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: '600' }}>
              {device.name}
            </h3>
            <div style={{ fontSize: '12px', marginBottom: '8px' }}>
              <div className={`tag ${getStatusDot(device.status)} mb-2`}>
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: color,
                  display: 'inline-block'
                }} />
                {device.status}
              </div>
            </div>
            <p style={{ margin: '4px 0', fontSize: '11px', color: 'var(--muted-fg)' }}>
              {device.category}
            </p>
            <Link
              to={`/devices/${device._id || device.id}`}
              className="btn btn-primary btn-sm mt-2 w-full"
              style={{ justifyContent: 'center' }}
            >
              View Details
            </Link>
          </div>
        </InfoWindow>
      )}
    </AdvancedMarker>
  );
}

function MapTypeToggle({ current, onChange }: {
  current: google.maps.MapTypeId;
  onChange: (type: google.maps.MapTypeId) => void;
}) {
  const types = [
    { id: 'satellite' as google.maps.MapTypeId, label: 'Satellite', Icon: Satellite },
    { id: 'hybrid' as google.maps.MapTypeId, label: 'Hybrid', Icon: Layers },
    { id: 'terrain' as google.maps.MapTypeId, label: 'Terrain', Icon: Mountain },
  ];

  return (
    <div className="absolute top-4 right-4 z-10 flex gap-2">
      {types.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`btn btn-sm flex items-center gap-1.5 transition-all ${
            current === id
              ? 'btn-primary'
              : 'btn-secondary hover:border-primary/40'
          }`}
          title={label}
        >
          <Icon size={14} />
          <span className="hidden sm:inline text-[11px]">{label}</span>
        </button>
      ))}
    </div>
  );
}

export function MapPage() {
  const [mapType, setMapType] = useState<google.maps.MapTypeId>('satellite');
  const [openDeviceId, setOpenDeviceId] = useState<string | null>(null);
  const [center, setCenter] = useState({ lat: 20, lng: 0 });

  const { data, isLoading, error } = useQuery({
    queryKey: ['devices'],
    queryFn: () => devicesApi.list(),
  });

  const devices = data?.devices ?? [];

  const devicesWithLocation = useMemo(
    () => devices.filter(d => d.location?.lat && d.location?.lng) as Device[],
    [devices]
  );

  // Auto-fit map bounds if devices exist
  useMemo(() => {
    if (devicesWithLocation.length > 0) {
      const lats = devicesWithLocation.map(d => d.location!.lat);
      const lngs = devicesWithLocation.map(d => d.location!.lng);
      const avgLat = lats.reduce((a, b) => a + b) / lats.length;
      const avgLng = lngs.reduce((a, b) => a + b) / lngs.length;
      setCenter({ lat: avgLat, lng: avgLng });
    }
  }, [devicesWithLocation]);

  if (!API_KEY) {
    return (
      <div className="page flex items-center justify-center min-h-[calc(100vh-116px)]">
        <div className="panel p-8 max-w-lg text-center">
          <MapPin size={40} className="mx-auto mb-4 text-primary" />
          <h2 className="text-2xl font-display mb-2">Google Maps API Key Required</h2>
          <p className="text-sm text-muted-foreground mb-4">
            The map feature requires a Google Maps API key.
          </p>
          <div className="bg-muted p-3 rounded text-left mb-4 text-[12px] font-mono">
            <p className="mb-1">Add to <code>.env</code>:</p>
            <code className="text-primary">VITE_GOOGLE_MAPS_API_KEY=your_key_here</code>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Then restart the development server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={API_KEY} onLoad={() => {}}>
      <div className="relative w-full h-[calc(100vh-58px)]">
        <Map
          mapId={MAP_ID}
          defaultCenter={center}
          defaultZoom={devicesWithLocation.length > 0 ? 10 : 2}
          mapTypeId={mapType}
          gestureHandling="greedy"
          streetViewControl={false}
        >
          {devicesWithLocation.map(device => (
            <DeviceMarker
              key={device._id || device.id}
              device={device}
              onInfoWindowOpen={setOpenDeviceId}
              openDeviceId={openDeviceId}
            />
          ))}
        </Map>

        <MapTypeToggle current={mapType} onChange={setMapType} />

        {/* Stats panel */}
        <div className="absolute top-4 left-4 z-10 p-4 bg-[hsl(var(--surface))] border border-[hsl(var(--rule))] backdrop-blur-sm rounded max-w-xs">
          <p className="eyebrow text-[9px] mb-2">Fleet Status</p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[12px]">
              <span className="flex items-center gap-2">
                <span className={`dot dot-online`} />
                Online
              </span>
              <span className="font-mono font-semibold">
                {devices.filter(d => d.status === 'online').length}
              </span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="flex items-center gap-2">
                <span className={`dot dot-error`} />
                Error
              </span>
              <span className="font-mono font-semibold">
                {devices.filter(d => d.status === 'error').length}
              </span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="flex items-center gap-2">
                <span className={`dot dot-warn`} />
                Idle
              </span>
              <span className="font-mono font-semibold">
                {devices.filter(d => d.status === 'idle').length}
              </span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="flex items-center gap-2">
                <span className={`dot dot-offline`} />
                Offline
              </span>
              <span className="font-mono font-semibold">
                {devices.filter(d => d.status === 'offline').length}
              </span>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-3">
            {devicesWithLocation.length} device{devicesWithLocation.length !== 1 ? 's' : ''} with location
          </p>
        </div>
      </div>
    </APIProvider>
  );
}
