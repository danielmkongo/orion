import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import GridLayout, { WidthProvider } from 'react-grid-layout';
import '@/styles/grid-layout.css';
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import apiClient from '@/api/client';
import toast from 'react-hot-toast';
import { copyText } from '@/lib/utils';
import { ArrowLeft, Plus, Globe, Lock, Pencil, Trash2, GripVertical, X, Check, Copy,
         ExternalLink, Download, Settings, ChevronLeft, ChevronDown, Eye, ArrowUp, ArrowDown,
         ArrowRight as ArrowRightIcon, ChevronRight } from 'lucide-react';
import { LineChart, BarChart } from '@/components/charts/Charts';
import { CommandWidget } from '@/components/devices/CommandWidget';
import type { DeviceCommand } from '@/components/devices/CommandWidget';
import { telemetryApi } from '@/api/telemetry';
import { devicesApi } from '@/api/devices';

const ResponsiveGridLayout = WidthProvider(GridLayout);
const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const MAP_ID  = import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID';

const WIDGET_TYPES = [
  { type: 'kpi_card',        label: 'KPI Card',      icon: '▣', desc: 'Single metric, big number',     defaultW: 3, defaultH: 2 },
  { type: 'stat_card',       label: 'Stat + Trend',  icon: '▲', desc: 'KPI with sparkline trend',       defaultW: 3, defaultH: 3 },
  { type: 'line_chart',      label: 'Line Chart',    icon: '〜', desc: 'Time-series area chart',         defaultW: 6, defaultH: 4 },
  { type: 'multi_line_chart',label: 'Multi-line',    icon: '≋', desc: 'Multiple series on one chart',   defaultW: 8, defaultH: 4 },
  { type: 'bar_chart',       label: 'Bar Chart',     icon: '▐', desc: 'Time-series bar chart',          defaultW: 6, defaultH: 4 },
  { type: 'scatter_chart',   label: 'Scatter Plot',  icon: '⋱', desc: 'Correlate two metrics (X vs Y)', defaultW: 6, defaultH: 4 },
  { type: 'gauge',           label: 'Gauge',         icon: '◉', desc: 'Radial gauge, live value',       defaultW: 3, defaultH: 3 },
  { type: 'level',           label: 'Level',         icon: '▮', desc: 'Liquid fill indicator',          defaultW: 2, defaultH: 4 },
  { type: 'progress_bar',    label: 'Progress',      icon: '◫', desc: 'Metric as horizontal fill bar',  defaultW: 4, defaultH: 2 },
  { type: 'data_table',      label: 'Data Table',    icon: '⊞', desc: 'Latest telemetry fields',        defaultW: 5, defaultH: 4 },
  { type: 'map',             label: 'Map',           icon: '⊕', desc: 'Device location on map',         defaultW: 6, defaultH: 5 },
  { type: 'status_grid',     label: 'Status Grid',   icon: '⬡', desc: 'Fleet status badges',            defaultW: 4, defaultH: 3 },
  { type: 'control_panel',   label: 'Controls',      icon: '⌥', desc: 'Device command buttons',         defaultW: 4, defaultH: 4 },
  { type: 'text',            label: 'Text',          icon: 'T',  desc: 'Custom heading or note',         defaultW: 4, defaultH: 2 },
  { type: 'separator',       label: 'Separator',     icon: '—',  desc: 'Divider line (H or V)',          defaultW: 12, defaultH: 1 },
];

const WIDGET_ACCENT: Record<string, string> = {
  kpi_card:        'hsl(var(--primary))',
  stat_card:       'hsl(var(--primary))',
  line_chart:      '#3b82f6',
  multi_line_chart:'#6366f1',
  bar_chart:       '#8b5cf6',
  scatter_chart:   '#f97316',
  gauge:           '#f59e0b',
  level:           '#06b6d4',
  progress_bar:    '#10b981',
  data_table:      '#10b981',
  map:             '#0ea5e9',
  status_grid:     '#f97316',
  control_panel:   '#ec4899',
  text:            'hsl(var(--muted-fg))',
  separator:       'hsl(var(--border))',
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

function uid() { return Math.random().toString(36).slice(2, 10); }

/* ── ResizeObserver height measurement ──────────────────────────────── */
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
  return <div ref={ref} style={{ height: '100%', overflow: 'hidden' }}>{render(Math.max(60, h - 8))}</div>;
}

