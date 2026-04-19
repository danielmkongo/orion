import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Plus, Trash2, Check, Loader2, MapPin,
  LineChart, AreaChart, BarChart2, Gauge, ScatterChart,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { devicesApi } from '@/api/devices';
import type { DeviceCategory, DeviceProtocol, DevicePayloadFormat } from '@orion/shared';
import toast from 'react-hot-toast';
import L from 'leaflet';
import { LineChart as CustomLineChart, Sparkline } from '@/components/charts/Charts';

/* ─── Types ─────────────────────────────────────────────────────── */
export interface DataField {
  key: string;
  label: string;
  type: 'number' | 'string' | 'boolean' | 'location' | 'timestamp';
  unit?: string;
  chartable?: boolean;
  chartType?: 'line' | 'area' | 'bar' | 'gauge' | 'scatter';
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
  { value: 'line', label: 'Line', Icon: LineChart },
  { value: 'area', label: 'Area', Icon: AreaChart },
  { value: 'bar', label: 'Bar', Icon: BarChart2 },
  { value: 'gauge', label: 'Gauge', Icon: Gauge },
  { value: 'scatter', label: 'Scatter', Icon: ScatterChart },
];

const CHART_COLORS = ['#FF6A30','#5B8DEF','#22C55E','#F59E0B','#8B5CF6','#06B6D4','#F43F5E','#0ea5e9'];

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
function GraphPreview({ field }: { field: DataField }) {
  const sparklineData = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => ({
      t: i,
      v: 30 - Math.sin(i / 3) * 18 + Math.cos(i / 2) * 8,
    })),
    []
  );

  if (field.type !== 'number') {
    return (
      <div className="border border-[hsl(var(--rule))] p-6 text-center bg-muted/20">
        <p className="text-[12px] text-muted-foreground">
          Visualization available for <strong className="text-foreground">number</strong> fields only.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-[hsl(var(--rule))] p-3 bg-muted/20">
      <p className="eyebrow text-[9px] mb-2">Preview</p>
      <Sparkline data={sparklineData} height={50} color={field.chartColor || '#FF6A30'} fill />
    </div>
  );
}

/* ─── Command preview ────────────────────────────────────────────────── */
function CommandPreview({ cmd }: { cmd: Command }) {
  const [bv, setBv] = useState(cmd.def as boolean ?? false);
  const [nv, setNv] = useState(cmd.def as number ?? 0);
  const [ev, setEv] = useState((cmd.values || '').split(',')[0] || '');
  const [pressed, setPressed] = useState(false);

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
      </motion.div>
    );
  }

  if (cmd.ctype === 'enum') {
    const vals = (cmd.values || '').split(',').map(s => s.trim()).filter(Boolean);
    return (
      <motion.div layout className="flex items-center justify-between">
        <span className="text-[13px]">{cmd.label || cmd.name}</span>
        <select
          value={ev}
          onChange={e => setEv(e.target.value)}
          className="select text-[12px] w-40"
        >
          {vals.map(v => <option key={v}>{v}</option>)}
          {vals.length === 0 && <option>(define values)</option>}
        </select>
      </motion.div>
    );
  }

  // action
  return (
    <motion.div layout className="flex items-center justify-between">
      <span className="text-[13px]">{cmd.label || cmd.name}</span>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => { setPressed(true); setTimeout(() => setPressed(false), 800); }}
        className={`btn btn-sm ${pressed ? 'btn-primary' : 'btn-outline'}`}
      >
        {pressed ? '✓ Sent' : 'Trigger'}
      </motion.button>
    </motion.div>
  );
}

