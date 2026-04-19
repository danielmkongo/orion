import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactECharts from 'echarts-for-react';
import {
  X, Plus, Trash2, ChevronRight, ChevronLeft,
  Check, Loader2, MapPin, Activity, AlertTriangle,
  Code2, RefreshCw, Copy, Navigation2, Thermometer,
  Zap, Waves, Settings2, Radio, FlaskConical, Cog, Cpu,
  Smartphone, Building2, LineChart, AreaChart, BarChart2,
  Gauge, Scatter,
} from 'lucide-react';
import {
  APIProvider, Map as GMap, AdvancedMarker, useMap,
} from '@vis.gl/react-google-maps';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { devicesApi } from '@/api/devices';
import type { DeviceCategory, DeviceProtocol, DevicePayloadFormat } from '@orion/shared';
import toast from 'react-hot-toast';

const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

/* ─── Types ──────────────────────────────────────────── */
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
  chartable: true, chartType: 'line', chartColor: '#6366f1',
});

/* ─── Category definitions ─────────────────────────── */
const CATEGORIES: {
  value: DeviceCategory; label: string; Icon: React.FC<any>; color: string; bg: string;
}[] = [
  { value: 'environmental', label: 'Environmental', Icon: Thermometer,  color: '#10b981', bg: 'bg-emerald-500/10' },
  { value: 'industrial',    label: 'Industrial',    Icon: Cog,          color: '#ef4444', bg: 'bg-red-500/10'     },
  { value: 'energy',        label: 'Energy',        Icon: Zap,          color: '#f59e0b', bg: 'bg-amber-500/10'   },
  { value: 'water',         label: 'Water',         Icon: Waves,        color: '#0ea5e9', bg: 'bg-sky-500/10'     },
  { value: 'tracker',       label: 'Tracker',       Icon: Navigation2,  color: '#6366f1', bg: 'bg-indigo-500/10'  },
  { value: 'gateway',       label: 'Gateway',       Icon: Radio,        color: '#06b6d4', bg: 'bg-cyan-500/10'    },
  { value: 'research',      label: 'Research',      Icon: FlaskConical, color: '#a855f7', bg: 'bg-purple-500/10'  },
  { value: 'custom',        label: 'Custom',        Icon: Cpu,          color: '#ea580c', bg: 'bg-orange-500/10'  },
];

const PROTOCOLS: { value: DeviceProtocol; label: string; desc: string }[] = [
  { value: 'http',      label: 'HTTP/S',    desc: 'REST API'     },
  { value: 'mqtt',      label: 'MQTT',      desc: 'Pub/Sub'      },
  { value: 'websocket', label: 'WebSocket', desc: 'Persistent'   },
  { value: 'coap',      label: 'CoAP',      desc: 'Constrained'  },
  { value: 'tcp',       label: 'TCP',       desc: 'Raw socket'   },
  { value: 'custom',    label: 'Custom',    desc: 'Proprietary'  },
];

const CHART_TYPES: { value: DataField['chartType']; label: string; Icon: React.FC<any> }[] = [
  { value: 'line',    label: 'Line',    Icon: LineChart  },
  { value: 'area',    label: 'Area',    Icon: AreaChart  },
  { value: 'bar',     label: 'Bar',     Icon: BarChart2  },
  { value: 'gauge',   label: 'Gauge',   Icon: Gauge      },
  { value: 'scatter', label: 'Scatter', Icon: Scatter    },
];

const CHART_COLORS = [
  '#6366f1','#10b981','#f59e0b','#06b6d4',
  '#f97316','#a855f7','#ef4444','#0ea5e9',
];

/* ─── Helpers ────────────────────────────────────────── */
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
      chartColor: '#6366f1',
    }));
  } catch { return null; }
}

function genJsonPayload(fields: DataField[]): string {
  const obj: Record<string, unknown> = {};
  fields.forEach(f => {
    if (!f.key) return;
    if (f.type === 'number')    obj[f.key] = 0;
    else if (f.type === 'boolean') obj[f.key] = true;
    else if (f.type === 'timestamp') obj[f.key] = new Date().toISOString();
    else obj[f.key] = '';
  });
  return JSON.stringify(obj, null, 2);
}

