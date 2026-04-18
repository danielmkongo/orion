import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Cpu, Wifi, WifiOff, Bell, Activity, MapPin, ArrowUpRight, ArrowDownRight, Zap } from 'lucide-react';
import apiClient from '@/api/client';
import { devicesApi } from '@/api/devices';
import { cn, timeAgo, categoryIcon } from '@/lib/utils';
import { TelemetryLineChart } from '@/components/charts/TelemetryLineChart';
import { DeviceStatusPie } from '@/components/charts/DeviceStatusPie';
import { ActivityFeed } from '@/components/charts/ActivityFeed';
import { useSocket } from '@/hooks/useSocket';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

function StatCard({ icon: Icon, label, value, sub, color, trend }: {
  icon: any; label: string; value: string | number; sub?: string;
  color: string; trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-5 hover:border-surface-border-strong transition-colors"
    >
      <div className="flex items-start justify-between mb-4">
        <div className={cn('p-2.5 rounded-xl', color)}>
          <Icon className="w-4 h-4" />
        </div>
        {trend && (
          <span className={cn('text-xs font-medium flex items-center gap-0.5',
            trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-rose-400' : 'text-slate-500'
          )}>
            {trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : trend === 'down' ? <ArrowDownRight className="w-3 h-3" /> : null}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-100">{value}</p>
      <p className="text-sm text-slate-400 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
    </motion.div>
  );
}

export function DashboardPage() {
  const { on } = useSocket();
  const [liveDeviceIds, setLiveDeviceIds] = useState<Set<string>>(new Set());

  const { data: statsData, refetch: refetchStats } = useQuery({
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

  const { data: telemetryData } = useQuery({
    queryKey: ['telemetry', 'recent'],
    queryFn: () => apiClient.get('/telemetry', { params: { limit: 50 } }).then(r => r.data),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const unsub = on('telemetry.update', (event: any) => {
      setLiveDeviceIds(prev => new Set([...prev, event.deviceId]));
      setTimeout(() => setLiveDeviceIds(prev => {
        const next = new Set(prev);
        next.delete(event.deviceId);
        return next;
      }), 3000);
    });
    const unsubStatus = on('device.online', () => refetchStats());
    const unsubOff = on('device.offline', () => refetchStats());
    return () => { unsub(); unsubStatus(); unsubOff(); };
  }, [on, refetchStats]);

  const stats = statsData ?? { total: 0, online: 0, offline: 0, byCategory: [] };
  const devices = devicesData?.devices ?? [];
  const alerts = alertsData?.data ?? [];
  const activeAlerts = alertsData?.total ?? 0;

  const onlineRate = stats.total > 0 ? Math.round((stats.online / stats.total) * 100) : 0;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Operations Overview</h1>
          <p className="text-sm text-slate-500 mt-0.5">Live platform summary</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live data
          </span>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Cpu} label="Total Devices" value={stats.total}
          color="bg-orion-600/20 text-orion-400"
          sub={`${stats.byCategory?.length ?? 0} categories`}
        />
        <StatCard
          icon={Wifi} label="Online Now" value={stats.online}
          color="bg-emerald-500/20 text-emerald-400"
          sub={`${onlineRate}% fleet health`}
          trend="up"
        />
        <StatCard
          icon={WifiOff} label="Offline" value={stats.offline}
          color="bg-slate-500/20 text-slate-400"
          sub="May need attention"
          trend={stats.offline > 0 ? 'down' : 'neutral'}
        />
        <StatCard
          icon={Bell} label="Active Alerts" value={activeAlerts}
          color={activeAlerts > 0 ? "bg-rose-500/20 text-rose-400" : "bg-slate-500/20 text-slate-400"}
          sub={activeAlerts > 0 ? "Requires action" : "All clear"}
          trend={activeAlerts > 0 ? 'down' : 'neutral'}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Charts — 2 cols */}
        <div className="lg:col-span-2 space-y-4">
          <TelemetryLineChart />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DeviceStatusPie
              data={stats.byCategory.map(c => ({ name: c._id, value: c.count }))}
              online={stats.online}
              offline={stats.offline}
              total={stats.total}
            />

            {/* Fleet health mini */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-slate-200 mb-4">Fleet Health</h3>
              <div className="relative pt-1 mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-slate-400">Online rate</span>
                  <span className="text-xs font-semibold text-emerald-400">{onlineRate}%</span>
                </div>
                <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${onlineRate}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className="h-full bg-emerald-500 rounded-full"
                  />
                </div>
              </div>
              <div className="space-y-2 mt-4">
                {stats.byCategory.slice(0, 4).map(cat => (
                  <div key={cat._id} className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 capitalize flex items-center gap-1.5">
                      <span>{categoryIcon(cat._id)}</span> {cat._id}
                    </span>
                    <span className="text-xs font-medium text-slate-300">{cat.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Active alerts */}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-surface-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">Active Alerts</h3>
              <Link to="/alerts" className="text-xs text-orion-400 hover:text-orion-300">View all</Link>
            </div>
            <div className="divide-y divide-surface-border/50">
              {alerts.length === 0 ? (
                <div className="p-6 text-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-2">
                    <Zap className="w-4 h-4 text-emerald-400" />
                  </div>
                  <p className="text-sm text-slate-400">All systems nominal</p>
                </div>
              ) : alerts.map((alert: any) => (
                <div key={alert._id} className="p-3 hover:bg-surface-3/40 transition-colors">
                  <div className="flex items-start gap-2.5">
                    <span className={cn('mt-1 w-2 h-2 rounded-full shrink-0',
                      alert.severity === 'critical' ? 'bg-rose-400 animate-pulse' :
                      alert.severity === 'error' ? 'bg-rose-400' :
                      alert.severity === 'warning' ? 'bg-amber-400' : 'bg-sky-400'
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate">{alert.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{alert.message}</p>
                      <p className="text-[11px] text-slate-600 mt-1">{timeAgo(alert.createdAt)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent devices */}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-surface-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">Recent Devices</h3>
              <Link to="/devices" className="text-xs text-orion-400 hover:text-orion-300">View all</Link>
            </div>
            <div className="divide-y divide-surface-border/50">
              {devices.slice(0, 5).map((device: any) => (
                <Link
                  key={device._id}
                  to={`/devices/${device._id}`}
                  className="flex items-center gap-3 p-3 hover:bg-surface-3/40 transition-colors"
                >
                  <div className={cn(
                    'flex items-center gap-2',
                    liveDeviceIds.has(device._id) ? 'opacity-100' : ''
                  )}>
                    <span className={cn('status-dot',
                      device.status === 'online' ? 'status-dot-online' :
                      device.status === 'error' ? 'status-dot-error' : 'status-dot-offline'
                    )} />
                  </div>
                  <span className="text-base leading-none">{categoryIcon(device.category)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{device.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {device.lastSeenAt ? timeAgo(device.lastSeenAt) : 'Never seen'}
                    </p>
                  </div>
                  {liveDeviceIds.has(device._id) && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="flex items-center gap-1 text-[10px] text-emerald-400"
                    >
                      <Activity className="w-3 h-3" />
                    </motion.div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <ActivityFeed />
    </div>
  );
}
