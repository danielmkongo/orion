/**
 * ShareViewPage — public, unauthenticated viewer for shared device pages and builder pages.
 * Completely self-contained design system; independent of the app theme.
 * Orion branding woven throughout as a discovery surface.
 */

import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { publicClient } from '@/api/publicClient';
import { LineChart, BarChart } from '@/components/charts/Charts';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { BarChart2, TableProperties, Sun, Moon, Monitor, Download } from 'lucide-react';

const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const GMAPS_ID  = import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID';

/* ── Design tokens ───────────────────────────────────────────────────── */
type Theme = 'light' | 'dark' | 'system';

interface Tokens {
  bg: string; surface: string; surfaceHover: string; surfaceActive: string;
  border: string; borderStrong: string;
  fg: string; fgMuted: string; fgFaint: string;
  primary: string; primaryHover: string; primaryMuted: string;
  good: string; warn: string; bad: string;
  shadow: string; shadowCard: string; shadowHover: string;
  fontDisplay: string; fontMono: string;
}

const DARK: Tokens = {
  bg: '#0c0c0b', surface: '#161614', surfaceHover: '#1e1e1c', surfaceActive: '#252522',
  border: 'rgba(255,255,255,0.07)', borderStrong: 'rgba(255,255,255,0.14)',
  fg: '#f0ede8', fgMuted: '#8a8a82', fgFaint: '#44443e',
  primary: '#ff5b1f', primaryHover: '#ff7040', primaryMuted: 'rgba(255,91,31,0.14)',
  good: '#22c55e', warn: '#f59e0b', bad: '#ef4444',
  shadow: 'none', shadowCard: '0 1px 3px rgba(0,0,0,0.4)', shadowHover: '0 4px 20px rgba(0,0,0,0.6)',
  fontDisplay: 'var(--font-display, "Satoshi", system-ui, sans-serif)',
  fontMono: 'var(--font-mono, "JetBrains Mono", monospace)',
};

const LIGHT: Tokens = {
  bg: '#f5f5f3', surface: '#ffffff', surfaceHover: '#fafaf8', surfaceActive: '#f2f2f0',
  border: 'rgba(0,0,0,0.07)', borderStrong: 'rgba(0,0,0,0.14)',
  fg: '#0c0c0b', fgMuted: '#6b6b67', fgFaint: '#b8b8b2',
  primary: '#ff5b1f', primaryHover: '#e64e15', primaryMuted: 'rgba(255,91,31,0.08)',
  good: '#16a34a', warn: '#d97706', bad: '#dc2626',
  shadow: 'none', shadowCard: '0 1px 4px rgba(0,0,0,0.08)', shadowHover: '0 4px 20px rgba(0,0,0,0.14)',
  fontDisplay: 'var(--font-display, "Satoshi", system-ui, sans-serif)',
  fontMono: 'var(--font-mono, "JetBrains Mono", monospace)',
};

const ThemeCtx = createContext<{ T: Tokens; theme: Theme; setTheme: (t: Theme) => void }>({
  T: DARK, theme: 'dark', setTheme: () => {},
});
const useT = () => useContext(ThemeCtx);

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeRaw] = useState<Theme>(() => (localStorage.getItem('orion_share_theme') as Theme) ?? 'system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const resolve = () => setResolved(theme === 'system' ? (mq.matches ? 'light' : 'dark') : theme as 'light' | 'dark');
    resolve();
    if (theme === 'system') { mq.addEventListener('change', resolve); return () => mq.removeEventListener('change', resolve); }
  }, [theme]);

  const setTheme = (t: Theme) => { setThemeRaw(t); localStorage.setItem('orion_share_theme', t); };
  const T = resolved === 'light' ? LIGHT : DARK;

  return <ThemeCtx.Provider value={{ T, theme, setTheme }}>{children}</ThemeCtx.Provider>;
}

/* ── Theme toggle pill ───────────────────────────────────────────────── */
function ThemeToggle() {
  const { T, theme, setTheme } = useT();
  const options: { key: Theme; Icon: typeof Sun; label: string }[] = [
    { key: 'light', Icon: Sun, label: 'Light' },
    { key: 'system', Icon: Monitor, label: 'Auto' },
    { key: 'dark', Icon: Moon, label: 'Dark' },
  ];
  return (
    <div style={{ display: 'flex', background: T.surfaceActive, border: `1px solid ${T.border}`, borderRadius: 24, padding: 3, gap: 2 }}>
      {options.map(({ key, Icon, label }) => (
        <button
          key={key}
          title={label}
          onClick={() => setTheme(key)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: T.fontMono,
            background: theme === key ? T.surface : 'transparent',
            color: theme === key ? T.fg : T.fgMuted,
            boxShadow: theme === key ? T.shadowCard : 'none',
            transition: 'all 0.15s',
          }}
        >
          <Icon size={11} />
          <span style={{ display: 'none' }}>{label}</span>
        </button>
      ))}
    </div>
  );
}

