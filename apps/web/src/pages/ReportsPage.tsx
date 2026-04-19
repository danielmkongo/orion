import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, RefreshCw } from 'lucide-react';
import { devicesApi } from '@/api/devices';
import apiClient from '@/api/client';
import { LineChart, BarChart, Donut } from '@/components/charts/Charts';
import { downloadCSV } from '@/lib/utils';

const PERIODS = ['24h', '7d', '30d', '90d'];

function buildMockIngestion(period: string) {
  const now = Date.now();
  const count = period === '24h' ? 24 : period === '7d' ? 7 : period === '30d' ? 30 : 12;
  const step  = period === '24h' ? 3600_000 : period === '7d' ? 86400_000 : period === '30d' ? 86400_000 : 7 * 86400_000;
  return Array.from({ length: count }, (_, i) => ({
    ts: now - (count - i) * step,
    value: Math.round(800 + Math.sin(i / 3) * 400 + Math.random() * 200),
  }));
}

const MOCK_UPTIME = [
  { label: 'Alpha-01',   value: 98.3, color: '#22C55E' },
  { label: 'Env B1',     value: 99.7, color: '#22C55E' },
  { label: 'Energy C1',  value: 95.1, color: '#F59E0B' },
  { label: 'Water D1',   value: 91.4, color: '#F59E0B' },
  { label: 'Pump E1',    value: 88.2, color: '#EF4444' },
];

const ALERT_TREND = [
  { label: 'Mon', value: 4 },
  { label: 'Tue', value: 5 },
  { label: 'Wed', value: 9 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 1 },
  { label: 'Sun', value: 2 },
];

