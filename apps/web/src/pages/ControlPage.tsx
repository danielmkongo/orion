import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import apiClient from '@/api/client';
import { devicesApi } from '@/api/devices';
import { timeAgo } from '@/lib/utils';
import {
  Sliders, Send, X, Check, Clock, AlertCircle, Loader2,
  Terminal, ChevronDown, ChevronUp, Info, Radio, Globe, Wifi,
  ToggleLeft, SlidersHorizontal, Type, Minus, Plus, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { DataField } from '@/components/devices/DeviceForm';

/* ── Status config ─────────────────────────────────────────── */
const STATUS_CFG: Record<string, { badge: string; Icon: any }> = {
  pending:      { badge: 'badge-warning', Icon: Clock       },
  sent:         { badge: 'badge-info',    Icon: Send        },
  acknowledged: { badge: 'badge-info',    Icon: Check       },
  executed:     { badge: 'badge-online',  Icon: Check       },
  failed:       { badge: 'badge-error',   Icon: AlertCircle },
  timeout:      { badge: 'badge-error',   Icon: Clock       },
  cancelled:    { badge: 'badge-offline', Icon: X           },
};

/* ── Boolean control ───────────────────────────────────────── */
function BoolControl({
  field, onSend, loading,
}: { field: DataField; onSend: (name: string, value: unknown) => void; loading: boolean }) {
  const [on, setOn] = useState(false);
  return (
    <div className="card p-4 flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-foreground truncate">
          {field.label || field.key}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5 uppercase tracking-wider">
          Boolean · {field.key}
        </p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className={`text-[12px] font-medium transition-colors ${on ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
          {on ? 'ON' : 'OFF'}
        </span>
        <button
          onClick={() => {
            const next = !on;
            setOn(next);
            onSend(field.key, next);
          }}
          disabled={loading}
          style={{ width: 44, height: 24 }}
          className={`relative rounded-full transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${on ? 'bg-primary' : 'bg-border'} disabled:opacity-50`}
        >
          <motion.div
            animate={{ x: on ? 22 : 2 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm"
          />
        </button>
      </div>
    </div>
  );
}

/* ── Number / slider control ───────────────────────────────── */
function NumberControl({
  field, onSend, loading,
}: { field: DataField; onSend: (name: string, value: unknown) => void; loading: boolean }) {
  const [val, setVal] = useState(0);
  const [dirty, setDirty] = useState(false);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold text-foreground">{field.label || field.key}</p>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
            Number{field.unit ? ` · ${field.unit}` : ''} · {field.key}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setVal(v => Math.max(0, v - 1)); setDirty(true); }}
            className="btn btn-ghost btn-sm !w-7 !h-7 !px-0"
          ><Minus size={12} /></button>
          <input
            type="number"
            value={val}
            onChange={e => { setVal(Number(e.target.value)); setDirty(true); }}
            className="input !h-8 !w-20 text-center text-[13px] font-mono"
          />
          <button
            onClick={() => { setVal(v => v + 1); setDirty(true); }}
            className="btn btn-ghost btn-sm !w-7 !h-7 !px-0"
          ><Plus size={12} /></button>
          {field.unit && <span className="text-[12px] text-muted-foreground">{field.unit}</span>}
        </div>
      </div>
      <input
        type="range"
        min={0} max={100} step={1}
        value={Math.min(val, 100)}
        onChange={e => { setVal(Number(e.target.value)); setDirty(true); }}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-primary"
      />
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>0</span><span>50</span><span>100{field.unit ? ` ${field.unit}` : ''}</span>
      </div>
      <button
        onClick={() => { onSend(field.key, val); setDirty(false); }}
        disabled={loading || !dirty}
        className="btn btn-primary btn-sm w-full"
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
        Set {field.label || field.key}
      </button>
    </div>
  );
}

/* ── String / text control ─────────────────────────────────── */
const STRING_PRESETS: Record<string, string[]> = {
  mode: ['auto', 'manual', 'sleep', 'off'],
  state: ['active', 'idle', 'disabled'],
  level: ['low', 'medium', 'high'],
};

function StringControl({
  field, onSend, loading,
}: { field: DataField; onSend: (name: string, value: unknown) => void; loading: boolean }) {
  const [val, setVal] = useState('');
  const presets = STRING_PRESETS[field.key] ?? [];

  return (
    <div className="card p-4 space-y-3">
      <div>
        <p className="text-[13px] font-semibold text-foreground">{field.label || field.key}</p>
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Text · {field.key}</p>
      </div>
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {presets.map(p => (
            <button
              key={p}
              onClick={() => onSend(field.key, p)}
              disabled={loading}
              className={`px-3 py-1 rounded-lg border text-[12px] font-medium transition-all disabled:opacity-50 ${
                val === p
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border bg-surface text-muted-foreground hover:text-foreground hover:border-border-strong'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && val.trim()) { onSend(field.key, val); setVal(''); } }}
          placeholder={`Enter ${field.label || field.key}…`}
          className="input flex-1"
        />
        <button
          onClick={() => { if (val.trim()) { onSend(field.key, val); setVal(''); } }}
          disabled={loading || !val.trim()}
          className="btn btn-primary btn-sm"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
        </button>
      </div>
    </div>
  );
}

/* ── Delivery info ─────────────────────────────────────────── */
function DeliveryInfo({ deviceId }: { deviceId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Info size={14} className="text-primary" />
          <span className="text-[13px] font-medium text-foreground">Command Delivery</span>
          <span className="badge badge-info text-[10px]">How your device receives commands</span>
        </div>
        {open ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  Icon: Radio,
                  label: 'MQTT',
                  desc: 'Subscribe topic',
                  code: `devices/${deviceId}/commands`,
                },
                {
                  Icon: Globe,
                  label: 'HTTP Polling',
                  desc: 'GET pending commands',
                  code: `GET /api/v1/devices/${deviceId}/pending-commands`,
                },
                {
                  Icon: Wifi,
                  label: 'WebSocket',
                  desc: 'Event on connection',
                  code: 'event: "command"',
                },
              ].map(({ Icon, label, desc, code }) => (
                <div key={label} className="bg-muted/50 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={13} className="text-primary" />
                    <span className="text-[12px] font-semibold text-foreground">{label}</span>
                    <span className="text-[11px] text-muted-foreground">{desc}</span>
                  </div>
                  <code className="text-[11px] font-mono text-foreground/70 bg-background/60 rounded px-2 py-1 block break-all">
                    {code}
                  </code>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────── */
export function ControlPage() {
  const [deviceId, setDeviceId]     = useState('');
  const [cmdName, setCmdName]       = useState('');
  const [payload, setPayload]       = useState('{}');
  const [terminalOpen, setTerminal] = useState(false);
  const [sending, setSending]       = useState(false);
  const queryClient = useQueryClient();

  const { data: devicesData } = useQuery({
    queryKey: ['devices', 'control-page'],
    queryFn: () => devicesApi.list({ limit: 100 }),
  });

  const { data: commandsData, isLoading: cmdLoading } = useQuery({
    queryKey: ['commands', 'all'],
    queryFn: () => apiClient.get('/commands', { params: { limit: 50 } }).then(r => r.data),
    refetchInterval: 8_000,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/commands/${id}/cancel`),
    onSuccess: () => { toast.success('Cancelled'); queryClient.invalidateQueries({ queryKey: ['commands'] }); },
  });

  const devices  = devicesData?.devices ?? [];
  const commands = commandsData?.data ?? commandsData?.commands ?? [];

  // Auto-select first device
  useEffect(() => {
    if (!deviceId && devices.length > 0) setDeviceId((devices[0] as any)._id);
  }, [devices, deviceId]);

  const selectedDevice = devices.find((d: any) => d._id === deviceId) as any;
  const schemaFields: DataField[] = selectedDevice?.meta?.dataSchema?.fields ?? [];
  const controllableFields = schemaFields.filter(f =>
    ['boolean', 'number', 'string'].includes(f.type)
  );

  const sendControl = async (name: string, value: unknown) => {
    if (!deviceId) return;
    try {
      await apiClient.post('/commands', { deviceId, name, payload: { value } });
      toast.success(`Sent: ${name} = ${JSON.stringify(value)}`);
      queryClient.invalidateQueries({ queryKey: ['commands'] });
    } catch { toast.error('Failed to send command'); }
  };

  const sendTerminal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceId || !cmdName) return;
    setSending(true);
    try {
      let p = {};
      try { p = JSON.parse(payload); } catch {}
      await apiClient.post('/commands', { deviceId, name: cmdName, payload: p });
      toast.success('Command sent');
      setCmdName(''); setPayload('{}');
      queryClient.invalidateQueries({ queryKey: ['commands'] });
    } catch { toast.error('Failed'); }
    finally { setSending(false); }
  };

  const boolFields   = controllableFields.filter(f => f.type === 'boolean');
  const numberFields = controllableFields.filter(f => f.type === 'number');
  const stringFields = controllableFields.filter(f => f.type === 'string');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-semibold text-foreground tracking-tight">Control</h2>
          <p className="text-[14px] text-muted-foreground mt-0.5">
            Send commands and control devices in real time
          </p>
        </div>
      </div>

      {/* Device selector */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Sliders size={15} className="text-primary flex-shrink-0" />
          <select
            value={deviceId}
            onChange={e => setDeviceId(e.target.value)}
            className="select flex-1"
          >
            {devices.length === 0 && <option value="">No devices</option>}
            {devices.map((d: any) => (
              <option key={d._id} value={d._id}>{d.name}</option>
            ))}
          </select>
        </div>
        {selectedDevice && (
          <div className="flex items-center gap-2 text-[12px]">
            <span className={`status-dot ${selectedDevice.status === 'online' ? 'status-dot-online' : 'status-dot-offline'}`} />
            <span className="text-muted-foreground capitalize">{selectedDevice.status}</span>
            <span className="text-border">·</span>
            <span className="text-muted-foreground capitalize">{selectedDevice.category}</span>
            {controllableFields.length > 0 && (
              <>
                <span className="text-border">·</span>
                <span className="text-primary font-medium">{controllableFields.length} controls</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Delivery info */}
      {deviceId && <DeliveryInfo deviceId={deviceId} />}

      {/* Schema-based controls */}
      {deviceId && (
        <>
          {controllableFields.length === 0 ? (
            <div className="card p-10 text-center">
              <SlidersHorizontal size={28} className="text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-[14px] font-semibold text-foreground">No controls defined</p>
              <p className="text-[13px] text-muted-foreground mt-1 max-w-sm mx-auto">
                Define fields in the device's Data Schema to generate controls automatically.
                Use the terminal below to send raw commands.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Toggles row */}
              {boolFields.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <ToggleLeft size={14} className="text-muted-foreground" />
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Toggles</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {boolFields.map(f => (
                      <BoolControl key={f.key} field={f} onSend={sendControl} loading={false} />
                    ))}
                  </div>
                </div>
              )}

              {/* Setpoints row */}
              {numberFields.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <SlidersHorizontal size={14} className="text-muted-foreground" />
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Setpoints</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {numberFields.map(f => (
                      <NumberControl key={f.key} field={f} onSend={sendControl} loading={false} />
                    ))}
                  </div>
                </div>
              )}

              {/* Text controls */}
              {stringFields.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Type size={14} className="text-muted-foreground" />
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Text Controls</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {stringFields.map(f => (
                      <StringControl key={f.key} field={f} onSend={sendControl} loading={false} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Terminal */}
      <div className="card overflow-hidden">
        <button
          onClick={() => setTerminal(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-primary" />
            <span className="text-[13px] font-semibold text-foreground">Terminal</span>
            <span className="text-[11px] text-muted-foreground">Send arbitrary commands</span>
          </div>
          {terminalOpen ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
        </button>
        <AnimatePresence>
          {terminalOpen && (
            <motion.div
              initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <form onSubmit={sendTerminal} className="flex flex-wrap items-end gap-3 p-4 border-t border-border">
                <div className="min-w-[160px]">
                  <label className="block text-[12px] font-medium text-foreground mb-1.5">Command Name</label>
                  <input
                    value={cmdName}
                    onChange={e => setCmdName(e.target.value)}
                    className="input font-mono"
                    placeholder="reboot, get_status…"
                    required
                  />
                </div>
                <div className="min-w-[220px] flex-1">
                  <label className="block text-[12px] font-medium text-foreground mb-1.5">Payload (JSON)</label>
                  <input
                    value={payload}
                    onChange={e => setPayload(e.target.value)}
                    className="input font-mono text-[12px]"
                    placeholder="{}"
                  />
                </div>
                <button type="submit" disabled={sending || !deviceId} className="btn btn-primary self-end">
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Command history */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-[13px] font-semibold text-foreground">Command History</span>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted-foreground">{commands.length} records</span>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['commands'] })}
              className="btn btn-ghost btn-sm !w-7 !h-7 !px-0"
            >
              <RefreshCw size={12} />
            </button>
          </div>
        </div>
        {cmdLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-lg" />)}
          </div>
        ) : commands.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-muted-foreground">No commands sent yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Device</th><th>Command</th><th>Status</th>
                  <th>Sent</th><th>Response</th><th></th>
                </tr>
              </thead>
              <tbody>
                {commands.map((cmd: any, i: number) => {
                  const sc = STATUS_CFG[cmd.status] ?? { badge: 'badge-offline', Icon: Clock };
                  const Icon = sc.Icon;
                  const devName = devices.find((d: any) => d._id === cmd.deviceId)?.name ?? cmd.deviceId?.slice(-8);
                  return (
                    <motion.tr key={cmd._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}>
                      <td><span className="text-[13px] text-foreground">{devName}</span></td>
                      <td>
                        <code className="text-[12px] font-mono text-primary bg-primary/8 px-2 py-0.5 rounded">
                          {cmd.name}
                        </code>
                      </td>
                      <td>
                        <span className={`badge ${sc.badge} gap-1`}>
                          <Icon size={10} /> {cmd.status}
                        </span>
                      </td>
                      <td className="text-[12px] text-muted-foreground">{timeAgo(cmd.createdAt)}</td>
                      <td className="text-[12px] text-muted-foreground font-mono max-w-[180px] truncate">
                        {cmd.errorMessage ?? (cmd.response ? JSON.stringify(cmd.response).slice(0, 50) : '—')}
                      </td>
                      <td>
                        {['pending', 'sent'].includes(cmd.status) && (
                          <button
                            onClick={() => cancelMutation.mutate(cmd._id)}
                            className="text-[12px] text-red-600 dark:text-red-400 hover:underline"
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
