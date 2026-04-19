import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Download, TrendingUp, TrendingDown } from 'lucide-react';
import { devicesApi } from '@/api/devices';
import { PageHeader } from '@/components/ui/PageHeader';
import { Donut, BarChart } from '@/components/charts/Charts';
import toast from 'react-hot-toast';

interface Report {
  period: '24h' | '7d' | '30d';
  label: string;
}

const PERIODS: Report[] = [
  { period: '24h', label: '24h' },
  { period: '7d', label: '7d' },
  { period: '30d', label: '30d' },
];

function StatTile({ label, value, unit, trend, color }: {
  label: string; value: string | number; unit?: string; trend?: number; color?: string;
}) {
  return (
    <motion.div
      layout
      className="col p-4 border border-[hsl(var(--rule))]"
      style={{ background: color ? `${color}11` : undefined }}
    >
      <p className="eyebrow text-[9px]">{label}</p>
      <div className="flex items-end gap-2 mt-3">
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '32px', lineHeight: 1 }}>
          {value}
        </span>
        {unit && <span className="text-[13px] text-muted-foreground mb-1">{unit}</span>}
      </div>
      {trend !== undefined && (
        <div className="flex items-center gap-1 mt-2">
          {trend > 0 ? (
            <TrendingUp size={12} className="text-green-500" />
          ) : (
            <TrendingDown size={12} className="text-red-500" />
          )}
          <span className={`text-[11px] font-mono ${trend > 0 ? 'text-green-500' : 'text-red-500'}`}>
            {Math.abs(trend)}%
          </span>
        </div>
      )}
    </motion.div>
  );
}

