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

function KpiTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: '18px 20px', borderRight: '1px solid hsl(var(--border))', borderBottom: '1px solid hsl(var(--border))' }}>
      <div className="eyebrow" style={{ fontSize: 9.5 }}>{label.replace(/_/g, ' ')}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, lineHeight: 1, marginTop: 4, color }}>{value.toFixed(2)}</div>
    </div>
  );
}

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
  const data = deviceData?.device ? deviceData : undefined;
  const isPageShare = deviceErr && !!pageData?.page;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div className="skeleton" style={{ width: 320, height: 80 }} />
      </div>
    );
  }

  if (isPageShare) {
    return <PageShareView token={token!} pageData={pageData} />;
  }

  if (!data?.device) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 28 }}>Link expired</div>
        <p className="dim" style={{ fontSize: 14 }}>This link has expired or doesn't exist.</p>
      </div>
    );
  }

  return <DeviceShareView token={token!} data={data} />;
}

/* ── Interactive device share view ───────────────────────────────────── */
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
      {/* Slim top bar */}
      <div style={{ height: 48, borderBottom: '1px solid hsl(var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '-0.03em' }}>Orion</span>
        <span className="mono faint" style={{ fontSize: 10.5 }}>Powered by Orion</span>
      </div>

      <div className="page" style={{ maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        {/* Device title */}
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>{device.category} · {device.protocol?.toUpperCase()}</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 40, lineHeight: 1, margin: 0 }}>
            {device.name.split(' ').slice(0, -1).join(' ')} <em>{device.name.split(' ').slice(-1)[0]}</em>
          </h1>
          {device.description && <p className="lede" style={{ marginTop: 8 }}>{device.description}</p>}
        </div>

        {/* Metrics — interactive field selector */}
        {sections.includes('metrics') && numericFields.length > 0 && (
          <div style={{ borderTop: '1px solid hsl(var(--fg))', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', marginBottom: 32 }}>
            {numericFields.map(([k, v], i) => {
              const fmeta = schemaFields.find((f: any) => f.key === k);
              const color = fmeta?.chartColor ?? COLORS[i % COLORS.length];
              return (
                <button
                  key={k}
                  onClick={() => { setChartField(k); }}
                  style={{
                    padding: '18px 20px',
                    borderBottom: '1px solid hsl(var(--border))',
                    borderRight: '1px solid hsl(var(--border))',
                    textAlign: 'left',
                    background: chartField === k && sections.includes('chart') ? 'hsl(var(--surface-raised))' : 'transparent',
                    cursor: sections.includes('chart') ? 'pointer' : 'default',
                    outline: chartField === k && sections.includes('chart') ? `1px solid ${color}` : 'none',
                    outlineOffset: -1,
                    transition: 'background 0.1s',
                  }}
                >
                  <div className="eyebrow" style={{ fontSize: 9.5 }}>{k.replace(/_/g, ' ')}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, lineHeight: 1, marginTop: 4, color }} className="num">
                    {v.toFixed(2)}
                  </div>
                  {fmeta?.unit && <div className="mono faint" style={{ fontSize: 10, marginTop: 2 }}>{fmeta.unit}</div>}
                </button>
              );
            })}
          </div>
        )}

        {/* Chart — with interactive controls */}
        {sections.includes('chart') && numericFields.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            {/* Controls row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div className="eyebrow">Live telemetry</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, lineHeight: 1, marginTop: 4, textTransform: 'capitalize' }}>
                  {telemView === 'chart'
                    ? <>{chartField.replace(/_/g, ' ')} <span style={{ fontStyle: 'italic', color: 'hsl(var(--primary))' }}>· {chartRange}</span></>
                    : <>All fields <span style={{ fontStyle: 'italic', color: 'hsl(var(--primary))' }}>· {chartRange}</span></>
                  }
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Field selector */}
                {telemView === 'chart' && numericFields.length > 1 && (
                  <select
                    className="input"
                    value={chartField}
                    onChange={e => setChartField(e.target.value)}
                    style={{ fontSize: 11, padding: '4px 8px', height: 28 }}
                  >
                    {numericFields.map(([k]) => (
                      <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                )}
                {/* View toggle */}
                <div className="seg">
                  <button className={telemView === 'chart' ? 'on' : ''} onClick={() => setTelemView('chart')} title="Chart view">
                    <BarChart2 size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />Chart
                  </button>
                  <button className={telemView === 'table' ? 'on' : ''} onClick={() => setTelemView('table')} title="Table view">
                    <TableProperties size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />Table
                  </button>
                </div>
                {/* Range selector */}
                <div className="seg">
                  {['1h', '6h', '24h', '7d'].map(r => (
                    <button key={r} className={chartRange === r ? 'on' : ''} onClick={() => setChartRange(r)}>{r.toUpperCase()}</button>
                  ))}
                </div>
              </div>
            </div>

            {telemView === 'chart' ? (
              <SharedChart token={token} field={chartField} color={chartColor} from={fromTs} />
            ) : (
              <SharedTable token={token} field={chartField} schemaFields={schemaFields} from={fromTs} />
            )}
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
                {[
                  ['Lat', device.location.lat?.toFixed(6)],
                  ['Lng', (device.location.lng ?? device.location.lon)?.toFixed(6)],
                ].map(([k, v]) => (
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
                  <Map mapId={MAP_ID} defaultCenter={{ lat: device.location.lat, lng: device.location.lng ?? device.location.lon ?? 0 }} defaultZoom={13}
                    mapTypeId="satellite" style={{ width: '100%', height: 280 }} gestureHandling="cooperative" streetViewControl={false} mapTypeControl={false}>
                    <AdvancedMarker position={{ lat: device.location.lat, lng: device.location.lng ?? device.location.lon ?? 0 }}>
                      <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'hsl(var(--primary))', border: '2px solid white', boxShadow: '0 0 0 3px rgba(255,91,31,0.35)' }} />
                    </AdvancedMarker>
                  </Map>
                </APIProvider>
              ) : (
                <div className="panel" style={{ padding: 32, textAlign: 'center' }}>
                  <p className="dim" style={{ fontSize: 13 }}>Map unavailable</p>
                </div>
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
                <thead>
                  <tr>
                    <th>Command</th>
                    <th>Status</th>
                    <th>Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.commandHistory ?? []).length === 0 ? (
                    <tr><td colSpan={3} style={{ textAlign: 'center', padding: '24px 0' }} className="dim">No commands</td></tr>
                  ) : (
                    (data.commandHistory ?? []).map((cmd: any) => (
                      <tr key={cmd._id}>
                        <td className="mono acc" style={{ fontSize: 12 }}>{cmd.name}</td>
                        <td><span className={`tag tag-${cmd.status === 'executed' ? 'online' : cmd.status === 'failed' ? 'error' : 'offline'}`}>{cmd.status}</span></td>
                        <td className="mono faint" style={{ fontSize: 11 }}>{timeAgo(cmd.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Chart subcomponent ───────────────────────────────────────────────── */
function SharedChart({ token, field, color, from }: { token: string; field: string; color: string; from: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['share-series', token, field, from],
    queryFn: () => publicClient.get(`/public/device/${token}/series`, {
      params: { field, from },
    }).then(r => r.data),
    enabled: !!field,
  });

  const points = (data?.data ?? []).map((p: any) => ({
    ts: typeof p.ts === 'string' ? new Date(p.ts).getTime() : p.ts,
    value: typeof p.value === 'number' ? p.value : 0,
  }));

  if (isLoading) return <div className="skeleton" style={{ height: 260 }} />;

  return (
    <div className="panel" style={{ padding: '16px 12px 8px', overflow: 'hidden' }}>
      {points.length === 0 ? (
        <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="dim">No data</div>
      ) : (
        <LineChart series={[{ name: field, data: points, color }]} height={240} showArea />
      )}
    </div>
  );
}

/* ── Table subcomponent ─ shows selected field points as rows ─────────── */
function SharedTable({ token, field, schemaFields, from }: { token: string; field: string; schemaFields: any[]; from: string }) {
  const fm = schemaFields.find((f: any) => f.key === field);
  const color = fm?.chartColor ?? 'hsl(var(--primary))';

  const { data, isLoading } = useQuery({
    queryKey: ['share-table', token, field, from],
    queryFn: () => publicClient.get(`/public/device/${token}/series`, {
      params: { field, from, limit: 200 },
    }).then(r => r.data),
    enabled: !!field,
  });

  const rows: any[] = data?.data ?? [];

  if (isLoading) return <div className="skeleton" style={{ height: 260 }} />;

  if (rows.length === 0) {
    return (
      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="dim">No data in this range</div>
      </div>
    );
  }

  return (
    <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 320 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          <thead style={{ position: 'sticky', top: 0, background: 'hsl(var(--surface-raised))', zIndex: 1 }}>
            <tr>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: 9.5, color: 'hsl(var(--muted-fg))', borderBottom: '1px solid hsl(var(--border))' }}>
                Timestamp
              </th>
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

/* ── Page share view ─────────────────────────────────────────────────── */
function PageShareView({ token: _token, pageData }: { token: string; pageData: any }) {
  const { page, widgetData = {} } = pageData;

  return (
    <div style={{ minHeight: '100vh', background: 'hsl(var(--bg))', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 48, borderBottom: '1px solid hsl(var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '-0.03em' }}>Orion</span>
        <span className="mono faint" style={{ fontSize: 10.5 }}>Powered by Orion</span>
      </div>
      <div className="page" style={{ maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: 32 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Page</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 40, lineHeight: 1, margin: 0 }}>{page.name}</h1>
          {page.description && <p className="lede" style={{ marginTop: 8 }}>{page.description}</p>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {(page.widgets ?? []).map((w: any) => (
            <PublicWidgetCard key={w.id} widget={w} data={widgetData[w.id]} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PublicWidgetCard({ widget, data }: { widget: any; data: any }) {
  return (
    <div className="panel" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid hsl(var(--rule-ghost))' }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{widget.title}</div>
        <div className="mono faint" style={{ fontSize: 9.5, textTransform: 'uppercase', marginTop: 2 }}>{widget.type.replace('_', ' ')}</div>
      </div>
      <div style={{ padding: 14, minHeight: 100 }}>
        {(widget.type === 'kpi_card') && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 42, color: 'hsl(var(--primary))' }}>
              {data?.fields?.[widget.field] !== undefined ? Number(data.fields[widget.field]).toFixed(2) : '—'}
            </div>
            <div className="mono faint" style={{ fontSize: 10.5 }}>{(widget.field ?? '').replace(/_/g, ' ')}</div>
          </div>
        )}
        {(widget.type === 'line_chart') && Array.isArray(data) && data.length > 0 && (
          <LineChart series={[{ name: widget.field ?? '', data: data.map((p: any) => ({ ts: new Date(p.ts).getTime(), value: p.value })), color: 'hsl(var(--primary))' }]} height={120} showArea />
        )}
        {(widget.type === 'bar_chart') && Array.isArray(data) && data.length > 0 && (
          <BarChart data={data.slice(-20).map((p: any) => ({ label: new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), value: p.value }))} color="hsl(var(--primary))" height={120} />
        )}
        {(widget.type === 'data_table') && data?.fields && (
          <table style={{ width: '100%', fontSize: 11, fontFamily: 'var(--font-mono)', borderCollapse: 'collapse' }}>
            <tbody>
              {Object.entries(data.fields).filter(([, v]) => typeof v === 'number').map(([k, v]) => (
                <tr key={k} style={{ borderBottom: '1px solid hsl(var(--rule-ghost))' }}>
                  <td style={{ padding: '4px 0', color: 'hsl(var(--muted-fg))' }}>{k.replace(/_/g, ' ')}</td>
                  <td style={{ padding: '4px 0', textAlign: 'right' }}>{(v as number).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(widget.type === 'status_grid') && Array.isArray(data) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 6 }}>
            {data.filter(Boolean).map((d: any) => (
              <div key={d._id} style={{ padding: '6px 8px', background: 'hsl(var(--surface-raised))', fontSize: 11 }}>
                <div style={{ fontSize: 12 }}>{d.name}</div>
                <span className={`tag tag-${d.status === 'online' ? 'online' : 'offline'}`} style={{ marginTop: 2 }}>{d.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