export function ReportsPage() {
  const [period, setPeriod] = useState('7d');
  const ingestionData = buildMockIngestion(period);

  const { data: stats } = useQuery({
    queryKey: ['devices', 'stats'],
    queryFn: devicesApi.stats,
  });

  const { data: alertsData } = useQuery({
    queryKey: ['alerts', 'count'],
    queryFn: () => apiClient.get('/alerts', { params: { limit: 1 } }).then(r => r.data),
  });

  const total   = stats?.total   ?? 0;
  const online  = stats?.online  ?? 0;
  const offline = stats?.offline ?? 0;
  const byCategory = stats?.byCategory ?? [];
  const alertCount = alertsData?.total ?? 0;
  const onlineRate = total > 0 ? ((online / total) * 100).toFixed(1) : '0';

  const kpis = [
    { label: 'Avg Uptime',    value: `${onlineRate}%`, sub: 'Fleet average'  },
    { label: 'Online Now',    value: String(online),   sub: `of ${total} devices` },
    { label: 'Active Alerts', value: String(alertCount), sub: 'Require action' },
    { label: 'Ingested',      value: '142K',           sub: `in last ${period}` },
    { label: 'Commands',      value: '38',             sub: '35 successful'   },
    { label: 'OTA Updates',   value: '6',              sub: '5 successful'    },
  ];

  function exportReport() {
    downloadCSV(`orion-report-${period}.csv`, [
      ...kpis.map(k => ({ metric: k.label, value: k.value, note: k.sub })),
    ]);
  }

  const categoryDonut = byCategory.slice(0, 6).map((c: any, i: number) => ({
    name: c._id,
    value: c.count,
    color: ['#FF6A30','#5B8DEF','#22C55E','#F59E0B','#8B5CF6','#06B6D4'][i % 6],
  }));

  return (
    <div className="space-y-8">

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4 pt-1 flex-wrap">
        <div>
          <p className="eyebrow text-[9px] mb-2">Platform Analytics</p>
          <h1 className="text-[26px] leading-none tracking-tight text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
            <em>Reports</em>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-px border border-[hsl(var(--rule))]">
            {PERIODS.map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-[11px] font-mono transition-colors ${period === p ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
              >
                {p}
              </button>
            ))}
          </div>
          <button onClick={exportReport} className="btn btn-secondary btn-sm gap-1.5">
            <Download size={12} /> Export
          </button>
        </div>
      </div>

      {/* ── Section I — KPI Strip ────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 pb-3 mb-4 border-b border-[hsl(var(--rule))]">
          <span className="serif-i text-muted-foreground mr-2">№ I</span>
          <span className="eyebrow">Summary — {period}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-[hsl(var(--rule))] border border-[hsl(var(--rule))]">
          {kpis.map(({ label, value, sub }) => (
            <div key={label} className="bg-[hsl(var(--surface))] p-5">
              <p className="eyebrow text-[9px] mb-2">{label}</p>
              <p className="text-[1.6rem] font-semibold text-foreground leading-none">{value}</p>
              <p className="text-[10px] text-muted-foreground font-mono mt-1.5">{sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section II — Charts ──────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 pb-3 mb-4 border-b border-[hsl(var(--rule))]">
          <span className="serif-i text-muted-foreground mr-2">№ II</span>
          <span className="eyebrow">Trends</span>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-px bg-[hsl(var(--rule))] border border-[hsl(var(--rule))]">

          {/* Ingestion chart */}
          <div className="bg-[hsl(var(--surface))] p-5">
            <p className="eyebrow text-[9px] mb-4">Data Ingestion — {period}</p>
            <LineChart
              series={[{ name: 'data points', data: ingestionData, color: '#FF6A30' }]}
              height={200}
              showArea
            />
          </div>

          {/* Alert trend */}
          <div className="bg-[hsl(var(--surface))] p-5">
            <p className="eyebrow text-[9px] mb-4">Alert Volume — Last 7 Days</p>
            <BarChart
              data={ALERT_TREND}
              height={200}
              color='#F59E0B'
            />
          </div>
        </div>
      </div>

      {/* ── Section III — Device Breakdown ──────────────────────── */}
      <div>
        <div className="flex items-center gap-2 pb-3 mb-4 border-b border-[hsl(var(--rule))]">
          <span className="serif-i text-muted-foreground mr-2">№ III</span>
          <span className="eyebrow">Fleet Breakdown</span>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-px bg-[hsl(var(--rule))] border border-[hsl(var(--rule))]">

          {/* Category donut */}
          <div className="bg-[hsl(var(--surface))] p-5 flex flex-col items-center justify-center gap-4">
            <p className="eyebrow text-[9px] self-start">By Category</p>
            {categoryDonut.length > 0 ? (
              <>
                <Donut
                  segments={categoryDonut}
                  size={160}
                  thickness={18}
                  centerText={
                    <div className="text-center">
                      <p className="text-[22px] font-semibold text-foreground leading-none">{total}</p>
                      <p className="text-[10px] text-muted-foreground mt-1 font-mono">devices</p>
                    </div>
                  }
                />
                <div className="w-full space-y-1.5">
                  {categoryDonut.map(seg => (
                    <div key={seg.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2" style={{ backgroundColor: seg.color }} />
                        <span className="text-[11px] text-muted-foreground capitalize">{seg.name}</span>
                      </div>
                      <span className="font-mono text-[11px] text-foreground">{seg.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-[12px] text-muted-foreground">No device data</p>
            )}
          </div>

          {/* Device uptime */}
          <div className="xl:col-span-2 bg-[hsl(var(--surface))] p-5">
            <p className="eyebrow text-[9px] mb-4">Device Uptime</p>
            <BarChart
              data={MOCK_UPTIME}
              height={220}
              horizontal
            />
          </div>
        </div>
      </div>

      {/* ── Section IV — Saved Reports ───────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 pb-3 mb-4 border-b border-[hsl(var(--rule))]">
          <span className="serif-i text-muted-foreground mr-2">№ IV</span>
          <span className="eyebrow">Scheduled Reports</span>
        </div>
        <div className="border border-[hsl(var(--rule))] bg-[hsl(var(--surface))]">
          {[
            { name: 'Weekly Fleet Health', freq: 'Every Monday', format: 'CSV', last: '2026-04-14' },
            { name: 'Monthly Uptime Summary', freq: '1st of month', format: 'CSV', last: '2026-04-01' },
            { name: 'Daily Alert Digest', freq: 'Daily 08:00', format: 'CSV', last: '2026-04-18' },
          ].map((rep, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-5 py-3.5 border-b border-[hsl(var(--rule)/0.5)] last:border-0"
            >
              <div>
                <p className="text-[13px] font-medium text-foreground">{rep.name}</p>
                <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{rep.freq} · Last generated {rep.last}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] border border-[hsl(var(--rule))] px-2 py-0.5 text-muted-foreground">
                  {rep.format}
                </span>
                <button className="btn btn-secondary btn-sm gap-1.5">
                  <Download size={11} /> Download
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
