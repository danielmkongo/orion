import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Plus, Trash2, ChevronRight, ChevronLeft,
  Check, Loader2, MapPin, Activity, AlertTriangle,
  Code2, Copy, Navigation2, Thermometer,
  Zap, Waves, Radio, FlaskConical, Cog, Cpu,
  Search, LineChart, AreaChart, BarChart2, Gauge, ScatterChart,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { devicesApi } from '@/api/devices';
import type { DeviceCategory, DeviceProtocol, DevicePayloadFormat } from '@orion/shared';
import toast from 'react-hot-toast';
import L from 'leaflet';

/* ─── Types ─────────────────────────────────────────────────────── */
export interface DataField {
  key:        string;
  label:      string;
  type:       'number' | 'string' | 'boolean' | 'location' | 'timestamp';
  unit?:      string;
  chartable?: boolean;
  chartType?: 'line' | 'area' | 'bar' | 'gauge' | 'scatter';
  chartColor?: string;
}

type Step = 1 | 2 | 3 | 4;

const EMPTY_FIELD = (): DataField => ({
  key: '', label: '', type: 'number', unit: '',
  chartable: true, chartType: 'line', chartColor: '#FF6A30',
});

/* ─── Categories ─────────────────────────────────────────────────── */
const CATEGORIES: {
  value: DeviceCategory; label: string; Icon: React.FC<any>; color: string;
}[] = [
  { value: 'environmental', label: 'Environmental', Icon: Thermometer, color: '#10b981' },
  { value: 'industrial',    label: 'Industrial',    Icon: Cog,         color: '#ef4444' },
  { value: 'energy',        label: 'Energy',        Icon: Zap,         color: '#f59e0b' },
  { value: 'water',         label: 'Water',         Icon: Waves,       color: '#0ea5e9' },
  { value: 'tracker',       label: 'Tracker',       Icon: Navigation2, color: '#6366f1' },
  { value: 'gateway',       label: 'Gateway',       Icon: Radio,       color: '#06b6d4' },
  { value: 'research',      label: 'Research',      Icon: FlaskConical,color: '#a855f7' },
  { value: 'custom',        label: 'Custom',        Icon: Cpu,         color: '#FF6A30' },
];

const PROTOCOLS: { value: DeviceProtocol; label: string }[] = [
  { value: 'http',      label: 'HTTP/S'    },
  { value: 'mqtt',      label: 'MQTT'      },
  { value: 'websocket', label: 'WebSocket' },
  { value: 'coap',      label: 'CoAP'      },
  { value: 'tcp',       label: 'TCP'       },
  { value: 'custom',    label: 'Custom'    },
];

const CHART_TYPES: { value: DataField['chartType']; label: string; Icon: React.FC<any> }[] = [
  { value: 'line',    label: 'Line',    Icon: LineChart   },
  { value: 'area',    label: 'Area',    Icon: AreaChart   },
  { value: 'bar',     label: 'Bar',     Icon: BarChart2   },
  { value: 'gauge',   label: 'Gauge',   Icon: Gauge       },
  { value: 'scatter', label: 'Scatter', Icon: ScatterChart },
];

const CHART_COLORS = ['#FF6A30','#5B8DEF','#22C55E','#F59E0B','#8B5CF6','#06B6D4','#F43F5E','#0ea5e9'];

const FORMAT_TABS = [
  { key: 'json',  label: 'JSON'  },
  { key: 'csv',   label: 'CSV'   },
  { key: 'xml',   label: 'XML'   },
  { key: 'mqtt',  label: 'MQTT'  },
  { key: 'http',  label: 'HTTP'  },
  { key: 'proto', label: 'Proto' },
];

/* ─── Helpers ────────────────────────────────────────────────────── */
function inferType(value: unknown): DataField['type'] {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number')  return 'number';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return 'timestamp';
  return 'string';
}

function parseJsonToFields(raw: string): DataField[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return Object.entries(parsed).map(([key, value]) => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1).replace(/[_-]/g, ' '),
      type:  inferType(value),
      unit:  '',
      chartable: inferType(value) === 'number',
      chartType: 'line' as const,
      chartColor: '#FF6A30',
    }));
  } catch { return null; }
}

