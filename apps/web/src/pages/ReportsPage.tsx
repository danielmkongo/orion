import { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, Plus, X, Printer } from 'lucide-react';
import { devicesApi } from '@/api/devices';
import { downloadCSV } from '@/lib/utils';

interface Device {
  _id: string;
  name: string;
  status: 'online' | 'offline' | 'idle' | 'error';
  category: string;
  battery?: number;
  lastSeenAt?: string;
}

interface SavedReport {
  id: string;
  title: string;
  range: string;
  devices: string[];
  metrics: string[];
  createdAt: string;
}

const METRICS = ['uptime', 'battery', 'events', 'alerts', 'telemetry'];
const RANGE_ITEMS = [
  { v: '24h', l: '24H' }, { v: '7d', l: '7D' }, { v: '30d', l: '30D' }, { v: '90d', l: '90D' },
];

function LocalLineChart({ data, height, color }: { data: { v: number }[]; height: number; color?: string }) {
  if (!data.length) return null;
  const min = Math.min(...data.map(d => d.v));
  const max = Math.max(...data.map(d => d.v));
  const range = max - min || 1;
  const pts = data.map((d, i) => ({
    x: (i / (data.length - 1)) * 100,
    y: ((max - d.v) / range) * 94 + 3,
  }));
  const T = 0.4;
  let linePath = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 2)], p1 = pts[i - 1], p2 = pts[i], p3 = pts[Math.min(pts.length - 1, i + 1)];
    const cp1x = p1.x + (p2.x - p0.x) * T, cp1y = p1.y + (p2.y - p0.y) * T;
    const cp2x = p2.x - (p3.x - p1.x) * T, cp2y = p2.y - (p3.y - p1.y) * T;
    linePath += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  const areaPath = `${linePath} L 100,100 L 0,100 Z`;
  const c = color || '#FF5B1F';
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      <path d={areaPath} fill={c} fillOpacity="0.08" />
      <path d={linePath} fill="none" stroke={c} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function ReportsPage() {
  const [range, setRange] = useState('7d');
  const [showNewReport, setShowNewReport] = useState(false);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);

  const [newTitle, setNewTitle]       = useState('');
  const [newRange, setNewRange]       = useState('7d');
  const [newDevices, setNewDevices]   = useState<string[]>([]);
  const [newMetrics, setNewMetrics]   = useState<string[]>(['uptime', 'battery']);
  const [allDevicesSel, setAllDevicesSel] = useState(true);

  const printRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['devices'],
    queryFn: () => devicesApi.list(),
  });

  const devices = (data?.devices ?? []) as unknown as Device[];

  const total    = devices.length;
  const online   = devices.filter(d => d.status === 'online').length;
  const uptime   = total > 0 ? Math.round((online / total) * 100) : 0;
  const avgBattery = total > 0 ? Math.round(devices.reduce((s, d) => s + (d.battery ?? 50), 0) / total) : 0;
  const incidents  = devices.filter(d => d.status === 'error').length;

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

  function toggleDevice(id: string) {
    setNewDevices(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
  }
  function toggleMetric(m: string) {
    setNewMetrics(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  }

  function saveReport() {
    if (!newTitle) return;
    setSavedReports(prev => [...prev, {
      id: crypto.randomUUID(),
      title: newTitle,
      range: newRange,
      devices: allDevicesSel ? [] : newDevices,
      metrics: newMetrics,
      createdAt: new Date().toISOString(),
    }]);
    setShowNewReport(false);
    setNewTitle(''); setNewRange('7d'); setNewDevices([]); setNewMetrics(['uptime', 'battery']); setAllDevicesSel(true);
  }

  function exportDeviceCSV(report?: SavedReport) {
    const targetDevices = report && !report.devices.length
      ? devices
      : report
        ? devices.filter(d => report.devices.includes(d._id))
        : devices;
    const rows = targetDevices.map(d => ({
      name:      d.name,
      status:    d.status,
      category:  d.category,
      battery:   d.battery ?? '—',
      lastSeen:  d.lastSeenAt ?? '—',
      uptime_pct: d.status === 'online' ? 100 : d.status === 'idle' ? 60 : 0,
    }));
    const fname = `orion-report-${report?.range ?? range}-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCSV(fname, rows);
  }

  function printReport(report?: SavedReport) {
    if (!printRef.current) return;
    const targetDevices = report && report.devices.length
      ? devices.filter(d => report.devices.includes(d._id))
      : devices;
    printRef.current.innerHTML = `
      <h1 style="font-family:serif;font-size:28px;margin-bottom:12px">${report?.title ?? 'Device Report'}</h1>
      <p style="font-size:13px;color:#666;margin-bottom:24px">Range: ${report?.range ?? range} · Generated ${new Date().toLocaleString()}</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="border-bottom:2px solid #000">
          <th style="text-align:left;padding:6px 8px">Device</th>
          <th style="text-align:left;padding:6px 8px">Status</th>
          <th style="text-align:left;padding:6px 8px">Category</th>
          <th style="text-align:left;padding:6px 8px">Battery</th>
        </tr></thead>
        <tbody>${targetDevices.map(d => `
          <tr style="border-bottom:1px solid #eee">
            <td style="padding:6px 8px">${d.name}</td>
            <td style="padding:6px 8px">${d.status}</td>
            <td style="padding:6px 8px">${d.category}</td>
            <td style="padding:6px 8px">${d.battery != null ? d.battery + '%' : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    window.print();
  }

  return (
    <div className="page">
      {/* ── Print zone (hidden except during print) ── */}
      <div id="orion-print-zone" ref={printRef} style={{ display: 'none' }} />

      {/* ── Page header ── */}
      <div className="ph">
        <div>
          <div className="eyebrow-row" style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'hsl(var(--muted-fg))', marginBottom: '6px' }}>
            <span className="eyebrow">Intelligence · Operational reports</span>
          </div>
          <h1><em>Reports</em>.</h1>
          <p className="lede">Scheduled and ad-hoc reports across your entire Orion platform. Export to PDF or CSV, or schedule an email digest.</p>
        </div>
        <div style={{ gridColumn: 3, display: 'flex', alignItems: 'flex-end', gap: '8px', paddingBottom: '20px' }}>
          <div className="seg">
            {RANGE_ITEMS.map(it => (
              <button key={it.v} className={range === it.v ? 'on' : ''} onClick={() => setRange(it.v)}>{it.l}</button>
            ))}
          </div>
          <button className="btn btn-sm" style={{ gap: '6px' }} onClick={() => exportDeviceCSV()}>
            <Download size={13} /> Export CSV
          </button>
          <button className="btn btn-primary btn-sm" style={{ gap: '6px' }} onClick={() => setShowNewReport(true)}>
            <Plus size={13} /> New report
          </button>
        </div>
      </div>

      {/* ── KPI ticker ── */}
      <div className="ticker">
        {([
          ['Platform uptime', `${uptime}%`, '+2.1%', '#0F7A3D'],
          ['Avg. battery', `${avgBattery}%`, '−3.4%', '#FACC15'],
          ['Ingested events', '1.24M', '+18%', '#FF5B1F'],
          ['Incidents · week', String(incidents), incidents > 0 ? `+${incidents}` : '0', '#0B0B0A'],
        ] as const).map(([k, v, c, color]) => (
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
          Ingestion<br />volume
        </div>
        <div>
          <p className="dim" style={{ fontSize: '13px', maxWidth: '48ch', marginBottom: '16px' }}>
            Events per hour across the entire platform over the selected window.
          </p>
          <LocalLineChart data={ingestSeries} height={240} color="#FF5B1F" />
        </div>
      </div>

      {/* ── Section II: By Category ── */}
      <div className="section">
        <div className="ssh">
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
                    background: i === 0 ? '#FF5B1F' : '#0B0B0A',
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
          Saved<br />reports
        </div>
        <div>
          {savedReports.length === 0 ? (
            <div className="panel" style={{ padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, marginBottom: 8 }}>
                No saved reports
              </div>
              <p className="dim" style={{ fontSize: 13, marginBottom: 16 }}>Create your first report using the "New report" button.</p>
              <button className="btn btn-primary btn-sm" style={{ gap: 6 }} onClick={() => setShowNewReport(true)}>
                <Plus size={13} /> New report
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
              {savedReports.map((r, i) => (
                <div
                  key={r.id}
                  className="report-card"
                  style={{
                    padding: '22px',
                    borderTop: '1px solid hsl(var(--border))',
                    borderRight: i % 2 === 0 ? '1px solid hsl(var(--border))' : 0,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span className="mono faint" style={{ fontSize: '10.5px' }}>REPORT {String(i + 1).padStart(2, '0')}</span>
                    <span className="tag">{r.range.toUpperCase()}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', lineHeight: 1.1 }}>{r.title}</div>
                  <p className="dim" style={{ fontSize: '13px', marginTop: '8px' }}>
                    {r.devices.length ? `${r.devices.length} device(s)` : 'All devices'} · {r.metrics.join(', ')}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                    <span className="mono faint" style={{ fontSize: '10.5px' }}>{new Date(r.createdAt).toLocaleString()}</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn btn-sm" style={{ gap: '6px' }} onClick={() => printReport(r)}>
                        <Printer size={12} /> PDF
                      </button>
                      <button className="btn btn-sm" style={{ gap: '6px' }} onClick={() => exportDeviceCSV(r)}>
                        <Download size={12} /> CSV
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── New Report Modal ── */}
      <AnimatePresence>
        {showNewReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000, padding: 16 }}
            onClick={() => setShowNewReport(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              onClick={e => e.stopPropagation()}
              className="panel"
              style={{ padding: 32, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', borderTop: '3px solid hsl(var(--primary))' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 24 }}>New <em>report</em></div>
                <button onClick={() => setShowNewReport(false)} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'hsl(var(--muted-fg))' }}><X size={16} /></button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Title */}
                <div>
                  <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Report title</label>
                  <input
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    className="input"
                    placeholder="Device health weekly, Energy consumption…"
                  />
                </div>

                {/* Range */}
                <div>
                  <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 8 }}>Date range</label>
                  <div className="seg">
                    {RANGE_ITEMS.map(it => (
                      <button key={it.v} className={newRange === it.v ? 'on' : ''} onClick={() => setNewRange(it.v)}>{it.l}</button>
                    ))}
                  </div>
                </div>

                {/* Devices */}
                <div>
                  <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 8 }}>Devices</label>
                  <div style={{ marginBottom: 8 }}>
                    <button
                      onClick={() => setAllDevicesSel(v => !v)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '5px 10px', border: '1px solid',
                        borderColor: allDevicesSel ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                        background: allDevicesSel ? 'hsl(var(--primary) / 0.1)' : 'transparent',
                        color: allDevicesSel ? 'hsl(var(--primary))' : 'hsl(var(--muted-fg))',
                        cursor: 'pointer', fontSize: 12,
                      }}
                    >
                      All devices
                    </button>
                  </div>
                  {!allDevicesSel && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {devices.map(d => (
                        <button
                          key={d._id}
                          onClick={() => toggleDevice(d._id)}
                          style={{
                            padding: '4px 10px', fontSize: 12, border: '1px solid',
                            borderColor: newDevices.includes(d._id) ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                            background: newDevices.includes(d._id) ? 'hsl(var(--primary) / 0.1)' : 'transparent',
                            color: newDevices.includes(d._id) ? 'hsl(var(--primary))' : 'hsl(var(--muted-fg))',
                            cursor: 'pointer',
                          }}
                        >
                          {d.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Metrics */}
                <div>
                  <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 8 }}>Metrics</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {METRICS.map(m => (
                      <button
                        key={m}
                        onClick={() => toggleMetric(m)}
                        style={{
                          padding: '4px 10px', fontSize: 12, textTransform: 'capitalize', border: '1px solid',
                          borderColor: newMetrics.includes(m) ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                          background: newMetrics.includes(m) ? 'hsl(var(--primary) / 0.1)' : 'transparent',
                          color: newMetrics.includes(m) ? 'hsl(var(--primary))' : 'hsl(var(--muted-fg))',
                          cursor: 'pointer',
                        }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 28, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowNewReport(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={!newTitle} onClick={saveReport}>
                  Save report
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
