import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { devicesApi } from '@/api/devices';
import { telemetryApi } from '@/api/telemetry';
import { getCategoryIconInfo, downloadCSV, formatDate } from '@/lib/utils';
import { LineChart } from '@/components/charts/Charts';
import { Download, TrendingUp, TrendingDown, Minus } from 'lucide-react';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--fg))', 'hsl(var(--info))', 'hsl(var(--good))', 'hsl(var(--warn))', '#A06CD5'];
const RANGES = [{ label: '1h', h: 1 }, { label: '6h', h: 6 }, { label: '24h', h: 24 }, { label: '7d', h: 168 }];

export function TelemetryPage() {
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [featuredField, setFeaturedField] = useState('');
  const [range, setRange] = useState(RANGES[2]);
  const [normalize, setNormalize] = useState(false);
  const [showArea, setShowArea] = useState(true);

  const { data: devicesData } = useQuery({
    queryKey: ['devices', 'telemetry-page'],
    queryFn: () => devicesApi.list({ limit: 100 }),
  });

  const devices = devicesData?.devices ?? [];
  const deviceId = selectedDeviceId || (devices[0] as any)?._id;
  const selectedDevice = devices.find((d: any) => (d._id ?? d.id) === deviceId) as any;

  const { data: latestData } = useQuery({
    queryKey: ['telemetry', 'latest', deviceId],
    queryFn: () => telemetryApi.latest(deviceId),
    enabled: !!deviceId,
    refetchInterval: 15_000,
  });

  const latest = latestData?.fields ?? {};
  const numericFields = Object.entries(latest)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => ({ key: k, value: v as number }));

  useEffect(() => { setSelectedFields([]); setFeaturedField(''); }, [deviceId]);
  useEffect(() => {
    if (selectedFields.length === 0 && numericFields.length > 0)
      setSelectedFields(numericFields.slice(0, 2).map(f => f.key));
    if (!featuredField && numericFields.length > 0)
      setFeaturedField(numericFields[0].key);
  }, [numericFields.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const from = new Date(Date.now() - range.h * 3600_000).toISOString();
  const to   = new Date().toISOString();

  const { data: seriesData, isLoading } = useQuery({
    queryKey: ['series-multi', deviceId, selectedFields.join(','), range.label],
    queryFn: async () => {
      if (!deviceId || selectedFields.length === 0) return [];
      return Promise.all(
        selectedFields.map(field =>
          telemetryApi.series(deviceId, field, from, to, 500).catch(() => null)
        )
      );
    },
    enabled: !!deviceId && selectedFields.length > 0,
    refetchInterval: 60_000,
  });

  const { data: featuredSeriesData } = useQuery({
    queryKey: ['series-featured', deviceId, featuredField, range.label],
    queryFn: () => telemetryApi.series(deviceId, featuredField, from, to, 200).catch(() => null),
    enabled: !!deviceId && !!featuredField,
    refetchInterval: 30_000,
  });

  const schemaFields: any[] = selectedDevice?.meta?.dataSchema?.fields ?? [];
  const chartSeries = selectedFields.map((field, i) => {
    const fMeta = schemaFields.find((f: any) => f.key === field);
    return {
      name: field,
      data: ((seriesData?.[i] as any)?.data ?? []).map((p: any) => ({
        ts: typeof p.ts === 'string' ? new Date(p.ts).getTime() : p.ts,
        value: typeof p.value === 'number' ? p.value : 0,
      })),
      color: fMeta?.chartColor ?? COLORS[i % COLORS.length],
    };
  });

  const featuredPoints: { ts: number; value: number }[] = ((featuredSeriesData as any)?.data ?? []).map((p: any) => ({
    ts: typeof p.ts === 'string' ? new Date(p.ts).getTime() : p.ts,
    value: typeof p.value === 'number' ? p.value : 0,
  }));
  const featuredValues = featuredPoints.map(p => p.value);
  const featuredMin = featuredValues.length ? Math.min(...featuredValues) : 0;
  const featuredMax = featuredValues.length ? Math.max(...featuredValues) : 0;
  const featuredCurrent = numericFields.find(f => f.key === featuredField)?.value ?? 0;
  const featuredPrev = featuredPoints.length >= 2 ? featuredPoints[featuredPoints.length - 2]?.value : null;
  const trend = featuredPrev == null ? 0 : featuredCurrent - featuredPrev;

  function toggleField(key: string) {
    setSelectedFields(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  function exportCSV() {
    if (!chartSeries.length) return;
    const allTs = [...new Set(chartSeries.flatMap(s => s.data.map((p: any) => p.ts)))].sort();
    const rows = allTs.map(ts => {
      const row: Record<string, unknown> = { timestamp: new Date(ts).toISOString() };
      chartSeries.forEach(s => { row[s.name] = s.data.find((p: any) => p.ts === ts)?.value ?? ''; });
      return row;
    });
    downloadCSV(`${selectedDevice?.name ?? 'device'}-telemetry-${range.label}.csv`, rows);
  }

  return (
    <div className="page">
      {/* ── Page header ── */}
      <div className="ph">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <span className="eyebrow">Live data · time series</span>
          </div>
          <h1><em>Telemetry</em>.</h1>
          <p className="lede">Pick a device, stack any number of parameters on one chart, and export. No typing, no guessing.</p>
        </div>
        <div style={{ gridColumn: 3, display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 20 }}>
          <button className="btn btn-sm" style={{ gap: 6 }} onClick={exportCSV} disabled={!chartSeries.length}>
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {/* ── Device selector strip ── */}
      <div className="eyebrow" style={{ marginBottom: 8 }}>Device</div>
      <div style={{ display: 'flex', gap: 0, overflowX: 'auto', borderTop: '1px solid hsl(var(--fg))', borderBottom: '1px solid hsl(var(--border))', marginBottom: 24 }}>
        {devices.length === 0 ? (
          <p className="dim" style={{ padding: '16px 0', fontSize: 13 }}>No devices registered</p>
        ) : (
          (devices as any[]).map(d => {
            const id = d._id ?? d.id;
            const isSelected = id === deviceId;
            const { Icon, color } = getCategoryIconInfo(d.category);
            return (
              <button
                key={id}
                onClick={() => setSelectedDeviceId(id)}
                style={{
                  flex: '1 0 auto', minWidth: 180, textAlign: 'left',
                  padding: '14px 16px',
                  background: isSelected ? 'hsl(var(--surface-raised))' : 'transparent',
                  border: 0,
                  borderRight: '1px solid hsl(var(--border))',
                  borderTop: isSelected ? '2px solid hsl(var(--primary))' : '2px solid transparent',
                  marginTop: -1,
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className={`dot dot-${d.status === 'online' ? 'online' : d.status === 'error' ? 'error' : 'offline'}`} />
                  <span style={{ fontSize: 12.5, fontWeight: isSelected ? 500 : 400 }}>{d.name}</span>
                  <Icon size={11} style={{ color, marginLeft: 2, opacity: 0.7 }} />
                </div>
                <div className="mono faint" style={{ fontSize: 10.5, marginTop: 4 }}>{d.category?.toUpperCase()}</div>
              </button>
            );
          })
        )}
      </div>

      {/* ── Featured field KPI ── */}
      {numericFields.length > 0 && (
        <div className="panel" style={{ padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Featured telemetry</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 52, lineHeight: 1, letterSpacing: '-0.03em' }} className="num">
                  {featuredCurrent.toFixed(2)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: trend > 0 ? 'hsl(var(--good))' : trend < 0 ? 'hsl(var(--bad))' : 'hsl(var(--muted-fg))' }}>
                    {trend > 0 ? <TrendingUp size={13} /> : trend < 0 ? <TrendingDown size={13} /> : <Minus size={13} />}
                    {trend === 0 ? 'No change' : `${trend > 0 ? '+' : ''}${trend.toFixed(3)}`}
                  </span>
                  <span className="mono faint" style={{ fontSize: 10.5 }}>
                    min {featuredMin.toFixed(2)} · max {featuredMax.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label className="eyebrow" style={{ fontSize: 9 }}>Field</label>
              <select
                value={featuredField}
                onChange={e => setFeaturedField(e.target.value)}
                className="select"
                style={{ minWidth: 160 }}
              >
                {numericFields.map(({ key }) => (
                  <option key={key} value={key}>{key.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ── Latest KPI strip ── */}
      {numericFields.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Latest values — {selectedDevice?.name}</div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(6, numericFields.length)}, 1fr)`,
            borderTop: '1px solid hsl(var(--border))',
            marginBottom: 24,
          }}>
            {numericFields.slice(0, 6).map(({ key, value }, i) => {
              const fMeta = schemaFields.find((f: any) => f.key === key);
              const col = fMeta?.chartColor ?? COLORS[i % COLORS.length];
              const on = selectedFields.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleField(key)}
                  style={{
                    padding: `14px 18px 14px ${i === 0 ? 0 : 18}px`,
                    borderRight: i < Math.min(6, numericFields.length) - 1 ? '1px solid hsl(var(--border))' : 'none',
                    textAlign: 'left',
                    background: 'transparent',
                    cursor: 'pointer',
                    outline: on ? `1px solid ${col}` : 'none',
                    outlineOffset: -1,
                    transition: 'outline 0.1s',
                  }}
                >
                  <div className="eyebrow" style={{ fontSize: 9.5 }}>{key.replace(/_/g, ' ')}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, lineHeight: 1, marginTop: 4, color: on ? col : 'hsl(var(--fg))' }} className="num">
                    {value.toFixed(2)}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── Parameter chips + controls ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <span className="eyebrow" style={{ marginRight: 8 }}>Parameters</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {numericFields.map(({ key }, i) => {
              const fMeta2 = schemaFields.find((f: any) => f.key === key);
              const col = fMeta2?.chartColor ?? COLORS[i % COLORS.length];
              const on = selectedFields.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleField(key)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px',
                    fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em',
                    border: '1px solid', borderColor: on ? col : 'hsl(var(--border))',
                    background: on ? `color-mix(in oklab, ${col} 12%, hsl(var(--surface)))` : 'hsl(var(--surface))',
                    color: on ? col : 'hsl(var(--muted-fg))',
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                  }}
                >
                  <span style={{ width: 7, height: 7, background: on ? col : 'transparent', border: '1px solid currentColor', display: 'inline-block' }} />
                  {key.replace(/_/g, ' ')}
                </button>
              );
            })}
            {numericFields.length === 0 && <span className="dim" style={{ fontSize: 12 }}>No numeric fields available</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="seg">
            {RANGES.map(r => (
              <button key={r.label} className={range.label === r.label ? 'on' : ''} onClick={() => setRange(r)}>{r.label.toUpperCase()}</button>
            ))}
          </div>
          <div className="seg">
            <button className={showArea ? 'on' : ''} onClick={() => setShowArea(true)}>Area</button>
            <button className={!showArea ? 'on' : ''} onClick={() => setShowArea(false)}>Line</button>
          </div>
          <div className="seg">
            <button className={!normalize ? 'on' : ''} onClick={() => setNormalize(false)}>Raw</button>
            <button className={normalize ? 'on' : ''} onClick={() => setNormalize(true)}>Norm</button>
          </div>
        </div>
      </div>

      {/* ── Chart ── */}
      <div className="panel" style={{ padding: '22px 18px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {chartSeries.map((s, i) => (
              <span key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                <span style={{ width: 12, height: 2, background: COLORS[i % COLORS.length], display: 'inline-block' }} />
                {s.name}
              </span>
            ))}
          </div>
          <span className="mono faint" style={{ fontSize: 10 }}>{chartSeries.reduce((s, c) => s + c.data.length, 0).toLocaleString()} pts</span>
        </div>
        {!deviceId ? (
          <div style={{ height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="dim">Select a device above</div>
        ) : isLoading ? (
          <div className="skeleton" style={{ height: 360 }} />
        ) : chartSeries.every(s => s.data.length === 0) ? (
          <div style={{ height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="dim">No data for selected fields in {range.label}</div>
        ) : (
          <LineChart series={chartSeries} height={360} showArea={showArea} normalize={normalize} />
        )}
      </div>

      {/* ── Recent data table ── */}
      {chartSeries.length > 0 && chartSeries[0]?.data.length > 0 && (
        <div className="section">
          <div>
            <div className="ssh">Recent readings</div>
            <p className="dim" style={{ fontSize: 13, marginTop: 8, maxWidth: '28ch' }}>
              Latest 20 data points for the selected parameters.
            </p>
          </div>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  {chartSeries.map(s => <th key={s.name} style={{ textTransform: 'capitalize' }}>{s.name.replace(/_/g, ' ')}</th>)}
                </tr>
              </thead>
              <tbody>
                {chartSeries[0].data.slice(-20).reverse().map((pt: any, ri: number) => (
                  <tr key={ri}>
                    <td className="mono" style={{ fontSize: 11.5 }}>{formatDate(new Date(pt.ts).toISOString())}</td>
                    {chartSeries.map((s, si) => {
                      const match = s.data.find((p: any) => p.ts === pt.ts);
                      return (
                        <td key={si} className="mono num" style={{ fontSize: 12, color: COLORS[si % COLORS.length] }}>
                          {match ? (match as any).value.toFixed(3) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
