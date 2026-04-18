import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { devicesApi } from '@/api/devices';
import { telemetryApi } from '@/api/telemetry';
import { generateChartColor } from '@/lib/utils';
import { LineChart, AreaChart, BarChart3 } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';

const TIME_RANGES = [{ label: '1h', h: 1 }, { label: '6h', h: 6 }, { label: '24h', h: 24 }, { label: '7d', h: 168 }];
const CHART_TYPES = [
  { label: 'Line', icon: LineChart, value: 'line' },
  { label: 'Area', icon: AreaChart, value: 'area' },
  { label: 'Bar',  icon: BarChart3, value: 'bar'  },
];

export function TelemetryPage() {
  const { theme } = useUIStore();
  const isDark = theme === 'dark';
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [field, setField]   = useState('temperature');
  const [range, setRange]   = useState(TIME_RANGES[2]);
  const [chartType, setChartType] = useState('area');

  const { data: devicesData } = useQuery({
    queryKey: ['devices', 'telemetry-page'],
    queryFn: () => devicesApi.list({ limit: 100 }),
  });

  const devices  = devicesData?.devices ?? [];
  const deviceId = selectedDeviceId || (devices[0] as any)?._id;
  const from = new Date(Date.now() - range.h * 3600_000).toISOString();
  const to   = new Date().toISOString();

  const { data: seriesData, isLoading } = useQuery({
    queryKey: ['series', deviceId, field, range.label],
    queryFn: () => telemetryApi.series(deviceId, field, from, to, 1000),
    enabled: !!deviceId,
    refetchInterval: 30_000,
  });

  const { data: latestData } = useQuery({
    queryKey: ['telemetry', 'latest', deviceId],
    queryFn: () => telemetryApi.latest(deviceId),
    enabled: !!deviceId,
    refetchInterval: 15_000,
  });

  const points       = seriesData?.data ?? [];
  const latest       = latestData?.fields ?? {};
  const latestFields = Object.entries(latest).filter(([, v]) => typeof v === 'number');

  const labelColor  = isDark ? '#6b7280' : '#9ca3af';
  const splitColor  = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
  const PRIMARY     = '#EA580C';

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: isDark ? '#1a1a1a' : '#fff',
      borderColor: isDark ? '#333' : '#e5e5e5',
      textStyle: { color: isDark ? '#f5f5f5' : '#111', fontSize: 12 },
      axisPointer: { lineStyle: { color: isDark ? '#333' : '#e5e5e5' } },
    },
    grid: { left: '2%', right: '2%', bottom: '8%', top: 16, containLabel: true },
    xAxis: {
      type: 'time',
      axisLabel: { color: labelColor, fontSize: 11 },
      axisLine:  { lineStyle: { color: isDark ? '#333' : '#e5e5e5' } },
      axisTick:  { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      axisLabel: { color: labelColor, fontSize: 11 },
      axisLine:  { show: false },
      axisTick:  { show: false },
      splitLine: { lineStyle: { color: splitColor } },
    },
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', bottom: 0, height: 20, borderColor: 'transparent',
        backgroundColor: 'transparent', fillerColor: `${PRIMARY}20`,
        handleStyle: { color: PRIMARY }, textStyle: { color: labelColor } },
    ],
    series: [{
      type: chartType === 'area' ? 'line' : chartType,
      smooth: true,
      symbol: 'none',
      data: points.map((p: any) => [new Date(p.ts).getTime(), typeof p.value === 'number' ? parseFloat(p.value.toFixed(3)) : p.value]),
      lineStyle: { width: 2, color: PRIMARY },
      itemStyle: { color: PRIMARY },
      areaStyle: chartType === 'area' ? {
        color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: `${PRIMARY}25` }, { offset: 1, color: `${PRIMARY}03` }],
        },
      } : undefined,
    }],
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[22px] font-semibold text-foreground tracking-tight">Telemetry</h2>
        <p className="text-[14px] text-muted-foreground mt-0.5">Visualize and analyze device data</p>
      </div>

      {/* Controls */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <select
          value={selectedDeviceId || deviceId}
          onChange={e => setSelectedDeviceId(e.target.value)}
          className="select w-52"
        >
          {devices.length === 0 && <option value="">No devices</option>}
          {devices.map((d: any) => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>

        <input
          type="text"
          value={field}
          onChange={e => setField(e.target.value)}
          placeholder="Field (e.g. temperature)"
          className="input w-44"
        />

        <div className="flex gap-1 bg-muted rounded-xl p-1">
          {TIME_RANGES.map(r => (
            <button key={r.label} onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all ${
                range.label === r.label ? 'bg-surface text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'
              }`}>
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-muted rounded-xl p-1">
          {CHART_TYPES.map(({ value, label, icon: Icon }) => (
            <button key={value} onClick={() => setChartType(value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all ${
                chartType === value ? 'bg-surface text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'
              }`}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Latest field values */}
      {latestFields.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {latestFields.slice(0, 6).map(([key, val], i) => (
            <div key={key} className="card p-3">
              <p className="text-[11px] text-muted-foreground truncate mb-1 uppercase tracking-wider">{key}</p>
              <p className="text-[16px] font-semibold" style={{ color: generateChartColor(i) }}>
                {typeof val === 'number' ? val.toFixed(2) : String(val)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[14px] font-semibold text-foreground">
            {field} — {devices.find((d: any) => d._id === deviceId)?.name ?? '—'}
          </h3>
          <span className="text-[12px] text-muted-foreground">{points.length} points</span>
        </div>
        {isLoading ? (
          <div className="skeleton h-80 rounded-xl" />
        ) : points.length === 0 ? (
          <div className="h-80 flex items-center justify-center text-muted-foreground text-[14px]">
            No data for this field and time range
          </div>
        ) : (
          <ReactECharts option={option} style={{ height: 360 }} notMerge />
        )}
      </div>
    </div>
  );
}
