import { useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import apiClient from '@/api/client';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, Globe, Lock, Pencil, Trash2, GripVertical, X, Check } from 'lucide-react';
import { LineChart, BarChart } from '@/components/charts/Charts';
import { telemetryApi } from '@/api/telemetry';
import { devicesApi } from '@/api/devices';

const WIDGET_TYPES = [
  { type: 'kpi_card',    label: 'KPI Card',    desc: 'Single metric with big number' },
  { type: 'line_chart',  label: 'Line Chart',  desc: 'Time-series line chart' },
  { type: 'bar_chart',   label: 'Bar Chart',   desc: 'Time-series bar chart' },
  { type: 'gauge',       label: 'Gauge',       desc: 'Radial gauge, current value' },
  { type: 'data_table',  label: 'Data Table',  desc: 'Latest telemetry as table' },
  { type: 'map',         label: 'Map',         desc: 'Device location on map' },
  { type: 'status_grid', label: 'Status Grid', desc: 'Device online/offline grid' },
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

function nanoid() {
  return Math.random().toString(36).slice(2, 10);
}

/* ── Sortable widget card ──────────────────────────────────────────── */
function WidgetCard({
  widget, devices, onEdit, onDelete,
}: {
  widget: Widget;
  devices: any[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: widget.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const device = devices.find(d => d._id === widget.deviceId);

  return (
    <div ref={setNodeRef} style={{ ...style, overflow: 'hidden' }} className="panel">
      {/* Card header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid hsl(var(--rule-ghost))' }}>
        <button {...attributes} {...listeners} style={{ cursor: 'grab', color: 'hsl(var(--muted-fg))', background: 'none', border: 0, padding: 0, display: 'flex' }}>
          <GripVertical size={14} />
        </button>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{widget.title}</div>
        <span className="mono faint" style={{ fontSize: 9.5, textTransform: 'uppercase' }}>{widget.type.replace('_', ' ')}</span>
        <button onClick={onEdit} className="btn btn-ghost btn-sm btn-icon"><Pencil size={11} /></button>
        <button onClick={onDelete} className="btn btn-ghost btn-sm btn-icon" style={{ color: 'hsl(var(--bad))' }}><Trash2 size={11} /></button>
      </div>

      {/* Widget preview */}
      <div style={{ padding: 14, minHeight: 120 }}>
        <WidgetPreview widget={widget} device={device} />
      </div>
    </div>
  );
}

function WidgetPreview({ widget, device }: { widget: Widget; device?: any }) {
  const { data: latest } = useQuery({
    queryKey: ['wpreview-latest', widget.deviceId],
    queryFn: () => apiClient.get('/telemetry/latest', { params: { deviceId: widget.deviceId } }).then(r => r.data),
    enabled: !!widget.deviceId && ['kpi_card', 'data_table', 'gauge'].includes(widget.type),
  });

  const { data: series } = useQuery({
    queryKey: ['wpreview-series', widget.deviceId, widget.field],
    queryFn: () => telemetryApi.series(
      widget.deviceId!, widget.field!,
      new Date(Date.now() - (widget.rangeMs ?? 24 * 3600_000)).toISOString(),
      new Date().toISOString(), 200
    ),
    enabled: !!widget.deviceId && !!widget.field && ['line_chart', 'bar_chart'].includes(widget.type),
  });

  const fields: Record<string, number> = latest?.fields ?? {};
  const val = widget.field ? fields[widget.field] : undefined;

  if (widget.type === 'kpi_card') {
    return (
      <div style={{ textAlign: 'center', padding: '8px 0' }}>
        <div className="eyebrow" style={{ fontSize: 9.5 }}>{(widget.field ?? 'value').replace(/_/g, ' ')}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, lineHeight: 1, marginTop: 4, color: 'hsl(var(--primary))' }}>
          {val !== undefined ? val.toFixed(2) : <span className="dim" style={{ fontSize: 20 }}>no data</span>}
        </div>
        {device && <div className="mono faint" style={{ fontSize: 10, marginTop: 6 }}>{device.name}</div>}
      </div>
    );
  }

  if (widget.type === 'gauge') {
    const minV = 0; const maxV = 100;
    const pct = val !== undefined ? Math.min(100, Math.max(0, ((val - minV) / (maxV - minV)) * 100)) : 0;
    const r = 50; const cx = 70; const cy = 70;
    const start = Math.PI * 0.75; const end = Math.PI * 2.25;
    const arc = (angle: number) => ({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    const s = arc(start); const e = arc(end);
    const a = arc(start + (end - start) * (pct / 100));
    const large = pct > 50 ? 1 : 0;
    return (
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <svg viewBox="0 0 140 110" style={{ width: 140, height: 110 }}>
          <path d={`M ${s.x} ${s.y} A ${r} ${r} 0 1 1 ${e.x} ${e.y}`} fill="none" stroke="hsl(var(--border))" strokeWidth={10} strokeLinecap="round" />
          {pct > 0 && <path d={`M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${a.x} ${a.y}`} fill="none" stroke="hsl(var(--primary))" strokeWidth={10} strokeLinecap="round" />}
          <text x={cx} y={cy - 4} textAnchor="middle" style={{ fontFamily: 'var(--font-display)', fontSize: 18, fill: 'hsl(var(--fg))' }}>{val?.toFixed(1) ?? '—'}</text>
        </svg>
      </div>
    );
  }

  if (widget.type === 'line_chart') {
    const pts = (series?.data ?? []).map((p: any) => ({ ts: new Date(p.ts).getTime(), value: p.value }));
    return pts.length > 0
      ? <LineChart series={[{ name: widget.field ?? '', data: pts, color: 'hsl(var(--primary))' }]} height={120} showArea />
      : <div className="dim" style={{ textAlign: 'center', padding: '24px 0', fontSize: 12 }}>No data</div>;
  }

  if (widget.type === 'bar_chart') {
    const pts = (series?.data ?? []).slice(-20).map((p: any) => ({
      label: new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      value: p.value,
    }));
    return pts.length > 0
      ? <BarChart data={pts} color="hsl(var(--primary))" height={120} />
      : <div className="dim" style={{ textAlign: 'center', padding: '24px 0', fontSize: 12 }}>No data</div>;
  }

  if (widget.type === 'data_table') {
    const fkeys = Object.keys(fields).filter(k => typeof fields[k] === 'number').slice(0, 4);
    return (
      <table style={{ width: '100%', fontSize: 11, fontFamily: 'var(--font-mono)', borderCollapse: 'collapse' }}>
        <tbody>
          {fkeys.map(k => (
            <tr key={k} style={{ borderBottom: '1px solid hsl(var(--rule-ghost))' }}>
              <td style={{ padding: '4px 0', color: 'hsl(var(--muted-fg))' }}>{k.replace(/_/g, ' ')}</td>
              <td style={{ padding: '4px 0', textAlign: 'right' }}>{(fields[k] as number).toFixed(2)}</td>
            </tr>
          ))}
          {fkeys.length === 0 && <tr><td colSpan={2} className="dim" style={{ padding: '12px 0', textAlign: 'center' }}>No data</td></tr>}
        </tbody>
      </table>
    );
  }

  if (widget.type === 'status_grid') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 6 }}>
        {(widget.deviceIds ?? [widget.deviceId]).filter(Boolean).map((did: any) => (
          <div key={did} style={{ padding: '6px 8px', background: 'hsl(var(--surface-raised))', fontSize: 10.5 }}>
            <span className="mono faint">{did?.slice(-6)}</span>
          </div>
        ))}
      </div>
    );
  }

  return <div className="dim" style={{ textAlign: 'center', padding: '24px 0', fontSize: 12 }}>{widget.type}</div>;
}

