import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Plus } from 'lucide-react';
import { devicesApi } from '@/api/devices';

function Seg({ value, onChange, items }: { value: string; onChange: (v: string) => void; items: Array<{ v: string; l: string }> }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        padding: '3px',
        border: '1px solid hsl(var(--border))',
        background: 'hsl(var(--surface))',
        borderRadius: 0,
      }}
    >
      {items.map((item) => (
        <button
          key={item.v}
          onClick={() => onChange(item.v)}
          style={{
            border: 0,
            background: value === item.v ? 'hsl(var(--fg))' : 'transparent',
            color: value === item.v ? 'hsl(var(--bg))' : 'hsl(var(--muted-fg))',
            padding: '5px 12px',
            fontFamily: 'var(--font-mono)',
            fontSize: '10.5px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          {item.l}
        </button>
      ))}
    </div>
  );
}

function LineChart({ series, height, colors }: { series: Array<{ name: string; data: Array<{ t: number; v: number }> }>; height: number; colors?: string[] }) {
  const data = series[0]?.data || [];
  if (data.length === 0) return null;

  const min = Math.min(...data.map((d) => d.v));
  const max = Math.max(...data.map((d) => d.v));
  const range = max - min || 1;
  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * 100,
    y: ((max - d.v) / range) * 100,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const color = colors?.[0] || 'hsl(var(--primary))';

  return (
    <svg
      viewBox="0 0 100 100"
      style={{ width: '100%', height, display: 'block' }}
      preserveAspectRatio="none"
    >
      <path d={pathD} stroke={color} strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function ReportsPage() {
  const [range, setRange] = useState('7d');

  const { data } = useQuery({
    queryKey: ['devices'],
    queryFn: () => devicesApi.list(),
  });

  const devices = data?.devices ?? [];

  // Calculate KPI stats
  const total = devices.length;
  const online = devices.filter((d) => d.status === 'online').length;
  const uptime = total > 0 ? Math.round((online / total) * 100) : 0;
  const avgBattery = total > 0 ? Math.round(devices.reduce((s, d: any) => s + (d.battery || 50), 0) / total) : 0;

  // Mock ingestion series
  const ingestSeries = useMemo(() => {
    return Array.from({ length: 168 }, (_, i) => ({
      t: i,
      v: Math.abs(Math.sin(i / 10) * 2000) + 8000,
    }));
  }, []);

  // Category breakdown
  const catBreakdown = useMemo(() => {
    const cats = devices.reduce(
      (m, d: any) => {
        m[d.category || 'uncategorized'] = (m[d.category || 'uncategorized'] || 0) + 1;
        return m;
      },
      {} as Record<string, number>
    );
    return Object.entries(cats).map(([k, v]) => ({ cat: k, count: v }));
  }, [devices]);

  const maxCatCount = Math.max(...catBreakdown.map((c) => c.count), 1);

  // Saved reports
  const reports = [
    {
      title: 'Fleet health weekly',
      sub: 'Uptime, battery, firmware drift across all devices.',
      author: 'Auto · every Mon 09:00',
      pages: 12,
    },
    {
      title: 'Energy consumption · Dakar',
      sub: 'Aggregated kWh by meter and by hour.',
      author: 'A. Diallo · 2 days ago',
      pages: 8,
    },
    {
      title: 'Asset tracker incidents',
      sub: 'Geo-fence exits, idle spikes, and recoveries.',
      author: 'Auto · every Fri 18:00',
      pages: 5,
    },
    {
      title: 'Cold-chain compliance',
      sub: 'Temperature excursions across Pharma-A cohort.',
      author: 'M. Sarr · last week',
      pages: 22,
    },
  ];

  return (
    <div style={{ padding: '40px 48px 80px', maxWidth: '1560px', margin: '0 auto' }}>
      {/* Page Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          alignItems: 'flex-end',
          gap: '24px',
          paddingBottom: '20px',
          borderBottom: '1px solid hsl(var(--border))',
          marginBottom: '28px',
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              color: 'hsl(var(--muted-fg))',
              marginBottom: '6px',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10.5px',
                fontWeight: 500,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
              }}
            >
              Intelligence · Operational reports
            </span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '64px', lineHeight: 0.92, letterSpacing: '-0.035em', marginTop: '6px' }}>
            <em style={{ fontStyle: 'italic', color: 'hsl(var(--primary))' }}>Reports</em>.
          </h1>
          <p style={{ fontSize: '15px', color: 'hsl(var(--muted-fg))', maxWidth: '56ch', marginTop: '10px' }}>
            Scheduled and ad-hoc reports across your entire Orion fleet. Export to PDF or Excel, or schedule an email digest.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Seg value={range} onChange={setRange} items={[{ v: '24h', l: '24H' }, { v: '7d', l: '7D' }, { v: '30d', l: '30D' }, { v: '90d', l: '90D' }]} />
          <button
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              height: '36px',
              padding: '0 14px',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              fontWeight: 500,
              border: '1px solid hsl(var(--border))',
              background: 'hsl(var(--surface))',
              color: 'hsl(var(--fg))',
              cursor: 'pointer',
            }}
          >
            <Download width="14" height="14" /> Export
          </button>
          <button
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              height: '36px',
              padding: '0 14px',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              fontWeight: 500,
              border: '1px solid hsl(var(--primary))',
              background: 'hsl(var(--primary))',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            <Plus width="14" height="14" /> New report
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '1px solid hsl(var(--border))' }}>
        {[
          ['Fleet uptime', uptime + '%', '+2.1%', 'hsl(var(--good))'],
          ['Avg. battery', avgBattery + '%', '−3.4%', 'hsl(var(--warn))'],
          ['Ingested events', '1.24M', '+18%', 'hsl(var(--primary))'],
          ['Incidents · week', devices.length, '−1', 'hsl(var(--fg))'],
        ].map(([k, v, c, color], i) => (
          <div
            key={k as string}
            style={{
              padding: '20px 22px 20px 0',
              borderRight: i < 3 ? '1px solid hsl(var(--border))' : 0,
              paddingLeft: i === 0 ? 0 : 22,
              borderBottom: '1px solid hsl(var(--border))',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10.5px',
                fontWeight: 500,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'hsl(var(--muted-fg))',
              }}
            >
              {k as string}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginTop: '8px',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '44px',
                  lineHeight: 1,
                  letterSpacing: '-0.03em',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {v as string}
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: color as string,
                }}
              >
                {c as string}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Section I: Ingestion Volume */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '220px 1fr',
          gap: '28px',
          padding: '28px 0',
          borderTop: '1px solid hsl(var(--border))',
        }}
      >
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '28px', lineHeight: 1, letterSpacing: '-0.02em' }}>
            <span
              style={{
                display: 'block',
                fontFamily: 'var(--font-mono)',
                fontSize: '10.5px',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'hsl(var(--muted-fg))',
                marginBottom: '10px',
                fontWeight: 500,
              }}
            >
              № I
            </span>
            Ingestion volume
          </div>
          <p
            style={{
              fontSize: '13px',
              color: 'hsl(var(--muted-fg))',
              maxWidth: '28ch',
              marginTop: '8px',
            }}
          >
            Events per hour across the entire platform over the selected window.
          </p>
        </div>
        <div>
          <LineChart series={[{ name: 'events/h', data: ingestSeries }]} height={260} colors={['hsl(var(--primary))']} />
        </div>
      </div>

      {/* Section II: By Category */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '220px 1fr',
          gap: '28px',
          padding: '28px 0',
          borderTop: '1px solid hsl(var(--border))',
        }}
      >
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '28px', lineHeight: 1, letterSpacing: '-0.02em' }}>
            <span
              style={{
                display: 'block',
                fontFamily: 'var(--font-mono)',
                fontSize: '10.5px',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'hsl(var(--muted-fg))',
                marginBottom: '10px',
                fontWeight: 500,
              }}
            >
              № II
            </span>
            By category
          </div>
          <p
            style={{
              fontSize: '13px',
              color: 'hsl(var(--muted-fg))',
              maxWidth: '28ch',
              marginTop: '8px',
            }}
          >
            Events ingested and device count per category.
          </p>
        </div>
        <div>
          {catBreakdown.map(({ cat, count }, i) => (
            <div key={cat} style={{ padding: '10px 0', borderBottom: '1px solid hsl(var(--border-strong))' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '4px',
                }}
              >
                <span style={{ fontSize: '13px', textTransform: 'capitalize' }}>{cat}</span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    color: 'hsl(var(--muted-fg))',
                  }}
                >
                  {count} {count === 1 ? 'device' : 'devices'}
                </span>
              </div>
              <div style={{ height: '6px', background: 'hsl(var(--border-strong)))', position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: (count / maxCatCount) * 100 + '%',
                    background: i === 0 ? 'hsl(var(--primary))' : 'hsl(var(--fg))',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section III: Saved Reports */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '220px 1fr',
          gap: '28px',
          padding: '28px 0',
          borderTop: '1px solid hsl(var(--border))',
        }}
      >
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '28px', lineHeight: 1, letterSpacing: '-0.02em' }}>
            <span
              style={{
                display: 'block',
                fontFamily: 'var(--font-mono)',
                fontSize: '10.5px',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'hsl(var(--muted-fg))',
                marginBottom: '10px',
                fontWeight: 500,
              }}
            >
              № III
            </span>
            Saved reports
          </div>
          <p
            style={{
              fontSize: '13px',
              color: 'hsl(var(--muted-fg))',
              maxWidth: '28ch',
              marginTop: '8px',
            }}
          >
            Scheduled and custom reports. Click to open the generator.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
          {reports.map((r, i) => (
            <div
              key={i}
              style={{
                padding: '22px',
                borderTop: '1px solid hsl(var(--border))',
                borderRight: i % 2 === 0 ? '1px solid hsl(var(--border))' : 0,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'hsl(var(--surface-raised))')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10.5px',
                    color: 'hsl(var(--muted-fg))',
                  }}
                >
                  REPORT № {String(i + 1).padStart(2, '0')}
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '10.5px',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    padding: '3px 8px',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 0,
                    color: 'hsl(var(--muted-fg))',
                  }}
                >
                  {r.pages}pp
                </span>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '24px', lineHeight: 1.1 }}>
                {r.title}
              </div>
              <p
                style={{
                  fontSize: '13px',
                  color: 'hsl(var(--muted-fg))',
                  marginTop: '8px',
                }}
              >
                {r.sub}
              </p>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '16px',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10.5px',
                    color: 'hsl(var(--muted-fg))',
                  }}
                >
                  {r.author}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      height: '30px',
                      padding: '0 10px',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '12px',
                      fontWeight: 500,
                      border: '1px solid hsl(var(--border))',
                      background: 'transparent',
                      color: 'hsl(var(--fg))',
                      cursor: 'pointer',
                    }}
                  >
                    <Download width="12" height="12" /> PDF
                  </button>
                  <button
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      height: '30px',
                      padding: '0 10px',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '12px',
                      fontWeight: 500,
                      border: '1px solid hsl(var(--border))',
                      background: 'transparent',
                      color: 'hsl(var(--fg))',
                      cursor: 'pointer',
                    }}
                  >
                    <Download width="12" height="12" /> XLSX
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
