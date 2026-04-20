import { useState, useMemo, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { Search, ExternalLink, X, Activity, Clock, Cpu, Radio, FileCode } from 'lucide-react';
import { devicesApi } from '@/api/devices';
import { telemetryApi } from '@/api/telemetry';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const MAP_ID  = import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID';

type Status = 'online' | 'offline' | 'idle' | 'error';

interface RichDevice {
  _id?: string;
  id: string;
  name: string;
  description?: string;
  status: Status;
  category: string;
  protocol?: string;
  payloadFormat?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  hardwareVersion?: string;
  lastSeenAt?: string;
  createdAt?: string;
  tags?: string[];
  location?: { lat: number; lng: number; alt?: number; speed?: number; heading?: number };
}

const CAT_COLOR: Record<string, string> = {
  tracker:       '#FF5B1F',
  environmental: '#10B981',
  energy:        '#FACC15',
  water:         '#3B82F6',
  industrial:    '#F97316',
  gateway:       '#06B6D4',
  research:      '#EC4899',
  telemetry:     '#8B5CF6',
  pump:          '#14B8A6',
  mobile:        '#F59E0B',
  fixed:         '#6366F1',
  custom:        '#8B5CF6',
};

const CAT_ICON: Record<string, string> = {
  tracker:       '◉',
  environmental: '◈',
  energy:        '◆',
  water:         '◇',
  industrial:    '▣',
  gateway:       '◎',
  research:      '◍',
  telemetry:     '◌',
  pump:          '◐',
  mobile:        '◑',
  fixed:         '▪',
  custom:        '◦',
};

const PROTO_LABEL: Record<string, string> = {
  mqtt: 'MQTT', http: 'HTTP', websocket: 'WS',
  tcp: 'TCP', udp: 'UDP', coap: 'CoAP', custom: 'CUSTOM',
};

const STATUS_COLOR: Record<Status, string> = {
  online:  'var(--good)',
  offline: 'var(--muted-fg)',
  idle:    'var(--warn)',
  error:   'var(--bad)',
};

const LOCATION_KEYS = new Set([
  'lat','latitude','lng','lon','long','longitude',
  'alt','altitude','speed','spd','heading','course','bearing','accuracy',
]);

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

function relTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)   return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatVal(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v);
}

