import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Plus, Trash2, Check, Loader2, MapPin,
  LineChart, AreaChart, BarChart2, Gauge, ScatterChart, Thermometer, Settings2,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { devicesApi } from '@/api/devices';
import type { DeviceCategory, DeviceProtocol, DevicePayloadFormat } from '@orion/shared';
import toast from 'react-hot-toast';
import { LineChart as CustomLineChart, Sparkline } from '@/components/charts/Charts';
import { formatPayloadStr } from '@/lib/utils';

/* ─── Types ─────────────────────────────────────────────────────── */
export interface DataField {
  key: string;
  label: string;
  type: 'number' | 'string' | 'boolean' | 'location' | 'timestamp';
  unit?: string;
  chartable?: boolean;
  chartType?: 'line' | 'area' | 'bar' | 'gauge' | 'scatter' | 'level';
  chartColor?: string;
}

interface Command {
  name: string;
  ctype: 'boolean' | 'number' | 'enum' | 'action';
  label: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  def?: boolean | number;
  values?: string;
}

type Step = 1 | 2 | 3 | 4 | 5;

const EMPTY_FIELD = (): DataField => ({
  key: '', label: '', type: 'number', unit: '',
  chartable: true, chartType: 'line', chartColor: '#FF6A30',
});

const EMPTY_COMMAND = (): Command => ({
  name: '', ctype: 'boolean', label: '', def: false,
});

/* ─── Constants ──────────────────────────────────────────────────── */
const CATEGORIES: {
  value: DeviceCategory; label: string; color: string;
}[] = [
  { value: 'environmental', label: 'Environmental', color: '#10b981' },
  { value: 'industrial', label: 'Industrial', color: '#ef4444' },
  { value: 'energy', label: 'Energy', color: '#f59e0b' },
  { value: 'water', label: 'Water', color: '#0ea5e9' },
  { value: 'tracker', label: 'Tracker', color: '#6366f1' },
  { value: 'gateway', label: 'Gateway', color: '#06b6d4' },
  { value: 'research', label: 'Research', color: '#a855f7' },
  { value: 'custom', label: 'Custom', color: '#FF6A30' },
];

const PROTOCOLS: { value: DeviceProtocol; label: string }[] = [
  { value: 'http', label: 'HTTP/S' },
  { value: 'mqtt', label: 'MQTT' },
  { value: 'websocket', label: 'WebSocket' },
  { value: 'coap', label: 'CoAP' },
  { value: 'tcp', label: 'TCP' },
  { value: 'custom', label: 'Custom' },
];

const CHART_TYPES: { value: DataField['chartType']; label: string; Icon: React.FC<any> }[] = [
  { value: 'line',    label: 'Line',    Icon: LineChart    },
  { value: 'area',    label: 'Area',    Icon: AreaChart    },
  { value: 'bar',     label: 'Bar',     Icon: BarChart2    },
  { value: 'gauge',   label: 'Gauge',   Icon: Gauge        },
  { value: 'scatter', label: 'Scatter', Icon: ScatterChart },
  { value: 'level',   label: 'Level',   Icon: Thermometer  },
];

const CHART_COLORS = ['#FF6A30','#5B8DEF','#22C55E','#F59E0B','#8B5CF6','#06B6D4','#F43F5E','#0ea5e9'];

const UNIT_SUGGESTIONS = [
  '°C','°F','K','%','ppm','ppb','pH',
  'V','mV','A','mA','W','kW','kWh','MWh',
  'm/s','km/h','mph','m','cm','mm','km','ft','in',
  'L','mL','m³','g','kg','lb','t',
  'kPa','Pa','bar','hPa','atm','psi',
  'rpm','Hz','kHz','MHz','lux','dB','°','rad',
  'bpm','mmHg','mg/dL',
];

/* ─── ComboInput: styled suggestion dropdown (replaces datalist) ─── */
function ComboInput({
  value, onChange, suggestions, placeholder, className, style,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const filtered = value
    ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()))
    : suggestions;

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
        placeholder={placeholder}
        className={className}
        style={style}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
          background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))',
          maxHeight: 192, overflowY: 'auto',
        }}>
          {filtered.slice(0, 12).map(s => (
            <div
              key={s}
              onMouseDown={e => { e.preventDefault(); onChange(s); setOpen(false); }}
              style={{
                padding: '6px 10px', fontSize: 11, fontFamily: 'var(--font-mono)',
                cursor: 'pointer', height: 32, display: 'flex', alignItems: 'center',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'hsl(var(--surface-raised))')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────── */
function inferType(value: unknown): DataField['type'] {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return 'timestamp';
  return 'string';
}

function parseJsonToFields(raw: string): DataField[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return Object.entries(parsed).map(([key, value], idx) => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1).replace(/[_-]/g, ' '),
      type: inferType(value),
      unit: '',
      chartable: inferType(value) === 'number',
      chartType: 'line' as const,
      chartColor: CHART_COLORS[idx % CHART_COLORS.length],
    }));
  } catch {
    return null;
  }
}

