import { useQuery } from '@tanstack/react-query';
import ReactECharts from 'echarts-for-react';
import { useState } from 'react';
import apiClient from '@/api/client';
import { devicesApi } from '@/api/devices';
import { generateChartColor } from '@/lib/utils';

const TIME_RANGES = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
];

const MAX_DEVICES = 3;
const DEVICE_INDICES = [0, 1, 2] as const;

export function TelemetryLineChart() {
  const [range, setRange] = useState(TIME_RANGES[2]);
  const [selectedField, setSelectedField] = useState('temperature');

  const from = new Date(Date.now() - range.hours * 3600_000).toISOString();
  const to = new Date().toISOString();

  const { data: devicesData } = useQuery({
    queryKey: ['devices', 'environmental'],
    queryFn: () => devicesApi.list({ category: 'environmental', limit: 4 }),
  });

  const devices: any[] = devicesData?.devices?.slice(0, MAX_DEVICES) ?? [];

  // Use fixed-count queries (hooks must not be called conditionally)
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
    return {
      name: device.name,
      type: 'line',
      smooth: true,
      data: pts.map((p: any) => [new Date(p.ts).getTime(), typeof p.value === 'number' ? parseFloat(p.value.toFixed(2)) : p.value]),
      lineStyle: { width: 2, color: generateChartColor(i) },
      itemStyle: { color: generateChartColor(i) },
      areaStyle: {
        color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: `${generateChartColor(i)}30` },
            { offset: 1, color: `${generateChartColor(i)}05` },
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
      backgroundColor: '#1a1b31',
      borderColor: '#2a2b45',
      borderWidth: 1,
      textStyle: { color: '#e2e8f0', fontSize: 12 },
      axisPointer: { lineStyle: { color: '#2a2b45' } },
    },
    legend: {
      top: 0,
      right: 80,
      textStyle: { color: '#94a3b8', fontSize: 11 },
      icon: 'roundRect',
      itemWidth: 12,
      itemHeight: 4,
    },
    grid: { left: '2%', right: '2%', bottom: '3%', top: 40, containLabel: true },
    xAxis: {
      type: 'time',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#475569', fontSize: 11 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#475569', fontSize: 11 },
      splitLine: { lineStyle: { color: '#1f2040' } },
    },
    series,
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Environmental Telemetry</h3>
          <p className="text-xs text-slate-500 mt-0.5">Multi-sensor comparison</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedField}
            onChange={e => setSelectedField(e.target.value)}
            className="text-xs bg-surface-3 border border-surface-border rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none"
          >
            <option value="temperature">Temperature</option>
            <option value="humidity">Humidity</option>
            <option value="co2">CO₂</option>
            <option value="pressure">Pressure</option>
          </select>
          <div className="flex items-center gap-1 bg-surface-3 rounded-lg p-1">
            {TIME_RANGES.map(r => (
              <button
                key={r.label}
                onClick={() => setRange(r)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                  range.label === r.label
                    ? 'bg-orion-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <ReactECharts option={option} style={{ height: 220 }} notMerge />
    </div>
  );
}