function genCSVPayload(fields: DataField[]): string {
  const valid = fields.filter(f => f.key);
  const keys = valid.map(f => f.key);
  const vals = valid.map(f => f.type === 'number' ? '0' : f.type === 'boolean' ? 'true' : f.type === 'timestamp' ? new Date().toISOString() : '""');
  return `${keys.join(',')},timestamp\n${vals.join(',')},${new Date().toISOString()}`;
}

function genXMLPayload(fields: DataField[]): string {
  const valid = fields.filter(f => f.key);
  const inner = valid.map(f => {
    const val = f.type === 'number' ? '0' : f.type === 'boolean' ? 'true' : f.type === 'timestamp' ? new Date().toISOString() : '';
    return `  <${f.key}>${val}</${f.key}>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<telemetry>\n${inner}\n  <timestamp>${new Date().toISOString()}</timestamp>\n</telemetry>`;
}

function genMQTTExample(fields: DataField[], deviceId = '<device-id>'): string {
  const obj = Object.fromEntries(fields.filter(f => f.key).map(f => [
    f.key, f.type === 'number' ? 0 : f.type === 'boolean' ? true : ''
  ]));
  return `# MQTT Publish\nTopic:   devices/${deviceId}/telemetry\nQoS:     1\nPayload: ${JSON.stringify(obj)}`;
}

function genHTTPExample(fields: DataField[]): string {
  const body = genJsonPayload(fields);
  return `POST /api/v1/telemetry/ingest HTTP/1.1\nHost: orion.vortan.io\nX-API-Key: <your-device-key>\nContent-Type: application/json\n\n${body}`;
}

function genTCPExample(fields: DataField[]): string {
  const obj = Object.fromEntries(fields.filter(f => f.key).map(f => [
    f.key, f.type === 'number' ? 0 : f.type === 'boolean' ? true : ''
  ]));
  return `# TCP Raw Socket\nConnect: tcp://orion.vortan.io:8883\nSend (newline-delimited JSON):\n${JSON.stringify(obj)}\\n`;
}

function genProtoExample(fields: DataField[]): string {
  const numFields = fields.filter(f => f.key && f.type === 'number');
  const strFields = fields.filter(f => f.key && f.type === 'string');
  const boolFields = fields.filter(f => f.key && f.type === 'boolean');
  const lines = [
    'syntax = "proto3";',
    '',
    'message TelemetryPayload {',
    ...numFields.map((f, i) => `  float ${f.key} = ${i + 1};`),
    ...strFields.map((f, i) => `  string ${f.key} = ${numFields.length + i + 1};`),
    ...boolFields.map((f, i) => `  bool ${f.key} = ${numFields.length + strFields.length + i + 1};`),
    '}',
  ];
  return lines.join('\n');
}

const FORMAT_TABS = [
  { key: 'json',     label: 'JSON'    },
  { key: 'csv',      label: 'CSV'     },
  { key: 'xml',      label: 'XML'     },
  { key: 'mqtt',     label: 'MQTT'    },
  { key: 'http',     label: 'HTTP'    },
  { key: 'tcp',      label: 'TCP'     },
  { key: 'protobuf', label: 'Protobuf'},
];

/* ─── Mini chart preview ─────────────────────────────── */
function MiniChartPreview({ chartType, color }: { chartType: DataField['chartType']; color: string }) {
  const mockData = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => [
      Date.now() - (20 - i) * 60_000,
      20 + Math.sin(i / 3) * 8 + Math.random() * 3,
    ]);
  }, []);

  if (chartType === 'gauge') {
    const option = {
      backgroundColor: 'transparent',
      series: [{
        type: 'gauge',
        startAngle: 200, endAngle: -20,
        min: 0, max: 100,
        radius: '80%',
        axisLine: { lineStyle: { width: 8, color: [[0.3, '#10b981'], [0.7, '#f59e0b'], [1, '#ef4444']] } },
        pointer: { itemStyle: { color: color } },
        axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false },
        detail: { show: false },
        data: [{ value: 62 }],
      }],
    };
    return <ReactECharts option={option} style={{ height: 100 }} notMerge />;
  }

  const isBar = chartType === 'bar';
  const option = {
    backgroundColor: 'transparent',
    grid: { left: 4, right: 4, top: 4, bottom: 4 },
    xAxis: { type: 'time', show: false },
    yAxis: { show: false },
    series: [{
      type: isBar ? 'bar' : 'line',
      smooth: true,
      symbol: 'none',
      data: mockData,
      lineStyle: { width: 2, color },
      itemStyle: { color, borderRadius: isBar ? [2, 2, 0, 0] : 0 },
      areaStyle: chartType === 'area' ? {
        color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: `${color}40` }, { offset: 1, color: `${color}05` }] },
      } : undefined,
    }],
  };
  return <ReactECharts option={option} style={{ height: 100 }} notMerge />;
}