function genPayload(fields: DataField[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  fields.filter(f => f.key).forEach(f => {
    if (f.type === 'number') obj[f.key] = 0;
    else if (f.type === 'boolean') obj[f.key] = false;
    else if (f.type === 'timestamp') obj[f.key] = new Date().toISOString();
    else obj[f.key] = '';
  });
  return obj;
}

/* ─── Step indicator ──────────────────────────────────────────────── */
function Steps({ current }: { current: Step }) {
  const STEPS: { n: Step; label: string }[] = [
    { n: 1, label: 'Identity' },
    { n: 2, label: 'Data Fields' },
    { n: 3, label: 'Commands' },
    { n: 4, label: 'Location' },
    { n: 5, label: 'Review' },
  ];

  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map(({ n, label }, i) => (
        <div key={n} className="flex items-center flex-1">
          <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
            <div className={`w-8 h-8 flex items-center justify-center text-[11px] font-semibold transition-all ${
              current > n ? 'bg-primary text-white'
              : current === n ? 'bg-primary text-white ring-4 ring-primary/30'
              : 'bg-muted text-muted-foreground border border-[hsl(var(--rule))]'
            }`}>
              {current > n ? <Check size={14} strokeWidth={3} /> : n}
            </div>
            <span className={`text-[9px] whitespace-nowrap font-mono text-center ${current >= n ? 'text-foreground' : 'text-muted-foreground'}`}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-px mx-2 mb-6 transition-colors ${current > n ? 'bg-primary' : 'bg-[hsl(var(--rule))]'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Graph preview component ────────────────────────────────────────── */
function GraphPreview({ field, compact }: { field: DataField; compact?: boolean }) {
  const vals = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => 30 + Math.sin(i / 3) * 18 + Math.cos(i / 2) * 8),
    []
  );

  if (field.type !== 'number') {
    return (
      <div className="border border-[hsl(var(--rule))] p-4 text-center bg-muted/20">
        <p className="text-[11px] text-muted-foreground">
          Visualization for <strong className="text-foreground">number</strong> fields only.
        </p>
      </div>
    );
  }

  const h = compact ? 40 : 60;
  const c = field.chartColor || '#FF6A30';
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const xyPts = vals.map((v, i) => ({ x: (i / (vals.length - 1)) * 100, y: ((max - v) / range) * (h - 4) + 2 }));

  // Catmull-Rom smooth curve
  const T = 0.4;
  const buildSmooth = (points: {x:number;y:number}[]) => {
    let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      const p0 = points[Math.max(0,i-2)], p1 = points[i-1], p2 = points[i], p3 = points[Math.min(points.length-1,i+1)];
      d += ` C ${(p1.x+(p2.x-p0.x)*T).toFixed(1)},${(p1.y+(p2.y-p0.y)*T).toFixed(1)} ${(p2.x-(p3.x-p1.x)*T).toFixed(1)},${(p2.y-(p3.y-p1.y)*T).toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  };
  const linePath = buildSmooth(xyPts);
  const areaPath = `${linePath} L ${xyPts[xyPts.length-1].x.toFixed(1)},${h} L 0,${h} Z`;

  const preview = (() => {
    switch (field.chartType) {
      case 'area':
        return (
          <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h, display: 'block' }}>
            <path d={areaPath} fill={c} fillOpacity="0.18" />
            <path d={linePath} fill="none" stroke={c} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
        );
      case 'bar':
        return (
          <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h, display: 'block' }}>
            {vals.map((v, i) => {
              const bh = ((v - min) / range) * (h - 4);
              return <rect key={i} x={i * (100 / vals.length) + 0.5} y={h - bh} width={100 / vals.length - 1} height={bh} fill={c} fillOpacity={0.75} />;
            })}
          </svg>
        );
      case 'gauge': {
        const pct = 0.65;
        const r = 38, cx = 50, cy = 52;
        const startAngle = Math.PI, endAngle = 2 * Math.PI;
        const angle = startAngle + pct * (endAngle - startAngle);
        const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
        const x2 = cx + r * Math.cos(angle), y2 = cy + r * Math.sin(angle);
        const nx = cx + 28 * Math.cos(angle), ny = cy + 28 * Math.sin(angle);
        return (
          <svg viewBox="0 0 100 60" style={{ width: '100%', height: h, display: 'block' }}>
            <path d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
            <path d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`} fill="none" stroke={c} strokeWidth="6" />
            <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx={cx} cy={cy} r="3" fill="white" />
          </svg>
        );
      }
      case 'scatter':
        return (
          <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h, display: 'block' }}>
            {vals.map((v, i) => {
              const cx = (i / (vals.length - 1)) * 96 + 2;
              const cy = ((max - v) / range) * (h - 4) + 2;
              return <circle key={i} cx={cx} cy={cy} r="2" fill={c} fillOpacity={0.8} />;
            })}
          </svg>
        );
      case 'level': {
        const fillPct = 0.65;
        const tankH = h - 4, tankY = 2, tankX = 34, tankW = 32;
        const fillH = tankH * fillPct;
        const fillY = tankY + tankH - fillH;
        const marks = [0.25, 0.5, 0.75];
        return (
          <svg viewBox={`0 0 100 ${h}`} style={{ width: '100%', height: h, display: 'block' }}>
            {marks.map(m => (
              <line key={m} x1={tankX} y1={tankY + tankH * (1 - m)} x2={tankX + tankW} y2={tankY + tankH * (1 - m)}
                stroke="rgba(255,255,255,0.12)" strokeWidth="0.8" strokeDasharray="2,2" />
            ))}
            <rect x={tankX} y={fillY} width={tankW} height={fillH} fill={c} fillOpacity="0.75" rx="1" />
            <rect x={tankX} y={tankY} width={tankW} height={tankH} fill="none" stroke={c} strokeWidth="1.5" rx="2" strokeOpacity="0.6" />
            <text x={tankX + tankW / 2} y={tankY + tankH / 2 + 4} textAnchor="middle" fill="white" fontSize="9" fontFamily="monospace">
              {Math.round(fillPct * 100)}%
            </text>
          </svg>
        );
      }
      default: // line
        return (
          <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h, display: 'block' }}>
            <path d={linePath} fill="none" stroke={c} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
        );
    }
  })();

  return (
    <div className="border border-[hsl(var(--rule))] p-3 bg-muted/20">
      {!compact && <p className="eyebrow text-[9px] mb-2">Preview — {field.chartType}</p>}
      {preview}
    </div>
  );
}

