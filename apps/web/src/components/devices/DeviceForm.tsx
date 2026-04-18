import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Plus, Trash2, ChevronRight, ChevronLeft,
  Check, Loader2, MapPin, Activity, AlertTriangle,
  Code2, RefreshCw,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { devicesApi } from '@/api/devices';
import type { DeviceCategory, DeviceProtocol, DevicePayloadFormat } from '@orion/shared';
import toast from 'react-hot-toast';

/* ─────────────── Types ──────────────────────────────────── */
export interface DataField {
  key:      string;
  label:    string;
  type:     'number' | 'string' | 'boolean' | 'location' | 'timestamp';
  unit?:    string;
  chartable?: boolean;
}

type Step = 1 | 2 | 3;

const EMPTY_FIELD = (): DataField => ({ key: '', label: '', type: 'number', unit: '', chartable: true });

const CATEGORIES: { value: DeviceCategory; label: string; emoji: string }[] = [
  { value: 'environmental', label: 'Environmental', emoji: '🌱' },
  { value: 'industrial',    label: 'Industrial',    emoji: '⚙️'  },
  { value: 'energy',        label: 'Energy',        emoji: '⚡'  },
  { value: 'water',         label: 'Water',         emoji: '💧'  },
  { value: 'tracker',       label: 'Tracker',       emoji: '📍'  },
  { value: 'gateway',       label: 'Gateway',       emoji: '🔀'  },
  { value: 'research',      label: 'Research',      emoji: '🔬'  },
  { value: 'custom',        label: 'Custom',        emoji: '🔧'  },
];

const PROTOCOLS: { value: DeviceProtocol; label: string; desc: string }[] = [
  { value: 'http',      label: 'HTTP/S',     desc: 'REST API' },
  { value: 'mqtt',      label: 'MQTT',       desc: 'Pub/Sub' },
  { value: 'websocket', label: 'WebSocket',  desc: 'Persistent' },
  { value: 'coap',      label: 'CoAP',       desc: 'Constrained' },
  { value: 'custom',    label: 'Custom',     desc: 'Proprietary' },
];

/* ─────────────── Helpers ────────────────────────────────── */
function inferType(value: unknown): DataField['type'] {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number')  return 'number';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return 'timestamp';
  return 'string';
}

function fieldsToJson(fields: DataField[]): string {
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
    }));
  } catch {
    return null;
  }
}

