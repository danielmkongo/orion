import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { devicesApi } from '@/api/devices';

interface Device {
  _id: string;
  id: string;
  name: string;
  status: 'online' | 'offline' | 'idle' | 'error';
  category: string;
  location?: { lat: number; lng: number };
}

const CAT_GLYPHS: Record<string, string> = {
  tracker: '<path d="M12 2 L20 18 L12 14 L4 18 Z" fill="#fff"/>',
  environmental: '<path d="M5 16 C5 10 9 6 12 4 C15 6 19 10 19 16 C19 19 16 21 12 21 C8 21 5 19 5 16 Z" fill="#fff"/>',
  energy: '<path d="M13 3 L6 13 L11 13 L10 21 L17 11 L12 11 L13 3 Z" fill="#fff"/>',
  water: '<path d="M12 3 C8 9 5 13 5 16 C5 19 8 21 12 21 C16 21 19 19 19 16 C19 13 16 9 12 3 Z" fill="#fff"/>',
  pump: '<g fill="#fff"><circle cx="12" cy="12" r="3.2"/><path d="M12 4 L13 9 L11 9 Z M12 20 L11 15 L13 15 Z M4 12 L9 13 L9 11 Z M20 12 L15 11 L15 13 Z M6 6 L10 9 L9 10 Z M18 18 L14 15 L15 14 Z M18 6 L15 10 L14 9 Z M6 18 L9 14 L10 15 Z"/></g>',
  gateway: '<g fill="#fff"><path d="M3 11 C7 6 17 6 21 11 L19 13 C16 9 8 9 5 13 Z"/><path d="M6 14 C9 11 15 11 18 14 L16 16 C14 13 10 13 8 16 Z"/><circle cx="12" cy="18" r="2"/></g>',
  research: '<g fill="#fff"><path d="M9 3 H15 V5 H14 V10 L19 19 C20 21 18 22 16 22 H8 C6 22 4 21 5 19 L10 10 V5 H9 Z"/></g>',
  industrial: '<g fill="#fff"><path d="M3 21 V11 L9 14 V11 L15 14 V8 L21 8 V21 Z"/></g>',
};

const CAT_COLORS: Record<string, string> = {
  tracker: '#FF5B1F',
  environmental: '#10B981',
  energy: '#FACC15',
  water: '#3B82F6',
  pump: '#A855F7',
  gateway: '#06B6D4',
  research: '#EC4899',
  industrial: '#F97316',
};

function makeMarker(device: Device, isSelected: boolean) {
  const catColor = CAT_COLORS[device.category] || '#888';
  const glyph = CAT_GLYPHS[device.category] || '<circle cx="12" cy="12" r="5" fill="#fff"/>';
  const isOffline = device.status === 'offline';
  const isError = device.status === 'error';
  const ringColor = isError ? '#EF4444' : catColor;
  const sz = isSelected ? 44 : 36;
  const ringSize = isSelected ? 64 : 52;
  const sat = isOffline ? 'filter:saturate(.25) brightness(.7);' : '';

  return L.divIcon({
    className: 'orion-marker',
    iconSize: [ringSize, ringSize],
    iconAnchor: [ringSize / 2, ringSize / 2],
    html: `
      <div class="orion-marker-wrap" style="width:${ringSize}px;height:${ringSize}px;${sat}position:relative;">
        <span style="position:absolute;inset:0;border:3px solid ${ringColor};border-radius:50%;opacity:0.3;"></span>
        <div style="position:absolute;inset:0;width:${sz}px;height:${sz}px;left:${(ringSize - sz) / 2}px;top:${(ringSize - sz) / 2}px;background:${ringColor};border:2px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
          <svg viewBox="0 0 24 24" width="${sz - 8}" height="${sz - 8}">${glyph}</svg>
        </div>
      </div>
    `,
  });
}

function StatusTag({ status }: { status: string }) {
  const colors: Record<string, string> = {
    online: '#0F7A3D',
    offline: '#5E5C56',
    idle: '#B45309',
    error: '#C21D1D',
  };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '10.5px',
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        padding: '3px 8px',
        border: `1px solid ${colors[status] || '#999'}`,
        borderRadius: 0,
        color: colors[status] || '#999',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: colors[status] || '#999',
          display: 'inline-block',
        }}
      />
      {status}
    </span>
  );
}

export function MapPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: () => devicesApi.list(),
  });

  const devices = data?.devices ?? [];
  const located = devices.filter((d) => d.location?.lat && d.location?.lng) as Device[];

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInst.current) return;

    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([14.7, -17.4], 6);

    // ArcGIS satellite + boundaries layers
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
    }).addTo(map);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      opacity: 0.7,
    }).addTo(map);

    // Add markers
    located.forEach((device) => {
      const marker = L.marker([device.location!.lat, device.location!.lng], {
        icon: makeMarker(device, false),
      })
        .on('click', () => setSelected(device._id || device.id))
        .addTo(map);

      markersRef.current[device._id || device.id] = marker;
    });

    mapInst.current = map;
    setTimeout(() => map.invalidateSize(), 100);
  }, []);

  // Update selected marker
  useEffect(() => {
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      const device = located.find((d) => (d._id || d.id) === id);
      if (device) {
        marker.setIcon(makeMarker(device, id === selected));
      }
    });

    // Fly to selected device
    if (selected && mapInst.current) {
      const device = located.find((d) => (d._id || d.id) === selected);
      if (device?.location) {
        mapInst.current.flyTo([device.location.lat, device.location.lng], 12);
      }
    }
  }, [selected, located]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', height: 'calc(100vh - 58px)', gap: 0 }}>
      {/* Map */}
      <div
        ref={mapRef}
        style={{
          height: '100%',
          background: '#0a0a0a',
          borderRight: '1px solid hsl(var(--border))',
        }}
      />

      {/* Sidebar */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: 'hsl(var(--surface))',
          borderLeft: '1px solid hsl(var(--border))',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 22px 18px', borderBottom: '1px solid hsl(var(--border))' }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10.5px',
              fontWeight: 500,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'hsl(var(--muted-fg))',
              marginBottom: '4px',
            }}
          >
            {located.length} DEVICES
          </div>
        </div>

        {/* Device list */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {isLoading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'hsl(var(--muted-fg))' }}>
              Loading...
            </div>
          ) : located.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'hsl(var(--muted-fg))' }}>
              No located devices
            </div>
          ) : (
            located.map((device) => (
              <div
                key={device._id || device.id}
                onClick={() => setSelected(device._id || device.id)}
                style={{
                  padding: '10px 0',
                  borderBottom: '1px solid hsl(var(--border-strong))',
                  marginLeft: '22px',
                  marginRight: '22px',
                  cursor: 'pointer',
                  background: selected === (device._id || device.id) ? 'hsl(var(--surface-raised))' : 'transparent',
                  paddingLeft: '10px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '4px',
                  }}
                >
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>{device.name}</span>
                  <StatusTag status={device.status} />
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10.5px',
                    color: 'hsl(var(--muted-fg))',
                    marginTop: '2px',
                  }}
                >
                  {device.location?.lat.toFixed(3)}, {device.location?.lng.toFixed(3)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
