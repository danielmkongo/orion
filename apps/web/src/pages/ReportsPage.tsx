import { useState } from 'react';
import { motion } from 'framer-motion';
import ReactECharts from 'echarts-for-react';
import { BarChart3, Download, Calendar, FileText, FileSpreadsheet, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Mock report data
const MOCK_UPTIME = [
  { device: 'Tracker Alpha-01', uptime: 98.3 },
  { device: 'Env Sensor B1', uptime: 99.7 },
  { device: 'Energy Meter C1', uptime: 95.1 },
  { device: 'Water Level D1', uptime: 91.4 },
  { device: 'Pump Controller E1', uptime: 88.2 },
];

export function ReportsPage() {
  const [period, setPeriod] = useState('7d');

  const uptimeOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', backgroundColor: '#1a1b31', borderColor: '#2a2b45', textStyle: { color: '#e2e8f0', fontSize: 12 } },
    grid: { left: '2%', right: '5%', bottom: 10, top: 10, containLabel: true },
    xAxis: { type: 'value', max: 100, axisLabel: { color: '#475569', fontSize: 11, formatter: '{value}%' }, axisLine: { show: false }, splitLine: { lineStyle: { color: '#1f2040' } } },
    yAxis: { type: 'category', data: MOCK_UPTIME.map(d => d.device), axisLabel: { color: '#94a3b8', fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false } },
    series: [{
      type: 'bar',
      data: MOCK_UPTIME.map(d => ({
        value: d.uptime,
        itemStyle: { color: d.uptime >= 99 ? '#10b981' : d.uptime >= 95 ? '#f59e0b' : '#f43f5e', borderRadius: [0, 4, 4, 0] },
      })),
      label: { show: true, position: 'right', color: '#94a3b8', fontSize: 11, formatter: '{c}%' },
    }],
  };

  const alertTrendOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', backgroundColor: '#1a1b31', borderColor: '#2a2b45', textStyle: { color: '#e2e8f0' } },
    grid: { left: '2%', right: '2%', bottom: 10, top: 10, containLabel: true },
    xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], axisLabel: { color: '#475569', fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } },
    yAxis: { axisLabel: { color: '#475569', fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#1f2040' } } },
    series: [
      { name: 'Critical', type: 'bar', stack: 'total', data: [1, 0, 2, 0, 1, 0, 0], itemStyle: { color: '#f43f5e' } },
      { name: 'Warning', type: 'bar', stack: 'total', data: [3, 5, 2, 4, 3, 1, 2], itemStyle: { color: '#f59e0b' } },
      { name: 'Info', type: 'bar', stack: 'total', data: [8, 12, 7, 9, 11, 5, 6], itemStyle: { color: '#0ea5e9' } },
    ],
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">Operational summaries and analytics</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-surface-3 rounded-lg p-1">
            {['24h', '7d', '30d', '90d'].map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={cn('px-3 py-1.5 text-xs rounded-md transition-colors',
                  period === p ? 'bg-orion-600 text-white' : 'text-slate-400 hover:text-slate-200'
                )}>
                {p}
              </button>
            ))}
          </div>
          <button className="btn-secondary">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* Export options */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: FileSpreadsheet, label: 'Export CSV', desc: 'Raw telemetry data', color: 'text-emerald-400' },
          { icon: FileText, label: 'Export PDF', desc: 'Formatted report', color: 'text-rose-400' },
          { icon: Share2, label: 'Schedule Report', desc: 'Automated delivery', color: 'text-orion-400' },
        ].map(({ icon: Icon, label, desc, color }) => (
          <button key={label} className="card p-4 flex items-center gap-3 hover:border-surface-border-strong transition-colors text-left">
            <div className={cn('p-2.5 rounded-xl bg-surface-3', color)}>
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200">{label}</p>
              <p className="text-xs text-slate-500">{desc}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-1">Device Uptime</h3>
          <p className="text-xs text-slate-500 mb-4">Past {period}</p>
          <ReactECharts option={uptimeOption} style={{ height: 200 }} notMerge />
        </div>
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-1">Alert Volume</h3>
          <p className="text-xs text-slate-500 mb-4">By severity over last 7 days</p>
          <ReactECharts option={alertTrendOption} style={{ height: 200 }} notMerge />
        </div>
      </div>

      {/* Summary table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-surface-border">
          <h3 className="text-sm font-semibold text-slate-200">Fleet Summary — {period}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Uptime</th>
                <th>Data Points</th>
                <th>Alerts</th>
                <th>Commands</th>
                <th>Last Data</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_UPTIME.map((d, i) => (
                <tr key={i}>
                  <td className="font-medium text-slate-200">{d.device}</td>
                  <td>
                    <span className={cn('font-semibold', d.uptime >= 99 ? 'text-emerald-400' : d.uptime >= 95 ? 'text-amber-400' : 'text-rose-400')}>
                      {d.uptime}%
                    </span>
                  </td>
                  <td className="text-slate-400">{(Math.random() * 10000 + 500).toFixed(0)}</td>
                  <td className="text-slate-400">{Math.floor(Math.random() * 10)}</td>
                  <td className="text-slate-400">{Math.floor(Math.random() * 20)}</td>
                  <td className="text-xs text-slate-500">2 min ago</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