function genJsonPayload(fields: DataField[]): string {
  const obj: Record<string, unknown> = {};
  fields.filter(f => f.key).forEach(f => {
    if (f.type === 'number')    obj[f.key] = 0;
    else if (f.type === 'boolean') obj[f.key] = true;
    else if (f.type === 'timestamp') obj[f.key] = new Date().toISOString();
    else obj[f.key] = '';
  });
  return JSON.stringify(obj, null, 2);
}

function genCsvPayload(fields: DataField[]): string {
  const valid = fields.filter(f => f.key);
  const keys = valid.map(f => f.key);
  const vals = valid.map(f => f.type === 'number' ? '0' : f.type === 'boolean' ? 'true' : '""');
  return `${keys.join(',')},timestamp\n${vals.join(',')},${new Date().toISOString()}`;
}

function genXmlPayload(fields: DataField[]): string {
  const inner = fields.filter(f => f.key).map(f => {
    const v = f.type === 'number' ? '0' : f.type === 'boolean' ? 'true' : '';
    return `  <${f.key}>${v}</${f.key}>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<telemetry>\n${inner}\n  <timestamp>${new Date().toISOString()}</timestamp>\n</telemetry>`;
}

function genMqttExample(fields: DataField[]): string {
  const obj = Object.fromEntries(fields.filter(f => f.key).map(f => [f.key, f.type === 'number' ? 0 : true]));
  return `Topic:   devices/<device-id>/telemetry\nQoS:     1\nPayload: ${JSON.stringify(obj)}`;
}

function genHttpExample(fields: DataField[]): string {
  return `POST /api/v1/telemetry/ingest HTTP/1.1\nHost: orion.vortan.io\nX-API-Key: <device-api-key>\nContent-Type: application/json\n\n${genJsonPayload(fields)}`;
}

function genProtoExample(fields: DataField[]): string {
  const numF = fields.filter(f => f.key && f.type === 'number');
  return ['syntax = "proto3";', '', 'message TelemetryPayload {',
    ...numF.map((f, i) => `  float ${f.key} = ${i + 1};`),
    '}'].join('\n');
}

/* ─── Leaflet location picker ─────────────────────────────────────── */
function LeafletLocationPicker({ lat, lng, onChange }: {
  lat: number; lng: number;
  onChange: (lat: number, lng: number) => void;
}) {
  const mapRef   = useRef<HTMLDivElement | null>(null);
  const leafRef  = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!mapRef.current || leafRef.current) return;
    const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: true });
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles © Esri', maxZoom: 18 }
    ).addTo(map);
    map.setView([lat || 20, lng || 0], lat ? 13 : 2);

    const icon = L.divIcon({
      className: '',
      html: `<div style="width:14px;height:14px;background:#FF6A30;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    if (lat && lng) {
      const m = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
      m.on('dragend', () => { const p = m.getLatLng(); onChange(p.lat, p.lng); });
      markerRef.current = m;
    }

    map.on('click', (e) => {
      const { lat: la, lng: ln } = e.latlng;
      onChange(la, ln);
      if (markerRef.current) {
        markerRef.current.setLatLng([la, ln]);
      } else {
        const m = L.marker([la, ln], { icon, draggable: true }).addTo(map);
        m.on('dragend', () => { const p = m.getLatLng(); onChange(p.lat, p.lng); });
        markerRef.current = m;
      }
    });

    leafRef.current = map;
    return () => { map.remove(); leafRef.current = null; markerRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function nominatimSearch() {
    if (!searchQ.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQ)}&format=json&limit=5`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      setResults(data);
    } catch { toast.error('Search failed'); }
    finally { setSearching(false); }
  }

  function selectResult(r: any) {
    const la = parseFloat(r.lat);
    const ln = parseFloat(r.lon);
    onChange(la, ln);
    setResults([]);
    setSearchQ(r.display_name.split(',')[0]);
    if (leafRef.current) {
      leafRef.current.setView([la, ln], 14);
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;background:#FF6A30;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>`,
        iconSize: [14, 14], iconAnchor: [7, 7],
      });
      if (markerRef.current) {
        markerRef.current.setLatLng([la, ln]);
      } else {
        const m = L.marker([la, ln], { icon, draggable: true }).addTo(leafRef.current);
        m.on('dragend', () => { const p = m.getLatLng(); onChange(p.lat, p.lng); });
        markerRef.current = m;
      }
    }
  }

  return (
    <div className="space-y-3">
      {/* Nominatim search */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              className="input !pl-9"
              placeholder="Search location…"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') nominatimSearch(); }}
            />
          </div>
          <button
            onClick={nominatimSearch}
            disabled={searching}
            className="btn btn-secondary btn-sm px-4"
          >
            {searching ? <Loader2 size={13} className="animate-spin" /> : 'Search'}
          </button>
        </div>
        {results.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-[hsl(var(--surface))] border border-[hsl(var(--rule))] shadow-xl z-20 max-h-48 overflow-y-auto">
            {results.map((r: any) => (
              <button
                key={r.place_id}
                onClick={() => selectResult(r)}
                className="w-full px-3 py-2.5 text-left text-[12px] hover:bg-muted transition-colors border-b border-[hsl(var(--rule)/0.5)] last:border-0"
              >
                <p className="font-medium text-foreground truncate">{r.display_name.split(',').slice(0, 2).join(', ')}</p>
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{r.type}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map */}
      <div style={{ height: 260 }} className="border border-[hsl(var(--rule))] overflow-hidden">
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      </div>

      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <MapPin size={11} className="text-primary" />
        Click the map to place your device, or drag the pin to adjust
      </p>

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

/* ─── Step indicator ──────────────────────────────────────────────── */
function Steps({ current }: { current: Step }) {
  const STEPS: { n: Step; label: string }[] = [
    { n: 1, label: 'Identity' },
    { n: 2, label: 'Schema'   },
    { n: 3, label: 'Preview'  },
    { n: 4, label: 'Features' },
  ];
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map(({ n, label }, i) => (
        <div key={n} className="flex items-center flex-1">
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className={`w-7 h-7 flex items-center justify-center text-[12px] font-semibold transition-all ${
              current > n ? 'bg-primary text-white'
              : current === n ? 'bg-primary text-white ring-4 ring-primary/15'
              : 'bg-muted text-muted-foreground border border-[hsl(var(--rule))]'
            }`}>
              {current > n ? <Check size={12} strokeWidth={3} /> : n}
            </div>
            <span className={`text-[10px] whitespace-nowrap font-mono ${current >= n ? 'text-foreground' : 'text-muted-foreground'}`}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-px mx-2 mb-4 transition-colors ${current > n ? 'bg-primary' : 'bg-[hsl(var(--rule))]'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Feature toggle ──────────────────────────────────────────────── */
function FeatureToggle({ icon: Icon, title, desc, enabled, onToggle, children }: {
  icon: React.FC<any>; title: string; desc: string;
  enabled: boolean; onToggle: () => void; children?: React.ReactNode;
}) {
  return (
    <div className={`border p-4 transition-all ${enabled ? 'border-primary/30 bg-primary/[0.025]' : 'border-[hsl(var(--rule))]'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 flex items-center justify-center flex-shrink-0 ${enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
            <Icon size={15} />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-foreground">{title}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
          </div>
        </div>
        <button
          type="button" onClick={onToggle}
          style={{ width: 40, height: 22 }}
          className={`relative flex-shrink-0 mt-0.5 transition-colors ${enabled ? 'bg-primary' : 'bg-[hsl(var(--rule))]'}`}
        >
          <motion.div
            animate={{ x: enabled ? 20 : 2 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="absolute top-[2px] w-[18px] h-[18px] bg-white shadow-sm"
          />
        </button>
      </div>
      <AnimatePresence>
        {enabled && children && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mt-4"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────────── */
export function DeviceForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(1);

  // Step 1
  const [name, setName]           = useState('');
  const [description, setDesc]    = useState('');
  const [category, setCategory]   = useState<DeviceCategory>('custom');
  const [serialNumber, setSerial] = useState('');
  const [protocol, setProtocol]   = useState<DeviceProtocol>('http');
  const [payloadFormat, setFormat]= useState<DevicePayloadFormat>('json');
  const [tags, setTagsStr]        = useState('');

  // Step 2
  const [fields, setFields]         = useState<DataField[]>([EMPTY_FIELD()]);
  const [selectedFieldIdx, setSelIdx] = useState<number | null>(null);
  const [pasteOpen, setPasteOpen]   = useState(false);
  const [pasteJson, setPasteJson]   = useState('');
  const [pasteError, setPasteError] = useState('');

  // Step 3
  const [previewTab, setPreviewTab] = useState('json');

  // Step 4
  const [locationEnabled, setLocation] = useState(false);
  const [lat, setLat]                  = useState(0);
  const [lng, setLng]                  = useState(0);
  const [tracking, setTracking]        = useState(false);
  const [geofence, setGeofence]        = useState(false);

  const updateField = useCallback((i: number, patch: Partial<DataField>) => {
    setFields(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  }, []);

  const addField = () => { setFields(prev => [...prev, EMPTY_FIELD()]); setSelIdx(fields.length); };
  const removeField = (i: number) => {
    setFields(prev => prev.filter((_, idx) => idx !== i));
    if (selectedFieldIdx === i) setSelIdx(null);
  };

  function applyPaste() {
    if (!pasteJson.trim()) { setPasteError('Paste a JSON object first'); return; }
    const result = parseJsonToFields(pasteJson);
    if (!result) { setPasteError('Invalid JSON or not a flat object'); return; }
    setFields(result.length > 0 ? result : [EMPTY_FIELD()]);
    setPasteOpen(false); setPasteJson(''); setPasteError('');
    toast.success(`Imported ${result.length} field${result.length !== 1 ? 's' : ''}`);
  }

  const validFields = fields.filter(f => f.key.trim());

  const previewContent = useMemo(() => {
    switch (previewTab) {
      case 'json':  return genJsonPayload(validFields);
      case 'csv':   return genCsvPayload(validFields);
      case 'xml':   return genXmlPayload(validFields);
      case 'mqtt':  return genMqttExample(validFields);
      case 'http':  return genHttpExample(validFields);
      case 'proto': return genProtoExample(validFields);
      default:      return '';
    }
  }, [previewTab, validFields]);

  // Live JSON for step 2
  const liveJson = useMemo(() => genJsonPayload(fields.filter(f => f.key.trim())), [fields]);

  const selectedField = selectedFieldIdx !== null ? fields[selectedFieldIdx] : null;

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
    const payload: any = {
      name: name.trim(), description: description.trim() || undefined,
      serialNumber: serialNumber.trim() || undefined,
      category, protocol, payloadFormat,
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      meta: { dataSchema: { fields: validFields }, features: { locationEnabled, tracking, geofence } },
    };
    if (locationEnabled && lat && lng) {
      payload.location = { lat, lng, timestamp: new Date().toISOString() };
    }
    mutation.mutate(payload);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="relative bg-background border border-[hsl(var(--rule))] shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--rule))] flex-shrink-0">
          <div>
            <p className="eyebrow text-[9px] mb-1">Device Registration</p>
            <h2 className="text-[15px] font-semibold text-foreground tracking-tight">Add Device</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <Steps current={step} />

          {/* ── Step 1: Identity ── */}
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="eyebrow text-[9px] block mb-1.5">Device Name <span className="text-red-500">*</span></label>
                  <input className="input" placeholder="e.g. Sensor Node #12" value={name} onChange={e => setName(e.target.value)} autoFocus />
                </div>
                <div className="col-span-2">
                  <label className="eyebrow text-[9px] block mb-1.5">Description</label>
                  <input className="input" placeholder="Optional description" value={description} onChange={e => setDesc(e.target.value)} />
                </div>
                <div>
                  <label className="eyebrow text-[9px] block mb-1.5">Serial Number</label>
                  <input className="input" placeholder="SN-0001" value={serialNumber} onChange={e => setSerial(e.target.value)} />
                </div>
                <div>
                  <label className="eyebrow text-[9px] block mb-1.5">Tags</label>
                  <input className="input" placeholder="prod, outdoor, zone-a" value={tags} onChange={e => setTagsStr(e.target.value)} />
                  <p className="text-[10px] text-muted-foreground font-mono mt-1">Comma-separated</p>
                </div>
              </div>

              <div>
                <label className="eyebrow text-[9px] block mb-2">Category</label>
                <div className="grid grid-cols-4 gap-2">
                  {CATEGORIES.map(c => {
                    const Icon = c.Icon;
                    const active = category === c.value;
                    return (
                      <button
                        key={c.value} type="button" onClick={() => setCategory(c.value)}
                        className={`flex flex-col items-center gap-2 p-3 border text-[11px] font-medium transition-all ${
                          active ? 'border-primary bg-primary/5 text-primary' : 'border-[hsl(var(--rule))] text-muted-foreground hover:text-foreground hover:border-foreground/20'
                        }`}
                      >
                        <Icon size={16} style={{ color: active ? 'hsl(var(--primary))' : c.color }} />
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="eyebrow text-[9px] block mb-2">Protocol</label>
                  <div className="flex flex-wrap gap-1.5">
                    {PROTOCOLS.map(p => (
                      <button key={p.value} type="button" onClick={() => setProtocol(p.value)}
                        className={`px-3 py-1.5 border text-[11px] font-mono transition-all ${
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
            </motion.div>
          )}

          {/* ── Step 2: Schema + JSON Preview ── */}
          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-foreground">Define your data fields</p>
                  <p className="text-[11px] text-muted-foreground">Fields power dashboards, alerts, and auto-generated controls.</p>
                </div>
                <button type="button" onClick={() => { setPasteOpen(v => !v); setPasteError(''); }} className="btn btn-secondary btn-sm gap-1.5">
                  <Code2 size={12} /> Paste JSON
                </button>
              </div>

              <AnimatePresence>
                {pasteOpen && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="border border-[hsl(var(--rule))] bg-muted/30 p-4">
                      <p className="text-[12px] font-medium text-foreground mb-2">Paste a sample JSON payload:</p>
                      <textarea
                        autoFocus value={pasteJson}
                        onChange={e => { setPasteJson(e.target.value); setPasteError(''); }}
                        rows={4} className="textarea font-mono text-[12px]"
                        placeholder={'{\n  "temperature": 23.5,\n  "humidity": 78\n}'}
                      />
                      {pasteError && (
                        <p className="text-[11px] text-red-500 flex items-center gap-1 mt-1.5">
                          <AlertTriangle size={11} /> {pasteError}
                        </p>
                      )}
                      <div className="flex gap-2 mt-3">
                        <button onClick={applyPaste} className="btn btn-primary btn-sm">Import fields</button>
                        <button onClick={() => setPasteOpen(false)} className="btn btn-secondary btn-sm">Cancel</button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid grid-cols-2 gap-4">
                {/* Left — Field builder */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="eyebrow text-[9px]">Fields ({fields.filter(f => f.key).length})</p>
                    <button onClick={addField} className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                      <Plus size={11} /> Add
                    </button>
                  </div>
                  <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                    {fields.map((field, i) => (
                      <div
                        key={i}
                        onClick={() => setSelIdx(i)}
                        className={`border p-3 space-y-2 cursor-pointer transition-all ${selectedFieldIdx === i ? 'border-primary/40 bg-primary/[0.025]' : 'border-[hsl(var(--rule))] hover:border-foreground/20'}`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            className="input text-[12px] !h-7 flex-1 font-mono"
                            placeholder="field_key"
                            value={field.key}
                            onChange={e => updateField(i, { key: e.target.value })}
                            onClick={e => e.stopPropagation()}
                          />
                          <button
                            onClick={e => { e.stopPropagation(); removeField(i); }}
                            className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-red-500 flex-shrink-0"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <input className="input text-[11px] !h-7" placeholder="Label"
                            value={field.label} onChange={e => updateField(i, { label: e.target.value })}
                            onClick={e => e.stopPropagation()} />
                          <select className="select text-[11px] !h-7" value={field.type}
                            onChange={e => updateField(i, { type: e.target.value as DataField['type'] })}
                            onClick={e => e.stopPropagation()}>
                            <option value="number">Number</option>
                            <option value="string">Text</option>
                            <option value="boolean">Bool</option>
                            <option value="location">Location</option>
                            <option value="timestamp">Timestamp</option>
                          </select>
                          <input className="input text-[11px] !h-7" placeholder="Unit"
                            value={field.unit ?? ''} onChange={e => updateField(i, { unit: e.target.value })}
                            onClick={e => e.stopPropagation()} />
                        </div>
                        {field.chartColor && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2" style={{ backgroundColor: field.chartColor }} />
                            <span className="text-[9px] text-muted-foreground font-mono capitalize">{field.chartType}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Live JSON preview */}
                  <div className="border border-[hsl(var(--rule))] bg-muted/20">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-[hsl(var(--rule)/0.5)]">
                      <p className="eyebrow text-[9px]">Live JSON Preview</p>
                      <button
                        onClick={() => { navigator.clipboard.writeText(liveJson); toast.success('Copied!'); }}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        <Copy size={9} /> Copy
                      </button>
                    </div>
                    <pre className="p-3 text-[11px] font-mono text-foreground/80 overflow-x-auto max-h-[120px] leading-relaxed">
                      {validFields.length > 0 ? liveJson : '// Add fields above'}
                    </pre>
                  </div>
                </div>

                {/* Right — Visualization */}
                <div className="space-y-3">
                  {selectedField ? (
                    <>
                      <p className="eyebrow text-[9px]">
                        Visualization — {selectedField.label || selectedField.key || 'field'}
                      </p>
                      {selectedField.type === 'number' ? (
                        <>
                          <div className="flex gap-1.5">
                            {CHART_TYPES.map(({ value, label, Icon }) => (
                              <button key={value} type="button"
                                onClick={() => updateField(selectedFieldIdx!, { chartType: value })}
                                className={`flex-1 flex flex-col items-center gap-1 py-2 border text-[10px] font-medium transition-all ${
                                  selectedField.chartType === value
                                    ? 'border-primary bg-primary/5 text-primary'
                                    : 'border-[hsl(var(--rule))] text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                <Icon size={13} />
                                {label}
                              </button>
                            ))}
                          </div>
                          <div>
                            <p className="eyebrow text-[9px] mb-2">Color</p>
                            <div className="flex flex-wrap gap-1.5">
                              {CHART_COLORS.map(c => (
                                <button key={c} type="button"
                                  onClick={() => updateField(selectedFieldIdx!, { chartColor: c })}
                                  style={{ backgroundColor: c }}
                                  className={`w-6 h-6 transition-all ${selectedField.chartColor === c ? 'ring-2 ring-offset-2 ring-foreground/20 scale-110' : 'hover:scale-105'}`}
                                />
                              ))}
                              <input
                                type="color"
                                value={selectedField.chartColor ?? '#FF6A30'}
                                onChange={e => updateField(selectedFieldIdx!, { chartColor: e.target.value })}
                                className="w-6 h-6 cursor-pointer border border-[hsl(var(--rule))]"
                                title="Custom color"
                              />
                            </div>
                          </div>
                          {/* Simple sparkline preview */}
                          <div className="border border-[hsl(var(--rule))] p-3 bg-muted/20">
                            <p className="eyebrow text-[9px] mb-2">Preview</p>
                            <svg width="100%" height="60" style={{ overflow: 'hidden' }}>
                              {(() => {
                                const pts = Array.from({ length: 20 }, (_, i) => ({
                                  x: (i / 19) * 100 + '%',
                                  y: 50 - (Math.sin(i / 3) * 18 + Math.random() * 8),
                                }));
                                const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                                const color = selectedField.chartColor ?? '#FF6A30';
                                return (
                                  <>
                                    <path d={`${path} L 100% 60 L 0 60 Z`} fill={color} opacity="0.15" />
                                    <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
                                  </>
                                );
                              })()}
                            </svg>
                          </div>
                        </>
                      ) : (
                        <div className="border border-[hsl(var(--rule))] p-6 text-center">
                          <p className="text-[12px] text-muted-foreground">
                            Visualization available for <strong className="text-foreground">number</strong> fields only.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="border border-dashed border-[hsl(var(--rule))] p-8 text-center">
                      <Activity size={18} className="text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-[12px] text-muted-foreground">Select a field to configure visualization</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Step 3: Payload Preview ── */}
          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div>
                <p className="text-[13px] font-semibold text-foreground">Device payload reference</p>
                <p className="text-[11px] text-muted-foreground">How your firmware should format and send data.</p>
              </div>

              <div className="flex gap-px border border-[hsl(var(--rule))] overflow-x-auto no-scrollbar">
                {FORMAT_TABS.map(({ key, label }) => (
                  <button key={key} onClick={() => setPreviewTab(key)}
                    className={`px-3 py-2 text-[11px] font-mono whitespace-nowrap transition-colors ${
                      previewTab === key ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="relative border border-[hsl(var(--rule))] bg-muted/20">
                <button
                  onClick={() => { navigator.clipboard.writeText(previewContent); toast.success('Copied!'); }}
                  className="absolute top-3 right-3 btn btn-secondary btn-sm gap-1.5 z-10"
                >
                  <Copy size={11} /> Copy
                </button>
                <pre className="p-4 text-[12px] font-mono text-foreground/80 overflow-x-auto max-h-72 whitespace-pre leading-relaxed">
                  {validFields.length > 0 ? previewContent : '// Define fields in the previous step'}
                </pre>
              </div>

              {validFields.length > 0 && (
                <div className="bg-primary/5 border border-primary/15 p-4">
                  <p className="eyebrow text-[9px] mb-1">Ingestion endpoint</p>
                  <code className="font-mono text-[12px] text-foreground/80">
                    POST https://orion.vortan.io/api/v1/telemetry/ingest
                  </code>
                  <p className="text-[11px] text-muted-foreground font-mono mt-1">
                    Get your device API key from the device detail page after creation.
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* ── Step 4: Features ── */}
          {step === 4 && (
            <motion.div key="s4" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div>
                <p className="text-[13px] font-semibold text-foreground">Optional features</p>
                <p className="text-[11px] text-muted-foreground">Enable capabilities relevant to this device.</p>
              </div>

              <FeatureToggle
                icon={MapPin} title="Location" desc="Pin this device on the map"
                enabled={locationEnabled} onToggle={() => setLocation(v => !v)}
              >
                <LeafletLocationPicker
                  lat={lat} lng={lng}
                  onChange={(la, ln) => { setLat(la); setLng(ln); }}
                />
              </FeatureToggle>

              <FeatureToggle
                icon={Activity} title="Live Tracking" desc="Stream location updates in real time"
                enabled={tracking && locationEnabled}
                onToggle={() => { if (!locationEnabled) { toast.error('Enable Location first'); return; } setTracking(v => !v); }}
              />

              <FeatureToggle
                icon={AlertTriangle} title="Geo-fencing" desc="Alert when device enters or leaves a zone"
                enabled={geofence && locationEnabled}
                onToggle={() => { if (!locationEnabled) { toast.error('Enable Location first'); return; } setGeofence(v => !v); }}
              />
            </motion.div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[hsl(var(--rule))] flex-shrink-0">
          <div>
            {step > 1 && (
              <button onClick={() => setStep(s => (s - 1) as Step)} className="btn btn-secondary gap-1.5">
                <ChevronLeft size={14} /> Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn btn-ghost text-muted-foreground">Cancel</button>
            {step < 4 ? (
              <button
                onClick={() => {
                  if (step === 1 && !name.trim()) { toast.error('Enter a device name'); return; }
                  setStep(s => (s + 1) as Step);
                }}
                className="btn btn-primary gap-1.5"
              >
                Continue <ChevronRight size={14} />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={mutation.isPending} className="btn btn-primary gap-1.5">
                {mutation.isPending
                  ? <><Loader2 size={13} className="animate-spin" /> Creating…</>
                  : <><Check size={13} /> Create Device</>
                }
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
