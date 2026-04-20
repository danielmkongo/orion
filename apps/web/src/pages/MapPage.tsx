import {
  useState, useMemo, useEffect, useRef, useCallback,
  type CSSProperties, type ReactNode,
} from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import {
  Search, ExternalLink, X, Activity, Clock, Cpu, Radio, FileCode,
  Navigation, Shield, Plus, Trash2, ToggleLeft, ToggleRight, ChevronRight,
} from 'lucide-react';
import { devicesApi } from '@/api/devices';
import { telemetryApi } from '@/api/telemetry';
import { geofenceApi, type Geofence } from '@/api/geofence';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const MAP_ID  = import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID';

/* ═══════════════════════════════════════════════════════════
   Constants
═══════════════════════════════════════════════════════════ */
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

const LOCATION_KEYS = new Set([
  'lat','latitude','lng','lon','long','longitude',
  'alt','altitude','speed','spd','heading','course','bearing','accuracy',
]);

const TRAJ_COLORS = ['#FF5B1F','#3B82F6','#10B981','#FACC15','#EC4899','#8B5CF6','#06B6D4','#F97316'];
const GF_COLORS   = ['#FF5B1F','#3B82F6','#10B981','#FACC15','#EC4899','#8B5CF6','#06B6D4','#F97316'];

const RANGES = [
  { label: '1h',  ms: 3_600_000 },
  { label: '6h',  ms: 6 * 3_600_000 },
  { label: '24h', ms: 24 * 3_600_000 },
  { label: '7d',  ms: 7 * 24 * 3_600_000 },
];

type RightTab = 'devices' | 'geofences';
type DrawType = 'circle' | 'polygon';

interface RichDevice {
  _id?: string;
  id: string;
  name: string;
  description?: string;
  status: string;
  category: string;
  protocol?: string;
  payloadFormat?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  lastSeenAt?: string;
  tags?: string[];
  location?: { lat: number; lng: number; alt?: number; speed?: number; heading?: number };
}

interface DrawResult {
  type: DrawType;
  center?: { lat: number; lng: number };
  radius?: number;
  coordinates?: { lat: number; lng: number }[];
}

/* ═══════════════════════════════════════════════════════════
   Helpers
═══════════════════════════════════════════════════════════ */
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

function relTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatVal(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v);
}

