import { useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { Download } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';

const MOCK_UPTIME = [
  { device: 'Tracker Alpha-01', uptime: 98.3 },
  { device: 'Env Sensor B1',    uptime: 99.7 },
  { device: 'Energy Meter C1',  uptime: 95.1 },
  { device: 'Water Level D1',   uptime: 91.4 },
  { device: 'Pump Controller E1',uptime: 88.2 },
];

export function ReportsPage() {
  const { theme } = useUIStore();
  const isDark = theme === 'dark';
  const [period, setPeriod] = useState('7d');

  const labelColor = isDark ? '#6b7280' : '#9ca3af';
  const splitColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
  const tooltipBg  = isDark ? '#1a1a1a' : '#fff';
  const tooltipBorder = isDark ? '#333' : '#e5e5e5';
  const tooltipText = isDark ? '#f5f5f5' : '#111';

  const uptimeOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBorder, textStyle: { color: tooltipText, fontSize: 12 } },
    grid: { left: '2%', right: '8%', bottom: 10, top: 10, containLabel: true },
    xAxis: { type: 'value', max: 100, axisLabel: { color: labelColor, fontSize: 11, formatter: '{value}%' }, axisLine: { show: false }, splitLine: { lineStyle: { color: splitColor } } },
    yAxis: { type: 'category', data: MOCK_UPTIME.map(d => d.device), axisLabel: { color: labelColor, fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false } },
    series: [{
      type: 'bar',
      data: MOCK_UPTIME.map(d => ({
        value: d.uptime,
        itemStyle: { color: d.uptime >= 99 ? '#22c55e' : d.uptime >= 95 ? '#f59e0b' : '#ef4444', borderRadius: [0, 4, 4, 0] },
      })),
      label: { show: true, position: 'right', color: labelColor, fontSize: 11, formatter: '{c}%' },
    }],
  };

  const alertOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', backgroundColor: tooltipBg, borderColor: tooltipBorder, textStyle: { color: tooltipText } },
    legend: { textStyle: { color: labelColor }, top: 0 },
    grid: { left: '2%', right: '2%', bottom: 10, top: 32, containLabel: true },
    xAxis: { type: 'category', data: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], axisLabel: { color: labelColor, fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } },
    yAxis: { axisLabel: { color: labelColor, fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: splitColor } } },
    series: [
      { name: 'Critical', type: 'bar', stack: 'total', data: [1,0,2,0,1,0,0], itemStyle: { color: '#ef4444' } },
      { name: 'Warning',  type: 'bar', stack: 'total', data: [3,5,2,4,3,1,2], itemStyle: { color: '#f59e0b' } },
      { name: 'Info',     type: 'bar', stack: 'total', data: [8,12,7,9,11,5,6], itemStyle: { color: '#3b82f6' } },
    ],
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-semibold text-foreground tracking-tight">Reports</h2>
          <p className="text-[14px] text-muted-foreground mt-0.5">Operational summaries and analytics</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-muted rounded-xl p-1">
            {['24h','7d','30d','90d'].map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all ${period === p ? 'bg-surface text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'}`}>
                {p}
              </button>
            ))}
          </div>
          <button className="btn btn-secondary gap-1.5"><Download size={13} /> Export</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <h3 className="text-[13px] font-semibold text-foreground mb-4">Device Uptime</h3>
          <ReactECharts option={uptimeOption} style={{ height: 200 }} notMerge />
        </div>
        <div className="card p-5">
          <h3 className="text-[13px] font-semibold text-foreground mb-4">Alert Trends</h3>
          <ReactECharts option={alertOption} style={{ height: 200 }} notMerge />
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-[13px] font-semibold text-foreground mb-4">Summary — {period}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Avg Uptime',       value: '95.7%',  sub: 'Fleet average'   },
            { label: 'Data Points',      value: '142K',   sub: 'Ingested'        },
            { label: 'Commands Sent',    value: '38',     sub: 'Successful: 35'  },
            { label: 'OTA Updates',      value: '6',      sub: '5 successful'    },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-muted rounded-xl p-4">
              <p className="text-[1.25rem] font-semibold text-foreground">{value}</p>
              <p className="text-[12px] font-medium text-foreground mt-0.5">{label}</p>
              <p className="text-[11px] text-muted-foreground">{sub}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