/* ── Top navigation bar ──────────────────────────────────────────────── */
function TopNav({ subtitle }: { subtitle?: string }) {
  const { T } = useT();
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 50,
      height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px', borderBottom: `1px solid ${T.border}`,
      background: T.bg + 'ee', backdropFilter: 'blur(12px)',
    }}>
      {/* Left: brand + page name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Orion mark — square with O */}
          <div style={{
            width: 26, height: 26, background: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontFamily: T.fontDisplay, color: '#fff', fontWeight: 700, letterSpacing: '-0.03em', flexShrink: 0,
          }}>O</div>
          <span style={{ fontFamily: T.fontDisplay, fontSize: 16, fontWeight: 700, letterSpacing: '-0.04em', color: T.fg, lineHeight: 1 }}>
            Orion
          </span>
        </div>
        {subtitle && (
          <>
            <span style={{ width: 1, height: 16, background: T.border }} />
            <span style={{ fontSize: 13, color: T.fgMuted, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {subtitle}
            </span>
          </>
        )}
      </div>

      {/* Right: theme toggle + CTA */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ThemeToggle />
        <a
          href="https://orion.vortan.io"
          target="_blank"
          rel="noreferrer"
          className="orion-cta-nav"
          style={{
            padding: '6px 14px', background: T.primary, color: '#fff', fontSize: 11,
            fontFamily: T.fontMono, letterSpacing: '0.06em', textDecoration: 'none',
            border: 'none', cursor: 'pointer', transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.82')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          GET ORION
        </a>
        <style>{`.orion-cta-nav { display: none; } @media (min-width: 600px) { .orion-cta-nav { display: inline-flex; } }`}</style>
      </div>
    </nav>
  );
}

/* ── Page footer ─────────────────────────────────────────────────────── */
function PageFooter() {
  const { T } = useT();
  return (
    <footer style={{ borderTop: `1px solid ${T.border}`, padding: '40px 32px', marginTop: 80 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ width: 28, height: 28, background: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontFamily: T.fontDisplay, color: '#fff', fontWeight: 700 }}>O</div>
          <span style={{ fontFamily: T.fontDisplay, fontSize: 20, fontWeight: 700, letterSpacing: '-0.04em', color: T.fg }}>Orion</span>
        </div>
        <p style={{ fontSize: 14, color: T.fgMuted, maxWidth: 400, lineHeight: 1.6 }}>
          Connect, monitor, and control your IoT devices from anywhere.
          Build dashboards like this one — no code required.
        </p>
        <a
          href="https://orion.vortan.io"
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 24px', background: T.primary, color: '#fff',
            fontSize: 13, fontFamily: T.fontMono, letterSpacing: '0.06em',
            textDecoration: 'none', border: 'none', cursor: 'pointer',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          START BUILDING FREE →
        </a>
        <div style={{ fontSize: 11, fontFamily: T.fontMono, color: T.fgFaint, letterSpacing: '0.08em' }}>
          Powered by Orion Platform · orion.vortan.io
        </div>
      </div>
    </footer>
  );
}

/* ── Live badge ──────────────────────────────────────────────────────── */
function LiveBadge() {
  const { T } = useT();
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', background: T.primaryMuted, border: `1px solid ${T.primary}22`, fontSize: 9.5, fontFamily: T.fontMono, letterSpacing: '0.12em', color: T.primary }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.primary, animation: 'pulse 2s infinite' }} />
      LIVE
    </span>
  );
}

/* ── Tiny sparkline (inline SVG, no deps) ────────────────────────────── */
function Sparkline({ points, color, height = 32 }: { points: number[]; color: string; height?: number }) {
  if (points.length < 2) return null;
  const min = Math.min(...points); const max = Math.max(...points);
  const range = max - min || 1;
  const w = 80;
  const coords = points.map((v, i) => `${(i / (points.length - 1)) * w},${height - ((v - min) / range) * height}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width: '100%', maxWidth: 80, height }} preserveAspectRatio="none">
      <polyline points={coords} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   DEVICE SHARE VIEW
   ═══════════════════════════════════════════════════════════════════════ */
function DeviceShareView({ token, data }: { token: string; data: any }) {
  const { T } = useT();
  const { device, sections = [], latest } = data;
  const fields: Record<string, number> = latest?.fields ?? {};
  const numericFields = Object.entries(fields).filter(([, v]) => typeof v === 'number') as [string, number][];
  const schemaFields: any[] = device?.meta?.dataSchema?.fields ?? [];

  const [telemView, setTelemView] = useState<'chart' | 'table'>('chart');
  const [chartField, setChartField] = useState(numericFields[0]?.[0] ?? '');
  const [chartRange, setChartRange] = useState('24h');

  const hoursMap: Record<string, number> = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 };
  const fromTs = new Date(Date.now() - (hoursMap[chartRange] ?? 24) * 3600_000).toISOString();
  const fm = schemaFields.find((f: any) => f.key === chartField);
  const chartColor = fm?.chartColor ?? T.primary;

  const fieldColors = Object.fromEntries(
    numericFields.map(([k], i) => [k, schemaFields.find((f: any) => f.key === k)?.chartColor ?? [T.primary, '#22d3ee', '#a3e635', '#f97316'][i % 4]])
  );

  const seg: React.CSSProperties = {
    display: 'flex', background: T.surfaceActive, border: `1px solid ${T.border}`, borderRadius: 20, padding: 3, gap: 2,
  };
  const segBtn = (active: boolean): React.CSSProperties => ({
    padding: '4px 12px', border: 'none', borderRadius: 16, cursor: 'pointer', fontSize: 11, fontFamily: T.fontMono,
    background: active ? T.surface : 'transparent', color: active ? T.fg : T.fgMuted,
    boxShadow: active ? T.shadowCard : 'none', transition: 'all 0.15s',
  });

  return (
    <div style={{ background: T.bg, color: T.fg, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopNav subtitle={device.name} />
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      <div style={{ maxWidth: 1060, margin: '0 auto', width: '100%', padding: '48px 24px 0' }}>
        {/* Hero */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontFamily: T.fontMono, letterSpacing: '0.14em', color: T.fgMuted, textTransform: 'uppercase' }}>
              {device.category} · {device.protocol?.toUpperCase()}
            </span>
            {sections.includes('metrics') && <LiveBadge />}
          </div>
          <h1 style={{ fontFamily: T.fontDisplay, fontSize: 'clamp(32px,5vw,56px)', lineHeight: 1, margin: '0 0 10px', letterSpacing: '-0.03em', color: T.fg }}>
            {device.name.split(' ').slice(0, -1).join(' ')}{' '}
            <em style={{ fontStyle: 'italic', color: T.primary }}>{device.name.split(' ').slice(-1)[0]}</em>
          </h1>
          {device.description && <p style={{ fontSize: 15, color: T.fgMuted, maxWidth: 600, lineHeight: 1.6, margin: 0 }}>{device.description}</p>}
        </div>

        {/* Metrics grid */}
        {sections.includes('metrics') && numericFields.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', borderTop: `2px solid ${T.fg}`, marginBottom: 40 }}>
            {numericFields.map(([k, v], i) => {
              const fmeta = schemaFields.find((f: any) => f.key === k);
              const color = fieldColors[k];
              const selected = k === chartField && sections.includes('chart');
              return (
                <button
                  key={k}
                  onClick={() => sections.includes('chart') && setChartField(k)}
                  style={{
                    padding: '20px 22px', textAlign: 'left', background: selected ? T.primaryMuted : 'transparent',
                    border: 'none', borderBottom: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`,
                    cursor: sections.includes('chart') ? 'pointer' : 'default',
                    outline: selected ? `1.5px solid ${color}` : 'none', outlineOffset: -1,
                    transition: 'background 0.15s', color: T.fg,
                  }}
                >
                  <div style={{ fontSize: 9.5, fontFamily: T.fontMono, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.fgMuted, marginBottom: 6 }}>{k.replace(/_/g, ' ')}</div>
                  <div style={{ fontFamily: T.fontDisplay, fontSize: 36, lineHeight: 1, color, letterSpacing: '-0.02em' }}>{v.toFixed(2)}</div>
                  {fmeta?.unit && <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.fgFaint, marginTop: 4 }}>{fmeta.unit}</div>}
                </button>
              );
            })}
          </div>
        )}

        {/* Chart section */}
        {sections.includes('chart') && numericFields.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 9.5, fontFamily: T.fontMono, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.fgMuted, marginBottom: 6 }}>Telemetry</div>
                <div style={{ fontFamily: T.fontDisplay, fontSize: 28, lineHeight: 1, color: T.fg, letterSpacing: '-0.02em', textTransform: 'capitalize' }}>
                  {telemView === 'chart' ? chartField.replace(/_/g, ' ') : 'All fields'}{' '}
                  <span style={{ fontStyle: 'italic', color: T.primary }}>· {chartRange}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {telemView === 'chart' && numericFields.length > 1 && (
                  <select value={chartField} onChange={e => setChartField(e.target.value)}
                    style={{ padding: '5px 10px', background: T.surface, border: `1px solid ${T.border}`, color: T.fg, fontSize: 11, fontFamily: T.fontMono, outline: 'none', cursor: 'pointer' }}>
                    {numericFields.map(([k]) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
                  </select>
                )}
                <div style={seg}>
                  <button style={segBtn(telemView === 'chart')} onClick={() => setTelemView('chart')}><BarChart2 size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />Chart</button>
                  <button style={segBtn(telemView === 'table')} onClick={() => setTelemView('table')}><TableProperties size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />Table</button>
                </div>
                <div style={seg}>
                  {['1h', '6h', '24h', '7d'].map(r => <button key={r} style={segBtn(chartRange === r)} onClick={() => setChartRange(r)}>{r.toUpperCase()}</button>)}
                </div>
              </div>
            </div>
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
              {telemView === 'chart'
                ? <DeviceChart token={token} field={chartField} color={chartColor} from={fromTs} T={T} />
                : <DeviceTable token={token} field={chartField} schemaFields={schemaFields} from={fromTs} T={T} />}
            </div>
          </div>
        )}

        {/* Info */}
        {sections.includes('info') && (
          <div style={{ marginBottom: 40 }}>
            <SectionHeading label="Device Info" T={T} />
            <div style={{ background: T.surface, border: `1px solid ${T.border}` }}>
              {[['Category', device.category], ['Protocol', device.protocol?.toUpperCase()],
                ['Payload format', device.payloadFormat?.toUpperCase() ?? '—'],
                ['Firmware', device.firmwareVersion ?? '—'],
                ['Tags', device.tags?.join(', ') || '—']
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: `1px solid ${T.border}` }}>
                  <span style={{ fontSize: 10.5, fontFamily: T.fontMono, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.fgMuted }}>{label}</span>
                  <span style={{ fontSize: 13, color: T.fg }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Location */}
        {sections.includes('location') && device.location?.lat && (
          <div style={{ marginBottom: 40 }}>
            <SectionHeading label="Location" T={T} />
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16 }}>
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[['LAT', device.location.lat?.toFixed(6)], ['LNG', (device.location.lng ?? device.location.lon)?.toFixed(6)]].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 9, fontFamily: T.fontMono, letterSpacing: '0.12em', color: T.fgFaint, marginBottom: 4 }}>{k}</div>
                    <div style={{ fontSize: 14, fontFamily: T.fontMono, color: T.fg }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ border: `1px solid ${T.border}`, overflow: 'hidden', minHeight: 260 }}>
                <ShareMap devices={[device]} geofences={[]} mapTypeId="satellite" T={T} />
              </div>
            </div>
          </div>
        )}

        {/* History */}
        {sections.includes('history') && (
          <div style={{ marginBottom: 40 }}>
            <SectionHeading label="Command History" T={T} />
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: T.fontMono, fontSize: 11 }}>
                <thead>
                  <tr style={{ background: T.surfaceActive }}>
                    {['Command', 'Status', 'Sent'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.fgMuted, borderBottom: `1px solid ${T.border}`, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.commandHistory ?? []).length === 0
                    ? <tr><td colSpan={3} style={{ padding: '28px 16px', textAlign: 'center', color: T.fgMuted }}>No commands recorded</td></tr>
                    : (data.commandHistory ?? []).map((cmd: any, i: number) => (
                      <tr key={cmd._id} style={{ background: i % 2 === 0 ? 'transparent' : T.surfaceHover }}>
                        <td style={{ padding: '10px 16px', color: T.primary, borderBottom: `1px solid ${T.border}` }}>{cmd.name}</td>
                        <td style={{ padding: '10px 16px', borderBottom: `1px solid ${T.border}` }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9.5, padding: '2px 8px', letterSpacing: '0.08em',
                            background: cmd.status === 'executed' ? T.good + '22' : cmd.status === 'failed' ? T.bad + '22' : T.border,
                            color: cmd.status === 'executed' ? T.good : cmd.status === 'failed' ? T.bad : T.fgMuted }}>
                            {cmd.status?.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', color: T.fgMuted, borderBottom: `1px solid ${T.border}` }}>{new Date(cmd.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <PageFooter />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   PAGE SHARE VIEW — premium builder layout
   ═══════════════════════════════════════════════════════════════════════ */
function PageShareView({ pageData }: { pageData: any }) {
  const { T } = useT();
  const { page, widgetData = {} } = pageData;
  const allowExports: boolean = page.allowExports ?? false;
  const visibleWidgets = (page.widgets ?? []).filter((w: any) => w.type !== 'control_panel');

  return (
    <div style={{ background: T.bg, color: T.fg, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopNav subtitle={page.name} />
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      <div style={{ maxWidth: 1440, margin: '0 auto', width: '100%', padding: '48px 24px 0' }}>
        {/* Hero */}
        <div style={{ marginBottom: 48, paddingBottom: 36, borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 9.5, fontFamily: T.fontMono, letterSpacing: '0.14em', color: T.fgMuted, textTransform: 'uppercase' }}>Dashboard · Orion Platform</span>
            <LiveBadge />
          </div>
          <h1 style={{ fontFamily: T.fontDisplay, fontSize: 'clamp(36px,5vw,60px)', lineHeight: 1, margin: '0 0 12px', letterSpacing: '-0.03em', color: T.fg }}>
            {page.name.split(' ').length > 1
              ? <>{page.name.split(' ').slice(0, -1).join(' ')}{' '}<em style={{ fontStyle: 'italic', color: T.primary }}>{page.name.split(' ').slice(-1)[0]}</em></>
              : <em style={{ fontStyle: 'italic', color: T.primary }}>{page.name}</em>}
          </h1>
          {page.description && <p style={{ fontSize: 15, color: T.fgMuted, maxWidth: 560, lineHeight: 1.65, margin: 0 }}>{page.description}</p>}
        </div>

        {/* Widget grid — exact 12-col, 70px-row grid matching builder */}
        {visibleWidgets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 24px', opacity: 0.35 }}>
            <div style={{ fontFamily: T.fontDisplay, fontSize: 28, marginBottom: 8, color: T.fg }}>Nothing here yet</div>
            <p style={{ fontSize: 13, color: T.fgMuted }}>This page has no visible widgets.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gridAutoRows: '70px', gap: '12px' }}>
            {visibleWidgets.map((w: any) => {
              const pos = w.position ?? { x: 0, y: 0, w: 4, h: 3 };
              return (
                <div key={w.id} style={{ gridColumn: `${pos.x + 1} / span ${pos.w}`, gridRow: `${pos.y + 1} / span ${pos.h}`, minWidth: 0, minHeight: 0 }}>
                  <PageWidgetCard widget={w} data={widgetData[w.id]} T={T} allowExports={allowExports} />
                </div>
              );
            })}
          </div>
        )}
      </div>
      <PageFooter />
    </div>
  );
}

/* ── Widget card shell ───────────────────────────────────────────────── */
const WIDGET_ACCENT: Record<string, string> = {
  kpi_card: '#ff5b1f', line_chart: '#6366f1', bar_chart: '#22d3ee',
  gauge: '#f59e0b', data_table: '#10b981', map: '#3b82f6', status_grid: '#a855f7',
};

const EXPORTABLE_TYPES = new Set(['line_chart', 'bar_chart', 'data_table']);

function PageWidgetCard({ widget, data, T, allowExports }: { widget: any; data: any; T: Tokens; allowExports?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const accent = WIDGET_ACCENT[widget.type] ?? T.primary;
  const canExport = allowExports && EXPORTABLE_TYPES.has(widget.type);

  const handleExport = () => {
    if (widget.type === 'data_table') {
      const entries = Object.entries(data?.fields ?? {}).filter(([, v]) => typeof v === 'number');
      const rows = entries.map(([k, v]) => `"${k}","${v}"`);
      downloadCsv(`${widget.title.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0,10)}.csv`, ['field', 'value'], rows as any);
    } else {
      // line_chart / bar_chart — data is array of {ts, value}
      const pts: any[] = Array.isArray(data) ? data : [];
      const rows = pts.map(p => `"${new Date(p.ts).toISOString()}","${p.value}"`);
      const field = widget.field ?? widget.type;
      downloadCsv(`${field}-${new Date().toISOString().slice(0,10)}.csv`, ['timestamp', field], rows as any);
    }
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: T.surface, border: `1px solid ${T.border}`,
        borderTop: `2px solid ${accent}`,
        boxShadow: hovered ? T.shadowHover : T.shadowCard,
        transition: 'box-shadow 0.2s, transform 0.2s',
        transform: hovered ? 'translateY(-1px)' : 'none',
        overflow: 'hidden',
      }}
    >
      {/* Card header */}
      <div style={{
        padding: '9px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: `1px solid ${T.border}`, flexShrink: 0, background: T.surfaceActive,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.fg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>{widget.title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 8 }}>
          {canExport && <ExportBtn onClick={handleExport} T={T} />}
          <span style={{ fontSize: 8.5, fontFamily: T.fontMono, letterSpacing: '0.12em', color: accent, textTransform: 'uppercase' }}>
            {widget.type.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0, position: 'relative' }}>
        <PageWidgetContent widget={widget} data={data} T={T} />
      </div>
    </div>
  );
}

/* ── Widget content by type ──────────────────────────────────────────── */
function PageWidgetContent({ widget, data, T }: { widget: any; data: any; T: Tokens }) {
  const empty = (msg = 'No data') => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12, fontFamily: T.fontMono, color: T.fgMuted }}>{msg}</div>
  );

  if (widget.type === 'kpi_card') {
    const val = data?.fields?.[widget.field];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 6, padding: 16 }}>
        <div style={{ fontSize: 9.5, fontFamily: T.fontMono, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.fgMuted }}>{(widget.field ?? 'value').replace(/_/g, ' ')}</div>
        <div style={{ fontFamily: T.fontDisplay, fontSize: 'clamp(26px,4vw,52px)', lineHeight: 1, color: T.primary, letterSpacing: '-0.02em' }}>
          {val !== undefined ? Number(val).toFixed(2) : <span style={{ fontSize: 22, color: T.fgFaint }}>—</span>}
        </div>
        {data?.timestamp && <div style={{ fontSize: 9, fontFamily: T.fontMono, color: T.fgFaint }}>updated {new Date(data.timestamp).toLocaleTimeString()}</div>}
      </div>
    );
  }

  if (widget.type === 'gauge') {
    const pts: any[] = Array.isArray(data) ? data : [];
    const lastVal = pts.length > 0 ? pts[pts.length - 1].value : undefined;
    const pct = lastVal !== undefined ? Math.min(100, Math.max(0, lastVal)) : 0;
    const r = 56; const cx = 80; const cy = 76;
    const start = Math.PI * 0.75; const end = Math.PI * 2.25;
    const arc = (a: number) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    const s = arc(start); const e = arc(end); const a = arc(start + (end - start) * (pct / 100));
    const large = pct > 50 ? 1 : 0;
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <svg viewBox="0 0 160 115" style={{ width: '100%', maxWidth: 160, height: 'auto' }}>
          <path d={`M ${s.x} ${s.y} A ${r} ${r} 0 1 1 ${e.x} ${e.y}`} fill="none" stroke={T.border} strokeWidth={10} strokeLinecap="round" />
          {pct > 0 && <path d={`M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${a.x} ${a.y}`} fill="none" stroke={T.primary} strokeWidth={10} strokeLinecap="round" />}
          <text x={cx} y={cy} textAnchor="middle" fill={T.fg} style={{ fontFamily: T.fontDisplay, fontSize: 22 }}>{lastVal?.toFixed(1) ?? '—'}</text>
          <text x={cx} y={cy + 16} textAnchor="middle" fill={T.fgMuted} style={{ fontFamily: T.fontMono, fontSize: 8.5, textTransform: 'uppercase' }}>{widget.field ?? ''}</text>
        </svg>
      </div>
    );
  }

  if (widget.type === 'line_chart') {
    const pts = (Array.isArray(data) ? data : []).map((p: any) => ({ ts: new Date(p.ts).getTime(), value: p.value }));
    return pts.length > 0
      ? <div style={{ padding: '8px 4px 4px', height: '100%' }}><LineChart series={[{ name: widget.field ?? '', data: pts, color: T.primary }]} height={180} showArea /></div>
      : empty('No data yet');
  }

  if (widget.type === 'bar_chart') {
    const pts = (Array.isArray(data) ? data : []).slice(-24).map((p: any) => ({
      label: new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      value: p.value,
    }));
    return pts.length > 0
      ? <div style={{ padding: '8px 4px 4px', height: '100%' }}><BarChart data={pts} color={T.primary} height={180} /></div>
      : empty('No data yet');
  }

  if (widget.type === 'data_table') {
    const entries = Object.entries(data?.fields ?? {}).filter(([, v]) => typeof v === 'number');
    if (entries.length === 0) return empty();
    return (
      <div style={{ overflowY: 'auto', height: '100%' }}>
        <table style={{ width: '100%', fontSize: 11, fontFamily: T.fontMono, borderCollapse: 'collapse' }}>
          <tbody>
            {entries.map(([k, v], i) => (
              <tr key={k} style={{ background: i % 2 === 0 ? 'transparent' : T.surfaceHover }}>
                <td style={{ padding: '7px 14px', color: T.fgMuted, borderBottom: `1px solid ${T.border}` }}>{k.replace(/_/g, ' ')}</td>
                <td style={{ padding: '7px 14px', textAlign: 'right', color: T.fg, borderBottom: `1px solid ${T.border}`, fontVariantNumeric: 'tabular-nums' }}>{(v as number).toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (widget.type === 'status_grid') {
    const devices: any[] = Array.isArray(data) ? data.filter(Boolean) : [];
    if (devices.length === 0) return empty('No devices');
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(88px,1fr))', gap: 6, padding: 10, alignContent: 'start', overflowY: 'auto', height: '100%' }}>
        {devices.map((d: any) => (
          <div key={d._id} style={{ padding: '8px 10px', background: T.surfaceActive, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4, color: T.fg }}>{d.name}</div>
            <span style={{
              fontSize: 9.5, fontFamily: T.fontMono, padding: '2px 6px', letterSpacing: '0.06em',
              background: d.status === 'online' ? T.good + '22' : d.status === 'error' ? T.bad + '22' : T.border,
              color: d.status === 'online' ? T.good : d.status === 'error' ? T.bad : T.fgMuted,
            }}>{d.status}</span>
          </div>
        ))}
      </div>
    );
  }

  if (widget.type === 'map') {
    // data may be { devices, geofences } (new format) or an array (old format)
    const mapData = Array.isArray(data) ? { devices: data, geofences: [] } : (data ?? { devices: [], geofences: [] });
    const devices: any[] = (mapData.devices ?? []).filter(Boolean);
    const geofences: any[] = mapData.geofences ?? [];
    if (devices.length === 0) return empty('No location data');
    return <ShareMap devices={devices} geofences={geofences} T={T} />;
  }

  return empty(widget.type.replace('_', ' '));
}

/* ── Google Map with geofences ───────────────────────────────────────── */
type MapTypeId = 'satellite' | 'roadmap' | 'terrain' | 'hybrid';

function ShareMap({ devices, geofences, mapTypeId: initialType, T }: {
  devices: any[];
  geofences: any[];
  mapTypeId?: MapTypeId;
  T: Tokens;
}) {
  const [mapType, setMapType] = useState<MapTypeId>(initialType ?? 'satellite');
  const withLoc = devices.filter(d => d?.location?.lat);
  if (!GMAPS_KEY) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12, fontFamily: T.fontMono, color: T.fgMuted }}>Map unavailable</div>;
  if (withLoc.length === 0) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12, fontFamily: T.fontMono, color: T.fgMuted }}>No location data</div>;

  const center = { lat: withLoc[0].location.lat, lng: withLoc[0].location.lng ?? withLoc[0].location.lon ?? 0 };

  const MAP_TYPES: { key: MapTypeId; label: string }[] = [
    { key: 'satellite', label: 'Satellite' }, { key: 'hybrid', label: 'Hybrid' },
    { key: 'roadmap', label: 'Map' }, { key: 'terrain', label: 'Terrain' },
  ];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 200 }}>
      {/* Map type selector */}
      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', gap: 4, background: T.bg + 'ee', border: `1px solid ${T.border}`, padding: 3 }}>
        {MAP_TYPES.map(({ key, label }) => (
          <button key={key} onClick={() => setMapType(key)} style={{
            padding: '3px 8px', border: 'none', cursor: 'pointer', fontSize: 9.5, fontFamily: T.fontMono,
            background: mapType === key ? T.primary : 'transparent',
            color: mapType === key ? '#fff' : T.fgMuted,
          }}>{label}</button>
        ))}
      </div>
      <APIProvider apiKey={GMAPS_KEY}>
        <Map mapId={GMAPS_ID} defaultCenter={center} defaultZoom={withLoc.length > 1 ? 8 : 13}
          mapTypeId={mapType} style={{ width: '100%', height: '100%' }}
          gestureHandling="cooperative" streetViewControl={false} mapTypeControl={false} fullscreenControl={false}>
          <GeofenceLayer geofences={geofences} />
          {withLoc.map((d: any) => (
            <DeviceMarker key={d._id} device={d} T={T} />
          ))}
        </Map>
      </APIProvider>
    </div>
  );
}

