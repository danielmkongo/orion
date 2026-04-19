import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { devicesApi } from '@/api/devices';
import { telemetryApi } from '@/api/telemetry';
import { getCategoryIconInfo, downloadCSV, formatDate } from '@/lib/utils';
import { LineChart } from '@/components/charts/Charts';
import { Download, RefreshCw } from 'lucide-react';

const SERIES_COLORS = ['#FF6A30', '#5B8DEF', '#22C55E', '#F59E0B', '#8B5CF6', '#06B6D4', '#F43F5E'];
const RANGES = [{ label: '1h', h: 1 }, { label: '6h', h: 6 }, { label: '24h', h: 24 }, { label: '7d', h: 168 }];

export function TelemetryPage() {
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [range, setRange] = useState(RANGES[2]);
  const [normalize, setNormalize] = useState(false);
  const [showArea, setShowArea] = useState(true);

  const { data: devicesData } = useQuery({
    queryKey: ['devices', 'telemetry-page'],
    queryFn: () => devicesApi.list({ limit: 100 }),
  });

  const devices = devicesData?.devices ?? [];
  const deviceId = selectedDeviceId || (devices[0] as any)?._id;

  const { data: latestData, refetch: refetchLatest } = useQuery({
    queryKey: ['telemetry', 'latest', deviceId],
    queryFn: () => telemetryApi.latest(deviceId),
    enabled: !!deviceId,
    refetchInterval: 15_000,
  });

  const latest       = latestData?.fields ?? {};
  const numericFields = Object.entries(latest)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => ({ key: k, value: v as number }));

  // Auto-select first field when device changes
  useEffect(() => {
    setSelectedFields([]);
  }, [deviceId]);

  useEffect(() => {
    if (selectedFields.length === 0 && numericFields.length > 0) {
      setSelectedFields([numericFields[0].key]);
    }
  }, [numericFields.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const from = new Date(Date.now() - range.h * 3600_000).toISOString();
  const to   = new Date().toISOString();

  // Fetch series for all selected fields
  const seriesQueries = useQuery({
    queryKey: ['series-multi', deviceId, selectedFields.join(','), range.label],
    queryFn: async () => {
      if (!deviceId || selectedFields.length === 0) return [];
      const results = await Promise.all(
        selectedFields.map(field =>
          telemetryApi.series(deviceId, field, from, to, 500).catch(() => null)
        )
      );
      return results;
    },
    enabled: !!deviceId && selectedFields.length > 0,
    refetchInterval: 60_000,
  });

  const seriesData = seriesQueries.data ?? [];
  const isLoading  = seriesQueries.isLoading;

  const chartSeries = selectedFields.map((field, i) => {
    const data = (seriesData[i]?.data ?? []).map((p: any) => ({
      ts: typeof p.ts === 'string' ? new Date(p.ts).getTime() : p.ts,
      value: typeof p.value === 'number' ? p.value : 0,
    }));
    return { name: field, data, color: SERIES_COLORS[i % SERIES_COLORS.length] };
  });

  const totalPoints = chartSeries.reduce((sum, s) => sum + s.data.length, 0);

  function toggleField(key: string) {
    setSelectedFields(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  function exportCSV() {
    if (chartSeries.length === 0) return;
    // Wide-format: timestamp | field1 | field2 | ...
    const allTs = [...new Set(chartSeries.flatMap(s => s.data.map(p => p.ts)))].sort();
    const rows = allTs.map(ts => {
      const row: Record<string, unknown> = { timestamp: new Date(ts).toISOString() };
      chartSeries.forEach(s => {
        const pt = s.data.find(p => p.ts === ts);
        row[s.name] = pt?.value ?? '';
      });
      return row;
    });
    const deviceName = devices.find((d: any) => (d._id ?? d.id) === deviceId)?.name ?? 'device';
    downloadCSV(`${deviceName}-telemetry-${range.label}.csv`, rows);
  }

  function exportAllRaw() {
    if (chartSeries.length === 0) return;
    const rows = chartSeries.flatMap(s =>
      s.data.map(p => ({ timestamp: new Date(p.ts).toISOString(), field: s.name, value: p.value }))
    );
    const deviceName = devices.find((d: any) => (d._id ?? d.id) === deviceId)?.name ?? 'device';
    downloadCSV(`${deviceName}-telemetry-raw.csv`, rows);
  }

  const selectedDevice = devices.find((d: any) => (d._id ?? d.id) === deviceId);
  const { Icon: SelIcon, color: selColor } = getCategoryIconInfo((selectedDevice as any)?.category ?? '');

  return (
    <div className="space-y-7">

      {/* ── Section header ────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4 pt-1 flex-wrap">
        <div>
          <p className="eyebrow text-[9px] mb-2">Signal Analysis</p>
          <h1 className="text-[26px] leading-none tracking-tight text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
            <em>Telemetry</em>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { refetchLatest(); seriesQueries.refetch(); }} className="btn btn-secondary btn-sm gap-1.5">
            <RefreshCw size={12} /> Refresh
          </button>
          <div className="relative group">
            <button disabled={totalPoints === 0} onClick={exportCSV} className="btn btn-secondary btn-sm gap-1.5">
              <Download size={12} /> Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* ── Device strip ─────────────────────────────────────────── */}
      <div>
        <p className="eyebrow text-[9px] mb-2">Select Device</p>
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar flex-wrap">
          {devices.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">No devices registered</p>
          ) : (
            devices.map((d: any) => {
              const id = d._id ?? d.id;
              const isSelected = id === deviceId;
              const { Icon, color } = getCategoryIconInfo(d.category);
              return (
                <button
                  key={id}
                  onClick={() => setSelectedDeviceId(id)}
                  className={[
                    'flex items-center gap-2 px-3 py-2 border text-[12px] font-medium transition-colors flex-shrink-0',
                    isSelected
                      ? 'border-primary bg-primary/[0.07] text-primary'
                      : 'border-[hsl(var(--rule))] text-muted-foreground hover:text-foreground hover:bg-muted',
                  ].join(' ')}
                >
                  <span style={{ color: isSelected ? undefined : color }}>
                    <Icon size={12} />
                  </span>
                  {d.name}
                  <span className={`w-1.5 h-1.5 flex-shrink-0 ${d.status === 'online' ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── KPI strip ────────────────────────────────────────────── */}
      {numericFields.length > 0 && (
        <div>
          <p className="eyebrow text-[9px] mb-2">Latest Values — {selectedDevice?.name}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-px bg-[hsl(var(--rule))] border border-[hsl(var(--rule))]">
            {numericFields.map(({ key, value }, i) => {
              const col = SERIES_COLORS[i % SERIES_COLORS.length];
              const isSelected = selectedFields.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleField(key)}
                  className={[
                    'bg-[hsl(var(--surface))] p-4 text-left transition-colors hover:bg-muted',
                    isSelected ? 'ring-1 ring-inset ring-primary/30' : '',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="eyebrow text-[9px] capitalize truncate">{key}</p>
                    {isSelected && (
                      <span className="w-2 h-2 flex-shrink-0" style={{ backgroundColor: col }} />
                    )}
                  </div>
                  <p className="text-[1.3rem] font-semibold leading-none" style={{ color: isSelected ? col : undefined }}>
                    {value.toFixed(2)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Controls ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Field chips */}
        <div className="flex-1 min-w-0">
          <p className="eyebrow text-[9px] mb-1.5">Active Series</p>
          <div className="flex gap-1.5 flex-wrap">
            {numericFields.map(({ key }, i) => {
              const col = SERIES_COLORS[i % SERIES_COLORS.length];
              const active = selectedFields.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleField(key)}
                  className={[
                    'flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono border transition-colors',
                    active ? 'border-current' : 'border-[hsl(var(--rule))] text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                  style={active ? { color: col, borderColor: col, backgroundColor: `${col}10` } : {}}
                >
                  {active && <span className="w-1.5 h-1.5 flex-shrink-0" style={{ backgroundColor: col }} />}
                  {key}
                </button>
              );
            })}
            {numericFields.length === 0 && <span className="text-[12px] text-muted-foreground">No numeric fields available</span>}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {/* Range */}
          <div className="flex items-center gap-px border border-[hsl(var(--rule))]">
            {RANGES.map(r => (
              <button
                key={r.label}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-[11px] font-mono transition-colors ${range.label === r.label ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Display toggles */}
          <div className="flex items-center gap-px border border-[hsl(var(--rule))]">
            <button
              onClick={() => setShowArea(v => !v)}
              className={`px-3 py-1.5 text-[11px] font-mono transition-colors ${showArea ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Area
            </button>
            <button
              onClick={() => setNormalize(v => !v)}
              className={`px-3 py-1.5 text-[11px] font-mono transition-colors ${normalize ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Normalize
            </button>
          </div>
        </div>
      </div>

      {/* ── Chart ────────────────────────────────────────────────── */}
      <div className="border border-[hsl(var(--rule))] bg-[hsl(var(--surface))] p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {selectedFields.map((f, i) => (
              <span key={f} className="flex items-center gap-1.5 text-[11px] font-mono">
                <span className="w-3 h-px inline-block" style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                {f}
              </span>
            ))}
          </div>
          <span className="font-mono text-[10px] text-muted-foreground">{totalPoints.toLocaleString()} pts</span>
        </div>
        {!deviceId ? (
          <div className="h-[320px] flex items-center justify-center text-[13px] text-muted-foreground">
            Select a device above
          </div>
        ) : isLoading ? (
          <div className="h-[320px] bg-muted animate-pulse" />
        ) : chartSeries.every(s => s.data.length === 0) ? (
          <div className="h-[320px] flex items-center justify-center text-[13px] text-muted-foreground">
            No data for selected fields in {range.label}
          </div>
        ) : (
          <LineChart series={chartSeries} height={320} showArea={showArea} normalize={normalize} />
        )}
      </div>

      {/* ── Legend ───────────────────────────────────────────────── */}
      {chartSeries.length > 1 && (
        <div className="flex items-center gap-4 flex-wrap">
          {chartSeries.map((s, i) => (
            <div key={s.name} className="flex items-center gap-2">
              <span className="w-4 h-0.5 inline-block" style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }} />
              <span className="text-[11px] font-mono text-muted-foreground">{s.name}</span>
              <span className="font-mono text-[10px] text-muted-foreground/60">{s.data.length} pts</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Data table ───────────────────────────────────────────── */}
      {chartSeries.length > 0 && chartSeries[0]?.data.length > 0 && (
        <div className="border border-[hsl(var(--rule))]">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[hsl(var(--rule))]">
            <p className="eyebrow text-[9px]">Recent Data Points</p>
            <button onClick={exportAllRaw} className="flex items-center gap-1 text-[11px] text-primary hover:underline">
              <Download size={10} /> Export raw
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  {selectedFields.map(f => <th key={f} className="font-mono">{f}</th>)}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Build combined rows from first series timestamps
                  const pivotData = chartSeries[0].data.slice(-25).reverse();
                  return pivotData.map((pt, ri) => (
                    <tr key={ri}>
                      <td className="font-mono text-[11px]">{formatDate(new Date(pt.ts).toISOString())}</td>
                      {chartSeries.map((s, si) => {
                        const match = s.data.find(p => p.ts === pt.ts);
                        return (
                          <td key={si} className="font-mono text-[11px]" style={{ color: SERIES_COLORS[si % SERIES_COLORS.length] }}>
                            {match ? match.value.toFixed(3) : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