/* ─────────────── Step indicator ────────────────────────── */
function Steps({ current }: { current: Step }) {
  const steps = [
    { n: 1 as Step, label: 'Identity'     },
    { n: 2 as Step, label: 'Data Schema'  },
    { n: 3 as Step, label: 'Features'     },
  ];
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map(({ n, label }, i) => (
        <div key={n} className="flex items-center gap-0 flex-1">
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold transition-colors ${
              current > n ? 'bg-primary text-white'
              : current === n ? 'bg-primary text-white ring-4 ring-primary/20'
              : 'bg-muted text-muted-foreground border border-border'
            }`}>
              {current > n ? <Check size={12} strokeWidth={3} /> : n}
            </div>
            <span className={`text-[11px] whitespace-nowrap ${current >= n ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`flex-1 h-px mx-2 mb-4 transition-colors ${current > n ? 'bg-primary' : 'bg-border'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ─────────────── Props ──────────────────────────────────── */
interface DeviceFormProps {
  onClose: () => void;
}

/* ─────────────── Main component ────────────────────────── */
export function DeviceForm({ onClose }: DeviceFormProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(1);

  // Step 1 — Identity
  const [name, setName]             = useState('');
  const [description, setDesc]      = useState('');
  const [category, setCategory]     = useState<DeviceCategory>('custom');
  const [serialNumber, setSerial]   = useState('');
  const [protocol, setProtocol]     = useState<DeviceProtocol>('http');
  const [payloadFormat, setFormat]  = useState<DevicePayloadFormat>('json');
  const [tags, setTagsStr]          = useState('');

  // Step 2 — Data Schema
  const [fields, setFields]         = useState<DataField[]>([EMPTY_FIELD()]);
  const [pasteOpen, setPasteOpen]   = useState(false);
  const [pasteJson, setPasteJson]   = useState('');
  const [pasteError, setPasteError] = useState('');

  // Step 3 — Features
  const [locationEnabled, setLocation] = useState(false);
  const [lat, setLat]                  = useState('');
  const [lng, setLng]                  = useState('');
  const [tracking, setTracking]        = useState(false);
  const [geofence, setGeofence]        = useState(false);

  /* Field helpers */
  const updateField = useCallback((i: number, patch: Partial<DataField>) => {
    setFields(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  }, []);

  const addField = () => setFields(prev => [...prev, EMPTY_FIELD()]);

  const removeField = (i: number) =>
    setFields(prev => prev.filter((_, idx) => idx !== i));

  /* Parse pasted JSON → populate fields */
  function applyPaste() {
    if (!pasteJson.trim()) { setPasteError('Paste a JSON object first'); return; }
    const result = parseJsonToFields(pasteJson);
    if (!result) { setPasteError('Invalid JSON or not a flat object'); return; }
    setFields(result.length > 0 ? result : [EMPTY_FIELD()]);
    setPasteOpen(false);
    setPasteJson('');
    setPasteError('');
    toast.success(`Imported ${result.length} field${result.length !== 1 ? 's' : ''}`);
  }

  /* Mutation */
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
      name:         name.trim(),
      description:  description.trim() || undefined,
      serialNumber: serialNumber.trim() || undefined,
      category,
      protocol,
      payloadFormat,
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      meta: {
        dataSchema: { fields: validFields },
        features: {
          locationEnabled,
          tracking,
          geofence,
        },
      },
    };

    if (locationEnabled && lat && lng) {
      payload.location = {
        lat:       parseFloat(lat),
        lng:       parseFloat(lng),
        timestamp: new Date().toISOString(),
      };
    }

    mutation.mutate(payload);
  }

  /* Live JSON preview from current fields */
  const jsonPreview = fieldsToJson(fields.filter(f => f.key.trim()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.18 }}
        className="relative bg-background rounded-2xl border border-border shadow-card-hover w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-[16px] font-semibold text-foreground tracking-tight">Add Device</h2>
          <button onClick={onClose} className="btn-ghost btn btn-sm !px-0 w-8 h-8">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <Steps current={step} />

          {/* ─── Step 1: Identity ─── */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-5"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[13px] font-medium text-foreground mb-1.5">
                    Device Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="input"
                    placeholder="e.g. Sensor Node #12"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    autoFocus
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

              {/* Category */}
              <div>
                <label className="block text-[13px] font-medium text-foreground mb-2">Category</label>
                <div className="grid grid-cols-4 gap-2">
                  {CATEGORIES.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCategory(c.value)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-[12px] font-medium transition-all ${
                        category === c.value
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border bg-surface hover:border-border-strong text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <span className="text-xl">{c.emoji}</span>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Protocol */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-foreground mb-2">Protocol</label>
                  <div className="flex flex-wrap gap-2">
                    {PROTOCOLS.map(p => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setProtocol(p.value)}
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
                  <select
                    value={payloadFormat}
                    onChange={e => setFormat(e.target.value as DevicePayloadFormat)}
                    className="select"
                  >
                    {['json', 'csv', 'xml', 'raw', 'custom'].map(f => (
                      <option key={f} value={f}>{f.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── Step 2: Data Schema ─── */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-semibold text-foreground">Define your data fields</p>
                  <p className="text-[12px] text-muted-foreground">Tell Orion what your device sends. This powers dashboards and alerts.</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setPasteOpen(true); setPasteError(''); }}
                  className="btn btn-secondary btn-sm gap-1.5"
                >
                  <Code2 size={13} /> Paste JSON
                </button>
              </div>

              {/* Paste JSON modal */}
              <AnimatePresence>
                {pasteOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="rounded-xl border border-border overflow-hidden bg-muted/40"
                  >
                    <div className="p-4">
                      <p className="text-[13px] font-medium text-foreground mb-2">Paste a sample JSON payload:</p>
                      <textarea
                        autoFocus
                        value={pasteJson}
                        onChange={e => { setPasteJson(e.target.value); setPasteError(''); }}
                        rows={5}
                        className="textarea font-mono text-[12px]"
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

              {/* Two-column layout: form + preview */}
              <div className="grid grid-cols-2 gap-4">
                {/* Field builder */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Fields ({fields.filter(f => f.key).length})</p>
                    <button onClick={addField} className="btn btn-ghost btn-sm gap-1">
                      <Plus size={12} /> Add
                    </button>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {fields.map((field, i) => (
                      <div key={i} className="card p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            className="input text-[12px] !h-7 flex-1"
                            placeholder="key_name"
                            value={field.key}
                            onChange={e => updateField(i, { key: e.target.value })}
                          />
                          <button
                            onClick={() => removeField(i)}
                            className="btn-ghost btn btn-sm !px-0 w-7 h-7 flex-shrink-0 text-muted-foreground hover:text-red-500"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            className="input text-[12px] !h-7"
                            placeholder="Label"
                            value={field.label}
                            onChange={e => updateField(i, { label: e.target.value })}
                          />
                          <select
                            className="select text-[12px] !h-7"
                            value={field.type}
                            onChange={e => updateField(i, { type: e.target.value as DataField['type'] })}
                          >
                            <option value="number">Number</option>
                            <option value="string">Text</option>
                            <option value="boolean">Boolean</option>
                            <option value="location">Location</option>
                            <option value="timestamp">Timestamp</option>
                          </select>
                          <input
                            className="input text-[12px] !h-7"
                            placeholder="Unit (°C, %…)"
                            value={field.unit ?? ''}
                            onChange={e => updateField(i, { unit: e.target.value })}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Live JSON preview */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Live Preview</p>
                    <button
                      onClick={() => setFields([EMPTY_FIELD()])}
                      className="btn btn-ghost btn-sm gap-1 text-muted-foreground"
                      title="Reset"
                    >
                      <RefreshCw size={11} />
                    </button>
                  </div>
                  <div className="rounded-xl border border-border bg-foreground/[0.03] dark:bg-muted h-[254px] overflow-auto p-3">
                    <pre className="text-[11.5px] font-mono text-foreground/80 whitespace-pre leading-relaxed">
                      {jsonPreview || '{\n\n}'}
                    </pre>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                    Updates as you define fields
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── Step 3: Features ─── */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <p className="text-[12px] text-muted-foreground">Enable optional platform features for this device. You can change these any time.</p>

              {/* Location */}
              <FeatureToggle
                icon={MapPin}
                title="Location"
                desc="Pin this device on the map"
                enabled={locationEnabled}
                onToggle={() => setLocation(v => !v)}
              >
                {locationEnabled && (
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="block text-[12px] font-medium text-foreground mb-1">Latitude</label>
                      <input className="input text-[13px]" placeholder="0.000000" value={lat} onChange={e => setLat(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-foreground mb-1">Longitude</label>
                      <input className="input text-[13px]" placeholder="0.000000" value={lng} onChange={e => setLng(e.target.value)} />
                    </div>
                  </div>
                )}
              </FeatureToggle>

              <FeatureToggle
                icon={Activity}
                title="Live Tracking"
                desc="Stream location updates in real time on the map"
                enabled={tracking}
                onToggle={() => setTracking(v => !v)}
              />

              <FeatureToggle
                icon={AlertTriangle}
                title="Geo-fencing"
                desc="Trigger alerts when the device enters or leaves a defined area"
                enabled={geofence}
                onToggle={() => setGeofence(v => !v)}
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
            {step < 3 ? (
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
              <button
                onClick={handleSubmit}
                disabled={mutation.isPending}
                className="btn btn-primary"
              >
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

/* ─────────────── FeatureToggle sub-component ────────────── */
function FeatureToggle({ icon: Icon, title, desc, enabled, onToggle, children }: {
  icon: React.FC<any>;
  title: string;
  desc: string;
  enabled: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-4 transition-all ${enabled ? 'border-primary/30 bg-primary/[0.03]' : 'border-border bg-surface'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${enabled ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
            <Icon size={15} />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-foreground">{title}</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">{desc}</p>
          </div>
        </div>
        {/* Toggle switch */}
        <button
          type="button"
          onClick={onToggle}
          className={`relative w-10 h-5.5 h-[22px] rounded-full transition-colors flex-shrink-0 mt-0.5 ${enabled ? 'bg-primary' : 'bg-border'}`}
          style={{ width: 40, height: 22 }}
        >
          <motion.div
            animate={{ x: enabled ? 20 : 2 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow-sm"
          />
        </button>
      </div>
      {children}
    </div>
  );
}