/* ── Geofence overlay drawn imperatively ─────────────────────────────── */
function GeofenceLayer({ geofences }: { geofences: any[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !geofences.length) return;
    const win = window as any;
    if (!win.google?.maps) return;

    const shapes: any[] = [];
    for (const gf of geofences) {
      if (gf.type === 'polygon' && (gf.coordinates?.length ?? 0) >= 3) {
        const poly = new win.google.maps.Polygon({
          paths: gf.coordinates, strokeColor: gf.color, strokeOpacity: 0.9, strokeWeight: 2,
          fillColor: gf.color, fillOpacity: 0.18, map,
        });
        shapes.push(poly);
      } else if (gf.type === 'circle' && gf.center) {
        const circle = new win.google.maps.Circle({
          center: gf.center, radius: gf.radius ?? 100,
          strokeColor: gf.color, strokeOpacity: 0.9, strokeWeight: 2,
          fillColor: gf.color, fillOpacity: 0.18, map,
        });
        shapes.push(circle);
      }
    }
    return () => shapes.forEach(s => s.setMap(null));
  }, [map, geofences]);

  return null;
}

/* ── Device marker with hover tooltip ───────────────────────────────── */
function DeviceMarker({ device, T }: { device: any; T: Tokens }) {
  const [hovered, setHovered] = useState(false);
  const loc = device.location;
  if (!loc?.lat) return null;
  const CAT_COLORS: Record<string, string> = {
    tracker: '#FF5B1F', environmental: '#10B981', energy: '#FACC15', water: '#3B82F6',
    industrial: '#F97316', gateway: '#06B6D4', research: '#EC4899', telemetry: '#8B5CF6',
    pump: '#14B8A6', mobile: '#F59E0B', fixed: '#6366F1', custom: '#8B5CF6',
  };
  const color = CAT_COLORS[device.category] ?? T.primary;

  return (
    <AdvancedMarker position={{ lat: loc.lat, lng: loc.lng ?? loc.lon ?? 0 }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ position: 'relative', cursor: 'pointer' }}
      >
        {/* Tooltip */}
        {hovered && (
          <div style={{
            position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
            marginBottom: 8, background: T.surface, border: `1px solid ${T.border}`,
            padding: '8px 12px', whiteSpace: 'nowrap', boxShadow: T.shadowHover, minWidth: 140,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.fg, marginBottom: 2 }}>{device.name}</div>
            <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.fgMuted }}>{device.category}</div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontFamily: T.fontMono,
              marginTop: 5, padding: '2px 7px',
              background: device.status === 'online' ? T.good + '22' : T.border,
              color: device.status === 'online' ? T.good : T.fgMuted,
            }}>
              {device.status === 'online' && <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.good, animation: 'pulse 2s infinite' }} />}
              {device.status?.toUpperCase()}
            </div>
          </div>
        )}
        {/* Dot */}
        <div style={{
          width: 16, height: 16, borderRadius: '50%', background: color,
          border: '2.5px solid white', boxShadow: `0 0 0 3px ${color}44`,
          transition: 'transform 0.15s',
          transform: hovered ? 'scale(1.3)' : 'scale(1)',
        }} />
      </div>
    </AdvancedMarker>
  );
}