/* ─── Step indicator ─────────────────────────────────── */
function Steps({ current }: { current: Step }) {
  const STEPS: { n: Step; label: string }[] = [
    { n: 1, label: 'Identity'   },
    { n: 2, label: 'Schema'     },
    { n: 3, label: 'Preview'    },
    { n: 4, label: 'Features'   },
  ];
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map(({ n, label }, i) => (
        <div key={n} className="flex items-center flex-1">
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold transition-all ${
              current > n ? 'bg-primary text-white'
              : current === n ? 'bg-primary text-white ring-4 ring-primary/15'
              : 'bg-muted text-muted-foreground border border-border'
            }`}>
              {current > n ? <Check size={12} strokeWidth={3} /> : n}
            </div>
            <span className={`text-[11px] whitespace-nowrap font-medium ${current >= n ? 'text-foreground' : 'text-muted-foreground'}`}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-px mx-2 mb-4 transition-colors ${current > n ? 'bg-primary' : 'bg-border'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Location map picker ────────────────────────────── */
function LocationPicker({ lat, lng, onChange }: {
  lat: number; lng: number;
  onChange: (lat: number, lng: number) => void;
}) {
  const map = useMap();
  const center = { lat: lat || 0, lng: lng || 0 };

  return (
    <div className="space-y-3">
      <div className="rounded-xl overflow-hidden border border-border" style={{ height: 240 }}>
        <GMap
          defaultCenter={center}
          defaultZoom={lat ? 12 : 2}
          gestureHandling="greedy"
          disableDefaultUI
          mapId="orion-device-picker"
          style={{ width: '100%', height: '100%' }}
          onClick={e => {
            if (e.detail.latLng) onChange(e.detail.latLng.lat, e.detail.latLng.lng);
          }}
        >
          {lat !== 0 && (
            <AdvancedMarker
              position={{ lat, lng }}
              draggable
              onDragEnd={e => {
                if (e.latLng) onChange(e.latLng.lat(), e.latLng.lng());
              }}
            />
          )}
        </GMap>
      </div>
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <MapPin size={11} className="text-primary" />
        Click the map to place your device, or drag the marker to adjust
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[12px] font-medium text-foreground mb-1">Latitude</label>
          <input
            type="number" step="any"
            value={lat || ''}
            onChange={e => onChange(parseFloat(e.target.value) || 0, lng)}
            className="input text-[13px] font-mono"
            placeholder="0.000000"
          />
        </div>
        <div>
          <label className="block text-[12px] font-medium text-foreground mb-1">Longitude</label>
          <input
            type="number" step="any"
            value={lng || ''}
            onChange={e => onChange(lat, parseFloat(e.target.value) || 0)}
            className="input text-[13px] font-mono"
            placeholder="0.000000"
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Feature toggle ─────────────────────────────────── */
function FeatureToggle({ icon: Icon, title, desc, enabled, onToggle, children }: {
  icon: React.FC<any>; title: string; desc: string;
  enabled: boolean; onToggle: () => void; children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-4 transition-all ${enabled ? 'border-primary/30 bg-primary/[0.025]' : 'border-border bg-surface'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${enabled ? 'bg-primary/12 text-primary' : 'bg-muted text-muted-foreground'}`}>
            <Icon size={15} />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-foreground">{title}</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">{desc}</p>
          </div>
        </div>
        <button
          type="button" onClick={onToggle}
          style={{ width: 40, height: 22 }}
          className={`relative rounded-full transition-colors flex-shrink-0 mt-0.5 ${enabled ? 'bg-primary' : 'bg-border'}`}
        >
          <motion.div
            animate={{ x: enabled ? 20 : 2 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow-sm"
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

/* ─── Main component ─────────────────────────────────── */
interface DeviceFormProps { onClose: () => void; }

export function DeviceForm({ onClose }: DeviceFormProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(1);

  // Step 1 — Identity
  const [name, setName]           = useState('');
  const [description, setDesc]    = useState('');
  const [category, setCategory]   = useState<DeviceCategory>('custom');
  const [serialNumber, setSerial] = useState('');
  const [protocol, setProtocol]   = useState<DeviceProtocol>('http');
  const [payloadFormat, setFormat]= useState<DevicePayloadFormat>('json');
  const [tags, setTagsStr]        = useState('');

  // Step 2 — Schema
  const [fields, setFields]         = useState<DataField[]>([EMPTY_FIELD()]);
  const [selectedFieldIdx, setSelIdx] = useState<number | null>(null);
  const [pasteOpen, setPasteOpen]   = useState(false);
  const [pasteJson, setPasteJson]   = useState('');
  const [pasteError, setPasteError] = useState('');

  // Step 3 — Preview tab
  const [previewTab, setPreviewTab] = useState('json');

  // Step 4 — Features
  const [locationEnabled, setLocation] = useState(false);
  const [lat, setLat]                  = useState(0);
  const [lng, setLng]                  = useState(0);
  const [tracking, setTracking]        = useState(false);
  const [geofence, setGeofence]        = useState(false);

  const updateField = useCallback((i: number, patch: Partial<DataField>) => {
    setFields(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  }, []);

  const addField = () => {
    setFields(prev => [...prev, EMPTY_FIELD()]);
    setSelIdx(fields.length);
  };

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
    const validFields = fields.filter(f => f.key.trim());
    const payload: any = {
      name: name.trim(), description: description.trim() || undefined,
      serialNumber: serialNumber.trim() || undefined,
      category, protocol, payloadFormat,
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      meta: {
        dataSchema: { fields: validFields },
        features: { locationEnabled, tracking, geofence },
      },
    };
    if (locationEnabled && lat && lng) {
      payload.location = { lat, lng, timestamp: new Date().toISOString() };
    }
    mutation.mutate(payload);
  }

  /* Preview generation */
  const validFields = fields.filter(f => f.key.trim());
  const previewContent = useMemo(() => {
    switch (previewTab) {
      case 'json':     return genJsonPayload(validFields);
      case 'csv':      return genCSVPayload(validFields);
      case 'xml':      return genXMLPayload(validFields);
      case 'mqtt':     return genMQTTExample(validFields);
      case 'http':     return genHTTPExample(validFields);
      case 'tcp':      return genTCPExample(validFields);
      case 'protobuf': return genProtoExample(validFields);
      default:         return '';
    }
  }, [previewTab, validFields]);

  const selectedField = selectedFieldIdx !== null ? fields[selectedFieldIdx] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="relative bg-background rounded-2xl border border-border shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0 bg-surface/60">
          <div>
            <h2 className="text-[16px] font-semibold text-foreground tracking-tight">Add Device</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {step === 1 ? 'Configure identity and connectivity' :
               step === 2 ? 'Define your data schema and visualization' :
               step === 3 ? 'Preview payload formats for your device firmware' :
               'Enable optional platform features'}
            </p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm !px-0 w-8 h-8 rounded-lg">
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
                  <label className="block text-[13px] font-medium text-foreground mb-1.5">
                    Device Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="input" placeholder="e.g. Sensor Node #12"
                    value={name} onChange={e => setName(e.target.value)} autoFocus
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[13px] font-medium text-foreground mb-1.5">Description</label>
                  <input className="input" placeholder="Optional description" value={description} onChange={e => setDesc(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-foreground mb-1.5">Serial Number</label>
                  <input className="input" placeholder="SN-0001" value={serialNumber} onChange={e => setSerial(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-foreground mb-1.5">Tags</label>
                  <input className="input" placeholder="prod, outdoor, zone-a" value={tags} onChange={e => setTagsStr(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground mt-1">Comma-separated</p>
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-foreground mb-2">Category</label>
                <div className="grid grid-cols-4 gap-2">
                  {CATEGORIES.map(c => {
                    const Icon = c.Icon;
                    const active = category === c.value;
                    return (
                      <button
                        key={c.value} type="button" onClick={() => setCategory(c.value)}
                        className={`flex flex-col items-center gap-2 p-3.5 rounded-xl border text-[12px] font-medium transition-all ${
                          active
                            ? 'border-primary bg-primary/5 text-primary shadow-sm'
                            : 'border-border bg-surface hover:border-border-strong text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${active ? 'bg-primary/10' : c.bg}`}>
                          <Icon size={16} style={{ color: active ? 'hsl(var(--primary))' : c.color }} />
                        </div>
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-foreground mb-2">Protocol</label>
                  <div className="flex flex-wrap gap-2">
                    {PROTOCOLS.map(p => (
                      <button
                        key={p.value} type="button" onClick={() => setProtocol(p.value)}
                        className={`px-3 py-1.5 rounded-lg border text-[12px] font-medium transition-all ${
                          protocol === p.value
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-foreground mb-2">Payload Format</label>
                  <select value={payloadFormat} onChange={e => setFormat(e.target.value as DevicePayloadFormat)} className="select">
                    {['json','csv','xml','raw','msgpack','cbor','protobuf','binary','custom'].map(f => (
                      <option key={f} value={f}>{f.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Step 2: Schema + Visualization ── */}
          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-semibold text-foreground">Define your data fields</p>
                  <p className="text-[12px] text-muted-foreground">This powers dashboards, alerts, and auto-generated controls.</p>
                </div>
                <button type="button" onClick={() => { setPasteOpen(v => !v); setPasteError(''); }} className="btn btn-secondary btn-sm gap-1.5">
                  <Code2 size={13} /> Paste JSON
                </button>
              </div>

              <AnimatePresence>
                {pasteOpen && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="rounded-xl border border-border bg-muted/30 p-4">
                      <p className="text-[13px] font-medium text-foreground mb-2">Paste a sample JSON payload:</p>
                      <textarea
                        autoFocus value={pasteJson}
                        onChange={e => { setPasteJson(e.target.value); setPasteError(''); }}
                        rows={5} className="textarea font-mono text-[12px]"
                        placeholder={'{\n  "temperature": 23.5,\n  "humidity": 78\n}'}
                      />
                      {pasteError && (
                        <p className="text-[12px] text-red-500 flex items-center gap-1 mt-1.5">
                          <AlertTriangle size={12} /> {pasteError}
                        </p>
                      )}
                      <div className="flex gap-2 mt-3">
                        <button onClick={applyPaste} className="btn btn-primary btn-sm">Import fields</button>
                        <button onClick={() => { setPasteOpen(false); setPasteError(''); }} className="btn btn-secondary btn-sm">Cancel</button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid grid-cols-2 gap-4">
                {/* Field builder */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Fields ({fields.filter(f => f.key).length})
                    </p>
                    <button onClick={addField} className="btn btn-ghost btn-sm gap-1">
                      <Plus size={12} /> Add field
                    </button>
                  </div>
                  <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                    {fields.map((field, i) => (
                      <div
                        key={i}
                        onClick={() => setSelIdx(i)}
                        className={`card p-3 space-y-2 cursor-pointer transition-all ${selectedFieldIdx === i ? 'border-primary/40 bg-primary/[0.025]' : 'hover:border-border-strong'}`}
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
                            className="btn btn-ghost btn-sm !px-0 w-7 h-7 flex-shrink-0 text-muted-foreground hover:text-red-500"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            className="input text-[12px] !h-7" placeholder="Label"
                            value={field.label} onChange={e => updateField(i, { label: e.target.value })}
                            onClick={e => e.stopPropagation()}
                          />
                          <select
                            className="select text-[12px] !h-7" value={field.type}
                            onChange={e => updateField(i, { type: e.target.value as DataField['type'] })}
                            onClick={e => e.stopPropagation()}
                          >
                            <option value="number">Number</option>
                            <option value="string">Text</option>
                            <option value="boolean">Boolean</option>
                            <option value="location">Location</option>
                            <option value="timestamp">Timestamp</option>
                          </select>
                          <input
                            className="input text-[12px] !h-7" placeholder="Unit (°C, %…)"
                            value={field.unit ?? ''} onChange={e => updateField(i, { unit: e.target.value })}
                            onClick={e => e.stopPropagation()}
                          />
                        </div>
                        {/* Color dot indicator */}
                        {field.chartType && field.chartColor && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: field.chartColor }} />
                            <span className="text-[10px] text-muted-foreground capitalize">{field.chartType} chart</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Visualization panel */}
                <div className="space-y-3">
                  {selectedField ? (
                    <>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Visualization — {selectedField.label || selectedField.key || 'field'}
                      </p>
                      {selectedField.type === 'number' ? (
                        <>
                          {/* Chart type */}
                          <div className="flex gap-2">
                            {CHART_TYPES.map(({ value, label, Icon }) => (
                              <button
                                key={value} type="button"
                                onClick={() => updateField(selectedFieldIdx!, { chartType: value })}
                                className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl border text-[11px] font-medium transition-all ${
                                  selectedField.chartType === value
                                    ? 'border-primary bg-primary/5 text-primary'
                                    : 'border-border text-muted-foreground hover:text-foreground hover:border-border-strong'
                                }`}
                              >
                                <Icon size={14} />
                                {label}
                              </button>
                            ))}
                          </div>
                          {/* Color picker */}
                          <div>
                            <p className="text-[11px] text-muted-foreground mb-2">Color</p>
                            <div className="flex flex-wrap gap-2">
                              {CHART_COLORS.map(c => (
                                <button
                                  key={c} type="button"
                                  onClick={() => updateField(selectedFieldIdx!, { chartColor: c })}
                                  style={{ backgroundColor: c }}
                                  className={`w-6 h-6 rounded-lg transition-all ${
                                    selectedField.chartColor === c
                                      ? 'ring-2 ring-offset-2 ring-foreground/20 scale-110'
                                      : 'hover:scale-105'
                                  }`}
                                />
                              ))}
                              <input
                                type="color"
                                value={selectedField.chartColor ?? '#6366f1'}
                                onChange={e => updateField(selectedFieldIdx!, { chartColor: e.target.value })}
                                className="w-6 h-6 rounded-lg cursor-pointer border border-border"
                                title="Custom color"
                              />
                            </div>
                          </div>
                          {/* Live preview */}
                          <div className="rounded-xl border border-border bg-muted/20 p-2 overflow-hidden">
                            <MiniChartPreview
                              chartType={selectedField.chartType ?? 'line'}
                              color={selectedField.chartColor ?? '#6366f1'}
                            />
                          </div>
                        </>
                      ) : (
                        <div className="rounded-xl border border-border bg-muted/20 p-6 text-center">
                          <p className="text-[12px] text-muted-foreground">
                            Visualization is available for <strong className="text-foreground">number</strong> fields only.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border p-8 text-center">
                      <Activity size={20} className="text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-[12px] text-muted-foreground">Select a field to configure its visualization</p>
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
                <p className="text-[14px] font-semibold text-foreground">Device payload reference</p>
                <p className="text-[12px] text-muted-foreground">This shows how your firmware should format and send data. Copy and use in your device code.</p>
              </div>

              {/* Format tabs */}
              <div className="flex gap-1 bg-muted rounded-xl p-1 overflow-x-auto no-scrollbar">
                {FORMAT_TABS.map(({ key, label }) => (
                  <button
                    key={key} onClick={() => setPreviewTab(key)}
                    className={`px-3 py-1.5 text-[12px] font-medium rounded-lg whitespace-nowrap transition-all ${
                      previewTab === key
                        ? 'bg-surface text-foreground shadow-sm border border-border'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Preview content */}
              <div className="relative rounded-xl border border-border bg-foreground/[0.025] dark:bg-muted overflow-hidden">
                <button
                  onClick={() => { navigator.clipboard.writeText(previewContent); toast.success('Copied!'); }}
                  className="absolute top-3 right-3 btn btn-secondary btn-sm gap-1.5 z-10"
                >
                  <Copy size={12} /> Copy
                </button>
                <pre className="p-4 text-[12px] font-mono text-foreground/80 overflow-x-auto max-h-72 whitespace-pre leading-relaxed">
                  {validFields.length > 0 ? previewContent : '# Define fields in the previous step to generate examples'}
                </pre>
              </div>

              {validFields.length > 0 && (
                <div className="bg-primary/5 border border-primary/15 rounded-xl p-4">
                  <p className="text-[12px] font-semibold text-primary mb-1">Ingestion endpoint</p>
                  <code className="text-[12px] font-mono text-foreground/80">
                    POST https://orion.vortan.io/api/v1/telemetry/ingest
                  </code>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Get your device API key from the Device detail page after creation.
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* ── Step 4: Features ── */}
          {step === 4 && (
            <motion.div key="s4" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div>
                <p className="text-[14px] font-semibold text-foreground">Optional features</p>
                <p className="text-[12px] text-muted-foreground">Enable capabilities relevant to this device. All can be changed later.</p>
              </div>

              <FeatureToggle
                icon={MapPin}
                title="Location"
                desc="Pin this device on the map"
                enabled={locationEnabled}
                onToggle={() => setLocation(v => !v)}
              >
                {GMAPS_KEY ? (
                  <APIProvider apiKey={GMAPS_KEY}>
                    <LocationPicker lat={lat} lng={lng} onChange={(la, ln) => { setLat(la); setLng(ln); }} />
                  </APIProvider>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[12px] font-medium text-foreground mb-1">Latitude</label>
                      <input className="input text-[13px] font-mono" placeholder="0.000000" type="number" step="any"
                        value={lat || ''} onChange={e => setLat(parseFloat(e.target.value) || 0)} />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-foreground mb-1">Longitude</label>
                      <input className="input text-[13px] font-mono" placeholder="0.000000" type="number" step="any"
                        value={lng || ''} onChange={e => setLng(parseFloat(e.target.value) || 0)} />
                    </div>
                  </div>
                )}
              </FeatureToggle>

              <FeatureToggle
                icon={Activity}
                title="Live Tracking"
                desc="Stream location updates in real time on the map"
                enabled={tracking && locationEnabled}
                onToggle={() => { if (!locationEnabled) { toast.error('Enable Location first'); return; } setTracking(v => !v); }}
              />

              <FeatureToggle
                icon={AlertTriangle}
                title="Geo-fencing"
                desc="Trigger alerts when the device enters or leaves a defined area"
                enabled={geofence && locationEnabled}
                onToggle={() => { if (!locationEnabled) { toast.error('Enable Location first'); return; } setGeofence(v => !v); }}
              />
            </motion.div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border flex-shrink-0 bg-surface/60">
          <div>
            {step > 1 && (
              <button onClick={() => setStep(s => (s - 1) as Step)} className="btn btn-secondary">
                <ChevronLeft size={15} /> Back
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
                className="btn btn-primary"
              >
                Continue <ChevronRight size={15} />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={mutation.isPending} className="btn btn-primary">
                {mutation.isPending
                  ? <><Loader2 size={14} className="animate-spin" /> Creating…</>
                  : <><Check size={14} /> Create Device</>
                }
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