/* ── Inline mini sparkline ───────────────────────────────────────────── */
function MiniSparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return null;
  const min = Math.min(...points); const max = Math.max(...points);
  const range = max - min || 1;
  const w = 100; const h = 32;
  const coords = points.map((v, i) => `${(i / (points.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h }} preserveAspectRatio="none">
      <polyline points={coords} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Inline scatter renderer ─────────────────────────────────────────── */
function ScatterPlot({ pairs, xField, yField, color }: {
  pairs: Array<{ x: number; y: number }>;
  xField: string; yField: string; color: string;
}) {
  if (pairs.length === 0) return <div className="dim" style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100%',fontSize:12 }}>No paired data</div>;
  const xs = pairs.map(p => p.x); const ys = pairs.map(p => p.y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs) || minX + 1;
  const minY = Math.min(...ys); const maxY = Math.max(...ys) || minY + 1;
  const W = 300; const H = 200;
  const pad = { t: 8, r: 8, b: 28, l: 40 };
  const px = (v: number) => pad.l + ((v - minX) / (maxX - minX)) * (W - pad.l - pad.r);
  const py = (v: number) => H - pad.b - ((v - minY) / (maxY - minY)) * (H - pad.t - pad.b);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
      <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="hsl(var(--border))" strokeWidth={1} />
      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke="hsl(var(--border))" strokeWidth={1} />
      {pairs.map((p, i) => <circle key={i} cx={px(p.x)} cy={py(p.y)} r={3} fill={color} fillOpacity={0.65} />)}
      <text x={W / 2} y={H - 4} textAnchor="middle" style={{ fontSize: 8, fontFamily: 'var(--font-mono)', fill: 'hsl(var(--muted-fg))' }}>{xField}</text>
      <text x={8} y={H / 2} textAnchor="middle" transform={`rotate(-90,8,${H / 2})`} style={{ fontSize: 8, fontFamily: 'var(--font-mono)', fill: 'hsl(var(--muted-fg))' }}>{yField}</text>
    </svg>
  );
}

/* ── Multi-line series row (used in WidgetDrawer) ───────────────────── */
function SeriesRow({ series, index, devices, onUpdate, onRemove }: {
  series: { deviceId: string; field: string; color: string };
  index: number;
  devices: any[];
  onUpdate: (i: number, s: { deviceId: string; field: string; color: string }) => void;
  onRemove: (i: number) => void;
}) {
  const { data: latestData } = useQuery({
    queryKey: ['srow-latest', series.deviceId],
    queryFn: () => apiClient.get('/telemetry/latest', { params: { deviceId: series.deviceId } }).then(r => r.data),
    enabled: !!series.deviceId,
  });
  const fields = Object.keys(latestData?.fields ?? {}).filter(k => typeof latestData?.fields?.[k] === 'number');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 30px 28px', gap: 6, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid hsl(var(--rule-ghost))' }}>
      <select className="select" value={series.deviceId} onChange={e => onUpdate(index, { ...series, deviceId: e.target.value, field: '' })} style={{ fontSize: 11 }}>
        <option value="">Device…</option>
        {devices.map((d: any) => <option key={d._id} value={d._id}>{d.name}</option>)}
      </select>
      <select className="select" value={series.field} onChange={e => onUpdate(index, { ...series, field: e.target.value })} style={{ fontSize: 11 }}>
        <option value="">Field…</option>
        {fields.map(f => <option key={f} value={f}>{f}</option>)}
      </select>
      <input type="color" value={series.color || '#3b82f6'} onChange={e => onUpdate(index, { ...series, color: e.target.value })}
        style={{ width: 30, height: 30, border: '1px solid hsl(var(--border))', cursor: 'pointer', padding: 2 }} />
      <button onClick={() => onRemove(index)} className="btn btn-ghost btn-sm btn-icon" style={{ color: 'hsl(var(--bad))' }}><X size={11} /></button>
    </div>
  );
}

/* ── Widget preview content ─────────────────────────────────────────── */
function WidgetContent({ widget }: { widget: Widget }) {
  const { data: latest } = useQuery({
    queryKey: ['wpreview-latest', widget.deviceId],
    queryFn: () => apiClient.get('/telemetry/latest', { params: { deviceId: widget.deviceId } }).then(r => r.data),
    enabled: !!widget.deviceId && ['kpi_card', 'data_table', 'gauge', 'level', 'progress_bar', 'stat_card'].includes(widget.type),
    refetchInterval: 30_000,
  });

  const { data: series } = useQuery({
    queryKey: ['wpreview-series', widget.deviceId, widget.field, widget.rangeMs],
    queryFn: () => telemetryApi.series(
      widget.deviceId!, widget.field!,
      new Date(Date.now() - (widget.rangeMs ?? 24 * 3600_000)).toISOString(),
      new Date().toISOString(), 300
    ),
    enabled: !!widget.deviceId && !!widget.field && ['line_chart', 'bar_chart', 'stat_card'].includes(widget.type),
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

  // Map query — unconditional for hooks compliance
  const { data: mapDeviceData } = useQuery({
    queryKey: ['wmap-device', widget.deviceId],
    queryFn: () => apiClient.get(`/devices/${widget.deviceId}`).then(r => r.data),
    enabled: widget.type === 'map' && !!widget.deviceId,
  });

  // Multi-line chart — fetch all configured series
  const multiSeriesCfg: any[] = (widget.config?.series as any[]) ?? [];
  const { data: multiData } = useQuery({
    queryKey: ['wmulti', widget.id, widget.rangeMs, multiSeriesCfg.map(s => `${s.deviceId}:${s.field}`).join(',')],
    queryFn: async () => {
      const from = new Date(Date.now() - (widget.rangeMs ?? 24 * 3600_000)).toISOString();
      const to = new Date().toISOString();
      const results = await Promise.all(
        multiSeriesCfg.map(async (s: any) => {
          if (!s.deviceId || !s.field) return null;
          try {
            const res = await telemetryApi.series(s.deviceId, s.field, from, to, 300);
            return { name: s.label || s.field, color: s.color || '#3b82f6', data: (res.data ?? []).map((p: any) => ({ ts: new Date(p.ts).getTime(), value: p.value })) };
          } catch { return null; }
        })
      );
      return results.filter(Boolean);
    },
    enabled: widget.type === 'multi_line_chart' && multiSeriesCfg.length > 0,
    refetchInterval: 60_000,
  });

  // Scatter chart — separate queries for x and y fields
  const xField = (widget.config?.xField as string) ?? '';
  const yField = (widget.config?.yField as string) ?? '';
  const { data: scatterX } = useQuery({
    queryKey: ['wscatter-x', widget.deviceId, xField, widget.rangeMs],
    queryFn: () => telemetryApi.series(widget.deviceId!, xField, new Date(Date.now() - (widget.rangeMs ?? 24 * 3600_000)).toISOString(), new Date().toISOString(), 300),
    enabled: widget.type === 'scatter_chart' && !!widget.deviceId && !!xField,
    refetchInterval: 60_000,
  });
  const { data: scatterY } = useQuery({
    queryKey: ['wscatter-y', widget.deviceId, yField, widget.rangeMs],
    queryFn: () => telemetryApi.series(widget.deviceId!, yField, new Date(Date.now() - (widget.rangeMs ?? 24 * 3600_000)).toISOString(), new Date().toISOString(), 300),
    enabled: widget.type === 'scatter_chart' && !!widget.deviceId && !!yField,
    refetchInterval: 60_000,
  });

  const fields: Record<string, number> = latest?.fields ?? {};
  const val = widget.field ? fields[widget.field] : undefined;
  const dim = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12 } as const;

  // ── KPI Card ──
  if (widget.type === 'kpi_card') {
    return (
      <ChartWrapper render={h => (
        <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:4 }}>
          <div className="eyebrow" style={{ fontSize: 9 }}>{(widget.field ?? 'value').replace(/_/g, ' ')}</div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:`clamp(20px,${Math.max(20,h*0.38)}px,72px)`, lineHeight:1, color:'hsl(var(--primary))' }}>
            {val !== undefined ? val.toFixed(2) : <span className="dim" style={{ fontSize:20 }}>—</span>}
          </div>
          {latest?.timestamp && <div className="mono faint" style={{ fontSize:9.5 }}>live</div>}
        </div>
      )} />
    );
  }

  // ── Stat Card (KPI + sparkline trend) ──
  if (widget.type === 'stat_card') {
    const sparkPts: number[] = (series?.data ?? []).map((p: any) => p.value);
    const trend = sparkPts.length >= 2
      ? ((sparkPts[sparkPts.length - 1] - sparkPts[0]) / (Math.abs(sparkPts[0]) || 1)) * 100 : null;
    return (
      <div style={{ display:'flex',flexDirection:'column',justifyContent:'space-between',height:'100%',padding:'4px 0' }}>
        <div style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'flex-start',justifyContent:'center',gap:4 }}>
          <div className="eyebrow" style={{ fontSize:9 }}>{(widget.field ?? 'value').replace(/_/g,' ')}</div>
          <div style={{ fontFamily:'var(--font-display)',fontSize:'clamp(20px,3.5vw,44px)',color:'hsl(var(--primary))',lineHeight:1 }}>
            {val?.toFixed(2) ?? <span className="dim" style={{ fontSize:18 }}>—</span>}
          </div>
          {trend !== null && (
            <div style={{ fontSize:10.5,fontFamily:'var(--font-mono)',color:trend>=0?'hsl(var(--good))':'hsl(var(--bad))' }}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}% vs start
            </div>
          )}
        </div>
        {sparkPts.length >= 2 && (
          <div style={{ height:36,paddingBottom:4 }}><MiniSparkline points={sparkPts} color="hsl(var(--primary))" /></div>
        )}
      </div>
    );
  }

  // ── Gauge ──
  if (widget.type === 'gauge') {
    const pct = val !== undefined ? Math.min(100, Math.max(0, (val / 100) * 100)) : 0;
    const r = 60; const cx = 80; const cy = 80;
    const start = Math.PI * 0.75; const end = Math.PI * 2.25;
    const arc = (a: number) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    const s = arc(start); const e = arc(end); const a = arc(start + (end - start) * (pct / 100));
    const large = pct > 50 ? 1 : 0;
    return (
      <div style={{ display:'flex',justifyContent:'center',alignItems:'center',height:'100%' }}>
        <svg viewBox="0 0 160 130" style={{ width:'100%',maxWidth:160,height:'auto' }}>
          <path d={`M ${s.x} ${s.y} A ${r} ${r} 0 1 1 ${e.x} ${e.y}`} fill="none" stroke="hsl(var(--border))" strokeWidth={10} strokeLinecap="round" />
          {pct>0 && <path d={`M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${a.x} ${a.y}`} fill="none" stroke="hsl(var(--primary))" strokeWidth={10} strokeLinecap="round" />}
          <text x={cx} y={cy - 4} textAnchor="middle" style={{ fontFamily:'var(--font-display)',fontSize:22,fill:'hsl(var(--fg))' }}>{val?.toFixed(1) ?? '—'}</text>
          <text x={cx} y={cy + 14} textAnchor="middle" style={{ fontFamily:'var(--font-mono)',fontSize:9,fill:'hsl(var(--muted-fg))',textTransform:'uppercase' }}>{widget.field ?? ''}</text>
        </svg>
      </div>
    );
  }

  // ── Level ──
  if (widget.type === 'level') {
    const min = (widget.config?.min as number) ?? 0;
    const max = (widget.config?.max as number) ?? 100;
    const pct = val !== undefined ? Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100)) : 0;
    const accent = WIDGET_ACCENT['level'];
    return (
      <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'space-between',height:'100%',padding:'8px 0' }}>
        <div style={{ fontFamily:'var(--font-mono)',fontSize:9,color:'hsl(var(--muted-fg))' }}>{max}</div>
        <div style={{ flex:1,width:44,background:'hsl(var(--surface-raised))',border:'1px solid hsl(var(--border))',borderRadius:3,overflow:'hidden',display:'flex',flexDirection:'column',justifyContent:'flex-end',position:'relative',margin:'6px 0' }}>
          <div style={{ width:'100%',height:`${pct}%`,background:`linear-gradient(to top,${accent},${accent}88)`,transition:'height 0.8s ease',minHeight:pct>0?2:0 }} />
          <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center' }}>
            <span style={{ fontSize:11,fontFamily:'var(--font-display)',color:pct>50?'#fff':'hsl(var(--fg))',fontWeight:700,textShadow:pct>50?'0 1px 3px rgba(0,0,0,0.5)':'none' }}>{pct.toFixed(0)}%</span>
          </div>
        </div>
        <div style={{ fontFamily:'var(--font-display)',fontSize:13,fontWeight:700,color:accent }}>{val?.toFixed(1) ?? '—'}</div>
        <div style={{ fontFamily:'var(--font-mono)',fontSize:9,color:'hsl(var(--muted-fg))' }}>{min}</div>
      </div>
    );
  }

  // ── Progress Bar ──
  if (widget.type === 'progress_bar') {
    const min = (widget.config?.min as number) ?? 0;
    const max = (widget.config?.max as number) ?? 100;
    const pct = val !== undefined ? Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100)) : 0;
    const accent = WIDGET_ACCENT['progress_bar'];
    return (
      <div style={{ display:'flex',flexDirection:'column',justifyContent:'center',height:'100%',gap:8 }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'baseline' }}>
          <span style={{ fontFamily:'var(--font-display)',fontSize:24,color:accent }}>{val?.toFixed(1) ?? '—'}</span>
          <span style={{ fontFamily:'var(--font-mono)',fontSize:10,color:'hsl(var(--muted-fg))' }}>{pct.toFixed(0)}%</span>
        </div>
        <div style={{ height:8,background:'hsl(var(--surface-raised))',borderRadius:4,overflow:'hidden' }}>
          <div style={{ height:'100%',width:`${pct}%`,background:accent,borderRadius:4,transition:'width 0.5s ease' }} />
        </div>
        <div style={{ display:'flex',justifyContent:'space-between',fontFamily:'var(--font-mono)',fontSize:9,color:'hsl(var(--muted-fg))' }}>
          <span>{min}</span><span>{max}</span>
        </div>
      </div>
    );
  }

  // ── Line Chart ──
  if (widget.type === 'line_chart') {
    const pts = (series?.data ?? []).map((p: any) => ({ ts: new Date(p.ts).getTime(), value: p.value }));
    return (
      <ChartWrapper render={h => pts.length > 0
        ? <LineChart series={[{ name: widget.field ?? '', data: pts, color: 'hsl(var(--primary))' }]} height={h} showArea />
        : <div className="dim" style={dim}>No data yet</div>} />
    );
  }

  // ── Multi-line Chart ──
  if (widget.type === 'multi_line_chart') {
    if (!multiData?.length) return <div className="dim" style={dim}>Add series in settings</div>;
    return (
      <ChartWrapper render={h => <LineChart series={multiData as any} height={h} showArea={false} />} />
    );
  }

  // ── Bar Chart ──
  if (widget.type === 'bar_chart') {
    const pts = (series?.data ?? []).slice(-24).map((p: any) => ({
      label: new Date(p.ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
      value: p.value,
    }));
    return (
      <ChartWrapper render={h => pts.length > 0
        ? <BarChart data={pts} color="hsl(var(--primary))" height={h} />
        : <div className="dim" style={dim}>No data yet</div>} />
    );
  }

  // ── Scatter Chart ──
  if (widget.type === 'scatter_chart') {
    const xPts = (scatterX?.data ?? []).map((p: any) => ({ ts: new Date(p.ts).getTime(), value: p.value }));
    const yPts = (scatterY?.data ?? []).map((p: any) => ({ ts: new Date(p.ts).getTime(), value: p.value }));
    const pairs: Array<{x: number; y: number}> = [];
    for (const xp of xPts) {
      if (!yPts.length) break;
      const closest = yPts.reduce((b, yp) => Math.abs(yp.ts - xp.ts) < Math.abs(b.ts - xp.ts) ? yp : b, yPts[0]);
      if (Math.abs(closest.ts - xp.ts) < 120_000) pairs.push({ x: xp.value, y: closest.value });
    }
    if (!xField || !yField) return <div className="dim" style={dim}>Configure X and Y fields</div>;
    return <ScatterPlot pairs={pairs} xField={xField} yField={yField} color={WIDGET_ACCENT['scatter_chart']} />;
  }

  // ── Data Table ──
  if (widget.type === 'data_table') {
    const filterFields: string[] = (widget.config?.fields as string[]) ?? [];
    const entries = Object.entries(fields)
      .filter(([k, v]) => typeof v === 'number' && (filterFields.length === 0 || filterFields.includes(k)));
    return (
      <div style={{ overflowY:'auto',height:'100%' }}>
        <table style={{ width:'100%',fontSize:11,fontFamily:'var(--font-mono)',borderCollapse:'collapse' }}>
          <tbody>
            {entries.length === 0
              ? <tr><td colSpan={2} className="dim" style={{ padding:'16px 0',textAlign:'center' }}>No data</td></tr>
              : entries.map(([k, v]) => (
                <tr key={k} style={{ borderBottom:'1px solid hsl(var(--rule-ghost))' }}>
                  <td style={{ padding:'5px 8px',color:'hsl(var(--muted-fg))' }}>{k.replace(/_/g,' ')}</td>
                  <td style={{ padding:'5px 8px',textAlign:'right' }}>{(v as number).toFixed(3)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Map ──
  if (widget.type === 'map') {
    const loc = mapDeviceData?.location;
    if (!API_KEY) return <div className="dim" style={{ ...dim,textAlign:'center',padding:16 }}>Add VITE_GOOGLE_MAPS_API_KEY to enable maps</div>;
    if (!loc?.lat) return <div className="dim" style={dim}>No location data</div>;
    return (
      <APIProvider apiKey={API_KEY}>
        <Map mapId={MAP_ID} defaultCenter={{ lat:loc.lat, lng:loc.lng??loc.lon??0 }} defaultZoom={12}
          mapTypeId="satellite" style={{ width:'100%',height:'100%' }}
          gestureHandling="cooperative" streetViewControl={false} mapTypeControl={false} zoomControl={false}>
          <AdvancedMarker position={{ lat:loc.lat, lng:loc.lng??loc.lon??0 }}>
            <div style={{ width:14,height:14,borderRadius:'50%',background:'hsl(var(--primary))',border:'2.5px solid white',boxShadow:'0 0 0 3px rgba(255,91,31,0.4)' }} />
          </AdvancedMarker>
        </Map>
      </APIProvider>
    );
  }

  // ── Status Grid ──
  if (widget.type === 'status_grid') {
    const allDevices = devicesData?.devices ?? [];
    const shown = widget.deviceIds?.length
      ? allDevices.filter((d: any) => widget.deviceIds!.includes(d._id))
      : allDevices.slice(0, 12);
    return (
      <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(80px,1fr))',gap:6,padding:4,alignContent:'start' }}>
        {shown.map((d: any) => (
          <div key={d._id} style={{ padding:'6px 8px',background:'hsl(var(--surface-raised))' }}>
            <div style={{ fontSize:10.5,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{d.name}</div>
            <span className={`tag tag-${d.status==='online'?'online':d.status==='error'?'error':'offline'}`} style={{ marginTop:3,display:'inline-block' }}>{d.status}</span>
          </div>
        ))}
      </div>
    );
  }

  // ── Control Panel ──
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
    if (!widget.deviceId) return <div className="dim" style={{ ...dim,textAlign:'center',padding:16 }}>Select a device to show controls</div>;
    if (commands.length === 0) return <div className="dim" style={{ ...dim,textAlign:'center',padding:16 }}>No commands defined</div>;
    return (
      <div style={{ overflowY:'auto',height:'100%' }}>
        {commands.map(cmd => <CommandWidget key={cmd.name} cmd={cmd} payloadFormat={deviceMeta?.payloadFormat} onSend={sendCmd} compact />)}
      </div>
    );
  }

  // ── Text ──
  if (widget.type === 'text') {
    const { content = '', fontSize = 18, fontFamily = 'display', align = 'left', color: textColor, padding: textPad = 0 } = widget.config as any;
    return (
      <div style={{ height:'100%',display:'flex',alignItems:'center',overflow:'hidden',padding:Number(textPad),boxSizing:'border-box' }}>
        <div style={{
          fontFamily: fontFamily === 'mono' ? 'var(--font-mono)' : 'var(--font-display)',
          fontSize: Number(fontSize), textAlign: align as any,
          color: textColor || 'hsl(var(--fg))', width:'100%', overflowWrap:'break-word', lineHeight:1.35,
        }}>
          {content || <span style={{ color:'hsl(var(--muted-fg))',fontFamily:'var(--font-mono)',fontSize:12 }}>Click edit to add text…</span>}
        </div>
      </div>
    );
  }

  // ── Separator ──
  if (widget.type === 'separator') {
    const { orientation = 'horizontal', thickness = 1, color: lineColor } = widget.config as any;
    const c = lineColor || 'hsl(var(--border))';
    return (
      <div style={{ height:'100%',display:'flex',alignItems:'center',justifyContent:'center' }}>
        {orientation === 'vertical'
          ? <div style={{ width:Number(thickness),height:'80%',background:c }} />
          : <div style={{ height:Number(thickness),width:'90%',background:c }} />}
      </div>
    );
  }

  return <div className="dim" style={dim}>{widget.type}</div>;
}

/* ── Orion-themed custom select (portal-based, never clipped) ───────── */
function OrionSelect({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const toggle = () => {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setRect({ top: r.bottom + 2, left: r.left, width: r.width });
    }
    setOpen(v => !v);
  };

  const selected = options.find(o => o.value === value);

  return (
    <>
      <button ref={triggerRef} type="button" onClick={toggle} style={{
        width: '100%', padding: '8px 10px', textAlign: 'left',
        background: 'hsl(var(--bg))', border: '1px solid hsl(var(--border))',
        color: selected ? 'hsl(var(--fg))' : 'hsl(var(--muted-fg))',
        fontSize: 12, fontFamily: 'var(--font-mono)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer',
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected?.label ?? placeholder ?? '— select —'}
        </span>
        <ChevronDown size={12} style={{ flexShrink: 0, marginLeft: 6, color: 'hsl(var(--muted-fg))',
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {open && createPortal(
        <div onMouseDown={e => e.stopPropagation()} style={{
          position: 'fixed', top: rect.top, left: rect.left, width: rect.width, zIndex: 9999,
          background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)', maxHeight: 220, overflowY: 'auto',
        }}>
          {options.map(opt => (
            <button key={opt.value} type="button"
              onMouseDown={() => { onChange(opt.value); setOpen(false); }}
              style={{
                width: '100%', padding: '9px 12px', textAlign: 'left', display: 'block',
                background: value === opt.value ? 'hsl(var(--primary) / 0.1)' : 'transparent',
                border: 'none', borderBottom: '1px solid hsl(var(--border))',
                borderLeft: `2px solid ${value === opt.value ? 'hsl(var(--primary))' : 'transparent'}`,
                color: value === opt.value ? 'hsl(var(--primary))' : 'hsl(var(--fg))',
                fontSize: 12, fontFamily: 'var(--font-mono)', cursor: 'pointer',
              }}
            >{opt.label}</button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
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

  // Extended config state
  const [xField, setXField]         = useState((editing?.config?.xField as string) ?? '');
  const [yField, setYField]         = useState((editing?.config?.yField as string) ?? '');
  const [cfgMin, setCfgMin]         = useState(String((editing?.config?.min as number) ?? 0));
  const [cfgMax, setCfgMax]         = useState(String((editing?.config?.max as number) ?? 100));
  const [textContent, setTextContent] = useState((editing?.config?.content as string) ?? '');
  const [textSize, setTextSize]     = useState(Number((editing?.config?.fontSize) ?? 18));
  const [textFont, setTextFont]     = useState((editing?.config?.fontFamily as string) ?? 'display');
  const [textAlign, setTextAlign]   = useState((editing?.config?.align as string) ?? 'left');
  const [textColor, setTextColor]   = useState((editing?.config?.color as string) ?? '');
  const [textPadding, setTextPadding] = useState(Number((editing?.config?.padding) ?? 0));
  const [sepOrientation, setSepOrientation] = useState((editing?.config?.orientation as string) ?? 'horizontal');
  const [sepThickness, setSepThickness]     = useState(Number((editing?.config?.thickness) ?? 1));
  const [sepColor, setSepColor]     = useState((editing?.config?.color as string) ?? '');
  const [multiSeries, setMultiSeries] = useState<any[]>((editing?.config?.series as any[]) ?? []);
  const [tableFields, setTableFields] = useState<string[]>((editing?.config?.fields as string[]) ?? []);

  const { data: latestData } = useQuery({
    queryKey: ['wconfig-latest', deviceId],
    queryFn: () => apiClient.get('/telemetry/latest', { params: { deviceId } }).then(r => r.data),
    enabled: !!deviceId,
  });
  const availableFields = Object.entries(latestData?.fields ?? {})
    .filter(([, v]) => typeof v === 'number').map(([k]) => k);

  const needsDevice    = !['status_grid', 'text', 'separator', 'multi_line_chart'].includes(type);
  const needsField     = ['line_chart', 'bar_chart', 'gauge', 'kpi_card', 'level', 'progress_bar', 'stat_card'].includes(type);
  const needsRange     = ['line_chart', 'bar_chart', 'stat_card', 'scatter_chart', 'multi_line_chart'].includes(type);
  const needsDeviceIds = type === 'status_grid';
  const needsXYFields  = type === 'scatter_chart';
  const needsMinMax    = ['level', 'progress_bar'].includes(type);
  const isText         = type === 'text';
  const isSeparator    = type === 'separator';
  const isMultiLine    = type === 'multi_line_chart';
  const isDataTable    = type === 'data_table';

  const toggleDeviceId = (id: string) =>
    setDeviceIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const updateSeries = (i: number, s: any) =>
    setMultiSeries(prev => prev.map((row, idx) => idx === i ? s : row));
  const removeSeries = (i: number) =>
    setMultiSeries(prev => prev.filter((_, idx) => idx !== i));

  const pickType = (t: string) => { setType(t); setField(''); setStep('config'); };

  const save = () => {
    const finalTitle = title.trim() || (isText ? 'Text' : isSeparator ? 'Separator' : '');
    if (!finalTitle && !isText && !isSeparator) { toast.error('Title required'); return; }
    const defW = WIDGET_TYPES.find(t => t.type === type)?.defaultW ?? 4;
    const defH = WIDGET_TYPES.find(t => t.type === type)?.defaultH ?? 3;

    const config: Record<string, unknown> = {};
    if (needsXYFields) { config.xField = xField; config.yField = yField; }
    if (needsMinMax)   { config.min = Number(cfgMin); config.max = Number(cfgMax); }
    if (isText)        { config.content = textContent; config.fontSize = textSize; config.fontFamily = textFont; config.align = textAlign; config.padding = textPadding; if (textColor) config.color = textColor; }
    if (isSeparator)   { config.orientation = sepOrientation; config.thickness = sepThickness; if (sepColor) config.color = sepColor; }
    if (isMultiLine)   { config.series = multiSeries; }
    if (isDataTable)   { config.fields = tableFields; }

    onSave({
      id: (editing as any)?.id ?? uid(),
      type, title: finalTitle,
      deviceId: needsDevice ? (deviceId || undefined) : undefined,
      deviceIds: needsDeviceIds ? deviceIds : undefined,
      field: needsField ? (field || undefined) : undefined,
      rangeMs: needsRange ? rangeMs : undefined,
      config,
      position: (editing as any)?.position ?? { x: 0, y: Infinity, w: defW, h: defH },
    });
  };

  const selectedMeta = WIDGET_TYPES.find(wt => wt.type === type);

  const inputLabel = (text: string, hint?: string) => (
    <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>
      {text} {hint && <span className="faint">{hint}</span>}
    </label>
  );

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 440,
      background: 'hsl(var(--surface))', borderLeft: '1px solid hsl(var(--border))',
      boxShadow: '-12px 0 48px rgba(0,0,0,0.3)',
      transform: open ? 'translateX(0)' : 'translateX(100%)',
      transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
      zIndex: 100, display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ display:'flex',alignItems:'center',gap:8,padding:'16px 20px',borderBottom:'1px solid hsl(var(--border))',flexShrink:0 }}>
        {step === 'config' && !isEditing && (
          <button onClick={() => setStep('type-select')} className="btn btn-ghost btn-sm btn-icon">
            <ChevronLeft size={14} />
          </button>
        )}
        <div style={{ flex:1,fontFamily:'var(--font-display)',fontSize:18 }}>
          {isEditing ? 'Edit ' : step === 'type-select' ? 'Add ' : 'Configure '}
          <em style={{ color:'hsl(var(--primary))' }}>
            {step === 'config' && !isEditing ? (selectedMeta?.label ?? 'widget') : 'widget'}
          </em>
        </div>
        <button onClick={onClose} className="btn btn-ghost btn-sm btn-icon"><X size={14} /></button>
      </div>

      {/* Body */}
      <div style={{ flex:1,overflowY:'auto',padding:20 }}>
        {step === 'type-select' ? (
          <>
            <p className="dim" style={{ fontSize:12,marginBottom:16 }}>Choose what to add to your page.</p>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
              {WIDGET_TYPES.map(wt => (
                <button key={wt.type} onClick={() => pickType(wt.type)}
                  onMouseEnter={() => setHoveredType(wt.type)} onMouseLeave={() => setHoveredType(null)}
                  style={{
                    padding:'16px 12px', display:'flex',flexDirection:'column',alignItems:'flex-start',gap:8,
                    border:`1px solid ${hoveredType===wt.type?'hsl(var(--primary))':'hsl(var(--border))'}`,
                    borderLeft:`3px solid ${WIDGET_ACCENT[wt.type]??'hsl(var(--primary))'}`,
                    background:hoveredType===wt.type?'hsl(var(--primary) / 0.05)':'transparent',
                    cursor:'pointer',transition:'all 0.15s',textAlign:'left',
                  }}>
                  <span style={{ fontSize:20,lineHeight:1 }}>{wt.icon}</span>
                  <div>
                    <div style={{ fontSize:12,fontWeight:600,color:'hsl(var(--fg))' }}>{wt.label}</div>
                    <div style={{ fontSize:10.5,color:'hsl(var(--muted-fg))',marginTop:3,lineHeight:1.4 }}>{wt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
            {!isText && !isSeparator && (
              <div>
                {inputLabel('Title')}
                <input className="input" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Tank Level" autoFocus={!isEditing} onKeyDown={e => e.key==='Enter' && save()} />
              </div>
            )}

            {needsDevice && !needsDeviceIds && (
              <div>
                {inputLabel('Device')}
                <OrionSelect
                  value={deviceId}
                  onChange={v => { setDeviceId(v); setField(''); setXField(''); setYField(''); }}
                  placeholder="— select device —"
                  options={devices.map((d: any) => ({ value: d._id, label: d.name }))}
                />
              </div>
            )}

            {needsDeviceIds && (
              <div>
                {inputLabel('Devices', '(empty = all)')}
                <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
                  {devices.map((d: any) => (
                    <button key={d._id} onClick={() => toggleDeviceId(d._id)} style={{
                      padding:'4px 10px',fontSize:12,border:'1px solid',cursor:'pointer',
                      borderColor:deviceIds.includes(d._id)?'hsl(var(--primary))':'hsl(var(--border))',
                      background:deviceIds.includes(d._id)?'hsl(var(--primary) / 0.1)':'transparent',
                      color:deviceIds.includes(d._id)?'hsl(var(--primary))':'hsl(var(--muted-fg))',
                    }}>{d.name}</button>
                  ))}
                </div>
              </div>
            )}

            {needsField && deviceId && (
              <div>
                {inputLabel('Field')}
                <OrionSelect
                  value={field}
                  onChange={setField}
                  placeholder="— select field —"
                  options={availableFields.map(f => ({ value: f, label: f }))}
                />
              </div>
            )}

            {needsXYFields && deviceId && (
              <>
                <div>
                  {inputLabel('X-axis field')}
                  <OrionSelect
                    value={xField}
                    onChange={setXField}
                    placeholder="— X field —"
                    options={availableFields.map(f => ({ value: f, label: f }))}
                  />
                </div>
                <div>
                  {inputLabel('Y-axis field')}
                  <OrionSelect
                    value={yField}
                    onChange={setYField}
                    placeholder="— Y field —"
                    options={availableFields.filter(f => f !== xField).map(f => ({ value: f, label: f }))}
                  />
                </div>
              </>
            )}

            {needsMinMax && (
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
                <div>
                  {inputLabel('Min value')}
                  <input className="input" type="number" value={cfgMin} onChange={e => setCfgMin(e.target.value)} />
                </div>
                <div>
                  {inputLabel('Max value')}
                  <input className="input" type="number" value={cfgMax} onChange={e => setCfgMax(e.target.value)} />
                </div>
              </div>
            )}

            {isDataTable && deviceId && availableFields.length > 0 && (
              <div>
                {inputLabel('Show fields', '(empty = all)')}
                <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
                  {availableFields.map(f => (
                    <button key={f} onClick={() => setTableFields(prev => prev.includes(f) ? prev.filter(x => x!==f) : [...prev, f])} style={{
                      padding:'3px 9px',fontSize:11,border:'1px solid',cursor:'pointer',
                      borderColor:tableFields.includes(f)?'hsl(var(--primary))':'hsl(var(--border))',
                      background:tableFields.includes(f)?'hsl(var(--primary) / 0.1)':'transparent',
                      color:tableFields.includes(f)?'hsl(var(--primary))':'hsl(var(--muted-fg))',
                    }}>{f}</button>
                  ))}
                </div>
              </div>
            )}

            {needsRange && (
              <div>
                {inputLabel('Time range')}
                <div className="seg">
                  {[['1h',3600_000],['6h',21600_000],['24h',86400_000],['7d',604800_000]].map(([l,v]) => (
                    <button key={l} className={rangeMs===v?'on':''} onClick={() => setRangeMs(v as number)}>{l}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Multi-line series manager */}
            {isMultiLine && (
              <div>
                {inputLabel('Series')}
                {multiSeries.map((s, i) => (
                  <SeriesRow key={i} series={s} index={i} devices={devices} onUpdate={updateSeries} onRemove={removeSeries} />
                ))}
                <button onClick={() => setMultiSeries(prev => [...prev, { deviceId:'', field:'', color:'#3b82f6' }])}
                  className="btn btn-ghost btn-sm" style={{ marginTop:8,gap:4 }}>
                  <Plus size={11} /> Add series
                </button>
              </div>
            )}

            {/* Range for multi-line */}
            {isMultiLine && (
              <div>
                {inputLabel('Time range')}
                <div className="seg">
                  {[['1h',3600_000],['6h',21600_000],['24h',86400_000],['7d',604800_000]].map(([l,v]) => (
                    <button key={l} className={rangeMs===v?'on':''} onClick={() => setRangeMs(v as number)}>{l}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Text config */}
            {isText && (
              <>
                <div>
                  {inputLabel('Content')}
                  <textarea className="input" rows={4} value={textContent} onChange={e => setTextContent(e.target.value)}
                    placeholder="Your text here…" style={{ resize:'vertical',fontFamily:'inherit' }} />
                </div>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
                  <div>
                    {inputLabel('Font')}
                    <select className="select" value={textFont} onChange={e => setTextFont(e.target.value)}>
                      <option value="display">Display (Satoshi)</option>
                      <option value="mono">Mono (JetBrains)</option>
                    </select>
                  </div>
                  <div>
                    {inputLabel('Align')}
                    <select className="select" value={textAlign} onChange={e => setTextAlign(e.target.value)}>
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                </div>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 80px',gap:10,alignItems:'end' }}>
                  <div>
                    {inputLabel('Font size', `(${textSize}px)`)}
                    <input type="range" min={10} max={72} value={textSize} onChange={e => setTextSize(Number(e.target.value))}
                      style={{ width:'100%' }} />
                  </div>
                  <div>
                    {inputLabel('Color')}
                    <input type="color" value={textColor || '#eeebe6'} onChange={e => setTextColor(e.target.value)}
                      style={{ width:'100%',height:34,border:'1px solid hsl(var(--border))',cursor:'pointer',padding:2 }} />
                  </div>
                </div>
                <div>
                  {inputLabel('Padding', `(${textPadding}px)`)}
                  <input type="range" min={0} max={48} value={textPadding} onChange={e => setTextPadding(Number(e.target.value))}
                    style={{ width:'100%' }} />
                </div>
                <div style={{ padding:12,background:'hsl(var(--surface-raised))',border:'1px solid hsl(var(--border))' }}>
                  <div style={{ fontFamily:textFont==='mono'?'var(--font-mono)':'var(--font-display)',fontSize:Math.min(textSize,24),color:textColor||'hsl(var(--fg))',textAlign:textAlign as any }}>
                    {textContent || 'Preview…'}
                  </div>
                </div>
              </>
            )}

            {/* Separator config */}
            {isSeparator && (
              <>
                <div>
                  {inputLabel('Orientation')}
                  <div className="seg">
                    <button className={sepOrientation==='horizontal'?'on':''} onClick={() => setSepOrientation('horizontal')}>Horizontal</button>
                    <button className={sepOrientation==='vertical'?'on':''} onClick={() => setSepOrientation('vertical')}>Vertical</button>
                  </div>
                </div>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 80px',gap:10,alignItems:'end' }}>
                  <div>
                    {inputLabel('Thickness')}
                    <div className="seg">
                      {[1,2,4].map(t => <button key={t} className={sepThickness===t?'on':''} onClick={() => setSepThickness(t)}>{t}px</button>)}
                    </div>
                  </div>
                  <div>
                    {inputLabel('Color')}
                    <input type="color" value={sepColor || '#3e3e38'} onChange={e => setSepColor(e.target.value)}
                      style={{ width:'100%',height:34,border:'1px solid hsl(var(--border))',cursor:'pointer',padding:2 }} />
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {step === 'config' && (
        <div style={{ padding:'16px 20px',borderTop:'1px solid hsl(var(--border))',display:'flex',gap:10,flexShrink:0 }}>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ flex:1 }}>Cancel</button>
          <button onClick={save} className="btn btn-primary btn-sm" style={{ flex:2,gap:4 }}>
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
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
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

  const pageData = page as any;
  const widgets: Widget[] = pageData?.widgets ?? [];
  const publishedToken: string | null = pageData?.shareToken ?? null;
  const allowExports: boolean = pageData?.allowExports ?? false;

  useEffect(() => {
    if (pageData) {
      setSettingsBrandTitle(pageData.brandTitle ?? '');
      setSettingsBrandLogoUrl(pageData.brandLogoUrl ?? '');
    }
  }, [pageData?.brandTitle, pageData?.brandLogoUrl]);

  // Keyboard micro-nudge: arrow keys move selected widget 1 grid unit
  useEffect(() => {
    if (!selectedCard) return;
    const onKey = (e: KeyboardEvent) => {
      if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return;
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      e.preventDefault();
      const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      const updated = widgets.map(w => {
        if (w.id !== selectedCard) return w;
        return { ...w, position: { ...w.position, x: Math.max(0, Math.min(11, w.position.x + dx)), y: Math.max(0, w.position.y + dy) } };
      });
      debouncedPatch(updated);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedCard, widgets]);

  const toggleExports = async () => {
    try {
      const res = await apiClient.patch(`/pages/${id}`, { allowExports: !allowExports });
      queryClient.setQueryData(['page', id], (old: any) => ({ ...old, allowExports: res.data.allowExports }));
      toast.success(!allowExports ? 'Exports enabled for viewers' : 'Exports disabled');
    } catch { toast.error('Failed to update'); }
  };

  const saveSettings = async () => {
    try {
      await apiClient.patch(`/pages/${id}`, { brandTitle: settingsBrandTitle, brandLogoUrl: settingsBrandLogoUrl });
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
    const updated = existing >= 0 ? widgets.map(x => x.id === w.id ? w : x) : [...widgets, w];
    await patchWidgetsImmediate(updated);
    setDrawer({ open: false });
  };

  const removeWidget = async (wid: string) => {
    await patchWidgetsImmediate(widgets.filter(w => w.id !== wid));
    if (selectedCard === wid) setSelectedCard(null);
  };

  const publish = async () => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; try { await apiClient.patch(`/pages/${id}`, { widgets }); } catch {} }
    setPublishing(true);
    try {
      const res = await apiClient.post(`/pages/${id}/publish`);
      queryClient.setQueryData(['page', id], (old: any) => ({ ...old, shareToken: res.data.token }));
      await copyText(`${window.location.origin}/s/${res.data.token}`);
      toast.success('Published! Link copied.');
    } catch { queryClient.invalidateQueries({ queryKey: ['page', id] }); toast.error('Failed to publish'); }
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
    await copyText(`${window.location.origin}/s/${publishedToken}`);
    toast.success('Link copied!');
  };

  if (isLoading) return <div className="page"><div className="skeleton" style={{ height: 200 }} /></div>;
  if (!pageData) return <div className="page"><p className="dim" style={{ textAlign:'center', padding:'64px 0' }}>Page not found</p></div>;

  const layout = widgets.map(w => ({
    i: w.id, x: w.position.x, y: w.position.y, w: w.position.w, h: w.position.h, minW: 1, minH: 1,
  }));

  return (
    <div className="page" style={{ paddingBottom: 80, paddingRight: drawer.open ? 452 : 0, transition: 'padding-right 0.25s cubic-bezier(0.4,0,0.2,1)' }}>
      {/* ── Header ── */}
      <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:20,flexWrap:'wrap' }}>
        <Link to="/pages" className="btn btn-ghost btn-sm" style={{ gap:6 }}>
          <ArrowLeft size={13} /> Pages
        </Link>

        <div style={{ flex:1,minWidth:200 }}>
          {editingName ? (
            <input autoFocus value={draftName} onChange={e => setDraftName(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => { if (e.key==='Enter') saveName(); if (e.key==='Escape') setEditingName(false); }}
              style={{ fontFamily:'var(--font-display)',fontSize:24,background:'transparent',border:'none',borderBottom:'2px solid hsl(var(--primary))',outline:'none',color:'hsl(var(--fg))',width:'100%',maxWidth:400 }} />
          ) : (
            <h1 style={{ fontFamily:'var(--font-display)',fontSize:24,margin:0,lineHeight:1.2,cursor:'text',display:'inline-flex',alignItems:'center',gap:8 }}
              onClick={() => { setEditingName(true); setDraftName(pageData.name); }} title="Click to rename">
              {pageData.name}
              {publishedToken && <span className="eyebrow" style={{ fontSize:10,color:'hsl(var(--good))' }}>● LIVE</span>}
            </h1>
          )}
        </div>

        <div style={{ display:'flex',gap:8,alignItems:'center',flexWrap:'wrap' }}>
          <button onClick={() => setShowSettings(s => !s)} className="btn btn-ghost btn-sm btn-icon" title="Page branding"
            style={{ color:showSettings?'hsl(var(--primary))':undefined }}><Settings size={14} /></button>
          <button onClick={toggleExports} className="btn btn-sm btn-ghost"
            title={allowExports?'Click to disable exports':'Click to enable exports'}
            style={{ gap:6,color:allowExports?'hsl(var(--good))':'hsl(var(--muted-fg))' }}>
            <Download size={13} /> {allowExports ? 'Exports on' : 'Exports off'}
          </button>
          <a href={`/pages/${id}/preview`} target="_blank" rel="noreferrer"
            className="btn btn-sm btn-ghost" style={{ gap:6 }} title="Open internal live view">
            <Eye size={13} /> Preview
          </a>
          <button className="btn btn-primary btn-sm" style={{ gap:6 }} onClick={() => setDrawer({ open:true })}>
            <Plus size={13} /> Add widget
          </button>
          {publishedToken ? (
            <>
              <button onClick={copyLink} className="btn btn-sm" style={{ gap:6 }}><Copy size={13} /> Copy link</button>
              <a href={`/s/${publishedToken}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline" style={{ gap:6 }}><ExternalLink size={13} /> View</a>
              <button onClick={unpublish} className="btn btn-sm btn-outline" style={{ gap:6,color:'hsl(var(--bad))' }}><Lock size={13} /> Unpublish</button>
            </>
          ) : (
            <button onClick={publish} disabled={publishing} className="btn btn-sm btn-outline" style={{ gap:6 }}>
              <Globe size={13} /> {publishing ? 'Publishing…' : 'Publish'}
            </button>
          )}
        </div>
      </div>

      {/* ── Branding settings ── */}
      {showSettings && (
        <div className="panel" style={{ padding:'20px 24px',marginBottom:20,borderTop:'2px solid hsl(var(--primary))' }}>
          <div className="eyebrow" style={{ marginBottom:14 }}>Page branding</div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16 }}>
            <div>
              <label className="eyebrow" style={{ fontSize:9,display:'block',marginBottom:6 }}>
                Brand name <span className="faint">(shown in public link header)</span>
              </label>
              <input className="input" value={settingsBrandTitle} onChange={e => setSettingsBrandTitle(e.target.value)} placeholder={pageData.name} />
            </div>
            <div>
              <label className="eyebrow" style={{ fontSize:9,display:'block',marginBottom:6 }}>
                Logo URL <span className="faint">(replaces Orion logo on public page)</span>
              </label>
              <input className="input" value={settingsBrandLogoUrl} onChange={e => setSettingsBrandLogoUrl(e.target.value)} placeholder="https://…" />
            </div>
          </div>
          <div style={{ display:'flex',gap:8 }}>
            <button onClick={saveSettings} className="btn btn-primary btn-sm" style={{ gap:4 }}><Check size={11} /> Save branding</button>
            <button onClick={() => setShowSettings(false)} className="btn btn-ghost btn-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* ── Hint bar ── */}
      {widgets.length > 0 && (
        <div className="mono faint" style={{ fontSize:10.5,marginBottom:12 }}>
          Drag to move · resize from edges · click card to select · {selectedCard ? '↑↓←→ to nudge' : 'arrow keys nudge selected widget'}
        </div>
      )}

      {/* ── Canvas ── */}
      {widgets.length === 0 ? (
        <div style={{ padding:'60px 24px',textAlign:'center',border:'1px dashed hsl(var(--border))',background:'hsl(var(--surface))' }}>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 2fr',gap:10,maxWidth:420,margin:'0 auto 32px',opacity:0.12,pointerEvents:'none' }}>
            <div style={{ height:72,border:'1px dashed hsl(var(--fg))',borderRadius:4 }} />
            <div style={{ height:72,border:'1px dashed hsl(var(--fg))',borderRadius:4 }} />
            <div style={{ height:100,gridColumn:'1/-1',border:'1px dashed hsl(var(--fg))',borderRadius:4 }} />
          </div>
          <div style={{ fontFamily:'var(--font-display)',fontSize:28,marginBottom:10 }}>
            Empty <em style={{ color:'hsl(var(--primary))' }}>canvas</em>
          </div>
          <p className="dim" style={{ fontSize:13,marginBottom:24 }}>Add widgets to build your page. Drag to rearrange, resize from any edge.</p>
          <button className="btn btn-primary" style={{ gap:6 }} onClick={() => setDrawer({ open:true })}><Plus size={14} /> Add first widget</button>
        </div>
      ) : (
        <ResponsiveGridLayout className="layout" layout={layout} cols={12} rowHeight={70}
          margin={[12, 12]} containerPadding={[0, 0]} onLayoutChange={handleLayoutChange}
          draggableHandle=".drag-handle" resizeHandles={['se','sw','ne','nw','e','w','s']} style={{ minHeight:400 }}>
          {widgets.map(w => {
            const accent = WIDGET_ACCENT[w.type] ?? 'hsl(var(--primary))';
            const needsSetup = (() => {
              if (['text','separator'].includes(w.type)) return false;
              if (w.type === 'status_grid') return false;
              if (w.type === 'multi_line_chart') return !((w.config?.series as any[])?.length > 0);
              if (w.type === 'scatter_chart') return !w.deviceId || !(w.config?.xField) || !(w.config?.yField);
              return !w.deviceId;
            })();
            const isHovered  = hoveredCard === w.id;
            const isSelected = selectedCard === w.id;
            if (w.type === 'separator' || w.type === 'text') {
              return (
                <div key={w.id}
                  onMouseEnter={() => setHoveredCard(w.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                  onClick={() => setSelectedCard(id => id === w.id ? null : w.id)}
                  style={{ position:'relative', outline: isSelected ? '2px solid hsl(var(--border))' : 'none', outlineOffset: -1 }}>
                  <div className="drag-handle" style={{ position:'absolute',inset:0,cursor:'grab',zIndex:1 }} />
                  <div style={{ opacity: isHovered ? 1 : 0, transition:'opacity 0.15s', position:'absolute',top:'50%',right:8,transform:'translateY(-50%)',display:'flex',gap:4,zIndex:2 }}>
                    <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); setDrawer({ open:true,widget:w }); }}
                      className="btn btn-ghost btn-sm btn-icon"><Pencil size={10} /></button>
                    <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); removeWidget(w.id); }}
                      className="btn btn-ghost btn-sm btn-icon" style={{ color:'hsl(var(--bad))' }}><Trash2 size={10} /></button>
                  </div>
                  <WidgetContent widget={w} />
                </div>
              );
            }

            return (
              <div key={w.id} className="panel"
                onMouseEnter={() => setHoveredCard(w.id)}
                onMouseLeave={() => setHoveredCard(null)}
                onClick={() => setSelectedCard(id => id === w.id ? null : w.id)}
                style={{ display:'flex',flexDirection:'column',overflow:'hidden',
                  borderLeft:`3px solid ${accent}`,
                  outline: isSelected ? `2px solid ${accent}` : 'none',
                  outlineOffset: -1,
                }}>
                <div className="drag-handle" style={{
                  display:'flex',alignItems:'center',gap:6,padding:'7px 10px',
                  borderBottom:'1px solid hsl(var(--rule-ghost))',cursor:'grab',
                  flexShrink:0,userSelect:'none',background:'hsl(var(--surface-raised))',
                }}>
                  <GripVertical size={12} style={{ color:'hsl(var(--muted-fg))',flexShrink:0 }} />
                  <span style={{ flex:1,fontSize:12,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
                    {w.title}
                    {needsSetup && <span style={{ color:'#f59e0b',fontSize:9,marginLeft:6,fontFamily:'var(--font-mono)',fontWeight:400 }}>· setup needed</span>}
                  </span>
                  <span className="mono faint" style={{ fontSize:9,textTransform:'uppercase',flexShrink:0 }}>
                    {WIDGET_TYPES.find(t => t.type === w.type)?.icon} {w.type.replace(/_/g,' ')}
                  </span>
                  {isSelected && (
                    <span className="mono faint" style={{ fontSize:8,flexShrink:0 }}>↑↓←→</span>
                  )}
                  <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); setDrawer({ open:true,widget:w }); }}
                    className="btn btn-ghost btn-sm btn-icon" style={{ flexShrink:0,opacity:isHovered?1:0,transition:'opacity 0.15s' }}>
                    <Pencil size={11} />
                  </button>
                  <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); removeWidget(w.id); }}
                    className="btn btn-ghost btn-sm btn-icon" style={{ color:'hsl(var(--bad))',flexShrink:0,opacity:isHovered?1:0,transition:'opacity 0.15s' }}>
                    <Trash2 size={11} />
                  </button>
                </div>
                <div style={{ flex:1,padding:w.type==='map'?0:'10px 12px',overflow:'hidden',minHeight:0 }}>
                  <WidgetContent widget={w} />
                </div>
              </div>
            );
          })}
        </ResponsiveGridLayout>
      )}

      <WidgetDrawer key={drawer.widget?.id ?? 'new'} open={drawer.open} editing={drawer.widget}
        devices={devices} onSave={addOrUpdateWidget} onClose={() => setDrawer({ open:false })} />
    </div>
  );
}