/* ─── Command preview ────────────────────────────────────────────────── */
function CommandPreview({ cmd, payloadFormat = 'json' }: { cmd: Command; payloadFormat?: string }) {
  const [bv, setBv] = useState(cmd.def as boolean ?? false);
  const [nv, setNv] = useState(cmd.def as number ?? 0);
  const [ev, setEv] = useState((cmd.values || '').split(',')[0] || '');
  const [pressed, setPressed] = useState(false);

  const previewStr = cmd.name
    ? formatPayloadStr(
        { [cmd.name]: cmd.ctype === 'boolean' ? bv : cmd.ctype === 'number' ? nv : cmd.ctype === 'enum' ? ev || 'option' : cmd.ctype === 'action' ? null : '' },
        payloadFormat
      )
    : null;

  const PreviewLine = () => previewStr ? (
    <div style={{ marginTop: 10, borderTop: '1px solid hsl(var(--rule-ghost))', paddingTop: 8 }}>
      <span style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'hsl(var(--primary))', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 4 }}>
        {payloadFormat.toUpperCase()} payload
      </span>
      <pre style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'hsl(var(--muted-fg))', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{previewStr}</pre>
    </div>
  ) : null;

  if (cmd.ctype === 'boolean') {
    return (
      <motion.div layout className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[13px]">{cmd.label || cmd.name}</span>
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-mono ${bv ? 'text-green-500' : 'text-muted-foreground'}`}>
              {bv ? 'ON' : 'OFF'}
            </span>
            <label className="switch">
              <input type="checkbox" checked={bv} onChange={e => setBv(e.target.checked)} />
              <span />
            </label>
          </div>
        </div>
        <PreviewLine />
      </motion.div>
    );
  }

  if (cmd.ctype === 'number') {
    const min = cmd.min ?? 0, max = cmd.max ?? 100, step = cmd.step ?? 1;
    const pct = ((nv - min) / (max - min || 1)) * 100;
    return (
      <motion.div layout className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px]">{cmd.label || cmd.name}</span>
          <span className="font-mono text-[14px] text-primary font-semibold">
            {(+nv).toFixed(step < 1 ? 2 : 0)}{cmd.unit || ''}
          </span>
        </div>
        <div className="space-y-1.5">
          <div style={{
            position: 'relative',
            height: '6px',
            background: 'hsl(var(--muted))',
            overflow: 'hidden'
          }}>
            <motion.div
              layout
              style={{
                position: 'absolute',
                inset: 0,
                width: `${pct}%`,
                background: 'hsl(var(--primary))',
              }}
              transition={{ duration: 0.2 }}
            />
          </div>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={nv}
            onChange={e => setNv(+e.target.value)}
            className="w-full h-6 cursor-pointer"
            style={{ accentColor: 'hsl(var(--primary))' }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
          <span>{min}{cmd.unit || ''}</span>
          <span>{max}{cmd.unit || ''}</span>
        </div>
        <PreviewLine />
      </motion.div>
    );
  }

  if (cmd.ctype === 'enum') {
    const vals = (cmd.values || '').split(',').map(s => s.trim()).filter(Boolean);
    return (
      <motion.div layout className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[13px]">{cmd.label || cmd.name}</span>
          <select
            value={ev}
            onChange={e => setEv(e.target.value)}
            className="select text-[12px] w-40"
          >
            {vals.map(v => <option key={v}>{v}</option>)}
            {vals.length === 0 && <option>(define values)</option>}
          </select>
        </div>
        <PreviewLine />
      </motion.div>
    );
  }

  // action
  return (
    <motion.div layout className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px]">{cmd.label || cmd.name}</span>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => { setPressed(true); setTimeout(() => setPressed(false), 800); }}
          className={`btn btn-sm ${pressed ? 'btn-primary' : 'btn-outline'}`}
        >
          {pressed ? '✓ Sent' : 'Trigger'}
        </motion.button>
      </div>
      <PreviewLine />
    </motion.div>
  );
}

/* ─── Google Maps location picker ───────────────────────────────────── */
const GMAPS_KEY_FORM = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ?? '';
const GMAPS_ID_FORM  = (import.meta as any).env?.VITE_GOOGLE_MAP_ID ?? 'DEMO_MAP_ID';

function LocationPicker({ lat, lng, onChange }: {
  lat: number; lng: number;
  onChange: (lat: number, lng: number) => void;
}) {
  const mapRef    = useRef<HTMLDivElement | null>(null);
  const gMapRef   = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);

  const initMap = useCallback((la: number, ln: number) => {
    if (!mapRef.current) return;
    const win = window as any;
    if (!win.google?.maps) return;
    const center = { lat: la || 20, lng: ln || 0 };
    const map = new win.google.maps.Map(mapRef.current, {
      center,
      zoom: la ? 13 : 2,
      mapTypeId: 'satellite',
      mapId: GMAPS_ID_FORM,
      streetViewControl: false,
      mapTypeControl: false,
      gestureHandling: 'cooperative',
    });
    gMapRef.current = map;

    const makeMarker = (pos: { lat: number; lng: number }) => {
      if (markerRef.current) markerRef.current.map = null;
      const el = document.createElement('div');
      el.style.cssText = 'width:14px;height:14px;background:hsl(var(--primary));border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5);cursor:pointer';
      const m = new win.google.maps.marker.AdvancedMarkerElement({ map, position: pos, content: el, gmpDraggable: true });
      m.addListener('dragend', (e: any) => onChange(e.latLng.lat(), e.latLng.lng()));
      markerRef.current = m;
    };

    if (la && ln) makeMarker(center);
    map.addListener('click', (e: any) => {
      const la2 = e.latLng.lat(), ln2 = e.latLng.lng();
      onChange(la2, ln2);
      makeMarker({ lat: la2, lng: ln2 });
    });
  }, [onChange]);

  useEffect(() => {
    if (!GMAPS_KEY_FORM) return;
    const win = window as any;
    if (win.google?.maps) {
      initMap(lat, lng);
    } else {
      const existing = document.querySelector('script[data-gmaps]');
      if (!existing) {
        const script = document.createElement('script');
        script.dataset.gmaps = '1';
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY_FORM}&libraries=marker&callback=__gmapsReadyForm`;
        win.__gmapsReadyForm = () => initMap(lat, lng);
        document.head.appendChild(script);
      } else {
        existing.addEventListener('load', () => initMap(lat, lng));
      }
    }
  }, []); // eslint-disable-line

  const geocodeSearch = useCallback(async () => {
    if (!search.trim() || !GMAPS_KEY_FORM) return;
    setSearching(true);
    try {
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(search)}&key=${GMAPS_KEY_FORM}`);
      const json = await res.json();
      if (json.results?.[0]) {
        const { lat: la, lng: ln } = json.results[0].geometry.location;
        onChange(la, ln);
        if (gMapRef.current) gMapRef.current.setCenter({ lat: la, lng: ln });
        if (gMapRef.current) gMapRef.current.setZoom(13);
        const win = window as any;
        if (markerRef.current) markerRef.current.map = null;
        const el = document.createElement('div');
        el.style.cssText = 'width:14px;height:14px;background:hsl(var(--primary));border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5)';
        markerRef.current = new win.google.maps.marker.AdvancedMarkerElement({ map: gMapRef.current, position: { lat: la, lng: ln }, content: el, gmpDraggable: true });
        markerRef.current.addListener('dragend', (e: any) => onChange(e.latLng.lat(), e.latLng.lng()));
      }
    } catch { /* silent */ }
    finally { setSearching(false); }
  }, [search, onChange]);

  return (
    <div className="space-y-3">
      {GMAPS_KEY_FORM ? (
        <>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') geocodeSearch(); }}
              placeholder="Search location…"
              className="input text-[12px]"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={geocodeSearch}
              disabled={searching}
              className="btn btn-sm btn-ghost"
              style={{ gap: 4 }}
            >
              <MapPin size={12} /> {searching ? '…' : 'Go'}
            </button>
          </div>
          <div ref={mapRef} style={{ height: 260 }} className="border border-[hsl(var(--rule))]" />
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <MapPin size={11} className="text-primary" />
            Search or click the map to place your device
          </p>
        </>
      ) : (
        <p className="text-[12px] text-muted-foreground">
          Add <code className="font-mono text-primary">VITE_GOOGLE_MAPS_API_KEY</code> to enable map picker.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="eyebrow text-[9px] block mb-1.5">Latitude</label>
          <input
            type="number" step="any"
            value={lat || ''}
            onChange={e => onChange(parseFloat(e.target.value) || 0, lng)}
            className="input font-mono text-[12px]"
            placeholder="0.000000"
          />
        </div>
        <div>
          <label className="eyebrow text-[9px] block mb-1.5">Longitude</label>
          <input
            type="number" step="any"
            value={lng || ''}
            onChange={e => onChange(lat, parseFloat(e.target.value) || 0)}
            className="input font-mono text-[12px]"
            placeholder="0.000000"
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────────── */
export function DeviceForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(1);

  // Step 1
  const [name, setName] = useState('');
  const [description, setDesc] = useState('');
  const [category, setCategory] = useState<DeviceCategory>('custom');
  const [serialNumber, setSerial] = useState('');
  const [protocol, setProtocol] = useState<DeviceProtocol>('http');
  const [payloadFormat, setFormat] = useState<DevicePayloadFormat>('json');
  const [tags, setTagsStr] = useState('');
  // Channel config
  const [mqttTopicPrefix, setMqttTopicPrefix] = useState('');
  const [wsDataEvent, setWsDataEvent] = useState('telemetry');
  const [wsCommandEvent] = useState('command');
  const [wsAckEvent] = useState('command_ack');

  // Step 2
  const [fields, setFields] = useState<DataField[]>([EMPTY_FIELD()]);
  const [selectedFieldIdx, setSelIdx] = useState<number | null>(null);
  const [pasteJson, setPasteJson] = useState('');
  const [pasteError, setPasteError] = useState('');

  // Step 3
  const [commands, setCommands] = useState<Command[]>([]);

  // Step 4
  const [lat, setLat] = useState(0);
  const [lng, setLng] = useState(0);

  const updateField = useCallback((i: number, patch: Partial<DataField>) => {
    setFields(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  }, []);

  const addField = () => {
    const newIdx = fields.length;
    setFields(prev => [...prev, EMPTY_FIELD()]);
    setSelIdx(newIdx);
  };

  const removeField = (i: number) => {
    setFields(prev => prev.filter((_, idx) => idx !== i));
    if (selectedFieldIdx === i) setSelIdx(null);
  };

  const updateCommand = useCallback((i: number, patch: Partial<Command>) => {
    setCommands(prev => prev.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  }, []);

  const addCommand = () => {
    setCommands(prev => [...prev, EMPTY_COMMAND()]);
  };

  const removeCommand = (i: number) => {
    setCommands(prev => prev.filter((_, idx) => idx !== i));
  };

  function applyPaste() {
    if (!pasteJson.trim()) { setPasteError('Paste a JSON object first'); return; }
    const result = parseJsonToFields(pasteJson);
    if (!result) { setPasteError('Invalid JSON or not a flat object'); return; }
    setFields(result.length > 0 ? result : [EMPTY_FIELD()]);
    setPasteJson('');
    setPasteError('');
    setSelIdx(0);
    toast.success(`Imported ${result.length} field${result.length !== 1 ? 's' : ''}`);
  }

  const validFields = fields.filter(f => f.key.trim());
  const payload = genPayload(validFields);
  const payloadPreviewStr = validFields.length > 0 ? formatPayloadStr(payload, payloadFormat) : null;

  const mutation = useMutation({
    mutationFn: (input: any) => devicesApi.create(input),
    onSuccess: async (device) => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      toast.success(`Device "${device.name}" created`);
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Failed to create device'),
  });

  function handleSubmit() {
    if (!name.trim()) { toast.error('Device name is required'); return; }
    const devicePayload: any = {
      name: name.trim(),
      description: description.trim() || undefined,
      serialNumber: serialNumber.trim() || undefined,
      category, protocol, payloadFormat,
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      meta: {
        dataSchema: { fields: validFields },
        channelConfig: protocol === 'mqtt'
          ? { topicPrefix: mqttTopicPrefix || serialNumber.trim() || name.trim().toLowerCase().replace(/\s+/g, '_') }
          : protocol === 'websocket'
          ? { dataEvent: wsDataEvent, commandEvent: wsCommandEvent, ackEvent: wsAckEvent }
          : {},
        commands: commands.map(c => ({
          name: c.name,
          type: c.ctype,
          label: c.label,
          ...(c.ctype === 'number' ? { min: c.min, max: c.max, step: c.step, unit: c.unit, default: c.def } : {}),
          ...(c.ctype === 'enum' ? { values: (c.values || '').split(',').map(s => s.trim()).filter(Boolean) } : {}),
          ...(c.ctype === 'boolean' ? { default: c.def } : {}),
        })),
      },
    };
    if (lat && lng) {
      devicePayload.location = { lat, lng, timestamp: new Date().toISOString() };
    }
    mutation.mutate(devicePayload);
  }

  const selectedField = selectedFieldIdx !== null ? fields[selectedFieldIdx] : null;

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-sheet">
        {/* Header */}
        <div className="flex-shrink-0 px-8 py-6 border-b border-[hsl(var(--rule))]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="eyebrow text-[9px] mb-1">Provisioning</p>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', lineHeight: 1, marginTop: 4 }}>
                New <em style={{ color: 'hsl(var(--primary))', fontStyle: 'italic' }}>device</em>.
              </h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          </div>
          <Steps current={step} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex">
          {/* Main form area */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <AnimatePresence mode="wait">
              {/* Step 1: Identity */}
              {step === 1 && (
                <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                  <div className="space-y-3">
                    <div>
                      <label className="eyebrow text-[9px] block mb-1.5">Device Name <span className="text-red-500">*</span></label>
                      <input className="input" placeholder="e.g. Sensor Node #12" value={name} onChange={e => setName(e.target.value)} autoFocus />
                    </div>
                    <div>
                      <label className="eyebrow text-[9px] block mb-1.5">Description</label>
                      <input className="input" placeholder="Optional description" value={description} onChange={e => setDesc(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="eyebrow text-[9px] block mb-1.5">Serial Number</label>
                        <input className="input" placeholder="SN-0001" value={serialNumber} onChange={e => setSerial(e.target.value)} />
                      </div>
                      <div>
                        <label className="eyebrow text-[9px] block mb-1.5">Tags</label>
                        <input className="input" placeholder="prod, outdoor" value={tags} onChange={e => setTagsStr(e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="eyebrow text-[9px] block mb-2">Category</label>
                    <div className="grid grid-cols-4 gap-2">
                      {CATEGORIES.map(c => (
                        <button
                          key={c.value} type="button" onClick={() => setCategory(c.value)}
                          className={`py-2 border text-[10px] font-medium transition-all ${
                            category === c.value ? 'border-primary bg-primary/5 text-primary' : 'border-[hsl(var(--rule))] text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="eyebrow text-[9px] block mb-2">Protocol</label>
                      <div className="flex flex-wrap gap-1.5">
                        {PROTOCOLS.map(p => (
                          <button key={p.value} type="button" onClick={() => setProtocol(p.value)}
                            className={`px-2.5 py-1.5 border text-[10px] font-mono transition-all ${
                              protocol === p.value ? 'border-primary bg-primary/5 text-primary' : 'border-[hsl(var(--rule))] text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="eyebrow text-[9px] block mb-2">Payload Format</label>
                      <select value={payloadFormat} onChange={e => setFormat(e.target.value as DevicePayloadFormat)} className="select">
                        {['json','csv','xml','raw','msgpack','cbor','protobuf','binary','custom'].map(f => (
                          <option key={f} value={f}>{f.toUpperCase()}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* ── Channel configuration ── */}
                  {protocol === 'mqtt' && (
                    <div className="border border-[hsl(var(--rule))] p-3 space-y-3">
                      <p className="eyebrow text-[9px] text-primary">MQTT Channel Config</p>
                      <div>
                        <label className="eyebrow text-[9px] block mb-1.5">Topic prefix <span className="text-muted-foreground font-normal">(defaults to serial number)</span></label>
                        <input
                          className="input font-mono text-[11px]"
                          placeholder={serialNumber || name.toLowerCase().replace(/\s+/g, '_') || 'device_id'}
                          value={mqttTopicPrefix}
                          onChange={e => setMqttTopicPrefix(e.target.value)}
                        />
                      </div>
                      {(() => {
                        const pfx = mqttTopicPrefix || serialNumber || name.toLowerCase().replace(/\s+/g, '_') || 'device';
                        return (
                          <div className="space-y-1.5 text-[10px] font-mono text-muted-foreground">
                            {[
                              { label: 'PUBLISH data', topic: `/${pfx}/data`, color: '#0F7A3D' },
                              { label: 'SUBSCRIBE commands', topic: `/${pfx}/commands`, color: '#0284c7' },
                              { label: 'PUBLISH poll pending', topic: `/${pfx}/commands/pending`, color: '#B45309' },
                              { label: 'PUBLISH ack', topic: `/${pfx}/commands/{commandId}/ack`, color: '#FF5B1F' },
                            ].map(r => (
                              <div key={r.label} className="flex justify-between gap-4">
                                <span style={{ color: r.color }}>{r.label}</span>
                                <code style={{ color: 'hsl(var(--fg))' }}>{r.topic}</code>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {protocol === 'websocket' && (
                    <div className="border border-[hsl(var(--rule))] p-3 space-y-3">
                      <p className="eyebrow text-[9px] text-primary">WebSocket Channel Config</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="eyebrow text-[9px] block mb-1.5">Data event</label>
                          <input className="input font-mono text-[11px]" value={wsDataEvent} onChange={e => setWsDataEvent(e.target.value)} />
                        </div>
                        <div>
                          <label className="eyebrow text-[9px] block mb-1.5">Commands event <span className="text-muted-foreground">(system → device)</span></label>
                          <input value={wsCommandEvent} readOnly className="input font-mono text-[11px] opacity-60 cursor-not-allowed" />
                        </div>
                        <div>
                          <label className="eyebrow text-[9px] block mb-1.5">ACK event <span className="text-muted-foreground">(device → system)</span></label>
                          <input value={wsAckEvent} readOnly className="input font-mono text-[11px] opacity-60 cursor-not-allowed" />
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Include <code className="font-mono">deviceId</code> and <code className="font-mono">apiKey</code> in every emitted payload.</p>
                    </div>
                  )}

                  {protocol === 'http' && (
                    <div className="border border-[hsl(var(--rule))] p-3 space-y-1.5 text-[10px] font-mono text-muted-foreground">
                      <p className="eyebrow text-[9px] text-primary mb-2">HTTP Endpoints</p>
                      <div><span className="text-[#0F7A3D]">POST</span> /telemetry/ingest — send data (api_key in body)</div>
                      <div><span className="text-[#0284c7]">GET </span> /commands/pending?apiKey=… — poll for commands</div>
                      <div><span className="text-[#FF5B1F]">POST</span> /commands/&#123;id&#125;/ack — acknowledge execution</div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Step 2: Data Fields */}
              {step === 2 && (
                <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-semibold">Define your data fields</p>
                      <p className="text-[11px] text-muted-foreground mt-1">Fields power dashboards, alerts, and controls.</p>
                    </div>
                    <button type="button" onClick={() => setPasteJson('')} className="btn btn-secondary btn-sm">
                      Paste JSON
                    </button>
                  </div>

                  {pasteJson === '' ? (
                    <div className="space-y-3">
                      {/* Fields list */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="eyebrow text-[9px]">Fields ({validFields.length})</p>
                          <button onClick={addField} className="text-[11px] text-primary hover:underline flex items-center gap-1">
                            <Plus size={11} /> Add
                          </button>
                        </div>
                        <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
                          {fields.map((field, i) => (
                            <motion.div
                              key={i}
                              layout
                              className={`border p-2.5 space-y-1.5 transition-all ${
                                selectedFieldIdx === i ? 'border-primary/40 bg-primary/[0.025]' : 'border-[hsl(var(--rule))]'
                              }`}
                            >
                              {/* Row 1: Label + trash + graph expand */}
                              <div className="flex items-center gap-1.5">
                                <input
                                  className="input text-[10px] !h-7 flex-1"
                                  placeholder="Display label"
                                  value={field.label}
                                  onChange={e => updateField(i, { label: e.target.value })}
                                />
                                {field.type === 'number' && (
                                  <button
                                    title="Graph settings"
                                    onClick={e => { e.stopPropagation(); setSelIdx(selectedFieldIdx === i ? null : i); }}
                                    className={`w-7 h-7 flex items-center justify-center flex-shrink-0 border transition-all ${
                                      selectedFieldIdx === i
                                        ? 'border-primary text-primary bg-primary/5'
                                        : 'border-[hsl(var(--rule))] text-muted-foreground hover:text-foreground hover:border-foreground/30'
                                    }`}
                                  >
                                    <Settings2 size={11} />
                                  </button>
                                )}
                                <button
                                  onClick={e => { e.stopPropagation(); removeField(i); }}
                                  className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-red-500 flex-shrink-0"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                              {/* Row 2: Key + Type + Unit */}
                              <div className="grid grid-cols-5 gap-1">
                                <input
                                  className="input text-[10px] !h-7 font-mono col-span-2"
                                  placeholder="field_key"
                                  value={field.key}
                                  onChange={e => updateField(i, { key: e.target.value })}
                                />
                                <select className="select text-[10px] !h-7" value={field.type}
                                  onChange={e => updateField(i, { type: e.target.value as DataField['type'] })}>
                                  <option value="number">Number</option>
                                  <option value="string">Text</option>
                                  <option value="boolean">Bool</option>
                                </select>
                                <div className="col-span-2">
                                  <ComboInput
                                    className="input text-[10px] !h-7 w-full"
                                    placeholder="Unit (°C, %, …)"
                                    value={field.unit ?? ''}
                                    onChange={v => updateField(i, { unit: v })}
                                    suggestions={UNIT_SUGGESTIONS}
                                  />
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </div>

                      {/* Visualization */}
                      {selectedField && (
                        <div className="border-t border-[hsl(var(--rule))] pt-4 mt-4 space-y-3">
                          <p className="eyebrow text-[9px]">Visualization — {selectedField.label || selectedField.key}</p>
                          {selectedField.type === 'number' ? (
                            <>
                              <div className="space-y-2">
                                <div className="flex gap-1">
                                  {CHART_TYPES.map(({ value, label, Icon }) => (
                                    <button key={value} type="button"
                                      onClick={() => updateField(selectedFieldIdx!, { chartType: value })}
                                      className={`flex-1 flex flex-col items-center gap-1 py-1.5 border text-[10px] font-medium transition-all ${
                                        selectedField.chartType === value
                                          ? 'border-primary bg-primary/5 text-primary'
                                          : 'border-[hsl(var(--rule))] text-muted-foreground hover:text-foreground'
                                      }`}
                                    >
                                      <Icon size={12} />
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div>
                                <p className="eyebrow text-[9px] mb-2">Color</p>
                                <div className="flex flex-wrap gap-1">
                                  {CHART_COLORS.map(c => (
                                    <button key={c} type="button"
                                      onClick={() => updateField(selectedFieldIdx!, { chartColor: c })}
                                      style={{ backgroundColor: c, borderRadius: '50%' }}
                                      className={`w-5 h-5 transition-all flex-shrink-0 ${selectedField.chartColor === c ? 'ring-2 ring-offset-1 ring-foreground/50 scale-110' : 'hover:scale-105'}`}
                                    />
                                  ))}
                                  <input
                                    type="color"
                                    value={selectedField.chartColor ?? '#FF6A30'}
                                    onChange={e => updateField(selectedFieldIdx!, { chartColor: e.target.value })}
                                    className="w-5 h-5 cursor-pointer border border-[hsl(var(--rule))]"
                                    style={{ borderRadius: '50%', padding: 0, overflow: 'hidden' }}
                                  />
                                </div>
                              </div>

                              <GraphPreview field={selectedField} />
                            </>
                          ) : (
                            <div className="border border-[hsl(var(--rule))] p-4 text-center bg-muted/20">
                              <p className="text-[11px] text-muted-foreground">
                                Visualization available for <strong>number</strong> fields only.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <textarea
                        autoFocus value={pasteJson}
                        onChange={e => { setPasteJson(e.target.value); setPasteError(''); }}
                        rows={8} className="textarea font-mono text-[11px]"
                        placeholder={'{\n  "temperature": 23.5,\n  "humidity": 78\n}'}
                      />
                      {pasteError && (
                        <p className="text-[11px] text-red-500 flex items-center gap-1">
                          ⚠ {pasteError}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button onClick={applyPaste} className="btn btn-primary btn-sm">Import fields</button>
                        <button onClick={() => setPasteJson('')} className="btn btn-secondary btn-sm">Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* JSON Payload - BELOW */}
                  <div className="border-t border-[hsl(var(--rule))] pt-4 mt-6">
                    <div className="flex items-center justify-between mb-2">
                      <p className="eyebrow text-[9px]">Payload preview · <span className="text-primary">{payloadFormat.toUpperCase()}</span></p>
                      <button
                        onClick={() => { const s = validFields.length > 0 ? formatPayloadStr(payload, payloadFormat) : ''; if (s) { navigator.clipboard.writeText(s); toast.success('Copied!'); } }}
                        className="text-[10px] text-primary hover:underline flex items-center gap-1"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="p-3 bg-muted/30 border border-[hsl(var(--rule))] text-[11px] font-mono text-foreground/80 overflow-x-auto max-h-[140px] leading-relaxed">
                      {validFields.length > 0 ? formatPayloadStr(payload, payloadFormat) : `// Add fields above`}
                    </pre>
                  </div>
                </motion.div>
              )}

              {/* Step 3: Commands */}
              {step === 3 && (
                <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-semibold">Device controls</p>
                      <p className="text-[11px] text-muted-foreground mt-1">Define commands and controls for remote device operation.</p>
                    </div>
                    <button onClick={addCommand} className="btn btn-primary btn-sm gap-1">
                      <Plus size={12} /> Add
                    </button>
                  </div>

                  <AnimatePresence mode="popLayout">
                    <div className="space-y-4">
                      {commands.map((cmd, i) => (
                        <motion.div
                          key={i}
                          layout
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          className="border border-[hsl(var(--rule))] p-4 space-y-3"
                        >
                          <div className="flex items-start gap-2">
                            <input className="input text-[11px] flex-1 font-mono" placeholder="command_name"
                              value={cmd.name} onChange={e => updateCommand(i, { name: e.target.value })} />
                            <select className="select text-[11px] w-32" value={cmd.ctype}
                              onChange={e => updateCommand(i, { ctype: e.target.value as Command['ctype'] })}>
                              <option value="boolean">Toggle</option>
                              <option value="number">Slider</option>
                              <option value="enum">Dropdown</option>
                              <option value="action">Button</option>
                            </select>
                            <button onClick={() => removeCommand(i)} className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-red-500">
                              <Trash2 size={12} />
                            </button>
                          </div>

                          <input className="input text-[11px]" placeholder="Display label"
                            value={cmd.label} onChange={e => updateCommand(i, { label: e.target.value })} />

                          {cmd.ctype === 'number' && (
                            <div className="grid grid-cols-5 gap-2">
                              <div>
                                <label className="eyebrow text-[8px] block mb-1">Min</label>
                                <input className="input text-[11px] !h-7" type="number" value={cmd.min ?? 0}
                                  onChange={e => updateCommand(i, { min: +e.target.value })} />
                              </div>
                              <div>
                                <label className="eyebrow text-[8px] block mb-1">Max</label>
                                <input className="input text-[11px] !h-7" type="number" value={cmd.max ?? 100}
                                  onChange={e => updateCommand(i, { max: +e.target.value })} />
                              </div>
                              <div>
                                <label className="eyebrow text-[8px] block mb-1">Step</label>
                                <input className="input text-[11px] !h-7" type="number" step="0.1" value={cmd.step ?? 1}
                                  onChange={e => updateCommand(i, { step: +e.target.value })} />
                              </div>
                              <div>
                                <label className="eyebrow text-[8px] block mb-1">Unit</label>
                                <input className="input text-[11px] !h-7" value={cmd.unit ?? ''}
                                  onChange={e => updateCommand(i, { unit: e.target.value })} />
                              </div>
                              <div>
                                <label className="eyebrow text-[8px] block mb-1">Default</label>
                                <input className="input text-[11px] !h-7" type="number" value={typeof cmd.def === 'number' ? cmd.def : 0}
                                  onChange={e => updateCommand(i, { def: +e.target.value })} />
                              </div>
                            </div>
                          )}

                          {cmd.ctype === 'enum' && (
                            <input className="input text-[11px]" placeholder="low, medium, high"
                              value={cmd.values ?? ''} onChange={e => updateCommand(i, { values: e.target.value })} />
                          )}

                          {cmd.ctype === 'boolean' && (
                            <div>
                              <label className="eyebrow text-[9px] block mb-2">Default state</label>
                              <label className="switch">
                                <input type="checkbox" checked={cmd.def as boolean ?? false}
                                  onChange={e => updateCommand(i, { def: e.target.checked })} />
                                <span />
                              </label>
                            </div>
                          )}

                          {/* Preview */}
                          <div className="bg-muted/30 border border-dashed border-[hsl(var(--rule))] p-3 mt-3">
                            <p className="eyebrow text-[8px] mb-3">Preview</p>
                            <CommandPreview key={`${i}-${cmd.ctype}`} cmd={cmd} payloadFormat={payloadFormat} />
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </AnimatePresence>

                  {commands.length === 0 && (
                    <div className="border-2 border-dashed border-[hsl(var(--rule))] p-8 text-center">
                      <p className="text-[12px] text-muted-foreground">No commands defined yet</p>
                      <p className="text-[11px] text-muted-foreground mt-1">Add commands to enable remote device control</p>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Step 4: Location */}
              {step === 4 && (
                <motion.div key="s4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                  <div>
                    <p className="text-[13px] font-semibold">Device location</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Pin your device on a satellite map.</p>
                  </div>
                  <LocationPicker lat={lat} lng={lng} onChange={(la, ln) => { setLat(la); setLng(ln); }} />
                </motion.div>
              )}

              {/* Step 5: Review */}
              {step === 5 && (
                <motion.div key="s5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                  <div>
                    <p className="text-[13px] font-semibold">Review & provision</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Everything looks good?</p>
                  </div>

                  {/* Identity */}
                  <div className="border border-[hsl(var(--rule))] p-4">
                    <p className="eyebrow text-[9px] mb-2">Identity</p>
                    <div className="space-y-1 text-[12px]">
                      <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-mono">{name}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Category</span><span className="capitalize">{category}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Protocol</span><span className="font-mono">{protocol}</span></div>
                    </div>
                  </div>

                  {/* Fields with graph previews */}
                  {validFields.length > 0 && (
                    <div className="border border-[hsl(var(--rule))] p-4">
                      <p className="eyebrow text-[9px] mb-3">Data fields · {validFields.length}</p>
                      <div className="space-y-3">
                        {validFields.map(f => (
                          <div key={f.key}>
                            <div className="flex items-center justify-between text-[12px] mb-1.5">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 flex-shrink-0" style={{ backgroundColor: f.chartColor }} />
                                <span className="font-mono">{f.key}</span>
                                {f.unit && <span className="text-muted-foreground text-[10px]">{f.unit}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground text-[10px]">{f.type}</span>
                                {f.type === 'number' && f.chartType && (
                                  <span className="tag text-[9px]">{f.chartType}</span>
                                )}
                              </div>
                            </div>
                            {f.type === 'number' && <GraphPreview field={f} compact />}
                          </div>
                        ))}
                      </div>
                      {payloadPreviewStr && (
                        <div style={{ marginTop: 16, borderTop: '1px solid hsl(var(--rule))', paddingTop: 12 }}>
                          <span style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'hsl(var(--primary))', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 6 }}>
                            Sample {payloadFormat.toUpperCase()} payload
                          </span>
                          <pre style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'hsl(var(--muted-fg))', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'hsl(var(--muted))', padding: '8px 10px' }}>
                            {payloadPreviewStr}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Commands with widget previews */}
                  {commands.length > 0 && (
                    <div className="border border-[hsl(var(--rule))] p-4">
                      <p className="eyebrow text-[9px] mb-3">Commands · {commands.length}</p>
                      <div className="space-y-4">
                        {commands.map((c, i) => (
                          <div key={i} className="bg-muted/30 border border-dashed border-[hsl(var(--rule))] p-3">
                            <p className="eyebrow text-[8px] mb-3 text-muted-foreground">{c.name} — {c.ctype}</p>
                            <CommandPreview cmd={c} payloadFormat={payloadFormat} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right JSON rail */}
          <div className="w-96 flex-shrink-0 border-l border-[hsl(var(--rule))] bg-[#0b0b0b] text-[#F3EFE6] overflow-y-auto p-6 hidden lg:block">
            <p className="eyebrow text-[9px] text-[#9A968C] mb-2">Live JSON</p>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: '#fff', marginBottom: '16px' }}>
              Payload <em style={{ fontStyle: 'italic', color: 'hsl(var(--primary))' }}>builder</em>
            </p>
            <pre style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: '#E5E0D5',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.5,
              margin: 0,
            }}>
              {JSON.stringify({
                device: {
                  name: name || '(untitled)',
                  category, protocol, payloadFormat,
                  serialNumber: serialNumber || null,
                },
                schema: { fields: validFields },
                commands: commands.map(c => ({ name: c.name, type: c.ctype })),
              }, null, 2)}
            </pre>
            {payloadPreviewStr && (
              <div style={{ marginTop: 20, borderTop: '1px solid #2a2a2a', paddingTop: 16 }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'hsl(var(--primary))', marginBottom: 8 }}>
                  Sample {payloadFormat.toUpperCase()} payload
                </p>
                <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#b5b09a', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>
                  {payloadPreviewStr}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-8 py-4 border-t border-[hsl(var(--rule))] flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground font-mono">
            {validFields.length} field{validFields.length !== 1 ? 's' : ''} · {commands.length} command{commands.length !== 1 ? 's' : ''}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn btn-secondary btn-sm">Cancel</button>
            {step > 1 && <button onClick={() => setStep((s) => (s - 1) as Step)} className="btn btn-secondary btn-sm">Back</button>}
            {step < 5 ? (
              <button onClick={() => setStep((s) => (s + 1) as Step)} className="btn btn-primary btn-sm">Continue</button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={mutation.isPending}
                className="btn btn-primary btn-sm gap-1.5"
              >
                {mutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {mutation.isPending ? 'Creating...' : 'Create device'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
