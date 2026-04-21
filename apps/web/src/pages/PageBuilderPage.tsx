import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import GridLayout, { WidthProvider } from 'react-grid-layout';
import '@/styles/grid-layout.css';
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import apiClient from '@/api/client';
import toast from 'react-hot-toast';
import { copyText } from '@/lib/utils';
import { ArrowLeft, Plus, Globe, Lock, Pencil, Trash2, GripVertical, X, Check, Copy, ExternalLink, Download, Settings, ChevronLeft } from 'lucide-react';
import { LineChart, BarChart } from '@/components/charts/Charts';
import { CommandWidget } from '@/components/devices/CommandWidget';
import type { DeviceCommand } from '@/components/devices/CommandWidget';
import { telemetryApi } from '@/api/telemetry';
import { devicesApi } from '@/api/devices';

const ResponsiveGridLayout = WidthProvider(GridLayout);
const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const MAP_ID  = import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID';

const WIDGET_TYPES = [
  { type: 'kpi_card',      label: 'KPI Card',    icon: '▣', desc: 'Big number metric',         defaultW: 3, defaultH: 2 },
  { type: 'line_chart',    label: 'Line Chart',  icon: '〜', desc: 'Time-series area chart',    defaultW: 6, defaultH: 4 },
  { type: 'bar_chart',     label: 'Bar Chart',   icon: '▐', desc: 'Time-series bar chart',     defaultW: 6, defaultH: 4 },
  { type: 'gauge',         label: 'Gauge',       icon: '◉', desc: 'Radial gauge, live value',   defaultW: 3, defaultH: 3 },
  { type: 'data_table',    label: 'Data Table',  icon: '⊞', desc: 'Latest telemetry as table',  defaultW: 5, defaultH: 4 },
  { type: 'map',           label: 'Map',         icon: '⊕', desc: 'Device location on map',     defaultW: 6, defaultH: 5 },
  { type: 'status_grid',   label: 'Status Grid', icon: '⬡', desc: 'Fleet status badges',        defaultW: 4, defaultH: 3 },
  { type: 'control_panel', label: 'Controls',    icon: '⌥', desc: 'Device command controls',    defaultW: 4, defaultH: 4 },
];

const WIDGET_ACCENT: Record<string, string> = {
  kpi_card:      'hsl(var(--primary))',
  line_chart:    '#3b82f6',
  bar_chart:     '#8b5cf6',
  gauge:         '#f59e0b',
  data_table:    '#10b981',
  map:           '#06b6d4',
  status_grid:   '#f97316',
  control_panel: '#ec4899',
};