/* ── Pin ── */
function DevicePin({ device, isSelected }: { device: RichDevice; isSelected: boolean }) {
  const catColor  = CAT_COLOR[device.category] ?? '#FF5B1F';
  const ringColor = device.status === 'error' ? '#C21D1D' : catColor;
  const isOffline = device.status === 'offline';
  const sz        = isSelected ? 52 : 40;
  const cssVar    = `rgba(${hexToRgb(ringColor)},0.5)`;

  return (
    <div
      style={{
        width: sz, height: sz,
        borderRadius: '50%',
        background: `${ringColor}18`,
        border: `${isSelected ? 3 : 2}px solid ${ringColor}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        fontSize: isSelected ? 19 : 15,
        fontWeight: 700,
        color: ringColor,
        transition: 'all 0.18s cubic-bezier(0.4,0,0.2,1)',
        filter: isOffline ? 'grayscale(1) opacity(0.45)' : undefined,
        '--glow-color': cssVar,
        animation: isOffline ? undefined : 'marker-glow 2.5s ease-in-out infinite',
        boxShadow: isSelected
          ? `0 0 0 0 ${cssVar}, 0 6px 20px rgba(0,0,0,0.4)`
          : `0 0 0 0 ${cssVar}, 0 3px 10px rgba(0,0,0,0.25)`,
        backdropFilter: 'blur(4px)',
        letterSpacing: 0,
      } as CSSProperties}
    >
      {CAT_ICON[device.category] ?? '●'}
    </div>
  );
}

/* ── Map controller — pans + zooms when selection changes ── */
function MapController({ device }: { device: RichDevice | null }) {
  const map = useMap();
  const prevId = useRef('');

  useEffect(() => {
    if (!map || !device?.location) return;
    const id = device._id ?? device.id;
    if (id === prevId.current) return;
    prevId.current = id;
    map.panTo({ lat: device.location.lat, lng: device.location.lng });
    setTimeout(() => map.setZoom(15), 80);
  }, [map, device?._id, device?.id]);

  return null;
}

/* ── Status badge ── */
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, [string, string]> = {
    online:        ['#0F7A3D22', '#0F7A3D'],
    offline:       ['#5E5C5622', '#5E5C56'],
    idle:          ['#B4530922', '#B45309'],
    error:         ['#C21D1D22', '#C21D1D'],
    provisioning:  ['#3B82F622', '#3B82F6'],
    decommissioned:['#5E5C5622', '#5E5C56'],
  };
  const [bg, fg] = colors[status] ?? ['#5E5C5622', '#5E5C56'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px', background: bg, border: `1px solid ${fg}33`,
      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: fg,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: fg, flexShrink: 0,
        animation: status === 'online' ? 'pulse-dot 2s infinite' : undefined }} />
      {status}
    </span>
  );
}

/* ── Meta field ── */
function Field({ icon, label, value, mono = true, accent }: {
  icon: ReactNode; label: string; value?: string | null; mono?: boolean; accent?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <span style={{ color: 'hsl(var(--muted-fg))', marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'hsl(var(--muted-fg))', marginBottom: 1 }}>{label}</div>
        <div style={{
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
          fontSize: 11.5, fontWeight: 500,
          color: accent ?? (value ? 'hsl(var(--fg))' : 'hsl(var(--muted-fg))'),
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{value ?? '—'}</div>
      </div>
    </div>
  );
}

/* ── Device detail card (overlay) ── */
function DeviceCard({ device, onClose }: { device: RichDevice; onClose: () => void }) {
  const id = device._id ?? device.id;
  const catColor = CAT_COLOR[device.category] ?? '#FF5B1F';

  const { data: telem } = useQuery({
    queryKey: ['map-telem', id],
    queryFn: () => telemetryApi.latest(id),
    enabled: !!id,
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  const telemetryRows = useMemo(() => {
    const fields = telem?.fields as Record<string, unknown> | undefined;
    if (!fields) return [];
    return Object.entries(fields)
      .filter(([k, v]) => !LOCATION_KEYS.has(k.toLowerCase()) && (typeof v === 'number' || typeof v === 'boolean'))
      .slice(0, 6);
  }, [telem]);

  const coords = device.location
    ? `${device.location.lat.toFixed(5)}, ${device.location.lng.toFixed(5)}`
    : null;

  return (
    <div style={{
      position: 'absolute',
      bottom: 28,
      left: 24,
      width: 272,
      background: 'hsl(var(--surface))',
      border: '1px solid hsl(var(--border))',
      borderTop: `3px solid ${catColor}`,
      boxShadow: '0 12px 40px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.2)',
      zIndex: 20,
      overflow: 'hidden',
    }}>

      {/* ── Header ── */}
      <div style={{ padding: '13px 14px 11px', background: `${catColor}0A` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.15em',
            textTransform: 'uppercase', color: catColor, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 13 }}>{CAT_ICON[device.category] ?? '●'}</span>
            {device.category}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: '1px solid hsl(var(--border))', cursor: 'pointer',
            color: 'hsl(var(--muted-fg))', width: 20, height: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.1s',
          }}>
            <X size={11} />
          </button>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'hsl(var(--fg))', lineHeight: 1.2, marginBottom: 7,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {device.name}
        </div>
        <StatusBadge status={device.status} />
      </div>

      {/* ── Info grid ── */}
      <div style={{ padding: '11px 14px', borderTop: '1px solid hsl(var(--border))',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 8px' }}>
        <Field icon={<Radio size={11} />} label="Protocol"
          value={device.protocol ? PROTO_LABEL[device.protocol] ?? device.protocol.toUpperCase() : null}
          accent={catColor} />
        <Field icon={<FileCode size={11} />} label="Format"
          value={device.payloadFormat?.toUpperCase() ?? null} />
        {device.firmwareVersion && (
          <Field icon={<Cpu size={11} />} label="Firmware" value={device.firmwareVersion} />
        )}
        {device.serialNumber && (
          <Field icon={<Activity size={11} />} label="Serial" value={device.serialNumber} />
        )}
        <div style={{ gridColumn: '1 / -1' }}>
          <Field icon={<span style={{ fontSize: 10 }}>◎</span>} label="Coordinates" value={coords} />
        </div>
      </div>

      {/* ── Last seen ── */}
      {device.lastSeenAt && (
        <div style={{ padding: '7px 14px', borderTop: '1px solid hsl(var(--border))',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'hsl(var(--bg))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5,
            fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'hsl(var(--muted-fg))' }}>
            <Clock size={10} /> Last seen
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11,
            color: device.status === 'online' ? `hsl(${STATUS_COLOR.online})` : 'hsl(var(--fg))' }}>
            {relTime(device.lastSeenAt)}
          </span>
        </div>
      )}

      {/* ── Live telemetry ── */}
      {telemetryRows.length > 0 && (
        <div style={{ padding: '10px 14px', borderTop: '1px solid hsl(var(--border))' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'hsl(var(--muted-fg))', marginBottom: 8,
            display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: catColor,
              display: 'inline-block', animation: 'pulse-dot 2s infinite' }} />
            Live telemetry
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 8px' }}>
            {telemetryRows.map(([key, val]) => (
              <div key={key} style={{ background: 'hsl(var(--bg))', padding: '5px 7px',
                borderLeft: `2px solid ${catColor}44` }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'hsl(var(--muted-fg))',
                  textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 2 }}>
                  {key}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600,
                  color: 'hsl(var(--fg))', lineHeight: 1 }}>
                  {formatVal(val)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tags ── */}
      {(device.tags?.length ?? 0) > 0 && (
        <div style={{ padding: '6px 14px', borderTop: '1px solid hsl(var(--border))',
          display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {device.tags!.map(t => (
            <span key={t} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 6px',
              background: 'hsl(var(--surface-raised))', border: '1px solid hsl(var(--border))',
              color: 'hsl(var(--muted-fg))', letterSpacing: '0.1em' }}>
              {t}
            </span>
          ))}
        </div>
      )}

      {/* ── CTA ── */}
      <Link to={`/devices/${id}`} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        padding: '10px', background: catColor,
        color: '#fff', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600,
        textDecoration: 'none', letterSpacing: '0.02em',
        transition: 'opacity 0.12s',
        borderTop: '1px solid hsl(var(--border))',
      }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        Open device <ExternalLink size={12} />
      </Link>
    </div>
  );
}

/* ── Status tag (sidebar list) ── */
function StatusTag({ status }: { status: string }) {
  const tagClass: Record<string, string> = {
    online: 'tag tag-online', offline: 'tag tag-offline',
    idle: 'tag tag-warn',     error: 'tag tag-error',
    provisioning: 'tag tag-info', decommissioned: 'tag tag-offline',
  };
  const dotClass: Record<string, string> = {
    online: 'online', offline: 'offline', idle: 'warn', error: 'error',
    provisioning: 'info', decommissioned: 'offline',
  };
  return (
    <span className={tagClass[status] ?? 'tag tag-offline'}>
      <span className={`dot dot-${dotClass[status] ?? 'offline'}`} />
      {status}
    </span>
  );
}

/* ── No API key screen ── */
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

/* ══════════════════════════════════════════════════
   Main page
═══════════════════════════════════════════════════ */
export function MapPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: () => devicesApi.list(),
  });

  const devices = (data?.devices ?? []) as unknown as RichDevice[];
  const located = useMemo(() => devices.filter(d => d.location?.lat && d.location?.lng), [devices]);

  const filtered = useMemo(() => devices.filter(d => {
    const matchSearch = !search
      || d.name.toLowerCase().includes(search.toLowerCase())
      || d.category.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || d.status === statusFilter;
    return matchSearch && matchStatus;
  }), [devices, search, statusFilter]);

  const selectedDevice = useMemo(
    () => located.find(d => (d._id ?? d.id) === selectedId) ?? null,
    [located, selectedId],
  );

  const mapCenter = useMemo(() => {
    if (located.length === 0) return { lat: 14.7, lng: -17.4 };
    const lats = located.map(d => d.location!.lat);
    const lngs = located.map(d => d.location!.lng);
    return { lat: lats.reduce((a, b) => a + b) / lats.length, lng: lngs.reduce((a, b) => a + b) / lngs.length };
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

      {/* ── Map column ── */}
      <div style={{ position: 'relative' }}>
        <APIProvider apiKey={API_KEY}>
          <Map
            mapId={MAP_ID}
            defaultCenter={mapCenter}
            defaultZoom={located.length > 0 ? 5 : 3}
            mapTypeId="satellite"
            gestureHandling="greedy"
            streetViewControl={false}
            mapTypeControl={false}
            fullscreenControl={false}
            style={{ width: '100%', height: '100%' }}
          >
            <MapController device={selectedDevice} />

            {located.map(device => {
              const id = device._id ?? device.id;
              const isSelected = selectedId === id;
              return (
                <AdvancedMarker
                  key={id}
                  position={{ lat: device.location!.lat, lng: device.location!.lng }}
                  onClick={() => setSelectedId(isSelected ? null : id)}
                  zIndex={isSelected ? 20 : 1}
                >
                  <DevicePin device={device} isSelected={isSelected} />
                </AdvancedMarker>
              );
            })}
          </Map>
        </APIProvider>

        {/* Device detail card */}
        {selectedDevice && (
          <DeviceCard device={selectedDevice} onClose={() => setSelectedId(null)} />
        )}
      </div>

      {/* ── Right panel ── */}
      <div style={{ display: 'flex', flexDirection: 'column', background: 'hsl(var(--bg))', borderLeft: '1px solid hsl(var(--border))', overflow: 'hidden' }}>

        {/* Header */}
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
          {([
            ['online',  statusCounts.online,  'var(--good)'],
            ['error',   statusCounts.error,   'var(--bad)'],
            ['idle',    statusCounts.idle,    'var(--warn)'],
            ['offline', statusCounts.offline, 'var(--muted-fg)'],
          ] as const).map(([s, n, color]) => (
            <div key={s} style={{ padding: '10px 8px', borderRight: s !== 'offline' ? '1px solid hsl(var(--border))' : 0, textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', lineHeight: 1, color: `hsl(${color})` }}>{n}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: `hsl(${color})`, marginTop: '3px', opacity: 0.8 }}>{s}</div>
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
              const id = device._id ?? device.id;
              const hasLocation = !!(device.location?.lat && device.location?.lng);
              const isSelected  = selectedId === id;
              const catColor    = CAT_COLOR[device.category] ?? '#FF5B1F';
              return (
                <div
                  key={id}
                  onClick={() => { if (hasLocation) setSelectedId(isSelected ? null : id); }}
                  style={{
                    padding: '11px 20px',
                    borderBottom: '1px solid hsl(var(--border))',
                    borderLeft: isSelected ? `3px solid ${catColor}` : '3px solid transparent',
                    cursor: hasLocation ? 'pointer' : 'default',
                    background: isSelected ? `${catColor}0A` : 'transparent',
                    transition: 'background 0.1s, border-color 0.1s',
                  }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'hsl(var(--surface))'; }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14, color: catColor, fontWeight: 700 }}>{CAT_ICON[device.category] ?? '●'}</span>
                      {device.name}
                    </span>
                    <StatusTag status={device.status} />
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'hsl(var(--muted-fg))', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ textTransform: 'capitalize' }}>{device.category}</span>
                    <span style={{ opacity: 0.4 }}>·</span>
                    {device.protocol && <span style={{ textTransform: 'uppercase', fontSize: 9.5 }}>{PROTO_LABEL[device.protocol] ?? device.protocol}</span>}
                    {hasLocation
                      ? <span style={{ marginLeft: 'auto' }}>{device.location!.lat.toFixed(3)}, {device.location!.lng.toFixed(3)}</span>
                      : <span style={{ marginLeft: 'auto', opacity: 0.4 }}>no location</span>}
                  </div>
                  {device.lastSeenAt && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'hsl(var(--muted-fg))', marginTop: 3, opacity: 0.7 }}>
                      {relTime(device.lastSeenAt)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div style={{ padding: '10px 20px', borderTop: '1px solid hsl(var(--border))', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'hsl(var(--muted-fg))', display: 'flex', justifyContent: 'space-between' }}>
          <span>{located.length} of {devices.length} located</span>
          {selectedDevice && <span style={{ color: CAT_COLOR[selectedDevice.category] ?? 'hsl(var(--primary))' }}>1 selected</span>}
        </div>
      </div>
    </div>
  );
}
