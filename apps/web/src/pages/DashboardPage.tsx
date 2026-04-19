import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Cpu, Wifi, WifiOff, Bell, Activity, Zap,
  ArrowUpRight, ArrowRight, CheckCircle2,
} from 'lucide-react';
import apiClient from '@/api/client';
import { devicesApi } from '@/api/devices';
import { timeAgo, getCategoryIconInfo } from '@/lib/utils';
import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart';
import { DeviceStatusPie } from '@/components/charts/DeviceStatusPie';
import { ActivityFeed } from '@/components/charts/ActivityFeed';
import { useSocket } from '@/hooks/useSocket';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';

const SEVERITY_DOT: Record<string, string> = {
  critical: 'status-dot-error',
  error:    'status-dot-error',
  warning:  'status-dot-idle',
  info:     'bg-blue-400',
};

function KpiCard({ icon: Icon, label, value, sub, accent, trend }: {
  icon: React.FC<any>;
  label: string;
  value: number | string;
  sub?: string;
  accent?: string;
  trend?: 'up' | 'down';
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-5 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${accent ?? 'bg-muted'}`}>
          <Icon size={17} />
        </div>
        {trend && (
          <div className={`flex items-center gap-0.5 text-[12px] font-medium ${trend === 'up' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            <ArrowUpRight size={13} className={trend === 'down' ? 'rotate-90' : ''} />
          </div>
        )}
      </div>
      <div>
        <p className="text-[1.625rem] font-semibold text-foreground tracking-tight leading-none">{value}</p>
        <p className="text-[13px] text-muted-foreground mt-1">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{sub}</p>}
      </div>
    </motion.div>
  );
}

