import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { publicClient } from '@/api/publicClient';
import { LineChart, BarChart } from '@/components/charts/Charts';
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import { timeAgo } from '@/lib/utils';
import { BarChart2, TableProperties } from 'lucide-react';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const MAP_ID  = import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID';
const COLORS  = ['hsl(var(--primary))', '#22d3ee', '#a3e635', '#f97316', '#e879f9', '#facc15'];

const WIDGET_LABELS: Record<string, string> = {
  kpi_card: 'KPI', line_chart: 'Chart', bar_chart: 'Bar', gauge: 'Gauge',
  data_table: 'Table', map: 'Map', status_grid: 'Status', control_panel: 'Controls',
};

/* ── Slim top bar shared by all share views ──────────────────────────── */
function ShareTopBar({ subtitle }: { subtitle?: string }) {
  return (
    <div style={{
      height: 52, borderBottom: '1px solid hsl(var(--border))',
      background: 'hsl(var(--surface))',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 32px', flexShrink: 0, gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 19, letterSpacing: '-0.03em', lineHeight: 1 }}>Orion</span>
        {subtitle && (
          <>
            <span style={{ width: 1, height: 16, background: 'hsl(var(--border))' }} />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, opacity: 0.55, lineHeight: 1 }}>{subtitle}</span>
          </>
        )}
      </div>
      <span className="mono faint" style={{ fontSize: 9.5 }}>Powered by Orion</span>
    </div>
  );
}

/* ── KPI tile (device share) ─────────────────────────────────────────── */
function KpiTile({ label, value, color, unit }: { label: string; value: number; color: string; unit?: string }) {
  return (
    <button style={{
      padding: '18px 20px',
      borderRight: '1px solid hsl(var(--border))',
      borderBottom: '1px solid hsl(var(--border))',
      textAlign: 'left', background: 'transparent', cursor: 'default',
    }}>
      <div className="eyebrow" style={{ fontSize: 9.5 }}>{label.replace(/_/g, ' ')}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, lineHeight: 1, marginTop: 4, color }} className="num">
        {value.toFixed(2)}
      </div>
      {unit && <div className="mono faint" style={{ fontSize: 9.5, marginTop: 2 }}>{unit}</div>}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   DEVICE SHARE VIEW — interactive, with chart/table toggle
   ══════════════════════════════════════════════════════════════════════ */