/* ── CSV download helper ─────────────────────────────────────────────── */
function downloadCsv(filename: string, headers: string[], rows: (string | number)[]) {
  const lines = [[...headers].map(h => `"${h}"`).join(','), ...rows].join('\n');
  const blob = new Blob([lines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function ExportBtn({ onClick, T }: { onClick: () => void; T: Tokens }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 10px', border: `1px solid ${T.border}`, background: 'transparent',
        color: T.fgMuted, fontSize: 10, fontFamily: T.fontMono, letterSpacing: '0.06em',
        cursor: 'pointer', transition: 'color 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = T.fg; (e.currentTarget as HTMLElement).style.borderColor = T.borderStrong; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = T.fgMuted; (e.currentTarget as HTMLElement).style.borderColor = T.border; }}
    >
      <Download size={10} />CSV
    </button>
  );
}

/* ── Device share chart ──────────────────────────────────────────────── */
function DeviceChart({ token, field, color, from, T }: { token: string; field: string; color: string; from: string; T: Tokens }) {
  const { data, isLoading } = useQuery({
    queryKey: ['share-series', token, field, from],
    queryFn: () => publicClient.get(`/public/device/${token}/series`, { params: { field, from } }).then(r => r.data),
    enabled: !!field,
  });
  const raw: any[] = data?.data ?? [];
  const pts = raw.map((p: any) => ({ ts: new Date(p.ts).getTime(), value: typeof p.value === 'number' ? p.value : 0 }));

  const exportCsv = () => {
    const rows = raw.map(p => `"${new Date(p.ts).toISOString()}","${p.value}"`);
    downloadCsv(`${field}-${new Date().toISOString().slice(0,10)}.csv`, ['timestamp', field], rows as any);
  };

  if (isLoading) return <div style={{ height: 260, background: T.surfaceActive, animation: 'pulse 2s infinite' }} />;
  if (pts.length === 0) return <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.fgMuted, fontFamily: T.fontMono, fontSize: 12 }}>No data</div>;
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 5 }}>
        <ExportBtn onClick={exportCsv} T={T} />
      </div>
      <LineChart series={[{ name: field, data: pts, color }]} height={260} showArea />
    </div>
  );
}