interface Widget {
  id: string;
  type: string;
  title: string;
  deviceId?: string;
  deviceIds?: string[];
  field?: string;
  rangeMs?: number;
  config: Record<string, unknown>;
  position: { x: number; y: number; w: number; h: number };
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/* ── ResizeObserver-based height measurement ────────────────────────── */
function useContainerHeight(ref: React.RefObject<HTMLDivElement>) {
  const [h, setH] = useState(140);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setH(Math.floor(e.contentRect.height)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return h;
}

function ChartWrapper({ render }: { render: (h: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const h = useContainerHeight(ref);
  return (
    <div ref={ref} style={{ height: '100%', overflow: 'hidden' }}>
      {render(Math.max(60, h - 8))}
    </div>
  );
}

/* ── Widget preview content ─────────────────────────────────────────── */
function WidgetContent({ widget }: { widget: Widget }) {
  const { data: latest } = useQuery({
    queryKey: ['wpreview-latest', widget.deviceId],
    queryFn: () => apiClient.get('/telemetry/latest', { params: { deviceId: widget.deviceId } }).then(r => r.data),
    enabled: !!widget.deviceId && ['kpi_card', 'data_table', 'gauge'].includes(widget.type),
    refetchInterval: 30_000,
  });

  const { data: series } = useQuery({
    queryKey: ['wpreview-series', widget.deviceId, widget.field, widget.rangeMs],
    queryFn: () => telemetryApi.series(
      widget.deviceId!, widget.field!,
      new Date(Date.now() - (widget.rangeMs ?? 24 * 3600_000)).toISOString(),
      new Date().toISOString(), 300
    ),
    enabled: !!widget.deviceId && !!widget.field && ['line_chart', 'bar_chart'].includes(widget.type),
    refetchInterval: 60_000,
  });

  const { data: devicesData } = useQuery({
    queryKey: ['wpreview-devices', widget.deviceIds],
    queryFn: () => devicesApi.list({ limit: 200 }),
    enabled: ['status_grid', 'map'].includes(widget.type),
  });

  const { data: deviceMeta } = useQuery({
    queryKey: ['wcontrol-device', widget.deviceId],
    queryFn: () => apiClient.get(`/devices/${widget.deviceId}`).then(r => r.data),
    enabled: !!widget.deviceId && widget.type === 'control_panel',
  });

  // Moved unconditional — was inside if(type==='map') block which violates hooks rules
  const { data: mapDeviceData } = useQuery({
    queryKey: ['wmap-device', widget.deviceId],
    queryFn: () => apiClient.get(`/devices/${widget.deviceId}`).then(r => r.data),
    enabled: widget.type === 'map' && !!widget.deviceId,
  });

  const fields: Record<string, number> = latest?.fields ?? {};
  const val = widget.field ? fields[widget.field] : undefined;
  const dim = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12 } as const;

  if (widget.type === 'kpi_card') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 4 }}>
        <div className="eyebrow" style={{ fontSize: 9 }}>{(widget.field ?? 'value').replace(/_/g, ' ')}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px,4vw,52px)', lineHeight: 1, color: 'hsl(var(--primary))' }}>
          {val !== undefined ? val.toFixed(2) : <span className="dim" style={{ fontSize: 20 }}>—</span>}
        </div>
        {latest?.timestamp && <div className="mono faint" style={{ fontSize: 9.5 }}>live</div>}
      </div>
    );
  }

  if (widget.type === 'gauge') {
    const pct = val !== undefined ? Math.min(100, Math.max(0, (val / 100) * 100)) : 0;
    const r = 60; const cx = 80; const cy = 80;
    const start = Math.PI * 0.75; const end = Math.PI * 2.25;
    const arc = (a: number) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    const s = arc(start); const e = arc(end);
    const a = arc(start + (end - start) * (pct / 100));
    const large = pct > 50 ? 1 : 0;
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <svg viewBox="0 0 160 130" style={{ width: '100%', maxWidth: 160, height: 'auto' }}>
          <path d={`M ${s.x} ${s.y} A ${r} ${r} 0 1 1 ${e.x} ${e.y}`} fill="none" stroke="hsl(var(--border))" strokeWidth={10} strokeLinecap="round" />
          {pct > 0 && <path d={`M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${a.x} ${a.y}`} fill="none" stroke="hsl(var(--primary))" strokeWidth={10} strokeLinecap="round" />}
          <text x={cx} y={cy - 4} textAnchor="middle" style={{ fontFamily: 'var(--font-display)', fontSize: 22, fill: 'hsl(var(--fg))' }}>{val?.toFixed(1) ?? '—'}</text>
          <text x={cx} y={cy + 14} textAnchor="middle" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'hsl(var(--muted-fg))', textTransform: 'uppercase' }}>{widget.field ?? ''}</text>
        </svg>
      </div>
    );
  }

  if (widget.type === 'line_chart') {
    const pts = (series?.data ?? []).map((p: any) => ({ ts: new Date(p.ts).getTime(), value: p.value }));
    return (
      <ChartWrapper render={h => pts.length > 0
        ? <LineChart series={[{ name: widget.field ?? '', data: pts, color: 'hsl(var(--primary))' }]} height={h} showArea />
        : <div className="dim" style={dim}>No data yet</div>}
      />
    );
  }

  if (widget.type === 'bar_chart') {
    const pts = (series?.data ?? []).slice(-24).map((p: any) => ({
      label: new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      value: p.value,
    }));
    return (
      <ChartWrapper render={h => pts.length > 0
        ? <BarChart data={pts} color="hsl(var(--primary))" height={h} />
        : <div className="dim" style={dim}>No data yet</div>}
      />
    );
  }

  if (widget.type === 'data_table') {
    const entries = Object.entries(fields).filter(([, v]) => typeof v === 'number');
    return (
      <div style={{ overflowY: 'auto', height: '100%' }}>
        <table style={{ width: '100%', fontSize: 11, fontFamily: 'var(--font-mono)', borderCollapse: 'collapse' }}>
          <tbody>
            {entries.length === 0
              ? <tr><td colSpan={2} className="dim" style={{ padding: '16px 0', textAlign: 'center' }}>No data</td></tr>
              : entries.map(([k, v]) => (
                <tr key={k} style={{ borderBottom: '1px solid hsl(var(--rule-ghost))' }}>
                  <td style={{ padding: '5px 8px', color: 'hsl(var(--muted-fg))' }}>{k.replace(/_/g, ' ')}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right' }}>{(v as number).toFixed(3)}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    );
  }

  if (widget.type === 'map') {
    const loc = mapDeviceData?.location;
    if (!API_KEY) return <div className="dim" style={{ ...dim, textAlign: 'center', padding: 16 }}>Add VITE_GOOGLE_MAPS_API_KEY to enable maps</div>;
    if (!loc?.lat) return <div className="dim" style={dim}>No location data</div>;
    return (
      <APIProvider apiKey={API_KEY}>
        <Map mapId={MAP_ID} defaultCenter={{ lat: loc.lat, lng: loc.lng ?? loc.lon ?? 0 }} defaultZoom={12}
          mapTypeId="satellite" style={{ width: '100%', height: '100%' }}
          gestureHandling="cooperative" streetViewControl={false} mapTypeControl={false} zoomControl={false}>
          <AdvancedMarker position={{ lat: loc.lat, lng: loc.lng ?? loc.lon ?? 0 }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'hsl(var(--primary))', border: '2.5px solid white', boxShadow: '0 0 0 3px rgba(255,91,31,0.4)' }} />
          </AdvancedMarker>
        </Map>
      </APIProvider>
    );
  }

  if (widget.type === 'status_grid') {
    const allDevices = devicesData?.devices ?? [];
    const shown = widget.deviceIds?.length
      ? allDevices.filter((d: any) => widget.deviceIds!.includes(d._id))
      : allDevices.slice(0, 12);
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 6, padding: 4, alignContent: 'start' }}>
        {shown.map((d: any) => (
          <div key={d._id} style={{ padding: '6px 8px', background: 'hsl(var(--surface-raised))' }}>
            <div style={{ fontSize: 10.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
            <span className={`tag tag-${d.status === 'online' ? 'online' : d.status === 'error' ? 'error' : 'offline'}`} style={{ marginTop: 3, display: 'inline-block' }}>{d.status}</span>
          </div>
        ))}
      </div>
    );
  }

  if (widget.type === 'control_panel') {
    const commands: DeviceCommand[] = deviceMeta?.meta?.commands ?? [];
    const sendCmd = async (name: string, formattedPayload: string) => {
      try {
        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(formattedPayload); } catch {}
        await apiClient.post('/commands', { deviceId: widget.deviceId, name, payload: parsed });
        toast.success(`Sent: ${name}`);
      } catch { toast.error('Failed to send'); }
    };
    if (!widget.deviceId) return <div className="dim" style={{ ...dim, textAlign: 'center', padding: 16 }}>Select a device to show its controls</div>;
    if (commands.length === 0) return <div className="dim" style={{ ...dim, textAlign: 'center', padding: 16 }}>No commands defined for this device</div>;
    return (
      <div style={{ overflowY: 'auto', height: '100%' }}>
        {commands.map(cmd => (
          <CommandWidget key={cmd.name} cmd={cmd} payloadFormat={deviceMeta?.payloadFormat} onSend={sendCmd} compact />
        ))}
      </div>
    );
  }

  return <div className="dim" style={dim}>{widget.type}</div>;
}