/* ─── Leaflet location picker ────────────────────────────────────────── */
function LocationPicker({ lat, lng, onChange }: {
  lat: number; lng: number;
  onChange: (lat: number, lng: number) => void;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

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
      html: `<div style="width:14px;height:14px;background:hsl(var(--primary));border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>`,
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
  }, []);

  return (
    <div className="space-y-3">
      <div ref={mapRef} style={{ height: 260 }} className="border border-[hsl(var(--rule))]" />
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
                        <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                          {fields.map((field, i) => (
                            <motion.div
                              key={i}
                              layout
                              onClick={() => setSelIdx(i)}
                              className={`border p-2.5 space-y-1.5 cursor-pointer transition-all ${
                                selectedFieldIdx === i ? 'border-primary/40 bg-primary/[0.025]' : 'border-[hsl(var(--rule))] hover:border-foreground/20'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  className="input text-[11px] !h-7 flex-1 font-mono"
                                  placeholder="field_key"
                                  value={field.key}
                                  onChange={e => updateField(i, { key: e.target.value })}
                                  onClick={e => e.stopPropagation()}
                                />
                                <button
                                  onClick={e => { e.stopPropagation(); removeField(i); }}
                                  className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-red-500 flex-shrink-0"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                              <div className="grid grid-cols-3 gap-1">
                                <input className="input text-[10px] !h-7" placeholder="Label"
                                  value={field.label} onChange={e => updateField(i, { label: e.target.value })}
                                  onClick={e => e.stopPropagation()} />
                                <select className="select text-[10px] !h-7" value={field.type}
                                  onChange={e => updateField(i, { type: e.target.value as DataField['type'] })}
                                  onClick={e => e.stopPropagation()}>
                                  <option value="number">Number</option>
                                  <option value="string">Text</option>
                                  <option value="boolean">Bool</option>
                                </select>
                                <input className="input text-[10px] !h-7" placeholder="Unit"
                                  value={field.unit ?? ''} onChange={e => updateField(i, { unit: e.target.value })}
                                  onClick={e => e.stopPropagation()} />
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
                                      style={{ backgroundColor: c }}
                                      className={`w-5 h-5 transition-all ${selectedField.chartColor === c ? 'ring-2 ring-offset-1 ring-foreground/50 scale-110' : 'hover:scale-105'}`}
                                    />
                                  ))}
                                  <input
                                    type="color"
                                    value={selectedField.chartColor ?? '#FF6A30'}
                                    onChange={e => updateField(selectedFieldIdx!, { chartColor: e.target.value })}
                                    className="w-5 h-5 cursor-pointer border border-[hsl(var(--rule))]"
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
                      <p className="eyebrow text-[9px]">Payload to be sent</p>
                      <button
                        onClick={() => { navigator.clipboard.writeText(JSON.stringify(payload, null, 2)); toast.success('Copied!'); }}
                        className="text-[10px] text-primary hover:underline flex items-center gap-1"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="p-3 bg-muted/30 border border-[hsl(var(--rule))] text-[11px] font-mono text-foreground/80 overflow-x-auto max-h-[140px] leading-relaxed">
                      {validFields.length > 0 ? JSON.stringify(payload, null, 2) : '// Add fields above'}
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
                                <input className="input text-[11px] !h-7" type="number" value={cmd.def ?? 0}
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
                            <CommandPreview cmd={cmd} />
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

                  {/* Fields */}
                  {validFields.length > 0 && (
                    <div className="border border-[hsl(var(--rule))] p-4">
                      <p className="eyebrow text-[9px] mb-2">Data fields · {validFields.length}</p>
                      <div className="space-y-1.5">
                        {validFields.map(f => (
                          <div key={f.key} className="flex items-center justify-between text-[12px]">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className="w-2 h-2 flex-shrink-0" style={{ backgroundColor: f.chartColor }} />
                              <span className="font-mono">{f.key}</span>
                            </div>
                            <span className="text-muted-foreground text-[10px] ml-2">{f.type}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Commands */}
                  {commands.length > 0 && (
                    <div className="border border-[hsl(var(--rule))] p-4">
                      <p className="eyebrow text-[9px] mb-2">Commands · {commands.length}</p>
                      <div className="space-y-1.5">
                        {commands.map(c => (
                          <div key={c.name} className="flex items-center justify-between text-[12px]">
                            <span className="font-mono">{c.name}</span>
                            <span className="tag tag-accent text-[9px]">{c.ctype}</span>
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
                sample_payload: payload,
              }, null, 2)}
            </pre>
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
