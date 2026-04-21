/**
 * PagePreviewPage — authenticated internal live view of a builder page.
 * Full-screen read-only view using the app's design system.
 * Access via /pages/:id/preview (opens in new tab from the builder).
 */

import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/api/client';
import { ArrowLeft, Globe, Lock } from 'lucide-react';
import { LineChart, BarChart } from '@/components/charts/Charts';
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';

const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const MAP_ID = import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID';

/* ── Sparkline ───────────────────────────────────────────────────────── */
function Sparkline({ points, color }: { points: number[]; color: string }) {
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

/* ── Widget content ─────────────────────────────────────────────────── */
function PreviewWidgetContent({ widget, data, contentH = 200 }: { widget: any; data: any; contentH: number }) {
  const chartH = Math.max(80, contentH - 20);
  const empty = (msg = 'No data') => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12, color: 'hsl(var(--muted-fg))', fontFamily: 'var(--font-mono)' }}>{msg}</div>
  );

  if (widget.type === 'kpi_card') {
    const val = data?.fields?.[widget.field];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 6, padding: 12 }}>
        <div className="eyebrow" style={{ fontSize: 9 }}>{(widget.field ?? '').replace(/_/g, ' ')}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: `clamp(22px,${Math.max(22, contentH / 5)}px,64px)`, lineHeight: 1, color: 'hsl(var(--primary))' }}>
          {val !== undefined ? Number(val).toFixed(2) : <span className="dim">—</span>}
        </div>
        {data?.timestamp && <div className="mono faint" style={{ fontSize: 9 }}>{new Date(data.timestamp).toLocaleTimeString()}</div>}
      </div>
    );
  }

  if (widget.type === 'stat_card') {
    const val = data?.latest?.fields?.[widget.field];
    const pts: number[] = (data?.series ?? []).map((p: any) => p.value);
    const trend = pts.length >= 2 ? ((pts[pts.length - 1] - pts[0]) / (Math.abs(pts[0]) || 1)) * 100 : null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', padding: '8px 12px' }}>
        <div>
          <div className="eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>{(widget.field ?? '').replace(/_/g, ' ')}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: `clamp(18px,${Math.max(18, contentH / 6)}px,48px)`, color: 'hsl(var(--primary))', lineHeight: 1 }}>
            {val !== undefined ? Number(val).toFixed(2) : <span className="dim">—</span>}
          </div>
          {trend !== null && (
            <div className="mono" style={{ fontSize: 10.5, marginTop: 4, color: trend >= 0 ? 'hsl(var(--good))' : 'hsl(var(--bad))' }}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
            </div>
          )}
        </div>
        {pts.length >= 2 && <Sparkline points={pts} color="hsl(var(--primary))" />}
      </div>
    );
  }

  if (widget.type === 'gauge') {
    const val = data?.fields?.[widget.field];
    const cfgMin = (widget.config?.min ?? 0) as number;
    const cfgMax = (widget.config?.max ?? 100) as number;
    const pct = val !== undefined ? Math.min(100, Math.max(0, ((val - cfgMin) / (cfgMax - cfgMin)) * 100)) : 0;
    const r = 48; const cx = 70; const cy = 66;
    const start = Math.PI * 0.75; const end = Math.PI * 2.25;
    const arc = (a: number) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    const s = arc(start); const e = arc(end); const a = arc(start + (end - start) * pct / 100);
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <svg viewBox="0 0 140 100" style={{ width: '100%', maxWidth: Math.min(140, contentH * 1.4), height: 'auto' }}>
          <path d={`M ${s.x} ${s.y} A ${r} ${r} 0 1 1 ${e.x} ${e.y}`} fill="none" stroke="hsl(var(--rule))" strokeWidth={9} strokeLinecap="round" />
          {pct > 0 && <path d={`M ${s.x} ${s.y} A ${r} ${r} 0 ${pct > 50 ? 1 : 0} 1 ${a.x} ${a.y}`} fill="none" stroke="hsl(var(--primary))" strokeWidth={9} strokeLinecap="round" />}
          <text x={cx} y={cy} textAnchor="middle" fill="hsl(var(--fg))" style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{val?.toFixed(1) ?? '—'}</text>
          <text x={cx} y={cx + 14} textAnchor="middle" fill="hsl(var(--muted-fg))" style={{ fontFamily: 'var(--font-mono)', fontSize: 7.5 }}>{widget.field ?? ''}</text>
        </svg>
      </div>
    );
  }

  if (widget.type === 'level') {
    const val = data?.fields?.[widget.field];
    const cfgMin = (widget.config?.min ?? 0) as number;
    const cfgMax = (widget.config?.max ?? 100) as number;
    const pct = val !== undefined ? Math.min(100, Math.max(0, ((val - cfgMin) / (cfgMax - cfgMin)) * 100)) : 0;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, padding: 10 }}>
        <div style={{ flex: 1, width: 40, border: '2px solid hsl(var(--border))', position: 'relative', overflow: 'hidden', borderRadius: 5 }}>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'hsl(var(--primary))', height: `${pct}%`, transition: 'height 0.8s ease', opacity: 0.85 }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 13, color: pct > 50 ? '#fff' : 'hsl(var(--fg))' }}>
            {pct.toFixed(0)}%
          </div>
        </div>
        <div className="eyebrow" style={{ fontSize: 8.5 }}>{(widget.field ?? '').replace(/_/g, ' ')}</div>
        {val !== undefined && <div className="mono" style={{ fontSize: 11, color: 'hsl(var(--primary))' }}>{Number(val).toFixed(2)}</div>}
      </div>
    );
  }

  if (widget.type === 'progress_bar') {
    const val = data?.fields?.[widget.field];
    const cfgMin = (widget.config?.min ?? 0) as number;
    const cfgMax = (widget.config?.max ?? 100) as number;
    const pct = val !== undefined ? Math.min(100, Math.max(0, ((val - cfgMin) / (cfgMax - cfgMin)) * 100)) : 0;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', padding: '0 14px', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="eyebrow" style={{ fontSize: 9 }}>{(widget.field ?? '').replace(/_/g, ' ')}</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'hsl(var(--primary))' }}>{val !== undefined ? Number(val).toFixed(1) : '—'}</span>
        </div>
        <div style={{ height: 12, background: 'hsl(var(--rule))', overflow: 'hidden', borderRadius: 3 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'hsl(var(--primary))', transition: 'width 0.8s ease', borderRadius: 3 }} />
        </div>
        <div className="mono faint" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9 }}>
          <span>{cfgMin}</span><span>{Math.round(pct)}%</span><span>{cfgMax}</span>
        </div>
      </div>
    );
  }

  if (widget.type === 'line_chart') {
    const pts = (Array.isArray(data) ? data : []).map((p: any) => ({ ts: new Date(p.ts).getTime(), value: p.value }));
    return pts.length > 0
      ? <div style={{ padding: '4px 0', height: '100%' }}><LineChart series={[{ name: widget.field ?? '', data: pts, color: 'hsl(var(--primary))' }]} height={chartH} showArea /></div>
      : empty('No data yet');
  }

  if (widget.type === 'multi_line_chart') {
    const seriesArr: any[] = Array.isArray(data) ? data : [];
    if (seriesArr.length === 0) return empty('No series');
    const chartSeries = seriesArr.map((s: any) => ({
      name: s.name ?? '', color: s.color || 'hsl(var(--primary))',
      data: (s.data ?? []).map((p: any) => ({ ts: new Date(p.ts).getTime(), value: p.value })),
    }));
    return <div style={{ padding: '4px 0', height: '100%' }}><LineChart series={chartSeries} height={chartH} /></div>;
  }

  if (widget.type === 'bar_chart') {
    const pts = (Array.isArray(data) ? data : []).slice(-24).map((p: any) => ({
      label: new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      value: p.value,
    }));
    return pts.length > 0
      ? <div style={{ padding: '4px 0', height: '100%' }}><BarChart data={pts} color="hsl(var(--primary))" height={chartH} /></div>
      : empty('No data yet');
  }

  if (widget.type === 'scatter_chart') {
    const xData: any[] = data?.xData ?? [];
    const yData: any[] = data?.yData ?? [];
    if (xData.length === 0 || yData.length === 0) return empty('No data');
    const pairs: { x: number; y: number }[] = [];
    for (const xp of xData) {
      const xt = new Date(xp.ts).getTime();
      const best = yData.reduce((b: any, yp: any) =>
        Math.abs(new Date(yp.ts).getTime() - xt) < Math.abs(new Date(b.ts).getTime() - xt) ? yp : b, yData[0]);
      if (Math.abs(new Date(best.ts).getTime() - xt) < 120_000) pairs.push({ x: xp.value, y: best.value });
    }
    if (pairs.length === 0) return empty('No paired points');
    const xs = pairs.map(p => p.x); const ys = pairs.map(p => p.y);
    const minX = Math.min(...xs); const maxX = Math.max(...xs) || minX + 1;
    const minY = Math.min(...ys); const maxY = Math.max(...ys) || minY + 1;
    const W = 300; const H = Math.max(160, chartH);
    const pad = { t: 8, r: 8, b: 28, l: 40 };
    const px = (v: number) => pad.l + ((v - minX) / (maxX - minX)) * (W - pad.l - pad.r);
    const py = (v: number) => H - pad.b - ((v - minY) / (maxY - minY)) * (H - pad.t - pad.b);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
        <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="hsl(var(--border))" strokeWidth={1} />
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke="hsl(var(--border))" strokeWidth={1} />
        {pairs.map((p, i) => <circle key={i} cx={px(p.x)} cy={py(p.y)} r={3} fill="hsl(var(--primary))" fillOpacity={0.65} />)}
        <text x={W / 2} y={H - 4} textAnchor="middle" style={{ fontSize: 8, fontFamily: 'var(--font-mono)', fill: 'hsl(var(--muted-fg))' }}>{data?.xField ?? 'X'}</text>
        <text x={8} y={H / 2} textAnchor="middle" transform={`rotate(-90,8,${H / 2})`} style={{ fontSize: 8, fontFamily: 'var(--font-mono)', fill: 'hsl(var(--muted-fg))' }}>{data?.yField ?? 'Y'}</text>
      </svg>
    );
  }

  if (widget.type === 'data_table') {
    const entries = Object.entries(data?.fields ?? {}).filter(([, v]) => typeof v === 'number');
    if (entries.length === 0) return empty();
    return (
      <div style={{ overflowY: 'auto', height: '100%' }}>
        <table style={{ width: '100%', fontSize: 11, fontFamily: 'var(--font-mono)', borderCollapse: 'collapse' }}>
          <tbody>
            {entries.map(([k, v], i) => (
              <tr key={k} style={{ background: i % 2 === 0 ? 'transparent' : 'hsl(var(--surface-hover))' }}>
                <td style={{ padding: '6px 12px', color: 'hsl(var(--muted-fg))', borderBottom: '1px solid hsl(var(--rule-ghost))' }}>{k.replace(/_/g, ' ')}</td>
                <td style={{ padding: '6px 12px', textAlign: 'right', borderBottom: '1px solid hsl(var(--rule-ghost))', fontVariantNumeric: 'tabular-nums' }}>{(v as number).toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (widget.type === 'status_grid') {
    const devices: any[] = Array.isArray(data) ? data.filter(Boolean) : [];
    if (devices.length === 0) return empty('No devices');
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(80px,1fr))', gap: 6, padding: 8, alignContent: 'start', overflowY: 'auto', height: '100%' }}>
        {devices.map((d: any) => (
          <div key={d._id} className="panel" style={{ padding: '7px 10px' }}>
            <div style={{ fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>{d.name}</div>
            <span className="mono" style={{ fontSize: 9, padding: '2px 5px', background: d.status === 'online' ? 'hsl(var(--good) / 0.15)' : 'hsl(var(--border))', color: d.status === 'online' ? 'hsl(var(--good))' : 'hsl(var(--muted-fg))' }}>{d.status}</span>
          </div>
        ))}
      </div>
    );
  }

  if (widget.type === 'map') {
    const mapData = data ?? { devices: [], geofences: [] };
    const devices: any[] = (mapData.devices ?? []).filter((d: any) => d?.location?.lat);
    if (!GMAPS_KEY || devices.length === 0) return empty('No location data');
    const center = { lat: devices[0].location.lat, lng: devices[0].location.lng ?? devices[0].location.lon ?? 0 };
    return (
      <APIProvider apiKey={GMAPS_KEY}>
        <Map mapId={MAP_ID} defaultCenter={center} defaultZoom={devices.length > 1 ? 8 : 13}
          mapTypeId="satellite" style={{ width: '100%', height: '100%' }}
          gestureHandling="cooperative" streetViewControl={false} mapTypeControl={false} fullscreenControl={false}>
          {devices.map((d: any) => (
            <AdvancedMarker key={d._id} position={{ lat: d.location.lat, lng: d.location.lng ?? d.location.lon ?? 0 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'hsl(var(--primary))', border: '2px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,0.4)' }} />
            </AdvancedMarker>
          ))}
        </Map>
      </APIProvider>
    );
  }

  if (widget.type === 'text') {
    const text = (widget.config?.text as string) ?? '';
    const fontSize = (widget.config?.fontSize as number) ?? 16;
    const isDisplay = (widget.config?.font as string) !== 'mono';
    const align = (widget.config?.align as string) ?? 'left';
    const color = (widget.config?.color as string) ?? 'hsl(var(--fg))';
    return (
      <div style={{ padding: '12px 14px', height: '100%', overflowY: 'auto', display: 'flex', alignItems: 'center' }}>
        <div style={{ fontFamily: isDisplay ? 'var(--font-display)' : 'var(--font-mono)', fontSize, color, lineHeight: 1.55, textAlign: align as React.CSSProperties['textAlign'], whiteSpace: 'pre-wrap', width: '100%' }}>
          {text || <span style={{ opacity: 0.3 }}>No content</span>}
        </div>
      </div>
    );
  }

  if (widget.type === 'separator') {
    const orientation = (widget.config?.orientation as string) ?? 'horizontal';
    const thickness = (widget.config?.thickness as number) ?? 1;
    const color = (widget.config?.color as string) ?? 'hsl(var(--border))';
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '0 8px' }}>
        {orientation === 'vertical'
          ? <div style={{ width: thickness, height: '80%', background: color }} />
          : <div style={{ height: thickness, width: '100%', background: color }} />}
      </div>
    );
  }

  return empty(widget.type.replace(/_/g, ' '));
}

/* ── Widget card ─────────────────────────────────────────────────────── */
const ACCENT: Record<string, string> = {
  kpi_card: 'hsl(var(--primary))', stat_card: 'hsl(var(--primary))',
  line_chart: '#3b82f6', multi_line_chart: '#6366f1', bar_chart: '#8b5cf6',
  scatter_chart: '#f97316', gauge: '#f59e0b', level: '#06b6d4', progress_bar: '#10b981',
  data_table: '#10b981', map: '#0ea5e9', status_grid: '#f97316',
  text: 'hsl(var(--muted-fg))', separator: 'hsl(var(--border))',
};

function PreviewWidgetCard({ widget, data, contentH }: { widget: any; data: any; contentH: number }) {
  const accent = ACCENT[widget.type] ?? 'hsl(var(--primary))';
  if (widget.type === 'separator' || widget.type === 'text') {
    return <PreviewWidgetContent widget={widget} data={data} contentH={contentH} />;
  }
  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', borderTop: `2px solid ${accent}` }}>
      {widget.type !== 'text' && (
        <div style={{ padding: '7px 12px', borderBottom: '1px solid hsl(var(--rule-ghost))', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'hsl(var(--surface-active))' }}>
          <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{widget.title}</span>
          <span className="mono faint" style={{ fontSize: 8.5, letterSpacing: '0.1em', flexShrink: 0, marginLeft: 8 }}>{widget.type.replace(/_/g, ' ').toUpperCase()}</span>
        </div>
      )}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <PreviewWidgetContent widget={widget} data={data} contentH={contentH} />
      </div>
    </div>
  );
}

/* ── Page preview page ───────────────────────────────────────────────── */
export function PagePreviewPage() {
  const { id } = useParams<{ id: string }>();

  const { data: pageData, isLoading, isError } = useQuery({
    queryKey: ['page-preview', id],
    queryFn: () => apiClient.get(`/pages/${id}/preview`).then(r => r.data),
    enabled: !!id,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'hsl(var(--bg))' }}>
        <div className="mono faint" style={{ fontSize: 11, letterSpacing: '0.14em' }}>LOADING…</div>
      </div>
    );
  }

  if (isError || !pageData?.page) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'hsl(var(--bg))' }}>
        <div style={{ textAlign: 'center' }}>
          <p className="dim" style={{ fontSize: 14 }}>Page not found or access denied.</p>
          <a href="/pages" style={{ fontSize: 12, color: 'hsl(var(--primary))' }}>← Back to Pages</a>
        </div>
      </div>
    );
  }

  const { page, widgetData = {} } = pageData;
  const visibleWidgets = (page.widgets ?? []).filter((w: any) => w.type !== 'control_panel');

  return (
    <div style={{ minHeight: '100vh', background: 'hsl(var(--bg))', color: 'hsl(var(--fg))', display: 'flex', flexDirection: 'column' }}>
      {/* Internal preview banner */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', background: 'hsl(var(--surface))', borderBottom: '1px solid hsl(var(--rule))', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href={`/pages/${id}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'hsl(var(--muted-fg))', textDecoration: 'none' }}>
            <ArrowLeft size={12} /> Builder
          </a>
          <span style={{ width: 1, height: 14, background: 'hsl(var(--border))' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700 }}>{page.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'hsl(var(--good))', padding: '3px 9px', background: 'hsl(var(--good) / 0.1)', border: '1px solid hsl(var(--good) / 0.25)' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'hsl(var(--good))', animation: 'pulse 2s infinite' }} />
            INTERNAL PREVIEW
          </span>
          {page.shareToken
            ? <a href={`/s/${page.shareToken}`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'hsl(var(--muted-fg))', textDecoration: 'none' }}><Globe size={11} /> Public link</a>
            : <span className="mono faint" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 5 }}><Lock size={11} /> Not published</span>}
        </div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      {/* Page header */}
      <div style={{ padding: '32px 32px 24px', borderBottom: '1px solid hsl(var(--rule-ghost))' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px,4vw,52px)', letterSpacing: '-0.03em', margin: 0, lineHeight: 1 }}>{page.name}</h1>
        {page.description && <p className="dim" style={{ fontSize: 14, marginTop: 8, maxWidth: 560 }}>{page.description}</p>}
      </div>

      {/* Widget grid */}
      <div style={{ flex: 1, padding: '24px 32px 48px' }}>
        {visibleWidgets.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, opacity: 0.35 }}>
            <span className="dim" style={{ fontSize: 14 }}>No widgets on this page</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gridAutoRows: '70px', gap: '12px' }}>
            {visibleWidgets.map((w: any) => {
              const pos = w.position ?? { x: 0, y: 0, w: 4, h: 3 };
              const contentH = Math.max(80, pos.h * 82 - 55);
              return (
                <div key={w.id} style={{ gridColumn: `${pos.x + 1} / span ${pos.w}`, gridRow: `${pos.y + 1} / span ${pos.h}`, minWidth: 0, minHeight: 0 }}>
                  <PreviewWidgetCard widget={w} data={widgetData[w.id]} contentH={contentH} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
