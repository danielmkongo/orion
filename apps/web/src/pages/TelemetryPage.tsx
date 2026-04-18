import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { devicesApi } from '@/api/devices';
import { telemetryApi } from '@/api/telemetry';
import { cn, formatDate, generateChartColor } from '@/lib/utils';
import { Activity, BarChart3, LineChart, AreaChart } from 'lucide-react';

const TIME_RANGES = [{ label: '1h', h: 1 }, { label: '6h', h: 6 }, { label: '24h', h: 24 }, { label: '7d', h: 168 }];
const CHART_TYPES = [
  { label: 'Line', icon: LineChart, value: 'line' },
  { label: 'Area', icon: AreaChart, value: 'area' },
  { label: 'Bar', icon: BarChart3, value: 'bar' },
];

export function TelemetryPage() {
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [field, setField] = useState('temperature');
  const [range, setRange] = useState(TIME_RANGES[2]);
  const [chartType, setChartType] = useState('area');

  const { data: devicesData } = useQuery({
    queryKey: ['devices', 'telemetry-page'],
    queryFn: () => devicesApi.list({ limit: 100 }),
  });

  const devices = devicesData?.devices ?? [];
  const deviceId = selectedDeviceId || (devices[0] as any)?._id;

  const from = new Date(Date.now() - range.h * 3600_000).toISOString();
  const to = new Date().toISOString();

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

  const points = seriesData?.data ?? [];
  const latest = latestData?.fields ?? {};
  const latestFields = Object.entries(latest).filter(([, v]) => typeof v === 'number');

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1a1b31',
      borderColor: '#2a2b45',
      textStyle: { color: '#e2e8f0', fontSize: 12 },
      axisPointer: { lineStyle: { color: '#2a2b45' } },
    },
    grid: { left: '2%', right: '2%', bottom: '8%', top: 20, containLabel: true },
    xAxis: {
      type: 'time',
      axisLabel: { color: '#475569', fontSize: 11 },
      axisLine: { lineStyle: { color: '#1f2040' } },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      axisLabel: { color: '#475569', fontSize: 11 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#1a1b31' } },
    },
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', bottom: 0, height: 20, borderColor: 'transparent',
        backgroundColor: '#141528', fillerColor: '#6272f215',
        handleStyle: { color: '#6272f2' }, textStyle: { color: '#475569' } },
    ],
    series: [{
      type: chartType === 'area' ? 'line' : chartType,
      smooth: true,
      symbol: 'none',
      data: points.map((p: any) => [new Date(p.ts).getTime(), typeof p.value === 'number' ? parseFloat(p.value.toFixed(3)) : p.value]),
      lineStyle: { width: 2, color: '#6272f2' },
      itemStyle: { color: '#6272f2' },
      areaStyle: chartType === 'area' ? {
        color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: '#6272f235' }, { offset: 1, color: '#6272f205' }],
        },
      } : undefined,
    }],
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Telemetry Explorer</h1>
          <p className="text-sm text-slate-500 mt-0.5">Visualize and analyze device data</p>
        </div>
      </div>

      {/* Controls */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <select
          value={selectedDeviceId || deviceId}
          onChange={e => setSelectedDeviceId(e.target.value)}
          className="input-field w-56"
        >
          {devices.map((d: any) => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>
        <input
          type="text"
          value={field}
          onChange={e => setField(e.target.value)}
          placeholder="Field (e.g. temperature)"
          className="input-field w-44"
        />
        <div className="flex gap-1 bg-surface-3 rounded-lg p-1">
          {TIME_RANGES.map(r => (
            <button key={r.label} onClick={() => setRange(r)}
              className={cn('px-3 py-1.5 text-xs rounded-md transition-colors',
                range.label === r.label ? 'bg-orion-600 text-white' : 'text-slate-400 hover:text-slate-200'
              )}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-surface-3 rounded-lg p-1">
          {CHART_TYPES.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.value} onClick={() => setChartType(t.value)}
                className={cn('flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md transition-colors',
                  chartType === t.value ? 'bg-orion-600 text-white' : 'text-slate-400 hover:text-slate-200'
                )}>
                <Icon className="w-3 h-3" /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Latest values */}
      {latestFields.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {latestFields.slice(0, 6).map(([key, val], i) => (
            <div key={key} className="card p-3 hover:border-surface-border-strong transition-colors">
              <p className="text-xs text-slate-500 truncate mb-1">{key}</p>
              <p className="text-base font-bold" style={{ color: generateChartColor(i) }}>
                {typeof val === 'number' ? val.toFixed(2) : String(val)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-200">
            {field} — {devices.find((d: any) => d._id === deviceId)?.name ?? 'Loading...'}
          </h3>
          <span className="text-xs text-slate-500">{points.length} data points</span>
        </div>
        {isLoading ? (
          <div className="skeleton h-80 rounded-xl" />
        ) : (
          <ReactECharts option={option} style={{ height: 360 }} notMerge />
        )}
      </div>
    </div>
  );
}