function DeviceShareView({ token, data }: { token: string; data: any }) {
  const { device, sections = [], latest } = data;
  const fields: Record<string, number> = latest?.fields ?? {};
  const numericFields = Object.entries(fields).filter(([, v]) => typeof v === 'number') as [string, number][];
  const schemaFields: any[] = device?.meta?.dataSchema?.fields ?? [];

  const [telemView, setTelemView] = useState<'chart' | 'table'>('chart');
  const [chartField, setChartField] = useState(numericFields[0]?.[0] ?? '');
  const [chartRange, setChartRange] = useState('24h');

  const hoursMap: Record<string, number> = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 };
  const fromTs = new Date(Date.now() - (hoursMap[chartRange] ?? 24) * 3600_000).toISOString();
  const fm = schemaFields.find((f: any) => f.key === chartField);
  const chartColor = fm?.chartColor ?? 'hsl(var(--primary))';

  return (
    <div style={{ minHeight: '100vh', background: 'hsl(var(--bg))', display: 'flex', flexDirection: 'column' }}>
      <ShareTopBar subtitle={device.name} />

      <div className="page" style={{ maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>{device.category} · {device.protocol?.toUpperCase()}</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 40, lineHeight: 1, margin: 0 }}>
            {device.name.split(' ').slice(0, -1).join(' ')} <em>{device.name.split(' ').slice(-1)[0]}</em>
          </h1>
          {device.description && <p className="lede" style={{ marginTop: 8 }}>{device.description}</p>}
        </div>

        {/* Metrics — clickable to select chart field */}
        {sections.includes('metrics') && numericFields.length > 0 && (
          <div style={{ borderTop: '1px solid hsl(var(--fg))', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', marginBottom: 32 }}>
            {numericFields.map(([k, v], i) => {
              const fmeta = schemaFields.find((f: any) => f.key === k);
              const color = fmeta?.chartColor ?? COLORS[i % COLORS.length];
              return (
                <button
                  key={k}
                  onClick={() => setChartField(k)}
                  style={{
                    padding: '18px 20px', borderBottom: '1px solid hsl(var(--border))',
                    borderRight: '1px solid hsl(var(--border))', textAlign: 'left',
                    background: chartField === k && sections.includes('chart') ? 'hsl(var(--surface-raised))' : 'transparent',
                    cursor: sections.includes('chart') ? 'pointer' : 'default',
                    outline: chartField === k && sections.includes('chart') ? `1px solid ${color}` : 'none',
                    outlineOffset: -1, transition: 'background 0.1s',
                  }}
                >
                  <div className="eyebrow" style={{ fontSize: 9.5 }}>{k.replace(/_/g, ' ')}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, lineHeight: 1, marginTop: 4, color }} className="num">{v.toFixed(2)}</div>
                  {fmeta?.unit && <div className="mono faint" style={{ fontSize: 10, marginTop: 2 }}>{fmeta.unit}</div>}
                </button>
              );
            })}
          </div>
        )}

        {/* Chart section */}
        {sections.includes('chart') && numericFields.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div className="eyebrow">Live telemetry</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, lineHeight: 1, marginTop: 4, textTransform: 'capitalize' }}>
                  {telemView === 'chart'
                    ? <>{chartField.replace(/_/g, ' ')} <span style={{ fontStyle: 'italic', color: 'hsl(var(--primary))' }}>· {chartRange}</span></>
                    : <>All fields <span style={{ fontStyle: 'italic', color: 'hsl(var(--primary))' }}>· {chartRange}</span></>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {telemView === 'chart' && numericFields.length > 1 && (
                  <select className="input" value={chartField} onChange={e => setChartField(e.target.value)}
                    style={{ fontSize: 11, padding: '4px 8px', height: 28 }}>
                    {numericFields.map(([k]) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
                  </select>
                )}
                <div className="seg">
                  <button className={telemView === 'chart' ? 'on' : ''} onClick={() => setTelemView('chart')}>
                    <BarChart2 size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />Chart
                  </button>
                  <button className={telemView === 'table' ? 'on' : ''} onClick={() => setTelemView('table')}>
                    <TableProperties size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />Table
                  </button>
                </div>
                <div className="seg">
                  {['1h', '6h', '24h', '7d'].map(r => (
                    <button key={r} className={chartRange === r ? 'on' : ''} onClick={() => setChartRange(r)}>{r.toUpperCase()}</button>
                  ))}
                </div>
              </div>
            </div>
            {telemView === 'chart'
              ? <SharedChart token={token} field={chartField} color={chartColor} from={fromTs} />
              : <SharedTable token={token} field={chartField} schemaFields={schemaFields} from={fromTs} />}
          </div>
        )}

        {/* Info */}
        {sections.includes('info') && (
          <div style={{ marginBottom: 32 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Device info</div>
            <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
              {[
                ['Category', device.category],
                ['Protocol', device.protocol?.toUpperCase()],
                ['Format', device.payloadFormat?.toUpperCase() ?? '—'],
                ['Firmware', device.firmwareVersion ?? '—'],
                ['Tags', device.tags?.join(', ') || '—'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 16px', borderBottom: '1px solid hsl(var(--rule-ghost))' }}>
                  <span className="mono faint" style={{ fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{label}</span>
                  <span style={{ fontSize: 13 }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Location */}
        {sections.includes('location') && device.location?.lat && (
          <div className="section" style={{ marginBottom: 32 }}>
            <div>
              <div className="ssh">Location</div>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[['Lat', device.location.lat?.toFixed(6)], ['Lng', (device.location.lng ?? device.location.lon)?.toFixed(6)]].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="mono faint" style={{ fontSize: 10.5, textTransform: 'uppercase' }}>{k}</span>
                    <span className="mono" style={{ fontSize: 13 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              {API_KEY ? (
                <APIProvider apiKey={API_KEY}>
                  <Map mapId={MAP_ID}
                    defaultCenter={{ lat: device.location.lat, lng: device.location.lng ?? device.location.lon ?? 0 }}
                    defaultZoom={13} mapTypeId="satellite" style={{ width: '100%', height: 280 }}
                    gestureHandling="cooperative" streetViewControl={false} mapTypeControl={false}>
                    <AdvancedMarker position={{ lat: device.location.lat, lng: device.location.lng ?? device.location.lon ?? 0 }}>
                      <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'hsl(var(--primary))', border: '2px solid white', boxShadow: '0 0 0 3px rgba(255,91,31,0.35)' }} />
                    </AdvancedMarker>
                  </Map>
                </APIProvider>
              ) : (
                <div className="panel" style={{ padding: 32, textAlign: 'center' }}><p className="dim" style={{ fontSize: 13 }}>Map unavailable</p></div>
              )}
            </div>
          </div>
        )}

        {/* History */}
        {sections.includes('history') && (
          <div style={{ marginBottom: 32 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Command history</div>
            <div className="table-responsive">
              <table className="table">
                <thead><tr><th>Command</th><th>Status</th><th>Sent</th></tr></thead>
                <tbody>
                  {(data.commandHistory ?? []).length === 0
                    ? <tr><td colSpan={3} style={{ textAlign: 'center', padding: '24px 0' }} className="dim">No commands</td></tr>
                    : (data.commandHistory ?? []).map((cmd: any) => (
                      <tr key={cmd._id}>
                        <td className="mono acc" style={{ fontSize: 12 }}>{cmd.name}</td>
                        <td><span className={`tag tag-${cmd.status === 'executed' ? 'online' : cmd.status === 'failed' ? 'error' : 'offline'}`}>{cmd.status}</span></td>
                        <td className="mono faint" style={{ fontSize: 11 }}>{timeAgo(cmd.createdAt)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Single-field chart ───────────────────────────────────────────────── */
function SharedChart({ token, field, color, from }: { token: string; field: string; color: string; from: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['share-series', token, field, from],
    queryFn: () => publicClient.get(`/public/device/${token}/series`, { params: { field, from } }).then(r => r.data),
    enabled: !!field,
  });
  const points = (data?.data ?? []).map((p: any) => ({
    ts: typeof p.ts === 'string' ? new Date(p.ts).getTime() : p.ts,
    value: typeof p.value === 'number' ? p.value : 0,
  }));
  if (isLoading) return <div className="skeleton" style={{ height: 260 }} />;
  return (
    <div className="panel" style={{ padding: '16px 12px 8px', overflow: 'hidden' }}>
      {points.length === 0
        ? <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="dim">No data</div>
        : <LineChart series={[{ name: field, data: points, color }]} height={240} showArea />}
    </div>
  );
}

/* ── Single-field table ───────────────────────────────────────────────── */
function SharedTable({ token, field, schemaFields, from }: { token: string; field: string; schemaFields: any[]; from: string }) {
  const fm = schemaFields.find((f: any) => f.key === field);
  const color = fm?.chartColor ?? 'hsl(var(--primary))';
  const { data, isLoading } = useQuery({
    queryKey: ['share-table', token, field, from],
    queryFn: () => publicClient.get(`/public/device/${token}/series`, { params: { field, from, limit: 200 } }).then(r => r.data),
    enabled: !!field,
  });
  const rows: any[] = data?.data ?? [];
  if (isLoading) return <div className="skeleton" style={{ height: 260 }} />;
  if (rows.length === 0) return (
    <div className="panel" style={{ padding: 0 }}>
      <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="dim">No data in this range</div>
    </div>
  );
  return (
    <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 320 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          <thead style={{ position: 'sticky', top: 0, background: 'hsl(var(--surface-raised))', zIndex: 1 }}>
            <tr>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: 9.5, color: 'hsl(var(--muted-fg))', borderBottom: '1px solid hsl(var(--border))' }}>Timestamp</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: 9.5, color, borderBottom: '1px solid hsl(var(--border))' }}>
                {field.replace(/_/g, ' ')}{fm?.unit ? ` (${fm.unit})` : ''}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: any, i: number) => (
              <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'hsl(var(--surface-raised) / 0.4)' }}>
                <td style={{ padding: '7px 12px', color: 'hsl(var(--muted-fg))', whiteSpace: 'nowrap', borderBottom: '1px solid hsl(var(--rule-ghost))' }}>
                  {new Date(row.ts ?? row.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </td>
                <td style={{ padding: '7px 12px', textAlign: 'right', color, borderBottom: '1px solid hsl(var(--rule-ghost))' }}>
                  {typeof row.value === 'number' ? row.value.toFixed(4) : String(row.value ?? '—')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   PAGE SHARE VIEW — premium grid matching builder layout
   ══════════════════════════════════════════════════════════════════════ */
function PageShareView({ pageData }: { pageData: any }) {
  const { page, widgetData = {} } = pageData;

  // Hide control_panel widgets on public pages (require auth to send commands)
  const visibleWidgets = (page.widgets ?? []).filter((w: any) => w.type !== 'control_panel');

  return (
    <div style={{ minHeight: '100vh', background: 'hsl(var(--bg))', display: 'flex', flexDirection: 'column' }}>
      <ShareTopBar subtitle={page.name} />

      <div style={{ flex: 1, maxWidth: 1440, margin: '0 auto', width: '100%', padding: '40px 32px 80px' }}>
        {/* Page hero */}
        <div style={{ marginBottom: 40, paddingBottom: 32, borderBottom: '1px solid hsl(var(--border))' }}>
          <div className="eyebrow" style={{ marginBottom: 10, fontSize: 9 }}>Dashboard · Orion Platform</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 52, lineHeight: 0.95, margin: 0, letterSpacing: '-0.03em' }}>
            {page.name.split(' ').length > 1 ? (
              <>{page.name.split(' ').slice(0, -1).join(' ')}{' '}<em style={{ color: 'hsl(var(--primary))' }}>{page.name.split(' ').slice(-1)[0]}</em></>
            ) : (
              <em style={{ color: 'hsl(var(--primary))' }}>{page.name}</em>
            )}
          </h1>
          {page.description && <p className="lede" style={{ marginTop: 12, maxWidth: 560 }}>{page.description}</p>}
        </div>

        {/* Widget grid — exact 12-col, 70px-row layout matching the builder */}
        {visibleWidgets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 24px', opacity: 0.35 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, marginBottom: 8 }}>Nothing to show</div>
            <p style={{ fontSize: 13 }}>This page has no widgets, or they are not public.</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(12, 1fr)',
            gridAutoRows: '70px',
            gap: '12px',
          }}>
            {visibleWidgets.map((w: any) => {
              const pos = w.position ?? { x: 0, y: 0, w: 4, h: 3 };
              return (
                <div
                  key={w.id}
                  style={{
                    gridColumn: `${pos.x + 1} / span ${pos.w}`,
                    gridRow: `${pos.y + 1} / span ${pos.h}`,
                    minWidth: 0, minHeight: 0,
                  }}
                >
                  <WidgetCard widget={w} data={widgetData[w.id]} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Premium widget card shell ───────────────────────────────────────── */
function WidgetCard({ widget, data }: { widget: any; data: any }) {
  return (
    <div className="panel" style={{
      overflow: 'hidden', height: '100%',
      display: 'flex', flexDirection: 'column',
      background: 'hsl(var(--surface))',
    }}>
      {/* Header */}
      <div style={{
        padding: '9px 14px',
        borderBottom: '1px solid hsl(var(--rule-ghost))',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexShrink: 0,
        background: 'hsl(var(--surface-raised))',
      }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
          {widget.title}
        </div>
        <div className="mono" style={{ fontSize: 8.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'hsl(var(--muted-fg))', flexShrink: 0, marginLeft: 8 }}>
          {WIDGET_LABELS[widget.type] ?? widget.type}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0 }}>
        <WidgetContent widget={widget} data={data} />
      </div>
    </div>
  );
}

/* ── Widget content router ───────────────────────────────────────────── */
function WidgetContent({ widget, data }: { widget: any; data: any }) {
  const empty = (msg = 'No data') => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12 }} className="dim">{msg}</div>
  );

  /* KPI card */
  if (widget.type === 'kpi_card') {
    const val = data?.fields?.[widget.field];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 4, padding: 16 }}>
        <div className="eyebrow" style={{ fontSize: 9 }}>{(widget.field ?? 'value').replace(/_/g, ' ')}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(24px,3.5vw,52px)', lineHeight: 1, color: 'hsl(var(--primary))' }}>
          {val !== undefined ? Number(val).toFixed(2) : <span className="dim" style={{ fontSize: 20 }}>—</span>}
        </div>
        {data?.timestamp && <div className="mono faint" style={{ fontSize: 9 }}>updated {timeAgo(data.timestamp)}</div>}
      </div>
    );
  }

  /* Gauge */
  if (widget.type === 'gauge') {
    const pts: any[] = Array.isArray(data) ? data : [];
    const lastVal = pts.length > 0 ? pts[pts.length - 1].value : undefined;
    const pct = lastVal !== undefined ? Math.min(100, Math.max(0, lastVal)) : 0;
    const r = 58; const cx = 80; const cy = 78;
    const start = Math.PI * 0.75; const end = Math.PI * 2.25;
    const arc = (a: number) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    const s = arc(start); const e = arc(end);
    const a = arc(start + (end - start) * (pct / 100));
    const large = pct > 50 ? 1 : 0;
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <svg viewBox="0 0 160 120" style={{ width: '100%', maxWidth: 160, height: 'auto' }}>
          <path d={`M ${s.x} ${s.y} A ${r} ${r} 0 1 1 ${e.x} ${e.y}`} fill="none" stroke="hsl(var(--border))" strokeWidth={10} strokeLinecap="round" />
          {pct > 0 && <path d={`M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${a.x} ${a.y}`} fill="none" stroke="hsl(var(--primary))" strokeWidth={10} strokeLinecap="round" />}
          <text x={cx} y={cy - 2} textAnchor="middle" style={{ fontFamily: 'var(--font-display)', fontSize: 22, fill: 'hsl(var(--fg))' }}>{lastVal?.toFixed(1) ?? '—'}</text>
          <text x={cx} y={cy + 14} textAnchor="middle" style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, fill: 'hsl(var(--muted-fg))', textTransform: 'uppercase' }}>{widget.field ?? ''}</text>
        </svg>
      </div>
    );
  }

  /* Line chart */
  if (widget.type === 'line_chart') {
    const pts = (Array.isArray(data) ? data : []).map((p: any) => ({ ts: new Date(p.ts).getTime(), value: p.value }));
    return pts.length > 0
      ? <div style={{ padding: '8px 4px 4px', height: '100%' }}><LineChart series={[{ name: widget.field ?? '', data: pts, color: 'hsl(var(--primary))' }]} height={180} showArea /></div>
      : empty('No data yet');
  }

  /* Bar chart */
  if (widget.type === 'bar_chart') {
    const pts = (Array.isArray(data) ? data : []).slice(-24).map((p: any) => ({
      label: new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      value: p.value,
    }));
    return pts.length > 0
      ? <div style={{ padding: '8px 4px 4px', height: '100%' }}><BarChart data={pts} color="hsl(var(--primary))" height={180} /></div>
      : empty('No data yet');
  }

  /* Data table */
  if (widget.type === 'data_table') {
    const entries = Object.entries(data?.fields ?? {}).filter(([, v]) => typeof v === 'number');
    if (entries.length === 0) return empty();
    return (
      <div style={{ overflowY: 'auto', height: '100%' }}>
        <table style={{ width: '100%', fontSize: 11, fontFamily: 'var(--font-mono)', borderCollapse: 'collapse' }}>
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k} style={{ borderBottom: '1px solid hsl(var(--rule-ghost))' }}>
                <td style={{ padding: '6px 14px', color: 'hsl(var(--muted-fg))' }}>{k.replace(/_/g, ' ')}</td>
                <td style={{ padding: '6px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{(v as number).toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  /* Status grid */
  if (widget.type === 'status_grid') {
    const devices: any[] = Array.isArray(data) ? data.filter(Boolean) : [];
    if (devices.length === 0) return empty('No devices');
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 6, padding: 10, alignContent: 'start', overflowY: 'auto', height: '100%' }}>
        {devices.map((d: any) => (
          <div key={d._id} style={{ padding: '7px 9px', background: 'hsl(var(--surface-raised))' }}>
            <div style={{ fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
            <span className={`tag tag-${d.status === 'online' ? 'online' : d.status === 'error' ? 'error' : 'offline'}`} style={{ marginTop: 3, display: 'inline-block' }}>{d.status}</span>
          </div>
        ))}
      </div>
    );
  }

  /* Map */
  if (widget.type === 'map') {
    const devices: any[] = Array.isArray(data) ? data.filter(Boolean) : [];
    const withLoc = devices.filter(d => d?.location?.lat);
    if (!API_KEY) return empty('Map unavailable (no API key)');
    if (withLoc.length === 0) return empty('No location data');
    const center = { lat: withLoc[0].location.lat, lng: withLoc[0].location.lng ?? withLoc[0].location.lon ?? 0 };
    return (
      <APIProvider apiKey={API_KEY}>
        <Map mapId={MAP_ID} defaultCenter={center} defaultZoom={withLoc.length > 1 ? 8 : 12}
          mapTypeId="satellite" style={{ width: '100%', height: '100%' }}
          gestureHandling="cooperative" streetViewControl={false} mapTypeControl={false} zoomControl>
          {withLoc.map((d: any) => (
            <AdvancedMarker key={d._id} position={{ lat: d.location.lat, lng: d.location.lng ?? d.location.lon ?? 0 }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'hsl(var(--primary))', border: '2.5px solid white', boxShadow: '0 0 0 3px rgba(255,91,31,0.35)' }} />
            </AdvancedMarker>
          ))}
        </Map>
      </APIProvider>
    );
  }

  return empty(widget.type);
}

/* ══════════════════════════════════════════════════════════════════════
   ROOT — resolves token → device share or page share
   ══════════════════════════════════════════════════════════════════════ */
export function ShareViewPage() {
  const { token } = useParams<{ token: string }>();

  const { data: deviceData, isLoading: loadingDevice, isError: deviceErr } = useQuery({
    queryKey: ['share-device', token],
    queryFn: () => publicClient.get(`/public/device/${token}`).then(r => r.data),
    enabled: !!token,
    retry: false,
  });

  const { data: pageData, isLoading: loadingPage } = useQuery({
    queryKey: ['share-page', token],
    queryFn: () => publicClient.get(`/public/page/${token}`).then(r => r.data),
    enabled: !!token && deviceErr,
    retry: false,
  });

  const isLoading = loadingDevice || (deviceErr && loadingPage);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div className="skeleton" style={{ width: 320, height: 80 }} />
      </div>
    );
  }

  if (deviceData?.device) {
    return <DeviceShareView token={token!} data={deviceData} />;
  }

  if (pageData?.page) {
    return <PageShareView pageData={pageData} />;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <ShareTopBar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, letterSpacing: '-0.02em' }}>Link expired</div>
        <p className="dim" style={{ fontSize: 14 }}>This share link has expired or doesn't exist.</p>
      </div>
    </div>
  );
}
