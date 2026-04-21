import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, Plus, X, Printer, Trash2 } from 'lucide-react';
import { devicesApi } from '@/api/devices';
import { downloadXLSX } from '@/lib/utils';
import toast from 'react-hot-toast';

interface Device {
  _id: string;
  name: string;
  status: 'online' | 'offline' | 'idle' | 'error';
  category: string;
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

const METRICS = ['uptime', 'error_rate', 'events', 'alerts', 'telemetry'];
const RANGE_ITEMS = [
  { v: '24h', l: '24H' }, { v: '7d', l: '7D' }, { v: '30d', l: '30D' }, { v: '90d', l: '90D' },
];

export function ReportsPage() {
  const [range, setRange] = useState('7d');
  const [showNewReport, setShowNewReport] = useState(false);
  const [savedReports, setSavedReports] = useState<SavedReport[]>(() => {
    try { return JSON.parse(localStorage.getItem('orion_saved_reports') ?? '[]'); } catch { return []; }
  });
  const [xlsxPreview, setXlsxPreview] = useState<{ report?: SavedReport; rows: Record<string, unknown>[] } | null>(null);

  const [newTitle, setNewTitle]       = useState('');
  const [newRange, setNewRange]       = useState('7d');
  const [newDevices, setNewDevices]   = useState<string[]>([]);
  const [newMetrics, setNewMetrics]   = useState<string[]>(['uptime', 'error_rate']);
  const [allDevicesSel, setAllDevicesSel] = useState(true);

  const { data } = useQuery({
    queryKey: ['devices'],
    queryFn: () => devicesApi.list(),
  });

  const devices = (data?.devices ?? []) as unknown as Device[];

  const total    = devices.length;
  const online   = devices.filter(d => d.status === 'online').length;
  const uptime   = total > 0 ? Math.round((online / total) * 100) : 0;
  const incidents  = devices.filter(d => d.status === 'error').length;
  const errorRate  = total > 0 ? Math.round((incidents / total) * 100) : 0;

  const hasDevices = total > 0;

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
    const next = [...savedReports, {
      id: (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`),
      title: newTitle,
      range: newRange,
      devices: allDevicesSel ? [] : newDevices,
      metrics: newMetrics,
      createdAt: new Date().toISOString(),
    }];
    setSavedReports(next);
    localStorage.setItem('orion_saved_reports', JSON.stringify(next));
    setShowNewReport(false);
    setNewTitle(''); setNewRange('7d'); setNewDevices([]); setNewMetrics(['uptime', 'error_rate']); setAllDevicesSel(true);
  }

  function deleteReport(id: string) {
    const next = savedReports.filter(r => r.id !== id);
    setSavedReports(next);
    localStorage.setItem('orion_saved_reports', JSON.stringify(next));
  }

  function exportDeviceXLSX(report?: SavedReport) {
    const targetDevices = report && !report.devices.length
      ? devices
      : report
        ? devices.filter(d => report.devices.includes(d._id))
        : devices;
    const rows = targetDevices.map(d => ({
      name:         d.name,
      status:       d.status,
      category:     d.category,
      estimated_uptime: d.status === 'online' ? '100%' : d.status === 'idle' ? '~60%' : '0%',
      is_error:     d.status === 'error' ? 'Yes' : 'No',
      last_seen:    d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : '—',
    }));
    setXlsxPreview({ report, rows });
  }

  async function confirmXLSXDownload() {
    if (!xlsxPreview) return;
    const { report, rows } = xlsxPreview;
    const dateStr = new Date().toISOString().slice(0, 10);
    const title = report?.title ?? `Orion Device Report · ${report?.range ?? range}`;
    const summaryRows = [
      { metric: 'Platform uptime',  value: `${uptime}%`,    note: 'Percentage of fleet currently online' },
      { metric: 'Error rate',       value: `${errorRate}%`, note: 'Percentage of fleet in error state' },
      { metric: 'Devices online',   value: online,           note: '' },
      { metric: 'Devices total',    value: total,            note: '' },
      { metric: 'Incidents',        value: incidents,        note: '' },
      { metric: 'Generated',        value: new Date().toLocaleString(), note: '' },
      { metric: 'Range',            value: report?.range ?? range, note: '' },
    ];
    const catRows = catBreakdown.map(([cat, count]) => ({
      category: cat, count,
      pct_of_fleet: total > 0 ? `${Math.round((count / total) * 100)}%` : '—',
    }));
    await downloadXLSX(`orion-report-${dateStr}`, [
      { name: 'Summary',     rows: summaryRows, colWidths: { metric: 22, value: 18, note: 46 } },
      { name: 'Devices',     rows,              colWidths: { name: 28, status: 12, category: 18, estimated_uptime: 16, is_error: 10, last_seen: 24 } },
      { name: 'By Category', rows: catRows,     colWidths: { category: 22, count: 10, pct_of_fleet: 16 } },
    ], { title, generatedBy: 'Orion Platform' });
    setXlsxPreview(null);
  }

  function printReport(report?: SavedReport) {
    const targetDevices = report && report.devices.length
      ? devices.filter(d => report.devices.includes(d._id))
      : devices;

    const statusStyle: Record<string, string> = {
      online:  'background:#0a2e1a;color:#4ade80;border:1px solid #166534',
      offline: 'background:#1a1a1a;color:#9ca3af;border:1px solid #374151',
      idle:    'background:#2a1f00;color:#fbbf24;border:1px solid #854d0e',
      error:   'background:#2a0a0a;color:#f87171;border:1px solid #991b1b',
    };

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${report?.title ?? 'Device Report'}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',system-ui,sans-serif;background:#0B0B0A;color:#EDEDED;font-size:13px;min-height:100vh}
    .page{max-width:960px;margin:0 auto;padding:48px 40px}
    /* Header */
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:48px;padding-bottom:24px;border-bottom:1px solid #1e1e1e}
    .wordmark{font-size:22px;font-weight:800;letter-spacing:-.04em;color:#FF5B1F}
    .meta-right{text-align:right;font-family:'JetBrains Mono',monospace;font-size:10px;color:#555;line-height:1.8}
    /* Title */
    h1{font-size:40px;font-weight:800;letter-spacing:-.04em;line-height:1;margin-bottom:6px}
    h1 em{color:#FF5B1F;font-style:italic}
    .subtitle{font-size:13px;color:#666;margin-bottom:40px}
    /* KPIs */
    .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid #1e1e1e;margin-bottom:48px}
    .kpi{padding:20px 24px;border-right:1px solid #1e1e1e}
    .kpi:last-child{border-right:none}
    .kpi-label{font-family:'JetBrains Mono',monospace;font-size:9px;text-transform:uppercase;letter-spacing:.14em;color:#555;margin-bottom:8px}
    .kpi-value{font-size:40px;font-weight:800;letter-spacing:-.03em;line-height:1}
    .kpi-unit{font-family:'JetBrains Mono',monospace;font-size:18px;opacity:.7}
    /* Section */
    .section-label{font-family:'JetBrains Mono',monospace;font-size:9px;text-transform:uppercase;letter-spacing:.16em;color:#555;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #1e1e1e}
    /* Table */
    table{width:100%;border-collapse:collapse}
    thead tr{border-bottom:1px solid #FF5B1F}
    th{text-align:left;padding:10px 12px;font-family:'JetBrains Mono',monospace;font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:#FF5B1F;font-weight:600}
    td{padding:10px 12px;border-bottom:1px solid #141414;vertical-align:middle;font-size:12.5px}
    tbody tr:hover{background:#0f0f0f}
    .badge{display:inline-block;padding:3px 9px;font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
    .device-name{font-weight:600;color:#EDEDED}
    .mono{font-family:'JetBrains Mono',monospace;font-size:11px;color:#666}
    /* Category bars */
    .cats{display:grid;grid-template-columns:1fr 1fr;gap:0 32px;margin-bottom:48px}
    .cat-row{padding:9px 0;border-bottom:1px solid #141414}
    .cat-name{font-size:12px;text-transform:capitalize;margin-bottom:5px}
    .cat-bar-bg{height:3px;background:#1a1a1a;position:relative}
    .cat-bar-fill{position:absolute;inset:0;background:#FF5B1F}
    /* Footer */
    .footer{margin-top:56px;padding-top:20px;border-top:1px solid #1e1e1e;display:flex;justify-content:space-between;font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#333}
    @media print{
      body{background:#0B0B0A!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .page{padding:24px 20px}
    }
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="wordmark">Orion</div>
    <div class="meta-right">
      ${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}<br/>
      Range · ${(report?.range ?? range).toUpperCase()}<br/>
      ${targetDevices.length} device${targetDevices.length !== 1 ? 's' : ''}
    </div>
  </div>

  <h1>${(report?.title ?? 'Device <em>Report</em>').replace(/^(.+)(\s\S+)$/, '$1<em>$2</em>')}</h1>
  <div class="subtitle">Operational snapshot · Orion IoT Platform</div>

  <div class="kpis">
    <div class="kpi">
      <div class="kpi-label">Platform uptime</div>
      <div class="kpi-value" style="color:#4ade80">${uptime}<span class="kpi-unit">%</span></div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Error rate</div>
      <div class="kpi-value" style="color:#f87171">${errorRate}<span class="kpi-unit">%</span></div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Online now</div>
      <div class="kpi-value" style="color:#FF5B1F">${online}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Incidents</div>
      <div class="kpi-value">${incidents}</div>
    </div>
  </div>

  ${catBreakdown.length > 0 ? `
  <div class="section-label">By category</div>
  <div class="cats" style="margin-bottom:48px">
    ${catBreakdown.map(([cat, count]) => `
    <div class="cat-row">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px">
        <span class="cat-name">${cat}</span>
        <span class="mono">${count}</span>
      </div>
      <div class="cat-bar-bg"><div class="cat-bar-fill" style="width:${Math.round((count / maxCount) * 100)}%"></div></div>
    </div>`).join('')}
  </div>` : ''}

  <div class="section-label">Device breakdown</div>
  <table>
    <thead>
      <tr>
        <th>Device</th>
        <th>Status</th>
        <th>Category</th>
        <th>Est. uptime</th>
        <th>Last seen</th>
      </tr>
    </thead>
    <tbody>
      ${targetDevices.map(d => `<tr>
        <td class="device-name">${d.name}</td>
        <td><span class="badge" style="${statusStyle[d.status] ?? statusStyle.offline}">${d.status}</span></td>
        <td style="text-transform:capitalize;color:#aaa">${d.category ?? '—'}</td>
        <td class="mono">${d.status === 'online' ? '100%' : d.status === 'idle' ? '~60%' : '0%'}</td>
        <td class="mono">${d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : '—'}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <div class="footer">
    <span>Orion IoT Platform</span>
    <span>Generated ${new Date().toLocaleString()}</span>
  </div>
</div>
</body>
</html>`;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 2000);
    }, 500);
  }

  return (
    <div className="page">
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
          <button className="btn btn-sm" style={{ gap: '6px' }} onClick={() => exportDeviceXLSX()}>
            <Download size={13} /> Export Excel
          </button>
          <button className="btn btn-primary btn-sm" style={{ gap: '6px' }} onClick={() => setShowNewReport(true)}>
            <Plus size={13} /> New report
          </button>
        </div>
      </div>

      {/* ── KPI ticker ── */}
      <div className="ticker">
        {([
          { label: 'Platform uptime', num: hasDevices ? uptime     : null, unit: '%', color: '#0F7A3D' },
          { label: 'Error rate',      num: hasDevices ? errorRate  : null, unit: '%', color: '#EF4444' },
          { label: 'Devices online',  num: hasDevices ? online     : null, unit: '',  color: '#FF5B1F' },
          { label: 'Incidents · now', num: hasDevices ? incidents  : null, unit: '',  color: '#0B0B0A' },
        ] as { label: string; num: number | null; unit: string; color: string }[]).map(({ label, num, unit, color }) => (
          <div key={label}>
            <div className="eyebrow">{label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginTop: '8px' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '44px', lineHeight: 1, letterSpacing: '-.03em', color }}>
                {num !== null ? num : '—'}
              </span>
              {num !== null && unit && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', color, opacity: 0.8 }}>{unit}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Section I: Device Activity ── */}
      <div className="section">
        <div className="ssh">
          Device<br />activity
        </div>
        <div>
          {!hasDevices ? (
            <div className="panel" style={{ padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, marginBottom: 8 }}>
                No <em style={{ color: 'hsl(var(--primary))' }}>data</em> yet
              </div>
              <p className="dim" style={{ fontSize: 13 }}>Add devices to see activity trends.</p>
            </div>
          ) : (
            <>
              <p className="dim" style={{ fontSize: '13px', maxWidth: '48ch', marginBottom: '16px' }}>
                Online devices vs total over time. Based on current snapshot — historical series requires telemetry ingestion.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
                {[
                  { label: 'Online',  value: online,              color: '#0F7A3D' },
                  { label: 'Idle',    value: devices.filter(d => d.status === 'idle').length,    color: '#B45309' },
                  { label: 'Offline', value: devices.filter(d => d.status === 'offline').length, color: '#5E5C56' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="panel" style={{ padding: '16px 20px' }}>
                    <div className="eyebrow" style={{ marginBottom: 8 }}>{label}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, lineHeight: 1, color }}>{value}</div>
                    <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>{total > 0 ? Math.round((value / total) * 100) : 0}% of fleet</div>
                  </div>
                ))}
              </div>
            </>
          )}
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
                      <button className="btn btn-sm" style={{ gap: '6px' }} onClick={() => exportDeviceXLSX(r)}>
                        <Download size={12} /> Excel
                      </button>
                      <button className="btn btn-sm btn-ghost" style={{ gap: '6px', color: 'hsl(var(--bad))' }} onClick={() => deleteReport(r.id)}>
                        <Trash2 size={12} />
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

      {/* ── Excel Preview Modal ── */}
      <AnimatePresence>
        {xlsxPreview && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9001, padding: 16 }}
            onClick={() => setXlsxPreview(null)}
          >
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
              onClick={e => e.stopPropagation()}
              className="panel"
              style={{ width: '100%', maxWidth: 720, maxHeight: '80vh', display: 'flex', flexDirection: 'column', borderTop: '2px solid hsl(var(--primary))' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid hsl(var(--rule-ghost))' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>
                    {xlsxPreview.report?.title ?? 'Device Report'} <em style={{ color: 'hsl(var(--primary))' }}>· Excel</em>
                  </div>
                  <div className="mono faint" style={{ fontSize: 10.5, marginTop: 4 }}>
                    {xlsxPreview.rows.length} device{xlsxPreview.rows.length !== 1 ? 's' : ''} · 3 sheets: Summary, Devices, By Category
                  </div>
                </div>
                <button onClick={() => setXlsxPreview(null)} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'hsl(var(--muted-fg))' }}><X size={16} /></button>
              </div>
              <div style={{ overflow: 'auto', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'hsl(var(--surface-raised))' }}>
                    <tr>
                      {Object.keys(xlsxPreview.rows[0] ?? {}).map(k => (
                        <th key={k} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'hsl(var(--primary))', borderBottom: '1px solid hsl(var(--border))', whiteSpace: 'nowrap' }}>
                          {k.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {xlsxPreview.rows.map((row, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'hsl(var(--surface-raised) / 0.4)' }}>
                        {Object.values(row).map((v, j) => (
                          <td key={j} style={{ padding: '9px 14px', borderBottom: '1px solid hsl(var(--rule-ghost))', whiteSpace: 'nowrap' }}>
                            {String(v ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '16px 24px', borderTop: '1px solid hsl(var(--rule-ghost))', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setXlsxPreview(null)} className="btn btn-ghost btn-sm">Cancel</button>
                <button onClick={confirmXLSXDownload} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
                  <Download size={13} /> Download .xlsx
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