/* ── Widget config modal ────────────────────────────────────────────── */
function WidgetConfigModal({
  initial, devices, onSave, onClose,
}: {
  initial?: Partial<Widget>;
  devices: any[];
  onSave: (w: Widget) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState(initial?.type ?? 'kpi_card');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [deviceId, setDeviceId] = useState(initial?.deviceId ?? '');
  const [field, setField] = useState(initial?.field ?? '');
  const [rangeMs, setRangeMs] = useState(initial?.rangeMs ?? 24 * 3600_000);

  const { data: latest } = useQuery({
    queryKey: ['wconfig-latest', deviceId],
    queryFn: () => apiClient.get('/telemetry/latest', { params: { deviceId } }).then(r => r.data),
    enabled: !!deviceId,
  });
  const availableFields = Object.keys(latest?.fields ?? {}).filter(k => typeof latest?.fields[k] === 'number');

  const save = () => {
    if (!title.trim()) { toast.error('Title required'); return; }
    onSave({
      id: (initial as any)?._id ?? (initial as any)?.id ?? nanoid(),
      type, title: title.trim(), deviceId: deviceId || undefined,
      field: field || undefined,
      rangeMs: rangeMs || undefined,
      config: {},
      position: (initial as any)?.position ?? { x: 0, y: 0, w: 4, h: 3 },
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="panel" style={{ width: '100%', maxWidth: 480, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div className="eyebrow">{initial?.type ? 'Edit widget' : 'Add widget'}</div>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-icon"><X size={14} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Widget type</label>
            <select className="select" value={type} onChange={e => setType(e.target.value)}>
              {WIDGET_TYPES.map(wt => <option key={wt.type} value={wt.type}>{wt.label} — {wt.desc}</option>)}
            </select>
          </div>
          <div>
            <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Title</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Temperature KPI" />
          </div>
          {!['map', 'status_grid'].includes(type) && (
            <div>
              <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Device</label>
              <select className="select" value={deviceId} onChange={e => { setDeviceId(e.target.value); setField(''); }}>
                <option value="">— select device —</option>
                {devices.map((d: any) => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
            </div>
          )}
          {['line_chart', 'bar_chart', 'gauge', 'kpi_card'].includes(type) && deviceId && (
            <div>
              <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Field</label>
              <select className="select" value={field} onChange={e => setField(e.target.value)}>
                <option value="">— select field —</option>
                {availableFields.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          )}
          {['line_chart', 'bar_chart'].includes(type) && (
            <div>
              <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Time range</label>
              <select className="select" value={rangeMs} onChange={e => setRangeMs(+e.target.value)}>
                <option value={3600_000}>1 hour</option>
                <option value={6 * 3600_000}>6 hours</option>
                <option value={24 * 3600_000}>24 hours</option>
                <option value={7 * 24 * 3600_000}>7 days</option>
              </select>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={save} className="btn btn-primary btn-sm" style={{ gap: 4 }}>
            <Check size={11} /> Save widget
          </button>
          <button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ── PageBuilderPage ────────────────────────────────────────────────── */
export function PageBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [configModal, setConfigModal] = useState<{ open: boolean; widget?: Widget }>({ open: false });
  const [publishing, setPublishing] = useState(false);
  const [publishedToken, setPublishedToken] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { data: page, isLoading } = useQuery({
    queryKey: ['page', id],
    queryFn: () => apiClient.get(`/pages/${id}`).then(r => r.data),
    enabled: !!id,
    onSuccess: (p: any) => { if (p.shareToken) setPublishedToken(p.shareToken); },
  } as any);

  const { data: devicesData } = useQuery({
    queryKey: ['devices-all'],
    queryFn: () => devicesApi.list({ limit: 200 }),
  });
  const devices: any[] = devicesData?.devices ?? [];

  const widgets: Widget[] = (page as any)?.widgets ?? [];

  const patchWidgets = useCallback(async (newWidgets: Widget[]) => {
    try {
      await apiClient.patch(`/pages/${id}`, { widgets: newWidgets });
      queryClient.setQueryData(['page', id], (old: any) => ({ ...old, widgets: newWidgets }));
    } catch { toast.error('Failed to save'); }
  }, [id, queryClient]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = widgets.findIndex(w => w.id === active.id);
    const newIdx = widgets.findIndex(w => w.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = [...widgets];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);
    patchWidgets(reordered);
  };

  const addOrUpdateWidget = (w: Widget) => {
    const existing = widgets.findIndex(x => x.id === w.id);
    const updated = existing >= 0
      ? widgets.map(x => x.id === w.id ? w : x)
      : [...widgets, w];
    patchWidgets(updated);
    setConfigModal({ open: false });
  };

  const removeWidget = (wid: string) => {
    patchWidgets(widgets.filter(w => w.id !== wid));
  };

  const publish = async () => {
    setPublishing(true);
    try {
      const res = await apiClient.post(`/pages/${id}/publish`);
      setPublishedToken(res.data.token);
      const url = `${window.location.origin}/s/${res.data.token}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success('Published! Link copied to clipboard.');
      queryClient.invalidateQueries({ queryKey: ['page', id] });
    } catch { toast.error('Failed to publish'); }
    finally { setPublishing(false); }
  };

  const unpublish = async () => {
    try {
      await apiClient.delete(`/pages/${id}/publish`);
      setPublishedToken(null);
      queryClient.invalidateQueries({ queryKey: ['page', id] });
      toast.success('Page unpublished');
    } catch { toast.error('Failed to unpublish'); }
  };

  if (isLoading) return <div className="page"><div className="skeleton" style={{ height: 200 }} /></div>;
  if (!page) return <div className="page"><p className="dim" style={{ textAlign: 'center', padding: '64px 0' }}>Page not found</p></div>;

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <Link to="/pages" className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
          <ArrowLeft size={13} /> Pages
        </Link>
        <h1 style={{ flex: 1, fontFamily: 'var(--font-display)', fontSize: 28, margin: 0, lineHeight: 1 }}>{(page as any).name}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" style={{ gap: 6 }} onClick={() => setConfigModal({ open: true })}>
            <Plus size={13} /> Widget
          </button>
          {publishedToken ? (
            <>
              <button
                onClick={() => { const url = `${window.location.origin}/s/${publishedToken}`; navigator.clipboard.writeText(url).catch(() => {}); toast.success('Link copied!'); }}
                className="btn btn-sm"
                style={{ gap: 6 }}
              >
                <Globe size={13} /> Copy link
              </button>
              <button onClick={unpublish} className="btn btn-sm btn-outline" style={{ gap: 6 }}>
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

      {/* Canvas */}
      {widgets.length === 0 ? (
        <div className="panel" style={{ padding: '80px 24px', textAlign: 'center' }}>
          <Plus size={32} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p className="dim" style={{ fontSize: 14 }}>No widgets yet. Click <strong>+ Widget</strong> to add one.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={widgets.map(w => w.id)} strategy={rectSortingStrategy}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {widgets.map(w => (
                <WidgetCard
                  key={w.id}
                  widget={w}
                  devices={devices}
                  onEdit={() => setConfigModal({ open: true, widget: w })}
                  onDelete={() => removeWidget(w.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
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