/* ── Slide-in widget drawer ─────────────────────────────────────────── */
function WidgetDrawer({ open, editing, devices, onSave, onClose }: {
  open: boolean;
  editing?: Partial<Widget>;
  devices: any[];
  onSave: (w: Widget) => void;
  onClose: () => void;
}) {
  const isEditing = !!(editing as any)?.id;
  const [step, setStep]         = useState<'type-select' | 'config'>(isEditing ? 'config' : 'type-select');
  const [type, setType]         = useState(editing?.type ?? 'kpi_card');
  const [title, setTitle]       = useState(editing?.title ?? '');
  const [deviceId, setDeviceId] = useState(editing?.deviceId ?? '');
  const [field, setField]       = useState(editing?.field ?? '');
  const [rangeMs, setRangeMs]   = useState(editing?.rangeMs ?? 24 * 3600_000);
  const [deviceIds, setDeviceIds] = useState<string[]>(editing?.deviceIds ?? []);
  const [hoveredType, setHoveredType] = useState<string | null>(null);

  const { data: latest } = useQuery({
    queryKey: ['wconfig-latest', deviceId],
    queryFn: () => apiClient.get('/telemetry/latest', { params: { deviceId } }).then(r => r.data),
    enabled: !!deviceId,
  });
  const availableFields = Object.entries(latest?.fields ?? {})
    .filter(([, v]) => typeof v === 'number')
    .map(([k]) => k);

  const needsDevice    = !['status_grid'].includes(type);
  const needsField     = ['line_chart', 'bar_chart', 'gauge', 'kpi_card'].includes(type);
  const needsRange     = ['line_chart', 'bar_chart'].includes(type);
  const needsDeviceIds = type === 'status_grid';

  const toggleDeviceId = (id: string) =>
    setDeviceIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const pickType = (t: string) => { setType(t); setField(''); setStep('config'); };

  const save = () => {
    if (!title.trim()) { toast.error('Title required'); return; }
    const defW = WIDGET_TYPES.find(t => t.type === type)?.defaultW ?? 4;
    const defH = WIDGET_TYPES.find(t => t.type === type)?.defaultH ?? 3;
    onSave({
      id: (editing as any)?.id ?? uid(),
      type, title: title.trim(),
      deviceId: needsDevice ? (deviceId || undefined) : undefined,
      deviceIds: needsDeviceIds ? deviceIds : undefined,
      field: needsField ? (field || undefined) : undefined,
      rangeMs: needsRange ? rangeMs : undefined,
      config: {},
      position: (editing as any)?.position ?? { x: 0, y: Infinity, w: defW, h: defH },
    });
  };

  const selectedMeta = WIDGET_TYPES.find(wt => wt.type === type);

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 420,
      background: 'hsl(var(--surface))',
      borderLeft: '1px solid hsl(var(--border))',
      boxShadow: '-12px 0 48px rgba(0,0,0,0.3)',
      transform: open ? 'translateX(0)' : 'translateX(100%)',
      transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
      zIndex: 100, display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 20px', borderBottom: '1px solid hsl(var(--border))', flexShrink: 0 }}>
        {step === 'config' && !isEditing && (
          <button onClick={() => setStep('type-select')} className="btn btn-ghost btn-sm btn-icon">
            <ChevronLeft size={14} />
          </button>
        )}
        <div style={{ flex: 1, fontFamily: 'var(--font-display)', fontSize: 18 }}>
          {isEditing ? 'Edit ' : step === 'type-select' ? 'Add ' : 'Configure '}
          <em style={{ color: 'hsl(var(--primary))' }}>
            {step === 'config' && !isEditing ? (selectedMeta?.label ?? 'widget') : 'widget'}
          </em>
        </div>
        <button onClick={onClose} className="btn btn-ghost btn-sm btn-icon"><X size={14} /></button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {step === 'type-select' ? (
          <>
            <p className="dim" style={{ fontSize: 12, marginBottom: 16 }}>Choose a widget type to add to your page.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {WIDGET_TYPES.map(wt => (
                <button
                  key={wt.type}
                  onClick={() => pickType(wt.type)}
                  onMouseEnter={() => setHoveredType(wt.type)}
                  onMouseLeave={() => setHoveredType(null)}
                  style={{
                    padding: '18px 14px',
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10,
                    border: `1px solid ${hoveredType === wt.type ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`,
                    borderLeft: `3px solid ${WIDGET_ACCENT[wt.type] ?? 'hsl(var(--primary))'}`,
                    background: hoveredType === wt.type ? 'hsl(var(--primary) / 0.06)' : 'transparent',
                    cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 22, lineHeight: 1 }}>{wt.icon}</span>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'hsl(var(--fg))' }}>{wt.label}</div>
                    <div style={{ fontSize: 11, color: 'hsl(var(--muted-fg))', marginTop: 3, lineHeight: 1.4 }}>{wt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Title</label>
              <input
                className="input" value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Temperature overview"
                autoFocus={!isEditing}
                onKeyDown={e => e.key === 'Enter' && save()}
              />
            </div>

            {needsDevice && !needsDeviceIds && (
              <div>
                <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Device</label>
                <select className="select" value={deviceId} onChange={e => { setDeviceId(e.target.value); setField(''); }}>
                  <option value="">— select device —</option>
                  {devices.map((d: any) => <option key={d._id} value={d._id}>{d.name}</option>)}
                </select>
              </div>
            )}

            {needsDeviceIds && (
              <div>
                <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 8 }}>
                  Devices <span className="faint">(leave empty for all)</span>
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {devices.map((d: any) => (
                    <button
                      key={d._id} onClick={() => toggleDeviceId(d._id)}
                      style={{
                        padding: '4px 10px', fontSize: 12, border: '1px solid', cursor: 'pointer',
                        borderColor: deviceIds.includes(d._id) ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                        background: deviceIds.includes(d._id) ? 'hsl(var(--primary) / 0.1)' : 'transparent',
                        color: deviceIds.includes(d._id) ? 'hsl(var(--primary))' : 'hsl(var(--muted-fg))',
                      }}
                    >{d.name}</button>
                  ))}
                </div>
              </div>
            )}

            {needsField && deviceId && (
              <div>
                <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Field</label>
                <select className="select" value={field} onChange={e => setField(e.target.value)}>
                  <option value="">— select field —</option>
                  {availableFields.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            )}

            {needsRange && (
              <div>
                <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Time range</label>
                <div className="seg">
                  {[['1h', 3600_000], ['6h', 21600_000], ['24h', 86400_000], ['7d', 604800_000]].map(([l, v]) => (
                    <button key={l} className={rangeMs === v ? 'on' : ''} onClick={() => setRangeMs(v as number)}>{l}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer — config step only */}
      {step === 'config' && (
        <div style={{ padding: '16px 20px', borderTop: '1px solid hsl(var(--border))', display: 'flex', gap: 10, flexShrink: 0 }}>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ flex: 1 }}>Cancel</button>
          <button onClick={save} className="btn btn-primary btn-sm" style={{ flex: 2, gap: 4 }}>
            <Check size={11} /> {isEditing ? 'Update widget' : 'Add to canvas'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── PageBuilderPage ─────────────────────────────────────────────────── */
export function PageBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [drawer, setDrawer]           = useState<{ open: boolean; widget?: Widget }>({ open: false });
  const [publishing, setPublishing]   = useState(false);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName]     = useState('');
  const [showSettings, setShowSettings]           = useState(false);
  const [settingsBrandTitle, setSettingsBrandTitle]     = useState('');
  const [settingsBrandLogoUrl, setSettingsBrandLogoUrl] = useState('');

  const { data: page, isLoading } = useQuery({
    queryKey: ['page', id],
    queryFn: () => apiClient.get(`/pages/${id}`).then(r => r.data),
    enabled: !!id,
  });

  const { data: devicesData } = useQuery({
    queryKey: ['devices-all'],
    queryFn: () => devicesApi.list({ limit: 200 }),
  });
  const devices: any[] = devicesData?.devices ?? [];

  const pageData       = page as any;
  const widgets: Widget[] = pageData?.widgets ?? [];
  const publishedToken: string | null = pageData?.shareToken ?? null;
  const allowExports: boolean = pageData?.allowExports ?? false;

  useEffect(() => {
    if (pageData) {
      setSettingsBrandTitle(pageData.brandTitle ?? '');
      setSettingsBrandLogoUrl(pageData.brandLogoUrl ?? '');
    }
  }, [pageData?.brandTitle, pageData?.brandLogoUrl]);

  const toggleExports = async () => {
    try {
      const res = await apiClient.patch(`/pages/${id}`, { allowExports: !allowExports });
      queryClient.setQueryData(['page', id], (old: any) => ({ ...old, allowExports: res.data.allowExports }));
      toast.success(!allowExports ? 'Exports enabled for viewers' : 'Exports disabled');
    } catch { toast.error('Failed to update'); }
  };

  const saveSettings = async () => {
    try {
      await apiClient.patch(`/pages/${id}`, {
        brandTitle: settingsBrandTitle,
        brandLogoUrl: settingsBrandLogoUrl,
      });
      queryClient.setQueryData(['page', id], (old: any) => ({
        ...old, brandTitle: settingsBrandTitle, brandLogoUrl: settingsBrandLogoUrl,
      }));
      toast.success('Branding saved');
      setShowSettings(false);
    } catch { toast.error('Failed to save settings'); }
  };

  const saveName = async () => {
    const name = draftName.trim();
    if (name && name !== pageData?.name) {
      try {
        await apiClient.patch(`/pages/${id}`, { name });
        queryClient.setQueryData(['page', id], (old: any) => ({ ...old, name }));
      } catch { toast.error('Failed to rename'); }
    }
    setEditingName(false);
  };

  const debouncedPatch = useCallback((newWidgets: Widget[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await apiClient.patch(`/pages/${id}`, { widgets: newWidgets });
        queryClient.setQueryData(['page', id], (old: any) => ({ ...old, widgets: newWidgets }));
      } catch { toast.error('Auto-save failed'); }
    }, 600);
  }, [id, queryClient]);

  const patchWidgetsImmediate = useCallback(async (newWidgets: Widget[]) => {
    try {
      await apiClient.patch(`/pages/${id}`, { widgets: newWidgets });
      queryClient.setQueryData(['page', id], (old: any) => ({ ...old, widgets: newWidgets }));
    } catch { toast.error('Failed to save'); }
  }, [id, queryClient]);

  const handleLayoutChange = (layout: any[]) => {
    if (!widgets.length) return;
    const updated = widgets.map(w => {
      const pos = layout.find((l: any) => l.i === w.id);
      return pos ? { ...w, position: { x: pos.x, y: pos.y, w: pos.w, h: pos.h } } : w;
    });
    debouncedPatch(updated);
  };

  const addOrUpdateWidget = async (w: Widget) => {
    const existing = widgets.findIndex(x => x.id === w.id);
    const updated = existing >= 0
      ? widgets.map(x => x.id === w.id ? w : x)
      : [...widgets, w];
    await patchWidgetsImmediate(updated);
    setDrawer({ open: false });
  };

  const removeWidget = async (wid: string) => {
    await patchWidgetsImmediate(widgets.filter(w => w.id !== wid));
  };

  const publish = async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      try { await apiClient.patch(`/pages/${id}`, { widgets }); } catch {}
    }
    setPublishing(true);
    try {
      const res = await apiClient.post(`/pages/${id}/publish`);
      queryClient.setQueryData(['page', id], (old: any) => ({ ...old, shareToken: res.data.token }));
      const url = `${window.location.origin}/s/${res.data.token}`;
      await copyText(url);
      toast.success('Published! Link copied.');
    } catch {
      queryClient.invalidateQueries({ queryKey: ['page', id] });
      toast.error('Failed to publish');
    } finally { setPublishing(false); }
  };

  const unpublish = async () => {
    try {
      await apiClient.delete(`/pages/${id}/publish`);
      queryClient.setQueryData(['page', id], (old: any) => ({ ...old, shareToken: undefined }));
      toast.success('Unpublished');
    } catch { toast.error('Failed to unpublish'); }
  };

  const copyLink = async () => {
    await copyText(`${window.location.origin}/s/${publishedToken}`);
    toast.success('Link copied!');
  };

  if (isLoading) return <div className="page"><div className="skeleton" style={{ height: 200 }} /></div>;
  if (!pageData) return <div className="page"><p className="dim" style={{ textAlign: 'center', padding: '64px 0' }}>Page not found</p></div>;

  const layout = widgets.map(w => ({
    i: w.id, x: w.position.x, y: w.position.y,
    w: w.position.w, h: w.position.h, minW: 2, minH: 2,
  }));

  return (
    <div
      className="page"
      style={{ paddingBottom: 80, paddingRight: drawer.open ? 432 : 0, transition: 'padding-right 0.25s cubic-bezier(0.4,0,0.2,1)' }}
    >
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Link to="/pages" className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
          <ArrowLeft size={13} /> Pages
        </Link>

        <div style={{ flex: 1, minWidth: 200 }}>
          {editingName ? (
            <input
              autoFocus
              value={draftName}
              onChange={e => setDraftName(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
              style={{
                fontFamily: 'var(--font-display)', fontSize: 24,
                background: 'transparent', border: 'none',
                borderBottom: '2px solid hsl(var(--primary))', outline: 'none',
                color: 'hsl(var(--fg))', width: '100%', maxWidth: 400,
              }}
            />
          ) : (
            <h1
              style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: 0, lineHeight: 1.2, cursor: 'text', display: 'inline-flex', alignItems: 'center', gap: 8 }}
              onClick={() => { setEditingName(true); setDraftName(pageData.name); }}
              title="Click to rename"
            >
              {pageData.name}
              {publishedToken && (
                <span className="eyebrow" style={{ fontSize: 10, color: 'hsl(var(--good))' }}>● LIVE</span>
              )}
            </h1>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowSettings(s => !s)}
            className="btn btn-ghost btn-sm btn-icon"
            title="Page branding"
            style={{ color: showSettings ? 'hsl(var(--primary))' : undefined }}
          >
            <Settings size={14} />
          </button>
          <button
            onClick={toggleExports}
            className="btn btn-sm btn-ghost"
            title={allowExports ? 'Viewers can download data — click to disable' : 'Viewers cannot download — click to enable'}
            style={{ gap: 6, color: allowExports ? 'hsl(var(--good))' : 'hsl(var(--muted-fg))' }}
          >
            <Download size={13} /> {allowExports ? 'Exports on' : 'Exports off'}
          </button>
          <button className="btn btn-primary btn-sm" style={{ gap: 6 }} onClick={() => setDrawer({ open: true })}>
            <Plus size={13} /> Add widget
          </button>
          {publishedToken ? (
            <>
              <button onClick={copyLink} className="btn btn-sm" style={{ gap: 6 }}>
                <Copy size={13} /> Copy link
              </button>
              <a href={`/s/${publishedToken}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline" style={{ gap: 6 }}>
                <ExternalLink size={13} /> View
              </a>
              <button onClick={unpublish} className="btn btn-sm btn-outline" style={{ gap: 6, color: 'hsl(var(--bad))' }}>
                <Lock size={13} /> Unpublish
              </button>
            </>
          ) : (
            <button onClick={publish} disabled={publishing} className="btn btn-sm btn-outline" style={{ gap: 6 }}>
              <Globe size={13} /> {publishing ? 'Publishing…' : 'Publish'}
            </button>
          )}
        </div>
      </div>

      {/* ── Branding settings panel ── */}
      {showSettings && (
        <div className="panel" style={{ padding: '20px 24px', marginBottom: 20, borderTop: '2px solid hsl(var(--primary))' }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Page branding</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>
                Brand name <span className="faint">(overrides page title on public link)</span>
              </label>
              <input
                className="input"
                value={settingsBrandTitle}
                onChange={e => setSettingsBrandTitle(e.target.value)}
                placeholder={pageData.name}
              />
            </div>
            <div>
              <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>
                Logo URL <span className="faint">(shown top-left on public page)</span>
              </label>
              <input
                className="input"
                value={settingsBrandLogoUrl}
                onChange={e => setSettingsBrandLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={saveSettings} className="btn btn-primary btn-sm" style={{ gap: 4 }}>
              <Check size={11} /> Save branding
            </button>
            <button onClick={() => setShowSettings(false)} className="btn btn-ghost btn-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* ── Hint bar ── */}
      {widgets.length > 0 && (
        <div className="mono faint" style={{ fontSize: 10.5, marginBottom: 12 }}>
          Drag headers to move · resize from corners · click title to rename page
        </div>
      )}

      {/* ── Canvas ── */}
      {widgets.length === 0 ? (
        <div style={{ padding: '60px 24px', textAlign: 'center', border: '1px dashed hsl(var(--border))', background: 'hsl(var(--surface))' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, maxWidth: 420, margin: '0 auto 32px', opacity: 0.12, pointerEvents: 'none' }}>
            <div style={{ height: 72, border: '1px dashed hsl(var(--fg))', borderRadius: 4 }} />
            <div style={{ height: 72, border: '1px dashed hsl(var(--fg))', borderRadius: 4 }} />
            <div style={{ height: 100, gridColumn: '1/-1', border: '1px dashed hsl(var(--fg))', borderRadius: 4 }} />
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, marginBottom: 10 }}>
            Empty <em style={{ color: 'hsl(var(--primary))' }}>canvas</em>
          </div>
          <p className="dim" style={{ fontSize: 13, marginBottom: 24 }}>Add widgets to build your page. Drag to rearrange, resize from any edge.</p>
          <button className="btn btn-primary" style={{ gap: 6 }} onClick={() => setDrawer({ open: true })}>
            <Plus size={14} /> Add first widget
          </button>
        </div>
      ) : (
        <ResponsiveGridLayout
          className="layout"
          layout={layout}
          cols={12}
          rowHeight={70}
          margin={[12, 12]}
          containerPadding={[0, 0]}
          onLayoutChange={handleLayoutChange}
          draggableHandle=".drag-handle"
          resizeHandles={['se', 'sw', 'ne', 'nw', 'e', 'w', 's']}
          style={{ minHeight: 400 }}
        >
          {widgets.map(w => {
            const accent = WIDGET_ACCENT[w.type] ?? 'hsl(var(--primary))';
            const needsSetup = !['status_grid'].includes(w.type) && !w.deviceId;
            const isHovered = hoveredCard === w.id;
            return (
              <div
                key={w.id}
                className="panel"
                onMouseEnter={() => setHoveredCard(w.id)}
                onMouseLeave={() => setHoveredCard(null)}
                style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderLeft: `3px solid ${accent}` }}
              >
                <div className="drag-handle" style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 10px', borderBottom: '1px solid hsl(var(--rule-ghost))',
                  cursor: 'grab', flexShrink: 0, userSelect: 'none',
                  background: 'hsl(var(--surface-raised))',
                }}>
                  <GripVertical size={12} style={{ color: 'hsl(var(--muted-fg))', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {w.title}
                    {needsSetup && (
                      <span style={{ color: '#f59e0b', fontSize: 9, marginLeft: 6, fontFamily: 'var(--font-mono)', fontWeight: 400 }}>
                        · setup needed
                      </span>
                    )}
                  </span>
                  <span className="mono faint" style={{ fontSize: 9, textTransform: 'uppercase', flexShrink: 0 }}>
                    {WIDGET_TYPES.find(t => t.type === w.type)?.icon} {w.type.replace('_', ' ')}
                  </span>
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={() => setDrawer({ open: true, widget: w })}
                    className="btn btn-ghost btn-sm btn-icon"
                    style={{ flexShrink: 0, opacity: isHovered ? 1 : 0, transition: 'opacity 0.15s' }}
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={() => removeWidget(w.id)}
                    className="btn btn-ghost btn-sm btn-icon"
                    style={{ color: 'hsl(var(--bad))', flexShrink: 0, opacity: isHovered ? 1 : 0, transition: 'opacity 0.15s' }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                <div style={{ flex: 1, padding: w.type === 'map' ? 0 : '10px 12px', overflow: 'hidden', minHeight: 0 }}>
                  <WidgetContent widget={w} />
                </div>
              </div>
            );
          })}
        </ResponsiveGridLayout>
      )}

      {/* ── Drawer (always mounted for smooth transition) ── */}
      <WidgetDrawer
        key={drawer.widget?.id ?? 'new'}
        open={drawer.open}
        editing={drawer.widget}
        devices={devices}
        onSave={addOrUpdateWidget}
        onClose={() => setDrawer({ open: false })}
      />
    </div>
  );
}