export function ReportsPage() {
  const [selectedPeriod, setSelectedPeriod] = useState<Report['period']>('7d');

  // Fetch devices
  const { data } = useQuery({
    queryKey: ['devices'],
    queryFn: () => devicesApi.list(),
  });

  const devices = data?.devices ?? [];

  // Calculate fleet stats
  const fleetStats = useMemo(() => {
    const total = devices.length;
    const online = devices.filter(d => d.status === 'online').length;
    const offline = devices.filter(d => d.status === 'offline').length;
    const idle = devices.filter(d => d.status === 'idle').length;
    const error = devices.filter(d => d.status === 'error').length;
    const onlineRate = total > 0 ? Math.round((online / total) * 100) : 0;
    const errorRate = total > 0 ? Math.round((error / total) * 100) : 0;

    return { total, online, offline, idle, error, onlineRate, errorRate };
  }, [devices]);

  // Mock device uptime data
  const uptimeData = useMemo(() => {
    return devices.map(d => ({
      name: d.name,
      category: d.category,
      protocol: d.protocol || 'http',
      uptime24h: 95 + Math.random() * 5,
      uptime7d: 92 + Math.random() * 6,
      uptime30d: 88 + Math.random() * 8,
      mtbf: 720 + Math.random() * 480,
    })).sort((a, b) => b.uptime7d - a.uptime7d);
  }, [devices]);

  // Mock alert data
  const alertStats = useMemo(() => {
    const alerts24h = 12 + Math.floor(Math.random() * 20);
    const alerts7d = 89 + Math.floor(Math.random() * 30);
    const alerts30d = 350 + Math.floor(Math.random() * 100);

    const topAlerts = [
      { type: 'High Temperature', count: 15, trend: 8 },
      { type: 'Connection Lost', count: 12, trend: -5 },
      { type: 'Battery Low', count: 8, trend: 3 },
      { type: 'Data Invalid', count: 5, trend: 0 },
    ];

    return { alerts24h, alerts7d, alerts30d, topAlerts };
  }, []);

  // Export reports
  const handleExportCSV = () => {
    const headers = ['Device', 'Category', 'Protocol', 'Uptime 24h', 'Uptime 7d', 'Uptime 30d', 'MTBF (hours)'];
    const rows = uptimeData.map(d => [
      d.name, d.category, d.protocol,
      d.uptime24h.toFixed(1) + '%',
      d.uptime7d.toFixed(1) + '%',
      d.uptime30d.toFixed(1) + '%',
      d.mtbf.toFixed(0),
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orion-reports-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report exported');
  };

  const devicesByStatus = useMemo(() => [
    { v: fleetStats.online, color: 'hsl(var(--good))' },
    { v: fleetStats.idle, color: 'hsl(var(--warn))' },
    { v: fleetStats.error, color: 'hsl(var(--bad))' },
    { v: fleetStats.offline, color: 'hsl(var(--muted-fg))' },
  ], [fleetStats]);

  const alertTrendData = [
    { label: 'Mon', value: 4 },
    { label: 'Tue', value: 5 },
    { label: 'Wed', value: 9 },
    { label: 'Thu', value: 4 },
    { label: 'Fri', value: 5 },
    { label: 'Sat', value: 1 },
    { label: 'Sun', value: 2 },
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Analysis"
        title={<><em>Reports</em> & analytics.</>}
        lede="Comprehensive device fleet analytics, uptime tracking, and performance metrics."
        actions={
          <button onClick={handleExportCSV} className="btn btn-primary btn-sm gap-1.5">
            <Download size={13} /> Export CSV
          </button>
        }
      />

      {/* Period selector */}
      <div className="mb-8 flex items-center gap-4">
        <span className="eyebrow text-[9px]">Time period</span>
        <div className="seg">
          {PERIODS.map(p => (
            <button
              key={p.period}
              onClick={() => setSelectedPeriod(p.period)}
              className={selectedPeriod === p.period ? 'on' : ''}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fleet Health Dashboard */}
      <section className="mb-12">
        <div className="mb-6">
          <div className="no" style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '.22em', textTransform: 'uppercase', color: 'hsl(var(--muted-fg))', marginBottom: 10 }}>№ I</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', lineHeight: 1 }}>Fleet health</h2>
        </div>

        <div className="ticker grid-cols-4 gap-px mb-8">
          <StatTile label="Total devices" value={fleetStats.total} />
          <StatTile label="Online now" value={fleetStats.online} unit={`/ ${fleetStats.total}`} trend={5} color="#10b981" />
          <StatTile label="Error rate" value={fleetStats.errorRate} unit="%" color="#FF6A30" />
          <StatTile label="Idle" value={fleetStats.idle} unit="devices" color="#F59E0B" />
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Online % chart */}
          <div className="col">
            <div className="panel p-6">
              <div className="mb-6">
                <p className="eyebrow text-[9px] mb-1">Fleet status</p>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 500, marginTop: 4 }}>
                  {fleetStats.onlineRate}% online
                </p>
              </div>
              <Donut
                segments={devicesByStatus}
                size={140}
                thickness={12}
                centerText={
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '24px', lineHeight: 1 }}>
                      {fleetStats.online}
                    </div>
                    <div style={{ fontSize: '10px', marginTop: 4, color: 'hsl(var(--muted-fg))' }}>
                      online
                    </div>
                  </div>
                }
              />
            </div>
          </div>

          {/* Status breakdown */}
          <div className="col">
            <div className="panel p-6">
              <p className="eyebrow text-[9px] mb-4">Status breakdown</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-2">
                    <span className="dot dot-online" />
                    Online
                  </span>
                  <span className="font-mono font-semibold">{fleetStats.online}</span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-2">
                    <span className="dot dot-warn" />
                    Idle
                  </span>
                  <span className="font-mono font-semibold">{fleetStats.idle}</span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-2">
                    <span className="dot dot-error" />
                    Error
                  </span>
                  <span className="font-mono font-semibold">{fleetStats.error}</span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-2">
                    <span className="dot dot-offline" />
                    Offline
                  </span>
                  <span className="font-mono font-semibold">{fleetStats.offline}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Alert summary */}
          <div className="col">
            <div className="panel p-6">
              <p className="eyebrow text-[9px] mb-4">Alert frequency</p>
              <div className="space-y-3">
                <div>
                  <p className="text-[12px] text-muted-foreground">Last 24h</p>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 500, marginTop: 2 }}>
                    {alertStats.alerts24h}
                  </p>
                </div>
                <div className="pt-3 border-t border-[hsl(var(--rule))]">
                  <p className="text-[12px] text-muted-foreground">Last 7d</p>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 500, marginTop: 2 }}>
                    {alertStats.alerts7d}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Device Uptime Report */}
      <section className="mb-12">
        <div className="mb-6">
          <div className="no" style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '.22em', textTransform: 'uppercase', color: 'hsl(var(--muted-fg))', marginBottom: 10 }}>№ II</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', lineHeight: 1 }}>Device uptime</h2>
          <p className="text-[13px] text-muted-foreground mt-2">Availability metrics across your fleet</p>
        </div>

        <div className="panel">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Device</th>
                <th>Category</th>
                <th>Protocol</th>
                <th className="text-right">24h</th>
                <th className="text-right">7d</th>
                <th className="text-right">30d</th>
                <th className="text-right">MTBF</th>
              </tr>
            </thead>
            <tbody>
              {uptimeData.map(d => (
                <tr key={d.name}>
                  <td className="font-medium">{d.name}</td>
                  <td className="capitalize text-[12px] text-muted-foreground">{d.category}</td>
                  <td className="font-mono text-[11px]">{d.protocol}</td>
                  <td className="text-right">
                    <span className={d.uptime24h > 95 ? 'text-green-500' : d.uptime24h > 85 ? 'text-yellow-500' : 'text-red-500'}>
                      {d.uptime24h.toFixed(1)}%
                    </span>
                  </td>
                  <td className="text-right">
                    <span className={d.uptime7d > 95 ? 'text-green-500' : d.uptime7d > 85 ? 'text-yellow-500' : 'text-red-500'}>
                      {d.uptime7d.toFixed(1)}%
                    </span>
                  </td>
                  <td className="text-right">
                    <span className={d.uptime30d > 95 ? 'text-green-500' : d.uptime30d > 85 ? 'text-yellow-500' : 'text-red-500'}>
                      {d.uptime30d.toFixed(1)}%
                    </span>
                  </td>
                  <td className="text-right font-mono text-[11px] text-muted-foreground">
                    {d.mtbf.toFixed(0)}h
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top Alerts */}
      <section className="mb-12">
        <div className="mb-6">
          <div className="no" style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '.22em', textTransform: 'uppercase', color: 'hsl(var(--muted-fg))', marginBottom: 10 }}>№ III</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', lineHeight: 1 }}>Top alerts</h2>
          <p className="text-[13px] text-muted-foreground mt-2">Most frequently triggered alert types</p>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {alertStats.topAlerts.map(alert => (
            <motion.div key={alert.type} className="panel p-4">
              <p className="text-[12px] font-medium mb-3">{alert.type}</p>
              <div className="flex items-baseline gap-2">
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '28px', lineHeight: 1 }}>
                  {alert.count}
                </span>
                <div className="flex items-center gap-1">
                  {alert.trend > 0 ? (
                    <TrendingUp size={12} className="text-red-500" />
                  ) : alert.trend < 0 ? (
                    <TrendingDown size={12} className="text-green-500" />
                  ) : (
                    <span className="text-[11px] text-muted-foreground">—</span>
                  )}
                  <span className={`text-[11px] font-mono ${alert.trend > 0 ? 'text-red-500' : alert.trend < 0 ? 'text-green-500' : 'text-muted-foreground'}`}>
                    {alert.trend > 0 ? '+' : ''}{alert.trend}%
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Alert Trend Chart */}
      <section>
        <div className="mb-6">
          <div className="no" style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '.22em', textTransform: 'uppercase', color: 'hsl(var(--muted-fg))', marginBottom: 10 }}>№ IV</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', lineHeight: 1 }}>Alert volume</h2>
          <p className="text-[13px] text-muted-foreground mt-2">7-day alert trend</p>
        </div>

        <div className="panel p-6">
          <BarChart data={alertTrendData} height={240} color="#F59E0B" />
        </div>
      </section>
    </div>
  );
}
