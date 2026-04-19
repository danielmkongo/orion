import { useQuery } from '@tanstack/react-query';
import ReactECharts from 'echarts-for-react';
import { useState } from 'react';
import apiClient from '@/api/client';
import { devicesApi } from '@/api/devices';
import { generateChartColor } from '@/lib/utils';
import { useUIStore } from '@/store/ui.store';

const TIME_RANGES = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
];

const FIELD_OPTIONS = ['temperature', 'humidity', 'co2', 'pressure', 'voltage', 'current'];
const MAX_DEVICES = 3;

export function TelemetryLineChart() {
  const { theme } = useUIStore();
  const isDark = theme === 'dark';
  const [range, setRange] = useState(TIME_RANGES[2]);
  const [selectedField, setSelectedField] = useState('temperature');

  const from = new Date(Date.now() - range.hours * 3600_000).toISOString();
  const to   = new Date().toISOString();

  const labelColor = isDark ? '#6b7280' : '#9ca3af';
  const splitColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const tooltipBg  = isDark ? '#1a1a1a' : '#ffffff';
  const tooltipBorder = isDark ? '#333' : '#e5e7eb';
  const tooltipText   = isDark ? '#f5f5f5' : '#111827';

  const { data: devicesData } = useQuery({
    queryKey: ['devices', 'telemetry-chart'],
    queryFn: () => devicesApi.list({ limit: 20 }),
  });

  const devices: any[] = devicesData?.devices?.slice(0, MAX_DEVICES) ?? [];

  const q0 = useQuery({
    queryKey: ['telemetry', 'series', devices[0]?._id, selectedField, range.label],
    queryFn: () => apiClient.get('/telemetry/series', { params: { deviceId: devices[0]._id, field: selectedField, from, to, limit: 200 } }).then(r => r.data),
    enabled: !!devices[0]?._id,
  });
  const q1 = useQuery({
    queryKey: ['telemetry', 'series', devices[1]?._id, selectedField, range.label],
    queryFn: () => apiClient.get('/telemetry/series', { params: { deviceId: devices[1]._id, field: selectedField, from, to, limit: 200 } }).then(r => r.data),
    enabled: !!devices[1]?._id,
  });
  const q2 = useQuery({
    queryKey: ['telemetry', 'series', devices[2]?._id, selectedField, range.label],
    queryFn: () => apiClient.get('/telemetry/series', { params: { deviceId: devices[2]._id, field: selectedField, from, to, limit: 200 } }).then(r => r.data),
    enabled: !!devices[2]?._id,
  });

  const queries = [q0, q1, q2];

  const series = queries.map((q, i) => {
    const device = devices[i];
    if (!device) return null;
    const pts = q.data?.data ?? [];
    const color = generateChartColor(i);
    return {
      name: device.name,
      type: 'line',
      smooth: true,
      data: pts.map((p: any) => [
        new Date(p.ts).getTime(),
        typeof p.value === 'number' ? parseFloat(p.value.toFixed(2)) : p.value,
      ]),
      lineStyle: { width: 2, color },
      itemStyle: { color },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: `${color}30` },
            { offset: 1, color: `${color}04` },
          ],
        },
      },
      symbol: 'none',
    };
  }).filter(Boolean);

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      borderWidth: 1,
      textStyle: { color: tooltipText, fontSize: 12 },
      axisPointer: { lineStyle: { color: tooltipBorder } },
    },
    legend: {
      top: 0,
      right: 0,
      textStyle: { color: labelColor, fontSize: 11 },
      icon: 'roundRect',
      itemWidth: 12,
      itemHeight: 3,
    },
    grid: { left: '2%', right: '2%', bottom: '4%', top: 36, containLabel: true },
    xAxis: {
      type: 'time',
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: labelColor, fontSize: 11 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: labelColor, fontSize: 11 },
      splitLine: { lineStyle: { color: splitColor } },
    },
    series,
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[13px] font-semibold text-foreground">Telemetry</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Multi-device comparison</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedField}
            onChange={e => setSelectedField(e.target.value)}
            className="select !h-8 !text-[12px] w-36"
          >
            {FIELD_OPTIONS.map(f => (
              <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
            ))}
          </select>
          <div className="flex gap-1 bg-muted rounded-xl p-1">
            {TIME_RANGES.map(r => (
              <button
                key={r.label} onClick={() => setRange(r)}
                className={`text-[11px] px-2.5 py-1 rounded-lg transition-all ${
                  range.label === r.label
                    ? 'bg-surface text-foreground shadow-sm border border-border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {series.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-[13px] text-muted-foreground">
          No devices or data yet
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: 220 }} notMerge />
      )}
    </div>
  );
}
