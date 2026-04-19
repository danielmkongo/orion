import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import apiClient from '@/api/client';
import { devicesApi } from '@/api/devices';
import { telemetryApi } from '@/api/telemetry';
import { timeAgo, getCategoryIconInfo } from '@/lib/utils';
import { LineChart, Donut, Sparkline } from '@/components/charts/Charts';
import { useSocket } from '@/hooks/useSocket';
import { useAuthStore } from '@/store/auth.store';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { on } = useSocket();
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set());
  const [featuredDeviceId, setFeaturedDeviceId] = useState('');
  const [featuredField, setFeaturedField] = useState('temperature');
  const [range, setRange] = useState('24h');

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

  const devices = devicesData?.devices ?? [];
  const total = stats?.total ?? 0;
  const online = stats?.online ?? 0;
  const offline = stats?.offline ?? 0;
  const byCategory = stats?.byCategory ?? [];
  const activeAlerts = alertsData?.total ?? 0;
  const alerts = alertsData?.alerts ?? alertsData?.data ?? [];
  const onlineRate = total > 0 ? Math.round((online / total) * 100) : 0;

  const defaultDeviceId = (devices[0] as any)?._id ?? (devices[0] as any)?.id ?? '';
  const effectiveDeviceId = featuredDeviceId || defaultDeviceId;

  const { data: featuredLatest } = useQuery({
    queryKey: ['telemetry', 'latest', effectiveDeviceId],
    queryFn: () => telemetryApi.latest(effectiveDeviceId),
    enabled: !!effectiveDeviceId,
    refetchInterval: 30_000,
  });

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
  const to = new Date().toISOString();

  const { data: featuredSeries } = useQuery({
    queryKey: ['series', effectiveDeviceId, featuredField, '24h'],
    queryFn: () => telemetryApi.series(effectiveDeviceId, featuredField, from, to, 300),
    enabled: !!effectiveDeviceId && !!featuredField,
    refetchInterval: 60_000,
  });

  const featuredPoints = (featuredSeries?.data ?? []).map((p: any) => ({
    ts: typeof p.ts === 'string' ? new Date(p.ts).getTime() : p.ts,
    value: typeof p.value === 'number' ? p.value : 0,
  }));

  function sparkData(d: any): number[] {
    return Array.from({ length: 12 }, (_, i) =>
      30 + Math.sin(i + (d.name?.charCodeAt(0) ?? 0)) * 8 + Math.cos(i / 2) * 4
    );
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

  const catColors = ['#FF5B1F', '#0B0B0A', '#3B82F6', '#0F7A3D', '#FACC15', '#8B5CF6', '#14B8A6'];

  return (
    <div className="page">
      {/* ── Page header ── */}
      <div className="ph">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <span className="eyebrow">Orion · Device Intelligence Platform</span>
            <span className="dot dot-online pulse" style={{ color: 'hsl(var(--good))' }} />
            <span className="mono faint" style={{ fontSize: '11px' }}>Live · real-time</span>
          </div>
          <h1>{greeting()}, <em>{user?.name?.split(' ')[0] ?? 'there'}</em>.</h1>
          <p className="lede">
            {total} device{total !== 1 ? 's' : ''} across {byCategory.length} categories reporting. Platform health <strong style={{ color: 'hsl(var(--fg))' }}>{onlineRate}%</strong>.
            {activeAlerts > 0 && ` ${activeAlerts} alert${activeAlerts !== 1 ? 's' : ''} require attention.`}
          </p>
        </div>
        <div className="meta hide-sm">
          <div>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
          <div>Edition · Engineering</div>
          <div><strong>orion.vortan.io</strong></div>
        </div>
      </div>

      {/* ── Ticker ── */}
      <div className="ticker">
        <div>
          <div className="eyebrow">Total devices</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', alignItems: 'flex-end' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '56px', lineHeight: 0.95, letterSpacing: '-0.035em', fontVariantNumeric: 'tabular-nums' }}>
              {total}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 6px)', gap: '3px', paddingBottom: '6px' }}>
              {(devices as any[]).map((d, i) => (
                <span key={i} style={{ width: '6px', height: '6px', background: d.status === 'online' ? 'hsl(var(--fg))' : d.status === 'error' ? 'hsl(var(--bad))' : d.status === 'idle' ? 'hsl(var(--warn))' : 'hsl(var(--border))' }} />
              ))}
            </div>
          </div>
          <div className="mono faint" style={{ fontSize: '11px', marginTop: '4px' }}>{byCategory.length} categories</div>
        </div>

        <div>
          <div className="eyebrow">Online now</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', alignItems: 'flex-end' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '56px', lineHeight: 0.95, letterSpacing: '-0.035em', fontVariantNumeric: 'tabular-nums' }}>
              <em style={{ fontStyle: 'italic', color: 'hsl(var(--primary))' }}>{online}</em>
              <span style={{ fontSize: '24px', color: 'hsl(var(--muted-fg))' }}>/{total}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingBottom: '8px' }}>
              <div style={{ width: '60px', height: '6px', background: 'hsl(var(--surface-raised))', position: 'relative' }}>
                <div style={{ position: 'absolute', inset: 0, width: `${onlineRate}%`, background: 'hsl(var(--primary))' }} />
              </div>
              <span className="mono" style={{ fontSize: '11px', color: 'hsl(var(--primary))' }}>{onlineRate}%</span>
            </div>
          </div>
          <div className="mono faint" style={{ fontSize: '11px', marginTop: '4px' }}>online rate · live</div>
        </div>

        <div>
          <div className="eyebrow">Offline / idle</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '56px', lineHeight: 0.95, letterSpacing: '-0.035em', marginTop: '8px', fontVariantNumeric: 'tabular-nums' }}>
            {offline}
          </div>
          <div className="mono faint" style={{ fontSize: '11px', marginTop: '4px' }}>{offline > 0 ? 'Needs attention' : 'All healthy'}</div>
        </div>

        <div>
          <div className="eyebrow">Active alerts</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '56px', lineHeight: 0.95, letterSpacing: '-0.035em', marginTop: '8px', color: activeAlerts > 0 ? 'hsl(var(--primary))' : 'inherit', fontVariantNumeric: 'tabular-nums' }}>
            {activeAlerts}
          </div>
          <div className="mono faint" style={{ fontSize: '11px', marginTop: '4px' }}>{activeAlerts > 0 ? 'Requires review' : 'All clear'}</div>
        </div>
      </div>

      {/* ── Featured chart + category donut ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 0, marginTop: '32px', borderTop: '1px solid hsl(var(--fg))' }}>
        {/* Chart — 2/3 */}
        <div style={{ padding: '24px 24px 24px 0', borderRight: '1px solid hsl(var(--border))' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div className="eyebrow">Featured telemetry</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '28px', lineHeight: 1, marginTop: '4px', textTransform: 'capitalize' }}>
                {(devices as any[]).find(d => (d._id ?? d.id) === effectiveDeviceId)?.name ?? 'Select a device'}{' '}
                <span style={{ fontStyle: 'italic', color: 'hsl(var(--primary))' }}>· 24 hours</span>
              </div>
            </div>
            <div className="seg">
              {['1H', '6H', '24H', '7D'].map(l => (
                <button key={l} className={range === l.toLowerCase() ? 'on' : ''} onClick={() => setRange(l.toLowerCase())}>{l}</button>
              ))}
            </div>
          </div>
          {featuredPoints.length === 0 ? (
            <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--muted-fg))', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
              {effectiveDeviceId ? 'No telemetry data for this field' : 'No devices registered'}
            </div>
          ) : (
            <LineChart series={[{ name: featuredField, data: featuredPoints, color: 'hsl(var(--primary))' }]} height={260} showArea />
          )}
          <div style={{ display: 'flex', gap: '16px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid hsl(var(--border))' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '2px', background: 'hsl(var(--primary))' }} />
              <span className="mono" style={{ fontSize: '11px' }}>{featuredField}</span>
            </div>
          </div>
        </div>

        {/* Category donut — 1/3 */}
        <div style={{ padding: '24px 0 24px 24px' }}>
          <div className="eyebrow" style={{ marginBottom: '12px' }}>Devices by category</div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            <Donut
              segments={byCategory.slice(0, 6).map((c: any, i: number) => ({ name: c._id, value: c.count, color: catColors[i % catColors.length] }))}
              size={130}
              thickness={14}
              centerText={
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '26px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{total}</div>
                  <div className="mono faint" style={{ fontSize: '10px', marginTop: '2px' }}>devices</div>
                </div>
              }
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
              {byCategory.slice(0, 6).map((c: any, i: number) => (
                <div key={c._id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', background: catColors[i % catColors.length] }} />
                    <span style={{ textTransform: 'capitalize' }}>{c._id}</span>
                  </span>
                  <span className="mono faint">{c.count}</span>
                </div>
              ))}
            </div>
          </div>

          <hr className="hr" style={{ margin: '20px 0' }} />

          <div className="eyebrow" style={{ marginBottom: '12px' }}>Active alerts</div>
          {alerts.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'hsl(var(--good))', fontSize: '13px' }}>
              <CheckCircle2 size={14} /> All clear
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {(alerts as any[]).slice(0, 4).map(a => (
                <div key={a._id ?? a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: '1px solid hsl(var(--border))' }}>
                  <span className={`dot ${a.severity === 'critical' || a.severity === 'error' ? 'dot-error' : a.severity === 'warning' ? 'dot-warn' : 'dot-info'}`} style={{ marginTop: '5px' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px' }}>{a.title ?? a.message}</div>
                    <div className="mono faint" style={{ fontSize: '10.5px', marginTop: '2px' }}>{a.device ?? a.deviceId} · {timeAgo(a.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Section IV: Recent devices ── */}
      <div className="section">
        <div>
          <div className="ssh">Recent devices</div>
          <p className="dim" style={{ fontSize: '13px', maxWidth: '28ch', marginTop: '8px' }}>
            Last-seen, category, signal. Click a row for the full device dossier.
          </p>
          <Link to="/devices" className="btn btn-sm" style={{ marginTop: '12px', gap: '6px', display: 'inline-flex' }}>
            All devices <ArrowRight size={12} />
          </Link>
        </div>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '36px' }}>№</th>
                <th>Device</th>
                <th className="hide-sm">Category</th>
                <th>Status</th>
                <th className="hide-sm">Last 24h</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {(devices as any[]).slice(0, 8).map((d, i) => {
                const id = d._id ?? d.id;
                const isLive = liveIds.has(id);
                const sp = sparkData(d);
                const { Icon: DIcon, color: dc } = getCategoryIconInfo(d.category);
                return (
                  <tr key={id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/devices/${id}`)}>
                    <td className="row-n">{String(i + 1).padStart(2, '0')}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <DIcon size={12} style={{ color: dc, flexShrink: 0 }} />
                          <span style={{ fontSize: '13.5px', fontWeight: 500 }}>{d.name}</span>
                        </div>
                        <span className="mono faint" style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{d.category}</span>
                      </div>
                    </td>
                    <td className="hide-sm dim" style={{ fontSize: '12.5px', textTransform: 'capitalize' }}>{d.category}</td>
                    <td>
                      <span className={`tag tag-${d.status === 'idle' ? 'warn' : d.status === 'online' ? 'online' : d.status === 'error' ? 'error' : 'offline'}`}>
                        <span className={`dot dot-${d.status === 'idle' ? 'warn' : d.status}`} />
                        {d.status}
                      </span>
                    </td>
                    <td className="hide-sm" style={{ width: '120px' }}>
                      {sp.length > 2 && (
                        <Sparkline
                          data={sp}
                          color={d.status === 'error' ? 'hsl(var(--bad))' : d.status === 'online' ? 'hsl(var(--primary))' : 'hsl(var(--muted-fg))'}
                          height={28}
                        />
                      )}
                    </td>
                    <td className="mono" style={{ fontSize: '11.5px', color: 'hsl(var(--muted-fg))' }}>
                      {d.lastSeenAt ? timeAgo(d.lastSeenAt) : 'Never'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
