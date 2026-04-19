import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronDown, CheckCircle2, Wifi, WifiOff, Cpu, Bell } from 'lucide-react';
import apiClient from '@/api/client';
import { devicesApi } from '@/api/devices';
import { telemetryApi } from '@/api/telemetry';
import { timeAgo, getCategoryIconInfo } from '@/lib/utils';
import { LineChart, Donut, Sparkline } from '@/components/charts/Charts';
import { useSocket } from '@/hooks/useSocket';
import { useAuthStore } from '@/store/auth.store';

/* ── helpers ────────────────────────────────────────────────────── */
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function fmtDate() {
  return new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' });
}

const SERIES_COLORS = ['#FF6A30', '#5B8DEF', '#22C55E', '#F59E0B', '#8B5CF6', '#06B6D4'];

/* ── featured chart dropdown ─────────────────────────────────────── */
function FeaturedDropdown({
  devices,
  selectedDeviceId,
  selectedField,
  onSelect,
}: {
  devices: any[];
  selectedDeviceId: string;
  selectedField: string;
  onSelect: (deviceId: string, field: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expandedDevice, setExpandedDevice] = useState<string | null>(selectedDeviceId);
  const ref = useRef<HTMLDivElement>(null);

  const { data: latestMap } = useQuery({
    queryKey: ['telemetry', 'latest-map', devices.map(d => d._id ?? d.id).join(',')],
    queryFn: async () => {
      const results: Record<string, Record<string, number>> = {};
      await Promise.all(
        devices.slice(0, 12).map(async (d) => {
          try {
            const lat = await telemetryApi.latest(d._id ?? d.id);
            const fields = Object.entries(lat?.fields ?? {})
              .filter(([, v]) => typeof v === 'number')
              .reduce((acc, [k, v]) => ({ ...acc, [k]: v as number }), {});
            if (Object.keys(fields).length > 0) {
              results[d._id ?? d.id] = fields;
            }
          } catch {}
        })
      );
      return results;
    },
    enabled: open && devices.length > 0,
    staleTime: 60_000,
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectedDevice = devices.find(d => (d._id ?? d.id) === selectedDeviceId);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-[12px] font-medium border border-[hsl(var(--rule))] px-3 py-1.5 hover:bg-[hsl(var(--muted))] transition-colors text-foreground"
      >
        <span className="text-muted-foreground font-mono">{selectedDevice?.name ?? '—'}</span>
        <span className="text-primary font-mono">— {selectedField}</span>
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-[hsl(var(--surface))] border border-[hsl(var(--rule))] shadow-xl z-30 animate-fade-in max-h-80 overflow-y-auto">
          <div className="px-3 py-2 border-b border-[hsl(var(--rule))]">
            <p className="eyebrow text-[9px]">Select signal source</p>
          </div>
          {devices.slice(0, 12).map((d) => {
            const id = d._id ?? d.id;
            const fields = latestMap ? Object.keys(latestMap[id] ?? {}) : [];
            const isExpanded = expandedDevice === id;
            const { Icon, color } = getCategoryIconInfo(d.category);
            return (
              <div key={id}>
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-[hsl(var(--muted))] transition-colors text-left"
                  onClick={() => setExpandedDevice(isExpanded ? null : id)}
                >
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0" style={{ color }}>
                    <Icon size={12} />
                  </div>
                  <span className="text-[12px] font-medium text-foreground flex-1 truncate">{d.name}</span>
                  <span className={`w-1.5 h-1.5 flex-shrink-0 ${d.status === 'online' ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                  <ChevronDown size={10} className={`text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
                {isExpanded && (
                  <div className="border-t border-[hsl(var(--rule)/0.5)] bg-[hsl(var(--muted)/0.4)]">
                    {fields.length === 0 ? (
                      <p className="px-8 py-2 text-[11px] text-muted-foreground">No numeric fields</p>
                    ) : (
                      fields.map(field => {
                        const isSelected = id === selectedDeviceId && field === selectedField;
                        return (
                          <button
                            key={field}
                            className={`w-full flex items-center justify-between px-8 py-1.5 text-left transition-colors ${
                              isSelected ? 'text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--muted))]'
                            }`}
                            onClick={() => { onSelect(id, field); setOpen(false); }}
                          >
                            <span className="font-mono text-[11px]">{field}</span>
                            {isSelected && <CheckCircle2 size={11} />}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── main page ───────────────────────────────────────────────────── */
export function DashboardPage() {
  const { user } = useAuthStore();
  const { on } = useSocket();
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set());
  const [featuredDeviceId, setFeaturedDeviceId] = useState('');
  const [featuredField, setFeaturedField] = useState('temperature');

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['devices', 'stats'],
    queryFn: devicesApi.stats,
    refetchInterval: 30_000,
  });

  const { data: devicesData } = useQuery({
    queryKey: ['devices', 'dashboard'],
    queryFn: () => devicesApi.list({ limit: 12 }),
    refetchInterval: 30_000,
  });

  const { data: alertsData } = useQuery({
    queryKey: ['alerts', 'active'],
    queryFn: () => apiClient.get('/alerts', { params: { status: 'active', limit: 5 } }).then(r => r.data),
    refetchInterval: 15_000,
  });

  const devices = Array.isArray(devicesData?.devices) ? devicesData.devices : [];
  const total   = typeof stats?.total === 'number' ? stats.total : 0;
  const online  = typeof stats?.online === 'number' ? stats.online : 0;
  const offline = typeof stats?.offline === 'number' ? stats.offline : 0;
  const byCategory = Array.isArray(stats?.byCategory) ? stats.byCategory : [];
  const activeAlerts = typeof alertsData?.total === 'number' ? alertsData.total : 0;
  const alerts  = Array.isArray(alertsData?.alerts) ? alertsData.alerts : Array.isArray(alertsData?.data) ? alertsData.data : [];
  const onlineRate = total > 0 ? Math.round((online / total) * 100) : 0;

  // Default featured device to first device
  const defaultDeviceId = (devices[0] as any)?._id ?? (devices[0] as any)?.id ?? '';
  const effectiveDeviceId = featuredDeviceId || defaultDeviceId;

  const { data: featuredLatest } = useQuery({
    queryKey: ['telemetry', 'latest', effectiveDeviceId],
    queryFn: () => telemetryApi.latest(effectiveDeviceId),
    enabled: !!effectiveDeviceId,
    refetchInterval: 30_000,
  });

  // Auto-pick first numeric field from featured device
  useEffect(() => {
    if (!featuredLatest?.fields) return;
    const numFields = Object.entries(featuredLatest.fields)
      .filter(([, v]) => typeof v === 'number')
      .map(([k]) => k);
    if (numFields.length > 0 && !numFields.includes(featuredField)) {
      setFeaturedField(numFields[0]);
    }
  }, [featuredLatest, effectiveDeviceId]);

  const from = new Date(Date.now() - 24 * 3600_000).toISOString();
  const to   = new Date().toISOString();

  const { data: featuredSeries } = useQuery({
    queryKey: ['series', effectiveDeviceId, featuredField, '24h'],
    queryFn: () => telemetryApi.series(effectiveDeviceId, featuredField, from, to, 300),
    enabled: !!effectiveDeviceId && !!featuredField,
    refetchInterval: 60_000,
  });

  const featuredPoints = (Array.isArray(featuredSeries?.data) ? featuredSeries.data : []).map(p => {
    const ts = typeof p?.ts === 'string' ? new Date(p.ts).getTime() : typeof p?.ts === 'number' ? p.ts : Date.now();
    const value = typeof p?.value === 'number' ? p.value : 0;
    return { ts: isNaN(ts) ? Date.now() : ts, value: isNaN(value) ? 0 : value };
  });

  // Sparkline data per device (mock last few values from latest)
  function sparkData(d: any): number[] {
    try {
      const f = featuredLatest?.fields ?? {};
      const nums = Object.values(f).filter(v => typeof v === 'number') as number[];
      if (nums.length === 0) return [];
      const baseVal = typeof nums[0] === 'number' ? nums[0] : 0;
      return Array.from({ length: 12 }, (_, i) => {
        const charCode = d?.name?.charCodeAt?.(0) ?? 0;
        return baseVal * (0.9 + Math.sin(i + charCode) * 0.08);
      });
    } catch {
      return [];
    }
  }

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

  const SEVERITY_COLOR: Record<string, string> = {
    critical: 'bg-red-500',
    error:    'bg-red-500',
    warning:  'bg-amber-500',
    info:     'bg-blue-400',
  };

  return (
    <div className="space-y-8">

      {/* ── Masthead ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-2">
        <div>
          <p className="eyebrow mb-2">Fleet Overview</p>
          <h1 className="text-[28px] leading-none tracking-tight text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
            <em>{greeting()}, {user?.name?.split(' ')[0] ?? 'there'}.</em>
          </h1>
          <p className="text-[13px] text-muted-foreground mt-2 font-mono">{fmtDate()}</p>
        </div>
        <div className="flex items-center gap-2 border border-[hsl(var(--rule))] px-3 py-1.5 self-start sm:self-auto">
          <span className="w-1.5 h-1.5 bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-widest">Live</span>
        </div>
      </div>

      {/* ── Section I — KPI Ticker ───────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 pb-3 mb-4 border-b border-[hsl(var(--rule))]">
          <span className="serif-i text-muted-foreground mr-2">№ I</span>
          <span className="eyebrow">Metrics</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[hsl(var(--rule))] border border-[hsl(var(--rule))]">
          {[
            { icon: Cpu,    label: 'Total Devices', value: total,        sub: `${byCategory.length} categories` },
            { icon: Wifi,   label: 'Online',        value: online,       sub: `${onlineRate}% fleet health`,    accent: 'text-emerald-500' },
            { icon: WifiOff,label: 'Offline',       value: offline,      sub: offline > 0 ? 'Needs attention' : 'All healthy' },
            { icon: Bell,   label: 'Active Alerts', value: activeAlerts, sub: activeAlerts > 0 ? 'Action required' : 'All clear', accent: activeAlerts > 0 ? 'text-red-500' : undefined },
          ].map(({ icon: Icon, label, value, sub, accent }) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[hsl(var(--surface))] p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="eyebrow text-[9px]">{label}</p>
                <Icon size={14} className="text-muted-foreground opacity-50" />
              </div>
              <p className={`text-[2rem] font-semibold leading-none tracking-tight ${accent ?? 'text-foreground'}`}>
                {value}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1.5 font-mono">{sub}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Section II — Signal + Status ─────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 pb-3 mb-4 border-b border-[hsl(var(--rule))]">
          <span className="serif-i text-muted-foreground mr-2">№ II</span>
          <span className="eyebrow">Signal</span>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-px bg-[hsl(var(--rule))] border border-[hsl(var(--rule))]">

          {/* Featured chart — 2/3 */}
          <div className="xl:col-span-2 bg-[hsl(var(--surface))] p-5">
            <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
              <div>
                <p className="eyebrow text-[9px] mb-1">Featured Signal — 24h</p>
                <p className="text-[13px] font-semibold text-foreground">
                  {devices.find(d => (d as any)._id === effectiveDeviceId || (d as any).id === effectiveDeviceId)?.name ?? '—'}
                </p>
              </div>
              <FeaturedDropdown
                devices={devices}
                selectedDeviceId={effectiveDeviceId}
                selectedField={featuredField}
                onSelect={(id, f) => { setFeaturedDeviceId(id); setFeaturedField(f); }}
              />
            </div>
            {featuredPoints.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-[13px] text-muted-foreground">
                {effectiveDeviceId ? 'No telemetry data for this field in 24h' : 'No devices registered'}
              </div>
            ) : (
              <LineChart
                series={[{ name: featuredField, data: featuredPoints, color: SERIES_COLORS[0] }]}
                height={220}
                showArea
              />
            )}
          </div>

          {/* Status donut — 1/3 */}
          <div className="bg-[hsl(var(--surface))] p-5 flex flex-col">
            <p className="eyebrow text-[9px] mb-4">Fleet Status</p>
            <div className="flex items-center justify-center flex-1 py-4">
              <Donut
                segments={[
                  { name: 'Online',  value: online,  color: '#22C55E' },
                  { name: 'Offline', value: offline, color: 'hsl(var(--muted-fg))' },
                ]}
                size={140}
                thickness={16}
                centerText={
                  <div className="text-center">
                    <p className="text-[22px] font-semibold text-foreground leading-none">{onlineRate}%</p>
                    <p className="text-[10px] text-muted-foreground mt-1 font-mono">online</p>
                  </div>
                }
              />
            </div>
            <div className="space-y-2 mt-2">
              {[
                { label: 'Online',  value: online,  color: '#22C55E' },
                { label: 'Offline', value: offline, color: 'hsl(var(--muted-fg))' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2" style={{ backgroundColor: color }} />
                    <span className="text-[12px] text-muted-foreground">{label}</span>
                  </div>
                  <span className="font-mono text-[12px] text-foreground">{value}</span>
                </div>
              ))}
              {byCategory.slice(0, 3).map((cat: any) => (
                <div key={cat._id} className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground capitalize">{cat._id}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{cat.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Section III — Fleet + Alerts ─────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 pb-3 mb-4 border-b border-[hsl(var(--rule))]">
          <span className="serif-i text-muted-foreground mr-2">№ III</span>
          <span className="eyebrow">Fleet</span>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-px bg-[hsl(var(--rule))] border border-[hsl(var(--rule))]">

          {/* Devices table — 2/3 */}
          <div className="xl:col-span-2 bg-[hsl(var(--surface))]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[hsl(var(--rule))]">
              <p className="eyebrow text-[9px]">Recent Devices</p>
              <Link to="/devices" className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                All devices <ArrowRight size={10} />
              </Link>
            </div>
            <div>
              {devices.length === 0 ? (
                <div className="py-12 text-center text-[13px] text-muted-foreground">No devices registered</div>
              ) : (
                devices.slice(0, 8).map((d: any) => {
                  const id = d._id ?? d.id;
                  const { Icon: DIcon, color: dc } = getCategoryIconInfo(d.category);
                  const isLive = liveIds.has(id);
                  const sp = sparkData(d);
                  return (
                    <Link
                      key={id}
                      to={`/devices/${id}`}
                      className="flex items-center gap-3 px-5 py-3 border-b border-[hsl(var(--rule)/0.5)] last:border-0 hover:bg-[hsl(var(--muted)/0.5)] transition-colors"
                    >
                      <span className={`w-1.5 h-1.5 flex-shrink-0 ${
                        d.status === 'online' ? 'bg-emerald-500' :
                        d.status === 'error'  ? 'bg-red-500'    : 'bg-muted-foreground/30'
                      } ${d.status === 'online' && isLive ? 'animate-pulse' : ''}`} />
                      <div className="w-6 h-6 flex items-center justify-center flex-shrink-0" style={{ color: dc }}>
                        <DIcon size={13} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-foreground truncate leading-tight">{d.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {d.lastSeenAt ? timeAgo(d.lastSeenAt) : 'Never'}
                        </p>
                      </div>
                      {sp.length > 2 && (
                        <div className="w-20 flex-shrink-0">
                          <Sparkline data={sp} color={dc} height={24} />
                        </div>
                      )}
                      <span className="text-[10px] font-mono text-muted-foreground uppercase flex-shrink-0">
                        {d.protocol}
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          {/* Active Alerts — 1/3 */}
          <div className="bg-[hsl(var(--surface))]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[hsl(var(--rule))]">
              <p className="eyebrow text-[9px]">Active Alerts</p>
              <Link to="/alerts" className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                All <ArrowRight size={10} />
              </Link>
            </div>
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center px-4">
                <CheckCircle2 size={18} className="text-emerald-500 mb-2" />
                <p className="text-[12px] font-medium text-foreground">All systems nominal</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">No active alerts</p>
              </div>
            ) : (
              alerts.slice(0, 6).map((a: any) => (
                <div
                  key={a._id ?? a.id}
                  className="flex items-start gap-3 px-5 py-3 border-b border-[hsl(var(--rule)/0.5)] last:border-0"
                >
                  <span className={`mt-1.5 flex-shrink-0 w-1.5 h-1.5 ${SEVERITY_COLOR[a.severity] ?? 'bg-blue-400'} ${a.severity === 'critical' ? 'animate-pulse' : ''}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-foreground truncate">{a.title ?? a.message}</p>
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{timeAgo(a.createdAt)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