export function DashboardPage() {
  const { user } = useAuthStore();
  const { on } = useSocket();
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set());

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['devices', 'stats'],
    queryFn: devicesApi.stats,
    refetchInterval: 30_000,
  });

  const { data: devicesData } = useQuery({
    queryKey: ['devices', 'recent'],
    queryFn: () => devicesApi.list({ limit: 8 }),
    refetchInterval: 30_000,
  });

  const { data: alertsData } = useQuery({
    queryKey: ['alerts', 'active'],
    queryFn: () => apiClient.get('/alerts', { params: { status: 'active', limit: 5 } }).then(r => r.data),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const unsub = on<any>('telemetry.update', (e) => {
      const id = e?.deviceId ?? e?.data?.deviceId;
      if (!id) return;
      setLiveIds(prev => new Set([...prev, id]));
      setTimeout(() => setLiveIds(prev => { const next = new Set(prev); next.delete(id); return next; }), 3000);
    });
    const u1 = on<unknown>('device.online', () => refetchStats());
    const u2 = on<unknown>('device.offline', () => refetchStats());
    return () => { unsub(); u1(); u2(); };
  }, [on, refetchStats]);

  const total   = stats?.total ?? 0;
  const online  = stats?.online ?? 0;
  const offline = stats?.offline ?? 0;
  const byCategory = stats?.byCategory ?? [];
  const activeAlerts = alertsData?.total ?? 0;
  const alerts  = alertsData?.alerts ?? alertsData?.data ?? [];
  const devices = devicesData?.devices ?? [];
  const onlineRate = total > 0 ? Math.round((online / total) * 100) : 0;

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[22px] font-semibold text-foreground tracking-tight">
            {greeting()}, {user?.name?.split(' ')[0] ?? 'there'}
          </h2>
          <p className="text-[14px] text-muted-foreground mt-0.5">Here's what's happening with your fleet.</p>
        </div>
        <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground bg-muted px-3 py-1.5 rounded-full border border-border">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Live
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          icon={Cpu} label="Total Devices" value={total}
          sub={`${byCategory.length} categories`}
          accent="bg-primary/10 text-primary"
        />
        <KpiCard
          icon={Wifi} label="Online Now" value={online}
          sub={`${onlineRate}% fleet health`}
          accent="bg-green-500/10 text-green-600 dark:text-green-400"
          trend={online > 0 ? 'up' : undefined}
        />
        <KpiCard
          icon={WifiOff} label="Offline" value={offline}
          sub={offline > 0 ? 'Needs attention' : 'All healthy'}
          accent="bg-muted text-muted-foreground"
          trend={offline > 0 ? 'down' : undefined}
        />
        <KpiCard
          icon={Bell} label="Active Alerts" value={activeAlerts}
          sub={activeAlerts > 0 ? 'Action required' : 'All clear'}
          accent={activeAlerts > 0 ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-muted text-muted-foreground'}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Charts — 2/3 */}
        <div className="xl:col-span-2 space-y-5">
          <TelemetryLineChart />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <DeviceStatusPie
              data={byCategory.map(c => ({ name: c._id, value: c.count }))}
              online={online} offline={offline} total={total}
            />

            {/* Fleet health */}
            <div className="card p-5">
              <h3 className="text-[13px] font-semibold text-foreground mb-4">Fleet Health</h3>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] text-muted-foreground">Online rate</span>
                  <span className="text-[12px] font-semibold text-green-600 dark:text-green-400">{onlineRate}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${onlineRate}%` }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                    className="h-full bg-green-500 rounded-full"
                  />
                </div>
              </div>

              <div className="space-y-2.5">
                {byCategory.slice(0, 5).map(cat => {
                  const { Icon: CatIcon, color: catColor } = getCategoryIconInfo(cat._id);
                  return (
                    <div key={cat._id} className="flex items-center justify-between">
                      <span className="text-[12px] text-muted-foreground capitalize flex items-center gap-1.5">
                        <CatIcon size={12} style={{ color: catColor }} />
                        {cat._id}
                      </span>
                      <span className="text-[12px] font-medium text-foreground">{cat.count}</span>
                    </div>
                  );
                })}
                {byCategory.length === 0 && (
                  <p className="text-[12px] text-muted-foreground text-center py-4">No devices yet</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right column — 1/3 */}
        <div className="space-y-5">
          {/* Active Alerts */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-[13px] font-semibold text-foreground">Active Alerts</span>
              <Link to="/alerts" className="text-[12px] text-primary hover:underline flex items-center gap-0.5">
                All <ArrowRight size={11} />
              </Link>
            </div>
            <div>
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <CheckCircle2 size={20} className="text-green-500 mb-2" />
                  <p className="text-[13px] font-medium text-foreground">All systems nominal</p>
                  <p className="text-[12px] text-muted-foreground">No active alerts</p>
                </div>
              ) : (
                alerts.slice(0, 5).map((a: any) => (
                  <div key={a._id ?? a.id} className="flex items-start gap-3 px-4 py-3 border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors">
                    <span className={`status-dot mt-1.5 flex-shrink-0 ${SEVERITY_DOT[a.severity] ?? 'bg-blue-400'} ${a.severity === 'critical' ? 'animate-pulse' : ''}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-foreground truncate">{a.title ?? a.message}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{timeAgo(a.createdAt)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent devices */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-[13px] font-semibold text-foreground">Devices</span>
              <Link to="/devices" className="text-[12px] text-primary hover:underline flex items-center gap-0.5">
                All <ArrowRight size={11} />
              </Link>
            </div>
            <div>
              {devices.slice(0, 6).map((d: any) => {
                const { Icon: DIcon, color: dc } = getCategoryIconInfo(d.category);
                return (
                <Link
                  key={d._id ?? d.id}
                  to={`/devices/${d._id ?? d.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors"
                >
                  <span className={`status-dot flex-shrink-0 ${
                    d.status === 'online' ? 'status-dot-online' :
                    d.status === 'error'  ? 'status-dot-error'  : 'status-dot-offline'
                  }`} />
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${dc}15` }}>
                    <DIcon size={12} style={{ color: dc }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{d.name}</p>
                    <p className="text-[11px] text-muted-foreground">{d.lastSeenAt ? timeAgo(d.lastSeenAt) : 'Never'}</p>
                  </div>
                  {liveIds.has(d._id ?? d.id) && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                      <Activity size={12} className="text-green-500" />
                    </motion.div>
                  )}
                </Link>
                );
              })}
              {devices.length === 0 && (
                <p className="text-[13px] text-muted-foreground text-center py-6">No devices yet</p>
              )}
            </div>
          </div>

          {/* Activity feed */}
          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}
