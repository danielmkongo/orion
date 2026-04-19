import { useState, useMemo, CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { APIProvider, Map, AdvancedMarker, InfoWindow } from '@vis.gl/react-google-maps';
import { Search, ExternalLink } from 'lucide-react';
import { devicesApi } from '@/api/devices';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const MAP_ID  = import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID';

type Status = 'online' | 'offline' | 'idle' | 'error';

interface Device {
  _id: string;
  id: string;
  name: string;
  status: Status;
  category: string;
  location?: { lat: number; lng: number };
}

const CAT_EMOJI: Record<string, string> = {
  tracker:       '🚗',
  environmental: '🌿',
  energy:        '⚡',
  water:         '💧',
  industrial:    '⚙️',
  gateway:       '📡',
  research:      '🔬',
  custom:        '📟',
};

const CAT_COLOR: Record<string, string> = {
  tracker:       '#FF5B1F',
  environmental: '#10B981',
  energy:        '#FACC15',
  water:         '#3B82F6',
  industrial:    '#F97316',
  gateway:       '#06B6D4',
  research:      '#EC4899',
  custom:        '#8B5CF6',
};

const STATUS_RING: Record<Status, string> = {
  online:  '#0F7A3D',
  offline: '#5E5C56',
  idle:    '#B45309',
  error:   '#C21D1D',
};

function DevicePin({ device, isSelected }: { device: Device; isSelected: boolean }) {
  const catColor  = CAT_COLOR[device.category] || '#FF5B1F';
  const ringColor = device.status === 'error' ? STATUS_RING.error : catColor;
  const isOffline = device.status === 'offline';
  const sz = isSelected ? 56 : 44;
  const cssVar = `rgba(${hexToRgb(ringColor)},0.55)`;

  return (
    <div
      style={{
        width: sz,
        height: sz,
        borderRadius: '50%',
        background: `${ringColor}22`,
        border: `${isSelected ? 3 : 2}px solid ${ringColor}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        fontSize: isSelected ? 24 : 20,
        lineHeight: 1,
        transition: 'all 0.2s',
        filter: isOffline ? 'grayscale(1) opacity(0.5)' : undefined,
        '--glow-color': cssVar,
        animation: isOffline ? undefined : `marker-glow 2.5s ease-in-out infinite`,
        boxShadow: `0 0 0 0 ${cssVar}, 0 3px 10px rgba(0,0,0,0.3)`,
        backdropFilter: 'blur(2px)',
      } as CSSProperties}
      title={`${device.name} · ${device.status}`}
    >
      {CAT_EMOJI[device.category] || '📍'}
    </div>
  );
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

function StatusTag({ status }: { status: Status }) {
  const tagClass: Record<Status, string> = {
    online: 'tag tag-online',
    offline: 'tag tag-offline',
    idle: 'tag tag-warn',
    error: 'tag tag-error',
  };
  return (
    <span className={tagClass[status]}>
      <span className={`dot dot-${status === 'idle' ? 'warn' : status}`} />
      {status}
    </span>
  );
}

function NoApiKey() {
  return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 58px)' }}>
      <div className="panel" style={{ padding: '48px', maxWidth: '480px', textAlign: 'center', borderTop: '3px solid hsl(var(--primary))' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '28px', lineHeight: 1.1, marginBottom: '12px' }}>
          <em style={{ color: 'hsl(var(--primary))' }}>Google Maps</em> API key required
        </div>
        <p className="dim" style={{ fontSize: '13px', marginBottom: '24px' }}>
          Add your key to <code style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', background: 'hsl(var(--surface-raised))', padding: '2px 6px' }}>.env</code> to enable the map.
        </p>
        <div style={{ background: 'hsl(var(--bg))', border: '1px solid hsl(var(--border))', padding: '14px 16px', textAlign: 'left' }}>
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'hsl(var(--primary))' }}>
            VITE_GOOGLE_MAPS_API_KEY=your_key_here
          </code>
        </div>
      </div>
    </div>
  );
}

export function MapPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [infoId, setInfoId]         = useState<string | null>(null);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: () => devicesApi.list(),
  });

  const devices = (data?.devices ?? []) as unknown as Device[];
  const located = useMemo(() => devices.filter(d => d.location?.lat && d.location?.lng), [devices]);

  const filtered = useMemo(() => {
    return devices.filter(d => {
      const matchSearch = !search || d.name.toLowerCase().includes(search.toLowerCase()) || d.category.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' || d.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [devices, search, statusFilter]);

  const mapCenter = useMemo(() => {
    if (located.length === 0) return { lat: 14.7, lng: -17.4 };
    const lats = located.map(d => d.location!.lat);
    const lngs = located.map(d => d.location!.lng);
    return {
      lat: lats.reduce((a, b) => a + b) / lats.length,
      lng: lngs.reduce((a, b) => a + b) / lngs.length,
    };
  }, [located]);

  const statusCounts = useMemo(() => ({
    online:  devices.filter(d => d.status === 'online').length,
    offline: devices.filter(d => d.status === 'offline').length,
    idle:    devices.filter(d => d.status === 'idle').length,
    error:   devices.filter(d => d.status === 'error').length,
  }), [devices]);

  if (!API_KEY) return <NoApiKey />;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', height: 'calc(100vh - 58px)' }}>
      {/* ── Map ── */}
      <APIProvider apiKey={API_KEY}>
        <Map
          mapId={MAP_ID}
          defaultCenter={mapCenter}
          defaultZoom={located.length > 0 ? 7 : 3}
          mapTypeId="satellite"
          gestureHandling="greedy"
          streetViewControl={false}
          mapTypeControl={false}
          fullscreenControl={false}
          style={{ width: '100%', height: '100%' }}
        >
          {located.map(device => {
            const id = device._id || device.id;
            const isSelected = selectedId === id;
            return (
              <AdvancedMarker
                key={id}
                position={{ lat: device.location!.lat, lng: device.location!.lng }}
                onClick={() => { setSelectedId(id); setInfoId(id); }}
                zIndex={isSelected ? 10 : 1}
              >
                <DevicePin device={device} isSelected={isSelected} />
                {infoId === id && (
                  <InfoWindow
                    position={{ lat: device.location!.lat, lng: device.location!.lng }}
                    onCloseClick={() => setInfoId(null)}
                    pixelOffset={[0, -(isSelected ? 56 : 44) / 2 - 8]}
                  >
                    <div style={{ padding: '4px 2px', minWidth: '180px', fontFamily: 'var(--font-sans)' }}>
                      <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>{device.name}</div>
                      <div style={{ fontSize: '11px', textTransform: 'capitalize', color: '#666', marginBottom: '10px' }}>
                        {CAT_EMOJI[device.category] || '📍'} {device.category} · {device.status}
                      </div>
                      <Link to={`/devices/${device._id || device.id}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#FF5B1F', fontWeight: 500 }}>
                        View device <ExternalLink size={10} />
                      </Link>
                    </div>
                  </InfoWindow>
                )}
              </AdvancedMarker>
            );
          })}
        </Map>
      </APIProvider>

      {/* ── Right panel ── */}
      <div style={{ display: 'flex', flexDirection: 'column', background: 'hsl(var(--bg))', borderLeft: '1px solid hsl(var(--border))', overflow: 'hidden' }}>
        {/* Panel header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid hsl(var(--border))' }}>
          <div className="eyebrow" style={{ marginBottom: '12px' }}>Geography · Device map</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '34px', padding: '0 10px', border: '1px solid hsl(var(--border))', background: 'hsl(var(--surface))', marginBottom: '10px' }}>
            <Search size={13} style={{ color: 'hsl(var(--muted-fg))', flexShrink: 0 }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search devices…"
              style={{ border: 0, outline: 0, background: 'transparent', color: 'hsl(var(--fg))', fontFamily: 'var(--font-sans)', fontSize: '13px', width: '100%' }} />
          </div>
          <div className="seg" style={{ width: '100%', display: 'flex' }}>
            {(['all', 'online', 'error', 'idle', 'offline'] as const).map(s => (
              <button key={s} className={statusFilter === s ? 'on' : ''} onClick={() => setStatusFilter(s)}
                style={{ flex: 1, padding: '5px 4px', fontSize: '9.5px' }}>
                {s === 'all' ? 'ALL' : s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Status counters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: '1px solid hsl(var(--border))' }}>
          {([['online', statusCounts.online], ['error', statusCounts.error], ['idle', statusCounts.idle], ['offline', statusCounts.offline]] as const).map(([s, n]) => (
            <div key={s} style={{ padding: '10px 8px', borderRight: s !== 'offline' ? '1px solid hsl(var(--border))' : 0, textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', lineHeight: 1 }}>{n}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: `hsl(var(--${s === 'idle' ? 'warn' : s === 'online' ? 'good' : s === 'error' ? 'bad' : 'muted-fg'}))`, marginTop: '3px' }}>{s}</div>
            </div>
          ))}
        </div>

        {/* Device list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {isLoading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'hsl(var(--muted-fg))', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>LOADING…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'hsl(var(--muted-fg))', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>NO DEVICES FOUND</div>
          ) : (
            filtered.map(device => {
              const id = device._id || device.id;
              const hasLocation = !!(device.location?.lat && device.location?.lng);
              const isSelected = selectedId === id;
              return (
                <div key={id}
                  onClick={() => { if (hasLocation) { setSelectedId(id); setInfoId(id); } }}
                  style={{ padding: '11px 20px', borderBottom: '1px solid hsl(var(--border))', cursor: hasLocation ? 'pointer' : 'default', background: isSelected ? 'hsl(var(--surface-raised))' : 'transparent', transition: 'background 0.1s' }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'hsl(var(--surface))'; }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 16 }}>{CAT_EMOJI[device.category] || '📍'}</span>
                      {device.name}
                    </span>
                    <StatusTag status={device.status} />
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'hsl(var(--muted-fg))', display: 'flex', gap: '8px' }}>
                    <span style={{ textTransform: 'capitalize' }}>{device.category}</span>
                    {hasLocation ? <span>{device.location!.lat.toFixed(3)}, {device.location!.lng.toFixed(3)}</span> : <span style={{ opacity: 0.5 }}>no location</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ padding: '10px 20px', borderTop: '1px solid hsl(var(--border))', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'hsl(var(--muted-fg))' }}>
          {located.length} of {devices.length} devices located
        </div>
      </div>
    </div>
  );
}
