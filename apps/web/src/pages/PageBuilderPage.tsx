import { useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import GridLayout, { WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import apiClient from '@/api/client';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, Globe, Lock, Pencil, Trash2, GripVertical, X, Check, Copy, ExternalLink } from 'lucide-react';
import { LineChart, BarChart } from '@/components/charts/Charts';
import { telemetryApi } from '@/api/telemetry';
import { devicesApi } from '@/api/devices';

const ResponsiveGridLayout = WidthProvider(GridLayout);
const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const MAP_ID  = import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID';

const WIDGET_TYPES = [
  { type: 'kpi_card',    label: 'KPI Card',    icon: '▣', desc: 'Big number metric', defaultW: 3, defaultH: 2 },
  { type: 'line_chart',  label: 'Line Chart',  icon: '〜', desc: 'Time-series area chart', defaultW: 6, defaultH: 4 },
  { type: 'bar_chart',   label: 'Bar Chart',   icon: '▐', desc: 'Time-series bar chart', defaultW: 6, defaultH: 4 },
  { type: 'gauge',       label: 'Gauge',       icon: '◉', desc: 'Radial gauge, current value', defaultW: 3, defaultH: 3 },
  { type: 'data_table',  label: 'Data Table',  icon: '⊞', desc: 'Latest telemetry as table', defaultW: 5, defaultH: 4 },
  { type: 'map',         label: 'Map',         icon: '⊕', desc: 'Device location on map', defaultW: 6, defaultH: 5 },
  { type: 'status_grid', label: 'Status Grid', icon: '⬡', desc: 'Fleet online/offline grid', defaultW: 4, defaultH: 3 },
];

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

  const fields: Record<string, number> = latest?.fields ?? {};
  const val = widget.field ? fields[widget.field] : undefined;

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
    return pts.length > 0
      ? <LineChart series={[{ name: widget.field ?? '', data: pts, color: 'hsl(var(--primary))' }]} height={140} showArea />
      : <div className="dim" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12 }}>No data yet</div>;
  }

  if (widget.type === 'bar_chart') {
    const pts = (series?.data ?? []).slice(-24).map((p: any) => ({
      label: new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      value: p.value,
    }));
    return pts.length > 0
      ? <BarChart data={pts} color="hsl(var(--primary))" height={140} />
      : <div className="dim" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12 }}>No data yet</div>;
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
    const deviceId = widget.deviceId;
    const { data: dData } = useQuery({
      queryKey: ['wmap-device', deviceId],
      queryFn: () => apiClient.get(`/devices/${deviceId}`).then(r => r.data),
      enabled: !!deviceId,
    });
    const loc = dData?.location;
    if (!API_KEY) return <div className="dim" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12, textAlign: 'center', padding: 16 }}>Add VITE_GOOGLE_MAPS_API_KEY to enable maps</div>;
    if (!loc?.lat) return <div className="dim" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12 }}>No location data</div>;
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

  return <div className="dim" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12 }}>{widget.type}</div>;
}