/* ═══════════════════════════════════════════════════════════
   DevicePin
═══════════════════════════════════════════════════════════ */
function DevicePin({ device, isSelected }: { device: RichDevice; isSelected: boolean }) {
  const catColor  = CAT_COLOR[device.category] ?? '#FF5B1F';
  const ringColor = device.status === 'error' ? '#C21D1D' : catColor;
  const isOffline = device.status === 'offline';
  const sz        = isSelected ? 52 : 40;
  const cssVar    = `rgba(${hexToRgb(ringColor)},0.5)`;

  return (
    <div style={{
      width: sz, height: sz, borderRadius: '50%',
      background: `${ringColor}18`,
      border: `${isSelected ? 3 : 2}px solid ${ringColor}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', fontSize: isSelected ? 19 : 15, fontWeight: 700,
      color: ringColor, transition: 'all 0.18s cubic-bezier(0.4,0,0.2,1)',
      filter: isOffline ? 'grayscale(1) opacity(0.45)' : undefined,
      '--glow-color': cssVar,
      animation: isOffline ? undefined : 'marker-glow 2.5s ease-in-out infinite',
      boxShadow: isSelected
        ? `0 0 0 0 ${cssVar}, 0 6px 20px rgba(0,0,0,0.4)`
        : `0 0 0 0 ${cssVar}, 0 3px 10px rgba(0,0,0,0.25)`,
      backdropFilter: 'blur(4px)',
    } as CSSProperties}>
      {CAT_ICON[device.category] ?? '●'}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MapController — pan + zoom on selection
═══════════════════════════════════════════════════════════ */
function MapController({ device }: { device: RichDevice | null }) {
  const map    = useMap();
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

/* ═══════════════════════════════════════════════════════════
   TrajectoryLayer — fading polylines inside <Map>
═══════════════════════════════════════════════════════════ */
interface TrajectoryLayerProps {
  deviceId: string | null;
  enabled: boolean;
  color: string;
  rangeMs: number;
}

function TrajectoryLayer({ deviceId, enabled, color, rangeMs }: TrajectoryLayerProps) {
  const map       = useMap();
  const linesRef  = useRef<google.maps.Polyline[]>([]);

  const from = useMemo(() => new Date(Date.now() - rangeMs).toISOString(), [rangeMs]);

  const { data } = useQuery({
    queryKey: ['traj', deviceId, rangeMs],
    queryFn:  () => telemetryApi.locationHistory(deviceId!, from, undefined, 2000),
    enabled:  !!deviceId && enabled,
    staleTime: 60_000,
    refetchInterval: 90_000,
  });

  useEffect(() => {
    linesRef.current.forEach(l => l.setMap(null));
    linesRef.current = [];

    if (!map || !enabled || !data?.data?.length) return;

    const pts = data.data
      .filter(p => p.location?.lat && p.location?.lng)
      .map(p => ({ lat: p.location.lat, lng: p.location.lng }));

    if (pts.length < 2) return;

    const SEGS = 20;
    const step = Math.max(1, Math.floor(pts.length / SEGS));

    for (let i = 0; i < pts.length - 1; i++) {
      const segIdx  = Math.min(Math.floor(i / step), SEGS - 1);
      const opacity = Math.pow((segIdx + 1) / SEGS, 1.5);
      const weight  = 1.5 + 2 * (segIdx / SEGS);

      const line = new google.maps.Polyline({
        path:          [pts[i], pts[i + 1]],
        strokeColor:   color,
        strokeOpacity: opacity,
        strokeWeight:  weight,
        map,
        clickable: false,
        zIndex: 5,
      });
      linesRef.current.push(line);
    }

    return () => {
      linesRef.current.forEach(l => l.setMap(null));
      linesRef.current = [];
    };
  }, [map, data, color, enabled]);

  useEffect(() => {
    linesRef.current.forEach(l => l.setOptions({ strokeColor: color }));
  }, [color]);

  return null;
}

/* ═══════════════════════════════════════════════════════════
   GeofenceLayer — circle / polygon overlays inside <Map>
═══════════════════════════════════════════════════════════ */
function GeofenceLayer({ geofences, visible }: { geofences: Geofence[]; visible: boolean }) {
  const map       = useMap();
  const overlaysRef = useRef<(google.maps.Circle | google.maps.Polygon)[]>([]);

  useEffect(() => {
    overlaysRef.current.forEach(o => o.setMap(null));
    overlaysRef.current = [];

    if (!map || !visible) return;

    for (const gf of geofences) {
      if (!gf.active) continue;

      if (gf.type === 'circle' && gf.center && gf.radius) {
        const circle = new google.maps.Circle({
          center:        gf.center,
          radius:        gf.radius,
          fillColor:     gf.color,
          fillOpacity:   0.12,
          strokeColor:   gf.color,
          strokeOpacity: 0.85,
          strokeWeight:  2,
          map,
          zIndex: 3,
        });
        overlaysRef.current.push(circle);
      } else if (gf.type === 'polygon' && (gf.coordinates?.length ?? 0) >= 3) {
        const polygon = new google.maps.Polygon({
          paths:         gf.coordinates!,
          fillColor:     gf.color,
          fillOpacity:   0.12,
          strokeColor:   gf.color,
          strokeOpacity: 0.85,
          strokeWeight:  2,
          map,
          zIndex: 3,
        });
        overlaysRef.current.push(polygon);
      }
    }

    return () => {
      overlaysRef.current.forEach(o => o.setMap(null));
      overlaysRef.current = [];
    };
  }, [map, geofences, visible]);

  return null;
}

/* ═══════════════════════════════════════════════════════════
   DrawLayer — captures map clicks during draw mode
═══════════════════════════════════════════════════════════ */
interface DrawLayerProps {
  drawType: DrawType | null;
  color: string;
  defaultRadius: number;
  onComplete: (result: DrawResult) => void;
  onCancel: () => void;
  onPtAdded: (count: number) => void;
  completeRef: React.MutableRefObject<() => void>;
}

function DrawLayer({ drawType, color, defaultRadius, onComplete, onPtAdded, completeRef }: DrawLayerProps) {
  const map          = useMap();
  const listenersRef = useRef<google.maps.MapsEventListener[]>([]);
  const tempRef      = useRef<(google.maps.Circle | google.maps.Polygon)[]>([]);
  const ptsRef       = useRef<{ lat: number; lng: number }[]>([]);
  const blockingRef  = useRef(false);  // absorbs the extra click fired before dblclick

  const cleanup = useCallback(() => {
    listenersRef.current.forEach(l => google.maps.event.removeListener(l));
    listenersRef.current = [];
    tempRef.current.forEach(o => o.setMap(null));
    tempRef.current = [];
    ptsRef.current = [];
    blockingRef.current = false;
    if (map) map.setOptions({ draggableCursor: undefined });
  }, [map]);

  useEffect(() => {
    if (!map || !drawType) { cleanup(); return; }
    map.setOptions({ draggableCursor: 'crosshair' });

    if (drawType === 'circle') {
      completeRef.current = () => {};
      const clickL = map.addListener('click', (e: google.maps.MapMouseEvent) => {
        cleanup();
        const center = { lat: e.latLng!.lat(), lng: e.latLng!.lng() };
        const preview = new google.maps.Circle({
          center, radius: defaultRadius,
          fillColor: color, fillOpacity: 0.18,
          strokeColor: color, strokeOpacity: 0.85, strokeWeight: 2,
          map, zIndex: 4,
        });
        tempRef.current.push(preview);
        onComplete({ type: 'circle', center, radius: defaultRadius });
      });
      listenersRef.current.push(clickL);
    } else {
      // Polygon — live filled preview via google.maps.Polygon
      const previewPoly = new google.maps.Polygon({
        paths:         [],
        fillColor:     color,
        fillOpacity:   0.18,
        strokeColor:   color,
        strokeOpacity: 0.85,
        strokeWeight:  2,
        map,
        zIndex: 4,
        clickable: false,
      });
      tempRef.current.push(previewPoly);

      const doComplete = () => {
        if (ptsRef.current.length >= 3) {
          const coords = [...ptsRef.current];
          cleanup();
          onComplete({ type: 'polygon', coordinates: coords });
        }
      };
      completeRef.current = doComplete;

      const clickL = map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (blockingRef.current) return;
        const pt = { lat: e.latLng!.lat(), lng: e.latLng!.lng() };
        ptsRef.current = [...ptsRef.current, pt];
        previewPoly.setPath(ptsRef.current);
        onPtAdded(ptsRef.current.length);
      });

      const dblL = map.addListener('dblclick', (e: google.maps.MapMouseEvent) => {
        e.stop?.();
        // The browser fires one extra 'click' just before 'dblclick' — remove that point
        blockingRef.current = true;
        if (ptsRef.current.length > 0) {
          ptsRef.current = ptsRef.current.slice(0, -1);
          previewPoly.setPath(ptsRef.current);
          onPtAdded(ptsRef.current.length);
        }
        doComplete();
        setTimeout(() => { blockingRef.current = false; }, 100);
      });

      listenersRef.current.push(clickL, dblL);
    }

    return cleanup;
  }, [map, drawType, color, defaultRadius]);

  return null;
}

/* ═══════════════════════════════════════════════════════════
   StatusBadge
═══════════════════════════════════════════════════════════ */
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, [string, string]> = {
    online:         ['#0F7A3D22', '#0F7A3D'],
    offline:        ['#5E5C5622', '#5E5C56'],
    idle:           ['#B4530922', '#B45309'],
    error:          ['#C21D1D22', '#C21D1D'],
    provisioning:   ['#3B82F622', '#3B82F6'],
    decommissioned: ['#5E5C5622', '#5E5C56'],
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

/* ═══════════════════════════════════════════════════════════
   Meta field
═══════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════
   MapControls — floating top-left panel for trajectory +
   geofence toggles (always visible when map is open)
═══════════════════════════════════════════════════════════ */
interface MapControlsProps {
  selectedIsTracker: boolean;
  trajEnabled: boolean;        setTrajEnabled: (v: boolean) => void;
  trajColor: string;           setTrajColor: (v: string) => void;
  trajRangeMs: number;         setTrajRangeMs: (v: number) => void;
  gfVisible: boolean;          setGfVisible: (v: boolean) => void;
}

function MapControls({
  selectedIsTracker,
  trajEnabled, setTrajEnabled,
  trajColor, setTrajColor,
  trajRangeMs, setTrajRangeMs,
  gfVisible, setGfVisible,
}: MapControlsProps) {
  return (
    <div style={{
      position: 'absolute', top: 14, left: 14, zIndex: 15,
      background: 'hsl(var(--surface))',
      border: '1px solid hsl(var(--border))',
      boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
      padding: '10px 12px',
      minWidth: 220,
    }}>
      {/* Trajectory */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: trajEnabled && selectedIsTracker ? 8 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5,
            fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'hsl(var(--muted-fg))' }}>
            <Navigation size={11} style={{ color: trajEnabled && selectedIsTracker ? '#FF5B1F' : undefined }} />
            Trajectory
          </div>
          <button
            onClick={() => setTrajEnabled(!trajEnabled)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: trajEnabled ? '#FF5B1F' : 'hsl(var(--muted-fg))', display: 'flex' }}
          >
            {trajEnabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
          </button>
        </div>

        {trajEnabled && selectedIsTracker && (
          <>
            {/* Range */}
            <div style={{ display: 'flex', gap: 3, marginBottom: 7 }}>
              {RANGES.map(r => (
                <button key={r.label} onClick={() => setTrajRangeMs(r.ms)} style={{
                  flex: 1, padding: '3px 0',
                  fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em',
                  background: trajRangeMs === r.ms ? '#FF5B1F' : 'hsl(var(--bg))',
                  color: trajRangeMs === r.ms ? '#fff' : 'hsl(var(--muted-fg))',
                  border: `1px solid ${trajRangeMs === r.ms ? '#FF5B1F' : 'hsl(var(--border))'}`,
                  cursor: 'pointer',
                }}>{r.label}</button>
              ))}
            </div>
            {/* Color swatches */}
            <div style={{ display: 'flex', gap: 5 }}>
              {TRAJ_COLORS.map(c => (
                <button key={c} onClick={() => setTrajColor(c)} style={{
                  width: 16, height: 16, borderRadius: '50%',
                  background: c, border: trajColor === c ? `2px solid hsl(var(--fg))` : '2px solid transparent',
                  cursor: 'pointer', padding: 0, outline: 'none',
                  boxShadow: trajColor === c ? '0 0 0 1px hsl(var(--border))' : 'none',
                }} />
              ))}
            </div>
          </>
        )}

        {trajEnabled && !selectedIsTracker && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'hsl(var(--muted-fg))',
            marginTop: 4, opacity: 0.7 }}>Select a tracker device to show trail</div>
        )}
      </div>

      <div style={{ borderTop: '1px solid hsl(var(--border))', margin: '8px 0' }} />

      {/* Geofence overlay */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5,
          fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'hsl(var(--muted-fg))' }}>
          <Shield size={11} style={{ color: gfVisible ? '#3B82F6' : undefined }} />
          Geofences
        </div>
        <button
          onClick={() => setGfVisible(!gfVisible)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: gfVisible ? '#3B82F6' : 'hsl(var(--muted-fg))', display: 'flex' }}
        >
          {gfVisible ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   DeviceCard — overlay bottom-left of map
═══════════════════════════════════════════════════════════ */
function DeviceCard({ device, onClose }: { device: RichDevice; onClose: () => void }) {
  const id       = device._id ?? device.id;
  const catColor = CAT_COLOR[device.category] ?? '#FF5B1F';

  const { data: telem } = useQuery({
    queryKey: ['map-telem', id],
    queryFn:  () => telemetryApi.latest(id),
    enabled:  !!id,
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
      position: 'absolute', bottom: 28, left: 14, width: 272,
      background: 'hsl(var(--surface))',
      border: '1px solid hsl(var(--border))',
      borderTop: `3px solid ${catColor}`,
      boxShadow: '0 12px 40px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.2)',
      zIndex: 20, overflow: 'hidden',
    }}>

      {/* Header */}
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
          }}>
            <X size={11} />
          </button>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'hsl(var(--fg))', lineHeight: 1.2,
          marginBottom: 7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {device.name}
        </div>
        <StatusBadge status={device.status} />
      </div>

      {/* Info grid */}
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

      {/* Last seen */}
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
            color: device.status === 'online' ? '#0F7A3D' : 'hsl(var(--fg))' }}>
            {relTime(device.lastSeenAt)}
          </span>
        </div>
      )}

      {/* Live telemetry */}
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

      {/* Tags */}
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

      {/* CTA */}
      <Link to={`/devices/${id}`} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        padding: '10px', background: catColor, color: '#fff',
        fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600,
        textDecoration: 'none', letterSpacing: '0.02em', transition: 'opacity 0.12s',
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

/* ═══════════════════════════════════════════════════════════
   DrawBanner — floating hint during draw mode
═══════════════════════════════════════════════════════════ */
function DrawBanner({ drawType, pts, onDone, onCancel }: {
  drawType: DrawType; pts: number; onDone: () => void; onCancel: () => void;
}) {
  const isPolygon = drawType === 'polygon';
  const canDone   = isPolygon && pts >= 3;
  return (
    <div style={{
      position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
      zIndex: 25, background: 'hsl(var(--surface))',
      border: '1px solid hsl(var(--border))',
      boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
      padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'hsl(var(--fg))' }}>
        {isPolygon
          ? pts < 3 ? `Click to add vertices (${pts} so far, need 3)` : `${pts} vertices — double-click to close`
          : 'Click on the map to place the zone center'}
      </span>
      {canDone && (
        <button onClick={onDone} style={{
          padding: '4px 12px', background: '#3B82F6', color: '#fff', border: 'none',
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', cursor: 'pointer',
        }}>DONE</button>
      )}
      <button onClick={onCancel} style={{
        padding: '4px 10px', background: 'hsl(var(--bg))', color: 'hsl(var(--muted-fg))',
        border: '1px solid hsl(var(--border))', fontFamily: 'var(--font-mono)',
        fontSize: 10, letterSpacing: '0.08em', cursor: 'pointer',
      }}>CANCEL</button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   GeofenceForm — create new geofence after draw
═══════════════════════════════════════════════════════════ */
interface GeofenceFormProps {
  draft: DrawResult;
  onSave: (data: Omit<Geofence, '_id' | 'orgId' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
  saving: boolean;
}

function GeofenceForm({ draft, onSave, onCancel, saving }: GeofenceFormProps) {
  const [name, setName]               = useState('');
  const [color, setColor]             = useState(GF_COLORS[1]);
  const [radius, setRadius]           = useState(draft.radius ?? 500);
  const [alertOnEnter, setEnter]      = useState(true);
  const [alertOnExit, setExit]        = useState(false);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(), type: draft.type, color, active: true,
      alertOnEnter, alertOnExit, deviceIds: [],
      center:      draft.type === 'circle'  ? draft.center      : undefined,
      radius:      draft.type === 'circle'  ? radius            : undefined,
      coordinates: draft.type === 'polygon' ? draft.coordinates : undefined,
    });
  };

  return (
    <div style={{ padding: '12px 14px', borderTop: '1px solid hsl(var(--border))',
      background: 'hsl(var(--bg))' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em',
        textTransform: 'uppercase', color: 'hsl(var(--muted-fg))', marginBottom: 10 }}>
        {draft.type === 'circle' ? '◎ New circle zone' : '◆ New polygon zone'}
      </div>

      <input value={name} onChange={e => setName(e.target.value)}
        placeholder="Zone name…"
        style={{ width: '100%', padding: '6px 8px', marginBottom: 8, boxSizing: 'border-box',
          fontFamily: 'var(--font-sans)', fontSize: 12,
          background: 'hsl(var(--surface))', color: 'hsl(var(--fg))',
          border: '1px solid hsl(var(--border))', outline: 'none' }} />

      {draft.type === 'circle' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'hsl(var(--muted-fg))' }}>
            Radius (m)
          </label>
          <input type="number" value={radius} onChange={e => setRadius(Number(e.target.value))}
            min={50} step={50}
            style={{ width: 80, padding: '4px 6px', fontFamily: 'var(--font-mono)', fontSize: 11,
              background: 'hsl(var(--surface))', color: 'hsl(var(--fg))',
              border: '1px solid hsl(var(--border))', outline: 'none' }} />
        </div>
      )}

      {/* Color */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
        {GF_COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)} style={{
            width: 16, height: 16, borderRadius: '50%', background: c, padding: 0, cursor: 'pointer',
            border: color === c ? '2px solid hsl(var(--fg))' : '2px solid transparent',
            boxShadow: color === c ? '0 0 0 1px hsl(var(--border))' : 'none',
            outline: 'none',
          }} />
        ))}
      </div>

      {/* Alerts */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        {([['Enter', alertOnEnter, setEnter], ['Exit', alertOnExit, setExit]] as const).map(([label, val, set]) => (
          <label key={String(label)} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'hsl(var(--muted-fg))' }}>
            <input type="checkbox" checked={val} onChange={e => (set as any)(e.target.checked)}
              style={{ accentColor: color, cursor: 'pointer' }} />
            Alert on {label.toLowerCase()}
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={handleSubmit} disabled={!name.trim() || saving} style={{
          flex: 1, padding: '7px 0', background: color, color: '#fff',
          border: 'none', fontFamily: 'var(--font-mono)', fontSize: 10,
          letterSpacing: '0.08em', cursor: name.trim() && !saving ? 'pointer' : 'not-allowed',
          opacity: name.trim() && !saving ? 1 : 0.5,
        }}>{saving ? 'SAVING…' : 'CREATE ZONE'}</button>
        <button onClick={onCancel} style={{
          padding: '7px 12px', background: 'hsl(var(--surface))', color: 'hsl(var(--muted-fg))',
          border: '1px solid hsl(var(--border))', fontFamily: 'var(--font-mono)',
          fontSize: 10, letterSpacing: '0.08em', cursor: 'pointer',
        }}>CANCEL</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   GeofencesPanel — right panel tab content
═══════════════════════════════════════════════════════════ */
interface GeofencesPanelProps {
  geofences: Geofence[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onStartDraw: (type: DrawType) => void;
  drawMode: boolean;
  drawDraft: DrawResult | null;
  onSaveDraft: (data: Omit<Geofence, '_id' | 'orgId' | 'createdAt' | 'updatedAt'>) => void;
  onCancelDraft: () => void;
  saving: boolean;
}

function GeofencesPanel({
  geofences, onToggle, onDelete, onStartDraw,
  drawMode, drawDraft, onSaveDraft, onCancelDraft, saving,
}: GeofencesPanelProps) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Draw controls */}
      {!drawMode && !drawDraft && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid hsl(var(--border))',
          display: 'flex', gap: 6 }}>
          <button onClick={() => onStartDraw('circle')} style={{
            flex: 1, padding: '7px 0',
            background: 'hsl(var(--surface))', color: 'hsl(var(--fg))',
            border: '1px solid hsl(var(--border))', fontFamily: 'var(--font-mono)',
            fontSize: 9.5, letterSpacing: '0.1em', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}>
            <Plus size={10} /> CIRCLE
          </button>
          <button onClick={() => onStartDraw('polygon')} style={{
            flex: 1, padding: '7px 0',
            background: 'hsl(var(--surface))', color: 'hsl(var(--fg))',
            border: '1px solid hsl(var(--border))', fontFamily: 'var(--font-mono)',
            fontSize: 9.5, letterSpacing: '0.1em', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}>
            <Plus size={10} /> POLYGON
          </button>
        </div>
      )}

      {drawMode && !drawDraft && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid hsl(var(--border))',
          fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3B82F6',
          display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ animation: 'pulse-dot 1.5s infinite', width: 6, height: 6,
            borderRadius: '50%', background: '#3B82F6', display: 'inline-block' }} />
          Drawing on map…
        </div>
      )}

      {/* Create form */}
      {drawDraft && (
        <GeofenceForm draft={drawDraft} onSave={onSaveDraft} onCancel={onCancelDraft} saving={saving} />
      )}

      {/* Geofence list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {geofences.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center',
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'hsl(var(--muted-fg))',
            lineHeight: 1.7 }}>
            NO GEOFENCES YET<br />
            <span style={{ opacity: 0.6 }}>Draw circle or polygon zones to monitor device movements</span>
          </div>
        ) : geofences.map(gf => (
          <div key={gf._id} style={{
            padding: '11px 14px', borderBottom: '1px solid hsl(var(--border))',
            borderLeft: `3px solid ${gf.active ? gf.color : 'transparent'}`,
            opacity: gf.active ? 1 : 0.5,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: gf.type === 'circle' ? '50%' : '1px',
                  background: gf.color, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, fontWeight: 500, color: 'hsl(var(--fg))' }}>{gf.name}</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => onToggle(gf._id)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                  color: gf.active ? gf.color : 'hsl(var(--muted-fg))', display: 'flex',
                }}>
                  {gf.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                </button>
                <button onClick={() => onDelete(gf._id)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                  color: 'hsl(var(--muted-fg))', display: 'flex',
                }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'hsl(var(--muted-fg))',
              display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ textTransform: 'capitalize' }}>{gf.type}</span>
              {gf.type === 'circle' && gf.radius && (
                <>
                  <span style={{ opacity: 0.4 }}>·</span>
                  <span>{gf.radius >= 1000 ? `${(gf.radius / 1000).toFixed(1)}km` : `${gf.radius}m`}</span>
                </>
              )}
              {gf.type === 'polygon' && gf.coordinates && (
                <>
                  <span style={{ opacity: 0.4 }}>·</span>
                  <span>{gf.coordinates.length} pts</span>
                </>
              )}
              <span style={{ opacity: 0.4 }}>·</span>
              <span>
                {[gf.alertOnEnter && 'enter', gf.alertOnExit && 'exit'].filter(Boolean).join(' + ') || 'no alerts'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   StatusTag (sidebar)
═══════════════════════════════════════════════════════════ */
function StatusTag({ status }: { status: string }) {
  const tagClass: Record<string, string> = {
    online: 'tag tag-online', offline: 'tag tag-offline',
    idle: 'tag tag-warn', error: 'tag tag-error',
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

/* ═══════════════════════════════════════════════════════════
   NoApiKey
═══════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════
   MapPage
═══════════════════════════════════════════════════════════ */
export function MapPage() {
  const qc = useQueryClient();

  // Device selection + filters
  const [selectedId, setSelectedId]       = useState<string | null>(null);
  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState<string>('all');
  const [rightTab, setRightTab]           = useState<RightTab>('devices');

  // Trajectory
  const [trajEnabled, setTrajEnabled]     = useState(false);
  const [trajColor, setTrajColor]         = useState(TRAJ_COLORS[0]);
  const [trajRangeMs, setTrajRangeMs]     = useState(RANGES[2].ms);

  // Geofence overlay
  const [gfVisible, setGfVisible]         = useState(true);

  // Draw mode
  const [drawType, setDrawType]           = useState<DrawType | null>(null);
  const [drawPts, setDrawPts]             = useState(0);
  const [drawDraft, setDrawDraft]         = useState<DrawResult | null>(null);
  const drawCompleteRef                   = useRef<() => void>(() => {});

  // Devices query
  const { data, isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: () => devicesApi.list(),
  });

  // Geofences query
  const { data: gfData } = useQuery({
    queryKey: ['geofences'],
    queryFn: () => geofenceApi.list(),
    staleTime: 30_000,
  });
  const geofences = gfData ?? [];

  // Mutations
  const createGf = useMutation({
    mutationFn: (d: Parameters<typeof geofenceApi.create>[0]) => geofenceApi.create(d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['geofences'] }),
  });

  const toggleGf = useMutation({
    mutationFn: (id: string) => geofenceApi.toggle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['geofences'] }),
  });

  const deleteGf = useMutation({
    mutationFn: (id: string) => geofenceApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['geofences'] }),
  });

  const devices  = (data?.devices ?? []) as unknown as RichDevice[];
  const located  = useMemo(() => devices.filter(d => d.location?.lat && d.location?.lng), [devices]);

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

  const hasTrackers      = useMemo(() => located.some(d => d.category === 'tracker'), [located]);
  const selectedIsTracker = selectedDevice?.category === 'tracker';

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

  const handleStartDraw = (type: DrawType) => {
    setDrawType(type);
    setDrawPts(0);
    setDrawDraft(null);
    setRightTab('geofences');
  };

  const handleDrawComplete = (result: DrawResult) => {
    setDrawType(null);
    setDrawDraft(result);
  };

  const handleCancelDraw = () => {
    setDrawType(null);
    setDrawPts(0);
    setDrawDraft(null);
  };

  const handleSaveDraft = async (
    data: Omit<Geofence, '_id' | 'orgId' | 'createdAt' | 'updatedAt'>
  ) => {
    await createGf.mutateAsync(data);
    setDrawDraft(null);
  };

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

            <TrajectoryLayer
              deviceId={selectedId}
              enabled={trajEnabled && selectedIsTracker}
              color={trajColor}
              rangeMs={trajRangeMs}
            />

            <GeofenceLayer geofences={geofences} visible={gfVisible} />

            <DrawLayer
              drawType={drawType}
              color={GF_COLORS[1]}
              defaultRadius={500}
              onComplete={handleDrawComplete}
              onCancel={handleCancelDraw}
              onPtAdded={setDrawPts}
              completeRef={drawCompleteRef}
            />

            {located.map(device => {
              const id         = device._id ?? device.id;
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

        {/* Floating controls — only shown when tracker devices exist */}
        {hasTrackers && (
          <MapControls
            selectedIsTracker={selectedIsTracker}
            trajEnabled={trajEnabled}   setTrajEnabled={setTrajEnabled}
            trajColor={trajColor}       setTrajColor={setTrajColor}
            trajRangeMs={trajRangeMs}   setTrajRangeMs={setTrajRangeMs}
            gfVisible={gfVisible}       setGfVisible={setGfVisible}
          />
        )}

        {/* Draw banner */}
        {drawType && !drawDraft && (
          <DrawBanner
            drawType={drawType} pts={drawPts}
            onDone={() => drawCompleteRef.current()}
            onCancel={handleCancelDraw}
          />
        )}

        {/* Device detail card */}
        {selectedDevice && !drawType && (
          <DeviceCard device={selectedDevice} onClose={() => setSelectedId(null)} />
        )}
      </div>

      {/* ── Right panel ── */}
      <div style={{ display: 'flex', flexDirection: 'column', background: 'hsl(var(--bg))', borderLeft: '1px solid hsl(var(--border))', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid hsl(var(--border))' }}>
          <div className="eyebrow" style={{ marginBottom: '12px' }}>Geography · Device map</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '34px', padding: '0 10px', border: '1px solid hsl(var(--border))', background: 'hsl(var(--surface))', marginBottom: '10px' }}>
            <Search size={13} style={{ color: 'hsl(var(--muted-fg))', flexShrink: 0 }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search devices…"
              style={{ border: 0, outline: 0, background: 'transparent', color: 'hsl(var(--fg))', fontFamily: 'var(--font-sans)', fontSize: '13px', width: '100%' }} />
          </div>
          {/* Tabs — Geofences tab only shown when tracker devices are present */}
          <div style={{ display: 'flex', gap: 0, border: '1px solid hsl(var(--border))' }}>
            {(['devices', ...(hasTrackers ? ['geofences'] : [])] as RightTab[]).map((tab, i) => (
              <button key={tab} onClick={() => setRightTab(tab)} style={{
                flex: 1, padding: '6px 0',
                background: rightTab === tab ? 'hsl(var(--surface-raised))' : 'transparent',
                color: rightTab === tab ? 'hsl(var(--fg))' : 'hsl(var(--muted-fg))',
                border: 0,
                borderLeft: i > 0 ? '1px solid hsl(var(--border))' : 0,
                fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.12em',
                textTransform: 'uppercase', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}>
                {tab === 'devices' ? <><ChevronRight size={10} />DEVICES</> : <><Shield size={10} />GEOFENCES</>}
                {tab === 'geofences' && geofences.length > 0 && (
                  <span style={{ background: '#3B82F6', color: '#fff', borderRadius: '50%',
                    width: 14, height: 14, fontSize: 8, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontWeight: 700 }}>
                    {geofences.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {rightTab === 'devices' && (
          <>
            {/* Status filter */}
            <div style={{ padding: '10px 20px', borderBottom: '1px solid hsl(var(--border))' }}>
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
                  const id          = device._id ?? device.id;
                  const hasLocation = !!(device.location?.lat && device.location?.lng);
                  const isSelected  = selectedId === id;
                  const catColor    = CAT_COLOR[device.category] ?? '#FF5B1F';
                  return (
                    <div key={id}
                      onClick={() => { if (hasLocation) setSelectedId(isSelected ? null : id); }}
                      style={{
                        padding: '11px 20px', borderBottom: '1px solid hsl(var(--border))',
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
          </>
        )}

        {rightTab === 'geofences' && (
          <GeofencesPanel
            geofences={geofences}
            onToggle={id => toggleGf.mutate(id)}
            onDelete={id => deleteGf.mutate(id)}
            onStartDraw={handleStartDraw}
            drawMode={!!drawType}
            drawDraft={drawDraft}
            onSaveDraft={handleSaveDraft}
            onCancelDraft={handleCancelDraw}
            saving={createGf.isPending}
          />
        )}

        <div style={{ padding: '10px 20px', borderTop: '1px solid hsl(var(--border))', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'hsl(var(--muted-fg))', display: 'flex', justifyContent: 'space-between' }}>
          <span>{located.length} of {devices.length} located</span>
          {selectedDevice && <span style={{ color: CAT_COLOR[selectedDevice.category] ?? 'hsl(var(--primary))' }}>1 selected</span>}
        </div>
      </div>
    </div>
  );
}
