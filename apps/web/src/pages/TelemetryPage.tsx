import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef, useCallback } from 'react';
import { devicesApi } from '@/api/devices';
import { telemetryApi } from '@/api/telemetry';
import apiClient from '@/api/client';
import { getCategoryIconInfo, downloadCSV, formatDate, timeAgo } from '@/lib/utils';
import { useFmtTs } from '@/lib/use-fmt-ts';
import { useIsMobile } from '@/lib/use-responsive';
import { useUIStore } from '@/store/ui.store';
import { Select } from '@/components/ui/Select';
import { LineChart } from '@/components/charts/Charts';
import { Download, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useSocket } from '@/hooks/useSocket';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--fg))', 'hsl(var(--info))', 'hsl(var(--good))', 'hsl(var(--warn))', '#A06CD5'];
const RANGES = [{ label: '1h', h: 1 }, { label: '6h', h: 6 }, { label: '24h', h: 24 }, { label: '7d', h: 168 }, { label: '30d', h: 720 }];

const prettyKey = (k: string) =>
  k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
   .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const normalizeKey = (k: string) => k.toLowerCase().replace(/[_\-\s]/g, '');

export function TelemetryPage() {
  const { timezone } = useUIStore();
  const { fmt: fmtTs, displayTz } = useFmtTs();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { on, subscribeDevice } = useSocket();
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [featuredField, setFeaturedField] = useState('');
  const [range, setRange] = useState(RANGES[2]); // default: 24h
  const [normalize, setNormalize] = useState(false);
  const [showArea, setShowArea] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo]   = useState('');
  const isCustom = range.label === 'custom';
  const rangeRef = useRef({ range, isCustom, customFrom, customTo });
  useEffect(() => { rangeRef.current = { range, isCustom, customFrom, customTo }; }, [range, isCustom, customFrom, customTo]);

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

  // Must be declared before any hooks that reference it in their dependency arrays
  const schemaFields: any[] = selectedDevice?.meta?.dataSchema?.fields ?? [];

  const telemetryNumerics = Object.entries(latest)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => ({ key: k, value: v as number }));
  const schemaNumerics = schemaFields
    .filter((f: any) => !f.type || f.type === 'number')
    .filter((f: any) => f.key && !telemetryNumerics.some(t => t.key === f.key))
    .map((f: any) => ({ key: f.key, value: 0 as number }));
  const numericFields = [...telemetryNumerics, ...schemaNumerics];

  useEffect(() => { setSelectedFields([]); setFeaturedField(''); }, [deviceId]);
  useEffect(() => {
    const realKeys = telemetryNumerics.map(f => f.key);
    const allSchemaOnly = selectedFields.length > 0 && !selectedFields.some(k => realKeys.includes(k));

    if (selectedFields.length === 0 && numericFields.length > 0) {
      // Prefer real telemetry keys over schema-only placeholders on first init
      const preferred = (realKeys.length > 0 ? realKeys : numericFields.map(f => f.key)).slice(0, 2);
      setSelectedFields(preferred);
      if (!featuredField) setFeaturedField(preferred[0] ?? '');
    } else if (allSchemaOnly && realKeys.length > 0) {
      // All selections are schema-only but device is sending different keys — follow the real data
      setSelectedFields(realKeys.slice(0, 2));
      setFeaturedField(realKeys[0]);
    } else if (!featuredField && numericFields.length > 0) {
      setFeaturedField(realKeys[0] ?? numericFields[0].key);
    }
  }, [numericFields.length, telemetryNumerics.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync showArea from schema whenever the primary selected field changes
  useEffect(() => {
    if (!selectedFields[0] || schemaFields.length === 0) return;
    const fm = schemaFields.find((f: any) => f.key === selectedFields[0]);
    if (fm?.chartType) setShowArea(fm.chartType === 'area');
  }, [selectedFields[0], schemaFields.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveChartType = useCallback(async (isArea: boolean) => {
    setShowArea(isArea);
    if (!deviceId || schemaFields.length === 0) return;
    const newType = isArea ? 'area' : 'line';
    const newFields = schemaFields.map((f: any) =>
      selectedFields.includes(f.key) ? { ...f, chartType: newType } : f
    );
    try {
      await apiClient.patch(`/devices/${deviceId}`, {
        meta: { ...selectedDevice?.meta, dataSchema: { fields: newFields } },
      });
      queryClient.invalidateQueries({ queryKey: ['devices', 'telemetry-page'] });
    } catch { /* silent */ }
  }, [deviceId, selectedDevice, schemaFields, selectedFields, queryClient]);

  const getRangeBounds = useCallback(() => {
    const { range: r, isCustom: ic, customFrom: cf, customTo: ct } = rangeRef.current;
    const now = Date.now();
    const f = ic && cf ? new Date(cf).toISOString() : new Date(now - r.h * 3600_000).toISOString();
    const t = ic && ct ? new Date(ct + 'T23:59:59').toISOString() : new Date(now + 24 * 3600_000).toISOString();
    return { from: f, to: t };
  }, []);

  const fieldLabel = useCallback((key: string) => {
    const fm = schemaFields.find((f: any) => f.key === key)
      ?? schemaFields.find((f: any) => normalizeKey(f.key) === normalizeKey(key));
    const lbl = fm?.label?.trim();
    return (lbl && lbl !== fm?.key) ? lbl : prettyKey(key);
  }, [schemaFields]);

  // queryKey uses stable values only — Date.now() must NOT appear here
  const { data: seriesData, isLoading } = useQuery({
    queryKey: ['series-multi', deviceId, selectedFields.join(','), range.label, customFrom, customTo],
    queryFn: async () => {
      if (!deviceId || selectedFields.length === 0) return [];
      const { from: f, to: t } = getRangeBounds();
      return Promise.all(
        selectedFields.map(field =>
          telemetryApi.series(deviceId, field, f, t, 1000).catch(() => null)
        )
      );
    },
    enabled: !!deviceId && selectedFields.length > 0,
    refetchInterval: 10_000,
  });

  const { data: featuredSeriesData } = useQuery({
    queryKey: ['series-featured', deviceId, featuredField, range.label, customFrom, customTo],
    queryFn: () => {
      const { from: f, to: t } = getRangeBounds();
      return telemetryApi.series(deviceId, featuredField, f, t, 500).catch(() => null);
    },
    enabled: !!deviceId && !!featuredField,
    refetchInterval: 10_000,
  });

  // Socket: invalidate series on live telemetry events
  useEffect(() => {
    if (!deviceId) return;
    const unsub  = subscribeDevice(deviceId);
    const unsubT = on('telemetry.update', (event: any) => {
      if (event.deviceId !== deviceId) return;
      queryClient.invalidateQueries({ queryKey: ['series-multi', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['series-featured', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['telemetry', 'latest', deviceId] });
    });
    return () => { unsub(); unsubT(); };
  }, [deviceId, queryClient, on, subscribeDevice]);

  const chartSeries = selectedFields.map((field, i) => {
    const fMeta = schemaFields.find((f: any) => f.key === field);
    return {
      name: fieldLabel(field),
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
      const row: Record<string, unknown> = { timestamp: fmtTs(ts, selectedDevice) };
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
                <div className="mono faint" style={{ fontSize: 10.5, marginTop: 4 }}>
                  {d.category?.toUpperCase()}
                  {d.lastSeenAt && (
                    <span style={{ marginLeft: 8, opacity: 0.6 }}>· {timeAgo(d.lastSeenAt)}</span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* ── Featured field KPI ── */}
      {numericFields.length > 0 && (
        <div className="panel" style={{ padding: isMobile ? '14px 16px' : '20px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Featured telemetry</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: isMobile ? 10 : 16, flexWrap: 'wrap' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(34px, 7vw, 52px)', lineHeight: 1, letterSpacing: '-0.03em' }} className="num">
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
              <div style={{ minWidth: 160 }}>
                <Select
                  value={featuredField}
                  onChange={setFeaturedField}
                  options={numericFields.map(({ key }) => ({ value: key, label: fieldLabel(key) }))}
                />
              </div>
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
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            borderTop: '1px solid hsl(var(--border))',
            borderRight: '1px solid hsl(var(--border))',
            marginBottom: 24,
          }}>
            {numericFields.slice(0, isMobile ? 4 : 6).map(({ key, value }, i) => {
              const fMeta = schemaFields.find((f: any) => f.key === key);
              const col = fMeta?.chartColor ?? COLORS[i % COLORS.length];
              const on = selectedFields.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleField(key)}
                  style={{
                    padding: isMobile ? '10px 12px' : '14px 18px',
                    borderLeft: '1px solid hsl(var(--border))',
                    borderBottom: '1px solid hsl(var(--border))',
                    textAlign: 'left',
                    background: 'transparent',
                    cursor: 'pointer',
                    outline: on ? `1px solid ${col}` : 'none',
                    outlineOffset: -1,
                    transition: 'outline 0.1s',
                  }}
                >
                  <div className="eyebrow" style={{ fontSize: 9.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fieldLabel(key)}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 22 : 26, lineHeight: 1, marginTop: 4, color: on ? col : 'hsl(var(--fg))' }} className="num">
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
                  {fieldLabel(key)}
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
            <button className={isCustom ? 'on' : ''} onClick={() => { setRange({ label: 'custom', h: 0 }); if (!customFrom) { const d = new Date(); const week = new Date(d); week.setDate(d.getDate() - 7); setCustomFrom(week.toISOString().slice(0,10)); setCustomTo(d.toISOString().slice(0,10)); } }}>CUSTOM</button>
          </div>
          {isCustom && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="input" style={{ padding: '4px 8px', fontSize: 11, fontFamily: 'var(--font-mono)', width: 130 }} />
              <span className="mono faint" style={{ fontSize: 11 }}>→</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="input" style={{ padding: '4px 8px', fontSize: 11, fontFamily: 'var(--font-mono)', width: 130 }} />
            </div>
          )}
          <div className="seg">
            <button className={showArea ? 'on' : ''} onClick={() => saveChartType(true)}>Area</button>
            <button className={!showArea ? 'on' : ''} onClick={() => saveChartType(false)}>Line</button>
          </div>
          <div className="seg">
            <button className={!normalize ? 'on' : ''} onClick={() => setNormalize(false)}>Raw</button>
            <button className={normalize ? 'on' : ''} onClick={() => setNormalize(true)}>Norm</button>
          </div>
        </div>
      </div>

      {/* ── Chart ── */}
      <div className="panel" style={{ padding: isMobile ? '14px 10px 10px' : '22px 18px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {chartSeries.map(s => (
              <span key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                <span style={{ width: 12, height: 2, background: s.color ?? 'hsl(var(--primary))', display: 'inline-block' }} />
                {s.name}
              </span>
            ))}
          </div>
          <span className="mono faint" style={{ fontSize: 10 }}>{chartSeries.reduce((s, c) => s + c.data.length, 0).toLocaleString()} pts</span>
        </div>
        {!deviceId ? (
          <div style={{ height: isMobile ? 240 : 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="dim">Select a device above</div>
        ) : isLoading ? (
          <div className="skeleton" style={{ height: isMobile ? 240 : 360 }} />
        ) : chartSeries.every(s => s.data.length === 0) ? (
          <div style={{ height: isMobile ? 240 : 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="dim">No data for selected fields in {isCustom ? `${customFrom} → ${customTo}` : range.label}</div>
        ) : (
          <LineChart series={chartSeries} height={isMobile ? 240 : 360} showArea={showArea} normalize={normalize}
            storedTz={selectedDevice?.timestampFormat === 'utc' ? undefined : (selectedDevice?.timezone || 'Africa/Nairobi')}
            displayTz={displayTz}
            clockOffsetMin={selectedDevice?.clockOffsetMin ?? 0} />
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
                  {chartSeries.map(s => <th key={s.name}>{s.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {chartSeries[0].data.slice(-20).reverse().map((pt: any, ri: number) => (
                  <tr key={ri}>
                    <td className="mono" style={{ fontSize: 11.5 }}>{fmtTs(pt.ts, selectedDevice)}</td>
                    {chartSeries.map((s, si) => {
                      const match = s.data.find((p: any) => p.ts === pt.ts);
                      return (
                        <td key={si} className="mono num" style={{ fontSize: 12, color: s.color ?? 'hsl(var(--primary))' }}>
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