/* ── Widget config modal ─────────────────────────────────────────────── */
function WidgetConfigModal({ initial, devices, onSave, onClose }: {
  initial?: Partial<Widget>;
  devices: any[];
  onSave: (w: Widget) => void;
  onClose: () => void;
}) {
  const wtype = WIDGET_TYPES.find(t => t.type === initial?.type) ?? WIDGET_TYPES[0];
  const [type, setType]       = useState(initial?.type ?? 'kpi_card');
  const [title, setTitle]     = useState(initial?.title ?? '');
  const [deviceId, setDeviceId] = useState(initial?.deviceId ?? '');
  const [field, setField]     = useState(initial?.field ?? '');
  const [rangeMs, setRangeMs] = useState(initial?.rangeMs ?? 24 * 3600_000);
  const [deviceIds, setDeviceIds] = useState<string[]>(initial?.deviceIds ?? []);

  const { data: latest } = useQuery({
    queryKey: ['wconfig-latest', deviceId],
    queryFn: () => apiClient.get('/telemetry/latest', { params: { deviceId } }).then(r => r.data),
    enabled: !!deviceId,
  });
  const availableFields = Object.entries(latest?.fields ?? {})
    .filter(([, v]) => typeof v === 'number')
    .map(([k]) => k);

  const needsDevice   = !['status_grid', 'map'].includes(type) || type === 'map';
  const needsField    = ['line_chart', 'bar_chart', 'gauge', 'kpi_card'].includes(type);
  const needsRange    = ['line_chart', 'bar_chart'].includes(type);
  const needsDeviceIds = type === 'status_grid';

  const toggleDeviceId = (id: string) =>
    setDeviceIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const save = () => {
    if (!title.trim()) { toast.error('Title required'); return; }
    const defW = WIDGET_TYPES.find(t => t.type === type)?.defaultW ?? 4;
    const defH = WIDGET_TYPES.find(t => t.type === type)?.defaultH ?? 3;
    onSave({
      id: (initial as any)?.id ?? uid(),
      type, title: title.trim(),
      deviceId: needsDevice ? (deviceId || undefined) : undefined,
      deviceIds: needsDeviceIds ? deviceIds : undefined,
      field: needsField ? (field || undefined) : undefined,
      rangeMs: needsRange ? rangeMs : undefined,
      config: {},
      position: (initial as any)?.position ?? { x: 0, y: Infinity, w: defW, h: defH },
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}>
      <div className="panel" style={{ width: '100%', maxWidth: 520, padding: 28, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>{initial?.type ? 'Edit' : 'Add'} <em style={{ color: 'hsl(var(--primary))' }}>widget</em></div>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-icon"><X size={14} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Widget type grid */}
          <div>
            <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 8 }}>Widget type</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {WIDGET_TYPES.map(wt => (
                <button
                  key={wt.type}
                  onClick={() => { setType(wt.type); setField(''); }}
                  style={{
                    padding: '10px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    border: `1px solid ${type === wt.type ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`,
                    background: type === wt.type ? 'hsl(var(--primary) / 0.08)' : 'transparent',
                    cursor: 'pointer', fontSize: 10,
                  }}
                >
                  <span style={{ fontSize: 18 }}>{wt.icon}</span>
                  <span style={{ color: type === wt.type ? 'hsl(var(--primary))' : 'hsl(var(--muted-fg))' }}>{wt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Title</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Temperature overview" />
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
              <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 8 }}>Devices to show <span className="faint">(leave empty for all)</span></label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {devices.map((d: any) => (
                  <button
                    key={d._id}
                    onClick={() => toggleDeviceId(d._id)}
                    style={{
                      padding: '4px 10px', fontSize: 12, border: '1px solid',
                      borderColor: deviceIds.includes(d._id) ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                      background: deviceIds.includes(d._id) ? 'hsl(var(--primary) / 0.1)' : 'transparent',
                      color: deviceIds.includes(d._id) ? 'hsl(var(--primary))' : 'hsl(var(--muted-fg))',
                      cursor: 'pointer',
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
                {[['1h',3600_000],['6h',21600_000],['24h',86400_000],['7d',604800_000]].map(([l,v]) => (
                  <button key={l} className={rangeMs === v ? 'on' : ''} onClick={() => setRangeMs(v as number)}>{l}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
          <button onClick={save} className="btn btn-primary btn-sm" style={{ gap: 4 }}>
            <Check size={11} /> Save widget
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── PageBuilderPage ─────────────────────────────────────────────────── */
export function PageBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [configModal, setConfigModal] = useState<{ open: boolean; widget?: Widget }>({ open: false });
  const [publishing, setPublishing] = useState(false);

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

  const pageData = page as any;
  const widgets: Widget[] = pageData?.widgets ?? [];
  const publishedToken: string | null = pageData?.shareToken ?? null;

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
      if (!pos) return w;
      return { ...w, position: { x: pos.x, y: pos.y, w: pos.w, h: pos.h } };
    });
    debouncedPatch(updated);
  };

  const addOrUpdateWidget = async (w: Widget) => {
    const existing = widgets.findIndex(x => x.id === w.id);
    const updated = existing >= 0
      ? widgets.map(x => x.id === w.id ? w : x)
      : [...widgets, w];
    await patchWidgetsImmediate(updated);
    setConfigModal({ open: false });
  };

  const removeWidget = async (wid: string) => {
    await patchWidgetsImmediate(widgets.filter(w => w.id !== wid));
  };

  const publish = async () => {
    setPublishing(true);
    try {
      const res = await apiClient.post(`/pages/${id}/publish`);
      queryClient.setQueryData(['page', id], (old: any) => ({ ...old, shareToken: res.data.token }));
      const url = `${window.location.origin}/s/${res.data.token}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success('Published! Link copied.');
    } catch { toast.error('Failed to publish'); }
    finally { setPublishing(false); }
  };

  const unpublish = async () => {
    try {
      await apiClient.delete(`/pages/${id}/publish`);
      queryClient.setQueryData(['page', id], (old: any) => ({ ...old, shareToken: undefined }));
      toast.success('Unpublished');
    } catch { toast.error('Failed to unpublish'); }
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/s/${publishedToken}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    toast.success('Link copied!');
  };

  if (isLoading) return <div className="page"><div className="skeleton" style={{ height: 200 }} /></div>;
  if (!pageData) return <div className="page"><p className="dim" style={{ textAlign: 'center', padding: '64px 0' }}>Page not found</p></div>;

  const layout = widgets.map(w => ({
    i: w.id, x: w.position.x, y: w.position.y,
    w: w.position.w, h: w.position.h, minW: 2, minH: 2,
  }));

  return (
    <div className="page" style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link to="/pages" className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
          <ArrowLeft size={13} /> Pages
        </Link>
        <h1 style={{ flex: 1, fontFamily: 'var(--font-display)', fontSize: 26, margin: 0, lineHeight: 1 }}>
          {pageData.name} {publishedToken && <span className="eyebrow" style={{ fontSize: 10, color: 'hsl(var(--good))', marginLeft: 8 }}>● LIVE</span>}
        </h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" style={{ gap: 6 }} onClick={() => setConfigModal({ open: true })}>
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

      {/* Hint */}
      {widgets.length > 0 && (
        <div className="mono faint" style={{ fontSize: 10.5, marginBottom: 12 }}>
          Drag headers to move · drag bottom-right corner to resize
        </div>
      )}

      {/* Canvas */}
      {widgets.length === 0 ? (
        <div className="panel" style={{ padding: '80px 24px', textAlign: 'center', border: '2px dashed hsl(var(--border))' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, marginBottom: 10 }}>
            Empty <em style={{ color: 'hsl(var(--primary))' }}>canvas</em>
          </div>
          <p className="dim" style={{ fontSize: 13, marginBottom: 20 }}>Add widgets to build your dashboard. Drag to move, resize from corners.</p>
          <button className="btn btn-primary" style={{ gap: 6 }} onClick={() => setConfigModal({ open: true })}>
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
          {widgets.map(w => (
            <div key={w.id} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }} className="panel">
              {/* Card header — drag handle */}
              <div className="drag-handle" style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 12px', borderBottom: '1px solid hsl(var(--rule-ghost))',
                cursor: 'grab', flexShrink: 0, userSelect: 'none',
                background: 'hsl(var(--surface-raised))',
              }}>
                <GripVertical size={13} style={{ color: 'hsl(var(--muted-fg))', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.title}</span>
                <span className="mono faint" style={{ fontSize: 9, textTransform: 'uppercase', flexShrink: 0 }}>{w.type.replace('_', ' ')}</span>
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => setConfigModal({ open: true, widget: w })}
                  className="btn btn-ghost btn-sm btn-icon" style={{ flexShrink: 0 }}
                >
                  <Pencil size={11} />
                </button>
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => removeWidget(w.id)}
                  className="btn btn-ghost btn-sm btn-icon" style={{ color: 'hsl(var(--bad))', flexShrink: 0 }}
                >
                  <Trash2 size={11} />
                </button>
              </div>

              {/* Widget body */}
              <div style={{ flex: 1, padding: w.type === 'map' ? 0 : '10px 12px', overflow: 'hidden', minHeight: 0 }}>
                <WidgetContent widget={w} />
              </div>
            </div>
          ))}
        </ResponsiveGridLayout>
      )}

      {configModal.open && (
        <WidgetConfigModal
          initial={configModal.widget}
          devices={devices}
          onSave={addOrUpdateWidget}
          onClose={() => setConfigModal({ open: false })}
        />
      )}
    </div>
  );
}
