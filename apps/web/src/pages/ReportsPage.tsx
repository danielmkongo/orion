import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Plus } from 'lucide-react';
import { devicesApi } from '@/api/devices';

interface Device {
  _id: string;
  status: 'online' | 'offline' | 'idle' | 'error';
  category: string;
  battery?: number;
}

function LineChart({ data, height, color }: { data: { v: number }[]; height: number; color?: string }) {
  if (!data.length) return null;
  const min = Math.min(...data.map(d => d.v));
  const max = Math.max(...data.map(d => d.v));
  const range = max - min || 1;
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * 100},${((max - d.v) / range) * 94 + 3}`).join(' ');
  const fill = `${pts} 100,100 0,100`;
  const c = color || 'hsl(var(--primary))';
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      <polygon points={fill} fill={c} fillOpacity="0.08" />
      <polyline points={pts} fill="none" stroke={c} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function ReportsPage() {
  const [range, setRange] = useState('7d');

  const { data } = useQuery({
    queryKey: ['devices'],
    queryFn: () => devicesApi.list(),
  });

  const devices = (data?.devices ?? []) as unknown as Device[];

  const total = devices.length;
  const online = devices.filter(d => d.status === 'online').length;
  const uptime = total > 0 ? Math.round((online / total) * 100) : 0;
  const avgBattery = total > 0 ? Math.round(devices.reduce((s, d) => s + (d.battery ?? 50), 0) / total) : 0;
  const incidents = devices.filter(d => d.status === 'error').length;

  const ingestSeries = useMemo(() =>
    Array.from({ length: 120 }, (_, i) => ({
      v: Math.abs(Math.sin(i / 10) * 2200 + Math.cos(i / 7) * 800) + 7500,
    })), []);

  const catBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    devices.forEach(d => { map[d.category || 'other'] = (map[d.category || 'other'] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [devices]);

  const maxCount = Math.max(...catBreakdown.map(([, v]) => v), 1);

  const REPORTS = [
    { title: 'Fleet health weekly', sub: 'Uptime, battery, firmware drift across all devices.', author: 'Auto · every Mon 09:00', pages: 12 },
    { title: 'Energy consumption', sub: 'Aggregated kWh by meter and by hour.', author: 'Auto · 2 days ago', pages: 8 },
    { title: 'Asset tracker incidents', sub: 'Geo-fence exits, idle spikes, and recoveries.', author: 'Auto · every Fri 18:00', pages: 5 },
    { title: 'Cold-chain compliance', sub: 'Temperature excursions across Pharma-A cohort.', author: 'M. Sarr · last week', pages: 22 },
  ];

  const RANGE_ITEMS = [
    { v: '24h', l: '24H' }, { v: '7d', l: '7D' }, { v: '30d', l: '30D' }, { v: '90d', l: '90D' },
  ];

  return (
    <div className="page">
      {/* ── Page header ── */}
      <div className="ph">
        <div>
          <div className="eyebrow-row" style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'hsl(var(--muted-fg))', marginBottom: '6px' }}>
            <span className="eyebrow">Intelligence · Operational reports</span>
          </div>
          <h1><em>Reports</em>.</h1>
          <p className="lede">Scheduled and ad-hoc reports across your entire Orion fleet. Export to PDF or Excel, or schedule an email digest.</p>
        </div>
        <div style={{ gridColumn: 3, display: 'flex', alignItems: 'flex-end', gap: '8px', paddingBottom: '20px' }}>
          <div className="seg">
            {RANGE_ITEMS.map(it => (
              <button key={it.v} className={range === it.v ? 'on' : ''} onClick={() => setRange(it.v)}>{it.l}</button>
            ))}
          </div>
          <button className="btn btn-sm" style={{ gap: '6px' }}><Download size={13} /> Export</button>
          <button className="btn btn-primary btn-sm" style={{ gap: '6px' }}><Plus size={13} /> New report</button>
        </div>
      </div>

      {/* ── KPI ticker ── */}
      <div className="ticker">
        {([
          ['Fleet uptime', `${uptime}%`, '+2.1%', 'hsl(var(--good))'],
          ['Avg. battery', `${avgBattery}%`, '−3.4%', 'hsl(var(--warn))'],
          ['Ingested events', '1.24M', '+18%', 'hsl(var(--primary))'],
          ['Incidents · week', incidents, '−1', 'hsl(var(--fg))'],
        ] as const).map(([k, v, c, color], i) => (
          <div key={k}>
            <div className="eyebrow">{k}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '8px' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '44px', lineHeight: 1, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums' }}>
                {v}
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color }}>{c}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Section I: Ingestion Volume ── */}
      <div className="section">
        <div className="ssh">
          <span className="no">№ I</span>
          Ingestion<br />volume
        </div>
        <div>
          <p className="dim" style={{ fontSize: '13px', maxWidth: '48ch', marginBottom: '16px' }}>
            Events per hour across the entire platform over the selected window.
          </p>
          <LineChart data={ingestSeries} height={240} color="hsl(var(--primary))" />
        </div>
      </div>

      {/* ── Section II: By Category ── */}
      <div className="section">
        <div className="ssh">
          <span className="no">№ II</span>
          By<br />category
        </div>
        <div>
          <p className="dim" style={{ fontSize: '13px', maxWidth: '48ch', marginBottom: '16px' }}>
            Device count per category.
          </p>
          {catBreakdown.length === 0 ? (
            <p className="dim" style={{ fontSize: '13px' }}>No device data available.</p>
          ) : (
            catBreakdown.map(([cat, count], i) => (
              <div key={cat} style={{ padding: '10px 0', borderBottom: '1px solid hsl(var(--border))' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', textTransform: 'capitalize' }}>{cat}</span>
                  <span className="mono faint" style={{ fontSize: '11px' }}>{count} {count === 1 ? 'device' : 'devices'}</span>
                </div>
                <div style={{ height: '5px', background: 'hsl(var(--surface-raised))', position: 'relative' }}>
                  <div style={{
                    position: 'absolute', inset: 0,
                    width: `${(count / maxCount) * 100}%`,
                    background: i === 0 ? 'hsl(var(--primary))' : 'hsl(var(--fg))',
                    transition: 'width 0.6s ease',
                  }} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Section III: Saved Reports ── */}
      <div className="section">
        <div className="ssh">
          <span className="no">№ III</span>
          Saved<br />reports
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
          {REPORTS.map((r, i) => (
            <div
              key={i}
              className="report-card"
              style={{
                padding: '22px',
                borderTop: '1px solid hsl(var(--border))',
                borderRight: i % 2 === 0 ? '1px solid hsl(var(--border))' : 0,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span className="mono faint" style={{ fontSize: '10.5px' }}>REPORT № {String(i + 1).padStart(2, '0')}</span>
                <span className="tag">{r.pages}pp</span>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', lineHeight: 1.1 }}>{r.title}</div>
              <p className="dim" style={{ fontSize: '13px', marginTop: '8px' }}>{r.sub}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                <span className="mono faint" style={{ fontSize: '10.5px' }}>{r.author}</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className="btn btn-sm btn-outline" style={{ gap: '6px' }}><Download size={12} /> PDF</button>
                  <button className="btn btn-sm btn-outline" style={{ gap: '6px' }}><Download size={12} /> XLSX</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