/* ── Device share table ──────────────────────────────────────────────── */
function DeviceTable({ token, field, schemaFields, from, T }: { token: string; field: string; schemaFields: any[]; from: string; T: Tokens }) {
  const fm = schemaFields.find((f: any) => f.key === field);
  const color = fm?.chartColor ?? T.primary;
  const { data, isLoading } = useQuery({
    queryKey: ['share-table', token, field, from],
    queryFn: () => publicClient.get(`/public/device/${token}/series`, { params: { field, from, limit: 200 } }).then(r => r.data),
    enabled: !!field,
  });
  const rows: any[] = data?.data ?? [];

  const exportCsv = () => {
    const csvRows = rows.map(r => `"${new Date(r.ts).toISOString()}","${r.value}"`);
    downloadCsv(`${field}-${new Date().toISOString().slice(0,10)}.csv`, ['timestamp', field], csvRows as any);
  };

  if (isLoading) return <div style={{ height: 260, background: T.surfaceActive, animation: 'pulse 2s infinite' }} />;
  if (rows.length === 0) return <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.fgMuted, fontFamily: T.fontMono, fontSize: 12 }}>No data in range</div>;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 14px 0' }}>
        <ExportBtn onClick={exportCsv} T={T} />
      </div>
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 300 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: T.fontMono, fontSize: 11 }}>
          <thead style={{ position: 'sticky', top: 0, background: T.surfaceActive, zIndex: 1 }}>
            <tr>
              <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.fgMuted, borderBottom: `1px solid ${T.border}`, fontWeight: 600 }}>Timestamp</th>
              <th style={{ padding: '9px 14px', textAlign: 'right', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color, borderBottom: `1px solid ${T.border}`, fontWeight: 600 }}>
                {field.replace(/_/g, ' ')}{fm?.unit ? ` (${fm.unit})` : ''}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: any, i: number) => (
              <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : T.surfaceHover }}>
                <td style={{ padding: '8px 14px', color: T.fgMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${T.border}` }}>{new Date(row.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                <td style={{ padding: '8px 14px', textAlign: 'right', color, borderBottom: `1px solid ${T.border}`, fontVariantNumeric: 'tabular-nums' }}>{typeof row.value === 'number' ? row.value.toFixed(4) : String(row.value ?? '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Section heading ─────────────────────────────────────────────────── */
function SectionHeading({ label, T }: { label: string; T: Tokens }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <span style={{ fontSize: 9.5, fontFamily: T.fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.fgMuted }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: T.border }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   ROOT — resolves token, wraps in theme provider
   ═══════════════════════════════════════════════════════════════════════ */
export function ShareViewPage() {
  const { token } = useParams<{ token: string }>();

  const { data: deviceData, isLoading: loadingDevice, isError: deviceErr } = useQuery({
    queryKey: ['share-device', token],
    queryFn: () => publicClient.get(`/public/device/${token}`).then(r => r.data),
    enabled: !!token, retry: false,
  });

  const { data: pageData, isLoading: loadingPage } = useQuery({
    queryKey: ['share-page', token],
    queryFn: () => publicClient.get(`/public/page/${token}`).then(r => r.data),
    enabled: !!token && deviceErr, retry: false,
  });

  const isLoading = loadingDevice || (deviceErr && loadingPage);

  if (isLoading) {
    return (
      <ThemeProvider>
        <LoadingScreen />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      {deviceData?.device
        ? <DeviceShareView token={token!} data={deviceData} />
        : pageData?.page
          ? <PageShareView pageData={pageData} />
          : <NotFoundScreen />}
    </ThemeProvider>
  );
}

function LoadingScreen() {
  const { T } = useT();
  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ width: 36, height: 36, background: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontFamily: T.fontDisplay, color: '#fff', fontWeight: 700 }}>O</div>
      <div style={{ fontSize: 11, fontFamily: T.fontMono, letterSpacing: '0.14em', color: T.fgMuted, animation: 'pulse 2s infinite' }}>LOADING…</div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

function NotFoundScreen() {
  const { T } = useT();
  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.fg, display: 'flex', flexDirection: 'column' }}>
      <TopNav />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
        <div style={{ width: 1, height: 60, background: T.border, marginBottom: 8 }} />
        <div style={{ fontFamily: T.fontDisplay, fontSize: 'clamp(28px,4vw,48px)', letterSpacing: '-0.03em', color: T.fg }}>Link expired</div>
        <p style={{ fontSize: 14, color: T.fgMuted, maxWidth: 380, textAlign: 'center', lineHeight: 1.6 }}>
          This share link has expired or doesn't exist. Ask the sender for a fresh link.
        </p>
        <a href="https://orion.vortan.io" style={{ fontSize: 12, fontFamily: T.fontMono, color: T.primary, textDecoration: 'none', letterSpacing: '0.08em', marginTop: 8 }}>
          EXPLORE ORION →
        </a>
      </div>
      <PageFooter />
    </div>
  );
}
