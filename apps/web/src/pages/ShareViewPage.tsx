/**
 * ShareViewPage — public unauthenticated viewer for shared device and builder pages.
 * Completely self-contained design system; independent of the app theme.
 * Orion branding is the primary discovery surface for new users.
 */

import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
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
  bg: '#0a0a09', surface: '#131311', surfaceHover: '#1a1a18', surfaceActive: '#222220',
  border: 'rgba(255,255,255,0.07)', borderStrong: 'rgba(255,255,255,0.16)',
  fg: '#eeebe6', fgMuted: '#888880', fgFaint: '#3e3e38',
  primary: '#ff5b1f', primaryHover: '#ff7040', primaryMuted: 'rgba(255,91,31,0.13)',
  good: '#22c55e', warn: '#f59e0b', bad: '#ef4444',
  shadow: 'none', shadowCard: '0 1px 3px rgba(0,0,0,0.5)', shadowHover: '0 8px 32px rgba(0,0,0,0.7)',
  fontDisplay: 'var(--font-display, "Satoshi", system-ui, sans-serif)',
  fontMono: 'var(--font-mono, "JetBrains Mono", monospace)',
};

const LIGHT: Tokens = {
  bg: '#f4f4f2', surface: '#ffffff', surfaceHover: '#f9f9f7', surfaceActive: '#efefed',
  border: 'rgba(0,0,0,0.08)', borderStrong: 'rgba(0,0,0,0.18)',
  fg: '#0a0a09', fgMuted: '#666660', fgFaint: '#bcbcb6',
  primary: '#ff5b1f', primaryHover: '#e04d18', primaryMuted: 'rgba(255,91,31,0.08)',
  good: '#16a34a', warn: '#d97706', bad: '#dc2626',
  shadow: 'none', shadowCard: '0 1px 4px rgba(0,0,0,0.10)', shadowHover: '0 8px 32px rgba(0,0,0,0.15)',
  fontDisplay: 'var(--font-display, "Satoshi", system-ui, sans-serif)',
  fontMono: 'var(--font-mono, "JetBrains Mono", monospace)',
};

const ThemeCtx = createContext<{ T: Tokens; theme: Theme; resolved: 'light' | 'dark'; setTheme: (t: Theme) => void }>({
  T: DARK, theme: 'system', resolved: 'dark', setTheme: () => {},
});
const useT = () => useContext(ThemeCtx);

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeRaw] = useState<Theme>(() => (localStorage.getItem('orion_share_theme') as Theme) ?? 'system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const resolve = () => setResolved(theme === 'system' ? (mq.matches ? 'light' : 'dark') : theme as 'light' | 'dark');
    resolve();
    mq.addEventListener('change', resolve);
    return () => mq.removeEventListener('change', resolve);
  }, [theme]);

  const setTheme = (t: Theme) => { setThemeRaw(t); localStorage.setItem('orion_share_theme', t); };
  const T = resolved === 'light' ? LIGHT : DARK;

  return <ThemeCtx.Provider value={{ T, theme, resolved, setTheme }}>{children}</ThemeCtx.Provider>;
}

/* ── Orion logo mark — actual brand SVG ─────────────────────────────── */
function OrionMark({
  size = 32,
  color,
  animate = false,
  className,
}: {
  size?: number;
  color?: string;
  animate?: boolean;
  className?: string;
}) {
  const { T } = useT();
  const c = color ?? T.primary;
  return (
    <svg
      width={size} height={size} viewBox="0 0 32 32" fill="none"
      className={className}
      style={animate ? { animation: 'orion-spin 12s linear infinite', transformOrigin: '50% 50%', display: 'block' } : { display: 'block' }}
    >
      <circle cx="16" cy="16" r="14" stroke={c} strokeWidth="2.5" />
      <circle cx="16" cy="16" r="8" stroke={c} strokeWidth="2" opacity="0.45" />
      <circle cx="16" cy="16" r="3" fill={c} />
    </svg>
  );
}

/* ── Theme toggle with system resolution label ───────────────────────── */
function ThemeToggle() {
  const { T, theme, resolved, setTheme } = useT();
  const options: { key: Theme; Icon: typeof Sun; label: string }[] = [
    { key: 'light', Icon: Sun, label: 'Light' },
    { key: 'system', Icon: Monitor, label: 'Auto' },
    { key: 'dark', Icon: Moon, label: 'Dark' },
  ];
  const sysLabel = resolved === 'light' ? 'Light' : 'Dark';

  return (
    <div style={{ display: 'flex', background: T.surfaceActive, border: `1px solid ${T.border}`, borderRadius: 24, padding: 3, gap: 2 }}>
      {options.map(({ key, Icon, label }) => {
        const active = theme === key;
        return (
          <button
            key={key}
            title={key === 'system' ? `Follow OS (currently ${sysLabel})` : label}
            onClick={() => setTheme(key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 11px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 11, fontFamily: T.fontMono,
              background: active ? T.surface : 'transparent',
              color: active ? T.fg : T.fgMuted,
              boxShadow: active ? T.shadowCard : 'none',
              transition: 'all 0.15s',
            }}
          >
            <Icon size={11} />
            {active && key === 'system'
              ? <span style={{ fontSize: 10 }}>Auto · {sysLabel}</span>
              : active ? <span>{label}</span>
              : null}
          </button>
        );
      })}
    </div>
  );
}

/* ── Top navigation bar ──────────────────────────────────────────────── */
function TopNav({ subtitle, logoUrl, orgName, maxContentWidth = 1560 }: {
  subtitle?: string; logoUrl?: string; orgName?: string; maxContentWidth?: number;
}) {
  const { T } = useT();
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 50,
      height: 56, borderBottom: `1px solid ${T.border}`,
      background: T.bg + 'f0', backdropFilter: 'blur(16px)',
    }}>
      <div style={{
        maxWidth: maxContentWidth, margin: '0 auto', width: 'calc(100% - 40px)',
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Left: brand + page name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {logoUrl ? (
            <img src={logoUrl} alt={orgName ?? 'Logo'} style={{ height: 28, objectFit: 'contain' }} />
          ) : orgName ? (
            <span style={{ fontFamily: T.fontDisplay, fontSize: 17, fontWeight: 700, letterSpacing: '-0.04em', color: T.fg, lineHeight: 1 }}>
              {orgName}<em style={{ color: T.primary, fontStyle: 'italic' }}>.</em>
            </span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <OrionMark size={24} />
              <span style={{ fontFamily: T.fontDisplay, fontSize: 17, fontWeight: 700, letterSpacing: '-0.04em', color: T.fg, lineHeight: 1 }}>
                Orion<em style={{ color: T.primary, fontStyle: 'italic' }}>.</em>
              </span>
            </div>
          )}
          {subtitle && (
            <>
              <span style={{ width: 1, height: 18, background: T.border, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: T.fgMuted, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: T.fontMono }}>
                {subtitle}
              </span>
            </>
          )}
        </div>

        {/* Right: theme + ghost CTA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ThemeToggle />
          <a
            href="https://orion.vortan.io"
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '5px 14px', background: 'none', color: T.fgMuted, fontSize: 11,
              fontFamily: T.fontMono, letterSpacing: '0.07em', textDecoration: 'none',
              border: `1px solid ${T.border}`, transition: 'border-color 0.15s, color 0.15s', flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = T.fg; (e.currentTarget as HTMLElement).style.borderColor = T.borderStrong; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = T.fgMuted; (e.currentTarget as HTMLElement).style.borderColor = T.border; }}
            className="orion-cta-nav"
          >
            GET ORION
          </a>
        </div>
        <style>{`.orion-cta-nav{display:none}@media(min-width:540px){.orion-cta-nav{display:inline-flex}}`}</style>
      </div>
    </nav>
  );
}

/* ── Page footer ─────────────────────────────────────────────────────── */
function PageFooter() {
  const { T } = useT();
  return (
    <footer style={{ borderTop: `1px solid ${T.border}`, padding: '56px 32px', marginTop: 80 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <OrionMark size={36} />
          <span style={{ fontFamily: T.fontDisplay, fontSize: 28, fontWeight: 700, letterSpacing: '-0.04em', color: T.fg }}>Orion<em style={{ color: T.primary, fontStyle: 'italic' }}>.</em></span>
        </div>
        <p style={{ fontSize: 15, color: T.fgMuted, maxWidth: 420, lineHeight: 1.7, margin: 0 }}>
          Connect, monitor, and control your IoT devices from anywhere.
          Build pages like this one — no code required.
        </p>
        <a
          href="https://orion.vortan.io"
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '12px 28px', background: T.primary, color: '#fff',
            fontSize: 13, fontFamily: T.fontMono, letterSpacing: '0.07em',
            textDecoration: 'none', transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.82')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          START BUILDING FREE →
        </a>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <span style={{ width: 32, height: 1, background: T.border }} />
          <span style={{ fontSize: 10, fontFamily: T.fontMono, color: T.fgFaint, letterSpacing: '0.1em' }}>
            POWERED BY ORION · ORION.VORTAN.IO
          </span>
          <span style={{ width: 32, height: 1, background: T.border }} />
        </div>
      </div>
    </footer>
  );
}

/* ── Live badge ──────────────────────────────────────────────────────── */
function LiveBadge() {
  const { T } = useT();
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', background: T.primaryMuted, border: `1px solid ${T.primary}30`, fontSize: 9.5, fontFamily: T.fontMono, letterSpacing: '0.14em', color: T.primary }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.primary, animation: 'pulse 2s infinite' }} />
      LIVE
    </span>
  );
}

/* ── Tiny sparkline ──────────────────────────────────────────────────── */
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

/* ── Vertical side rail ──────────────────────────────────────────────── */
function SideRail({ text, align = 'left', T }: { text: string; align?: 'left' | 'right'; T: Tokens }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '80px 0', gap: 0, overflow: 'hidden',
    }}>
      <div style={{ width: 1, height: 80, flexShrink: 0, background: `linear-gradient(to bottom, transparent, ${T.border})` }} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120, padding: '20px 0' }}>
        <span style={{
          writingMode: 'vertical-rl',
          transform: align === 'left' ? 'rotate(180deg)' : undefined,
          fontSize: 8.5, fontFamily: T.fontMono, letterSpacing: '0.2em',
          color: T.fgFaint, textTransform: 'uppercase', userSelect: 'none',
        }}>{text}</span>
      </div>
      <div style={{ width: 1, height: 80, flexShrink: 0, background: `linear-gradient(to top, transparent, ${T.border})` }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   DEVICE SHARE VIEW
   ═══════════════════════════════════════════════════════════════════════ */
function DeviceShareView({ token, data }: { token: string; data: any }) {
  const { T, resolved } = useT();
  const outerBg = resolved === 'dark' ? '#060605' : '#e4e4e2';
  const docShadow = resolved === 'dark'
    ? '0 0 0 1px rgba(255,255,255,0.055), 0 32px 80px rgba(0,0,0,0.65), 0 4px 20px rgba(0,0,0,0.45)'
    : '0 0 0 1px rgba(0,0,0,0.07), 0 24px 60px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)';
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
    padding: '5px 12px', border: 'none', borderRadius: 16, cursor: 'pointer', fontSize: 11, fontFamily: T.fontMono,
    background: active ? T.surface : 'transparent', color: active ? T.fg : T.fgMuted,
    boxShadow: active ? T.shadowCard : 'none', transition: 'all 0.15s',
  });

  const leftLabel = [device.category, device.protocol?.toUpperCase()].filter(Boolean).join(' · ');

  return (
    <div style={{ background: outerBg, color: T.fg, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopNav subtitle={device.name} maxContentWidth={1120} />
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes orion-spin { to { transform: rotate(360deg); } }
        @keyframes orion-pulse { 0%{transform:scale(0.9);opacity:0.7} 100%{transform:scale(2.2);opacity:0} }
      `}</style>

      {/* Paper document */}
      <div style={{
        maxWidth: 1120, margin: '24px auto 48px', width: 'calc(100% - 40px)',
        background: T.bg, boxShadow: docShadow, position: 'relative',
      }}>
        {/* Hero gradient inside document */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 400, pointerEvents: 'none',
          background: `radial-gradient(ellipse 70% 50% at 50% 0%, ${T.primaryMuted} 0%, transparent 80%)`,
        }} />

          {/* Main content */}
          <div style={{ padding: '52px 48px 60px', minWidth: 0, position: 'relative' }}>
            {/* Hero */}
            <div style={{ marginBottom: 44 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 10, fontFamily: T.fontMono, letterSpacing: '0.14em', color: T.fgMuted, textTransform: 'uppercase' }}>
                  {device.category} · {device.protocol?.toUpperCase()}
                </span>
                {sections.includes('metrics') && <LiveBadge />}
              </div>
              <h1 style={{ fontFamily: T.fontDisplay, fontSize: 'clamp(34px,5vw,60px)', lineHeight: 1, margin: '0 0 12px', letterSpacing: '-0.03em', color: T.fg }}>
                {(() => {
                  const words = device.name.split(' ');
                  if (words.length === 1) return <em style={{ fontStyle: 'italic', color: T.primary }}>{device.name}</em>;
                  return <>{words.slice(0, -1).join(' ')}{' '}<em style={{ fontStyle: 'italic', color: T.primary }}>{words.slice(-1)[0]}</em></>;
                })()}
              </h1>
              {device.description && <p style={{ fontSize: 15, color: T.fgMuted, maxWidth: 580, lineHeight: 1.65, margin: 0 }}>{device.description}</p>}
            </div>

            {/* Metrics grid */}
            {sections.includes('metrics') && numericFields.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', borderTop: `2px solid ${T.fg}`, marginBottom: 44 }}>
                {numericFields.map(([k, v]) => {
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
                      <div style={{ fontSize: 9.5, fontFamily: T.fontMono, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.fgMuted, marginBottom: 8 }}>{k.replace(/_/g, ' ')}</div>
                      <div style={{ fontFamily: T.fontDisplay, fontSize: 38, lineHeight: 1, color, letterSpacing: '-0.02em' }}>{v.toFixed(2)}</div>
                      {fmeta?.unit && <div style={{ fontSize: 10, fontFamily: T.fontMono, color: T.fgFaint, marginTop: 5 }}>{fmeta.unit}</div>}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Chart section */}
            {sections.includes('chart') && numericFields.length > 0 && (
              <div style={{ marginBottom: 44 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 9.5, fontFamily: T.fontMono, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.fgMuted, marginBottom: 6 }}>Telemetry</div>
                    <div style={{ fontFamily: T.fontDisplay, fontSize: 30, lineHeight: 1, color: T.fg, letterSpacing: '-0.02em', textTransform: 'capitalize' }}>
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
                      <button style={segBtn(telemView === 'chart')} onClick={() => setTelemView('chart')}>
                        <BarChart2 size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />Chart
                      </button>
                      <button style={segBtn(telemView === 'table')} onClick={() => setTelemView('table')}>
                        <TableProperties size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />Table
                      </button>
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
              <div style={{ marginBottom: 44 }}>
                <SectionHeading label="Device Info" T={T} />
                <div style={{ background: T.surface, border: `1px solid ${T.border}` }}>
                  {[['Category', device.category], ['Protocol', device.protocol?.toUpperCase()],
                    ['Payload format', device.payloadFormat?.toUpperCase() ?? '—'],
                    ['Firmware', device.firmwareVersion ?? '—'],
                    ['Tags', device.tags?.join(', ') || '—'],
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
              <div style={{ marginBottom: 44 }}>
                <SectionHeading label="Location" T={T} />
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,200px) 1fr', gap: 16 }}>
                  <div style={{ background: T.surface, border: `1px solid ${T.border}`, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {[['LAT', device.location.lat?.toFixed(6)], ['LNG', (device.location.lng ?? device.location.lon)?.toFixed(6)]].map(([k, v]) => (
                      <div key={k}>
                        <div style={{ fontSize: 9, fontFamily: T.fontMono, letterSpacing: '0.14em', color: T.fgFaint, marginBottom: 4 }}>{k}</div>
                        <div style={{ fontSize: 14, fontFamily: T.fontMono, color: T.fg }}>{v}</div>
                      </div>
                    ))}
                    <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 9, fontFamily: T.fontMono, color: T.fgFaint, letterSpacing: '0.1em', marginBottom: 4 }}>STATUS</div>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontFamily: T.fontMono, padding: '3px 8px',
                        background: device.status === 'online' ? T.good + '22' : T.border,
                        color: device.status === 'online' ? T.good : T.fgMuted,
                      }}>
                        {device.status === 'online' && <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.good, animation: 'pulse 2s infinite' }} />}
                        {device.status?.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div style={{ border: `1px solid ${T.border}`, overflow: 'hidden', minHeight: 280 }}>
                    <ShareMap devices={[device]} geofences={[]} mapTypeId="satellite" T={T} />
                  </div>
                </div>
              </div>
            )}

            {/* History */}
            {sections.includes('history') && (
              <div style={{ marginBottom: 44 }}>
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
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9.5, padding: '2px 8px', letterSpacing: '0.08em',
                                background: cmd.status === 'executed' ? T.good + '22' : cmd.status === 'failed' ? T.bad + '22' : T.border,
                                color: cmd.status === 'executed' ? T.good : cmd.status === 'failed' ? T.bad : T.fgMuted,
                              }}>{cmd.status?.toUpperCase()}</span>
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
      </div>
      <PageFooter />
      <MadeWithBadge />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   PAGE SHARE VIEW
   ═══════════════════════════════════════════════════════════════════════ */
function PageShareView({ pageData }: { pageData: any }) {
  const { T, resolved } = useT();
  const { page, widgetData = {}, org } = pageData;
  const allowExports: boolean = page.allowExports ?? false;
  const visibleWidgets = (page.widgets ?? []).filter((w: any) => w.type !== 'control_panel');
  const displayTitle = page.brandTitle?.trim() || page.name;
  const navLogoUrl = page.brandLogoUrl?.trim() || org?.logoUrl || undefined;
  const navOrgName = !navLogoUrl ? (page.brandTitle?.trim() || org?.name || undefined) : undefined;

  const outerBg = resolved === 'dark' ? '#060605' : '#e4e4e2';
  const docShadow = resolved === 'dark'
    ? '0 0 0 1px rgba(255,255,255,0.055), 0 32px 80px rgba(0,0,0,0.65), 0 4px 20px rgba(0,0,0,0.45)'
    : '0 0 0 1px rgba(0,0,0,0.07), 0 24px 60px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)';

  return (
    <div style={{ background: outerBg, color: T.fg, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopNav subtitle={displayTitle} logoUrl={navLogoUrl} orgName={navOrgName} />
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes orion-spin { to { transform: rotate(360deg); } }
        @keyframes orion-pulse { 0%{transform:scale(0.9);opacity:0.7} 100%{transform:scale(2.2);opacity:0} }
      `}</style>

      {/* Paper document */}
      <div style={{
        maxWidth: 1560, margin: '24px auto 48px', width: 'calc(100% - 40px)',
        background: T.bg, boxShadow: docShadow, position: 'relative',
      }}>
        {/* Hero gradient inside document */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 300, pointerEvents: 'none',
          background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${T.primaryMuted} 0%, transparent 80%)`,
        }} />

        <div style={{ padding: '52px 40px 60px', minWidth: 0, position: 'relative' }}>
          {/* Hero */}
          <div style={{ marginBottom: 48, paddingBottom: 40, borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 9.5, fontFamily: T.fontMono, letterSpacing: '0.14em', color: T.fgMuted, textTransform: 'uppercase' }}>Page · Orion Platform</span>
              <LiveBadge />
            </div>
            <h1 style={{ fontFamily: T.fontDisplay, fontSize: 'clamp(36px,5vw,64px)', lineHeight: 1, margin: '0 0 14px', letterSpacing: '-0.03em', color: T.fg }}>
              {(() => {
                const words = displayTitle.split(' ');
                if (words.length === 1) return <em style={{ fontStyle: 'italic', color: T.primary }}>{displayTitle}</em>;
                return <>{words.slice(0, -1).join(' ')}{' '}<em style={{ fontStyle: 'italic', color: T.primary }}>{words.slice(-1)[0]}</em></>;
              })()}
            </h1>
            {page.description && <p style={{ fontSize: 15, color: T.fgMuted, maxWidth: 560, lineHeight: 1.65, margin: 0 }}>{page.description}</p>}
          </div>

          {/* Widget grid — 12-col × 70px-row, exact match to builder */}
          {visibleWidgets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 24px', opacity: 0.35 }}>
              <div style={{ fontFamily: T.fontDisplay, fontSize: 28, marginBottom: 8, color: T.fg }}>Nothing here yet</div>
              <p style={{ fontSize: 13, color: T.fgMuted }}>This page has no visible widgets.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gridAutoRows: '70px', gap: '12px' }}>
              {visibleWidgets.map((w: any) => {
                const pos = w.position ?? { x: 0, y: 0, w: 4, h: 3 };
                const contentH = Math.max(80, pos.h * 82 - 55);
                return (
                  <div key={w.id} style={{ gridColumn: `${pos.x + 1} / span ${pos.w}`, gridRow: `${pos.y + 1} / span ${pos.h}`, minWidth: 0, minHeight: 0 }}>
                    <PageWidgetCard widget={w} data={widgetData[w.id]} T={T} allowExports={allowExports} contentH={contentH} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <PageFooter />
      <MadeWithBadge />
    </div>
  );
}

/* ── Widget card shell ───────────────────────────────────────────────── */
const WIDGET_ACCENT: Record<string, string> = {
  kpi_card: '#ff5b1f', stat_card: '#ff5b1f',
  line_chart: '#6366f1', multi_line_chart: '#6366f1',
  bar_chart: '#22d3ee', scatter_chart: '#f97316',
  gauge: '#f59e0b', level: '#06b6d4', progress_bar: '#10b981',
  data_table: '#10b981', map: '#3b82f6', status_grid: '#a855f7',
  text: '#888880', separator: '#444444',
};
const EXPORTABLE_TYPES = new Set(['line_chart', 'bar_chart', 'data_table']);

function PageWidgetCard({ widget, data, T, allowExports, contentH }: {
  widget: any; data: any; T: Tokens; allowExports?: boolean; contentH?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const accent = WIDGET_ACCENT[widget.type] ?? T.primary;
  const canExport = allowExports && EXPORTABLE_TYPES.has(widget.type);

  if (widget.type === 'separator' || widget.type === 'text') {
    return <PageWidgetContent widget={widget} data={data} T={T} contentH={contentH} />;
  }

  const handleExport = () => {
    if (widget.type === 'data_table') {
      const entries = Object.entries(data?.fields ?? {}).filter(([, v]) => typeof v === 'number');
      const rows = entries.map(([k, v]) => `"${k}","${v}"`);
      downloadCsv(`${widget.title.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0,10)}.csv`, ['field', 'value'], rows as any);
    } else {
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
        transform: hovered ? 'translateY(-2px)' : 'none',
        overflow: 'hidden',
      }}
    >
      {/* Card header */}
      <div style={{
        padding: '9px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: `1px solid ${T.border}`, flexShrink: 0, background: T.surfaceActive, minHeight: 40,
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
        <PageWidgetContent widget={widget} data={data} T={T} contentH={contentH} />
      </div>
    </div>
  );
}

/* ── Widget content by type ──────────────────────────────────────────── */
function PageWidgetContent({ widget, data, T, contentH = 200 }: { widget: any; data: any; T: Tokens; contentH?: number }) {
  const chartH = Math.max(80, contentH - 16);
  const empty = (msg = 'No data') => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12, fontFamily: T.fontMono, color: T.fgMuted }}>{msg}</div>
  );

  if (widget.type === 'kpi_card') {
    const val = data?.fields?.[widget.field];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, padding: 16 }}>
        <div style={{ fontSize: 9.5, fontFamily: T.fontMono, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.fgMuted }}>{(widget.field ?? 'value').replace(/_/g, ' ')}</div>
        <div style={{ fontFamily: T.fontDisplay, fontSize: `clamp(24px,${Math.max(3, contentH / 8)}px,60px)`, lineHeight: 1, color: T.primary, letterSpacing: '-0.02em' }}>
          {val !== undefined ? Number(val).toFixed(2) : <span style={{ fontSize: 22, color: T.fgFaint }}>—</span>}
        </div>
        {data?.timestamp && <div style={{ fontSize: 9, fontFamily: T.fontMono, color: T.fgFaint }}>updated {new Date(data.timestamp).toLocaleTimeString()}</div>}
      </div>
    );
  }

  if (widget.type === 'stat_card') {
    const val = data?.latest?.fields?.[widget.field];
    const pts: number[] = (data?.series ?? []).map((p: any) => p.value);
    const trend = pts.length >= 2 ? ((pts[pts.length - 1] - pts[0]) / (Math.abs(pts[0]) || 1)) * 100 : null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', padding: '10px 14px' }}>
        <div>
          <div style={{ fontSize: 9.5, fontFamily: T.fontMono, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.fgMuted, marginBottom: 6 }}>
            {(widget.field ?? 'value').replace(/_/g, ' ')}
          </div>
          <div style={{ fontFamily: T.fontDisplay, fontSize: `clamp(20px,${Math.max(3, contentH / 7)}px,52px)`, lineHeight: 1, color: T.primary, letterSpacing: '-0.02em' }}>
            {val !== undefined ? Number(val).toFixed(2) : <span style={{ fontSize: 20, color: T.fgFaint }}>—</span>}
          </div>
          {trend !== null && (
            <div style={{ fontSize: 11, fontFamily: T.fontMono, marginTop: 6, color: trend >= 0 ? T.good : T.bad }}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
            </div>
          )}
        </div>
        {pts.length >= 2 && <Sparkline points={pts} color={T.primary} height={36} />}
      </div>
    );
  }

  if (widget.type === 'gauge') {
    const val = data?.fields?.[widget.field];
    const cfgMin = (widget.config?.min as number) ?? 0;
    const cfgMax = (widget.config?.max as number) ?? 100;
    const pct = val !== undefined ? Math.min(100, Math.max(0, ((val - cfgMin) / (cfgMax - cfgMin)) * 100)) : 0;
    const scale = Math.min(1, contentH / 150);
    const r = 56 * scale; const cx = 80; const cy = 76;
    const start = Math.PI * 0.75; const end = Math.PI * 2.25;
    const arc = (a: number) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    const s = arc(start); const e = arc(end); const a = arc(start + (end - start) * (pct / 100));
    const large = pct > 50 ? 1 : 0;
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: 8 }}>
        <svg viewBox="0 0 160 115" style={{ width: '100%', maxWidth: Math.min(160, contentH * 1.4), height: 'auto' }}>
          <path d={`M ${s.x} ${s.y} A ${r} ${r} 0 1 1 ${e.x} ${e.y}`} fill="none" stroke={T.border} strokeWidth={10} strokeLinecap="round" />
          {pct > 0 && <path d={`M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${a.x} ${a.y}`} fill="none" stroke={T.primary} strokeWidth={10} strokeLinecap="round" />}
          <text x={cx} y={cy} textAnchor="middle" fill={T.fg} style={{ fontFamily: T.fontDisplay, fontSize: 22 }}>{val?.toFixed(1) ?? '—'}</text>
          <text x={cx} y={cy + 16} textAnchor="middle" fill={T.fgMuted} style={{ fontFamily: T.fontMono, fontSize: 8.5, textTransform: 'uppercase' }}>{widget.field ?? ''}</text>
        </svg>
      </div>
    );
  }

  if (widget.type === 'level') {
    const val = data?.fields?.[widget.field];
    const cfgMin = (widget.config?.min as number) ?? 0;
    const cfgMax = (widget.config?.max as number) ?? 100;
    const pct = val !== undefined ? Math.min(100, Math.max(0, ((val - cfgMin) / (cfgMax - cfgMin)) * 100)) : 0;
    const accent = WIDGET_ACCENT.level;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 12, gap: 8 }}>
        <div style={{ flex: 1, width: 44, border: `2px solid ${T.borderStrong}`, position: 'relative', overflow: 'hidden', borderRadius: 6 }}>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: accent, height: `${pct}%`, transition: 'height 0.8s ease', opacity: 0.85 }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: pct > 50 ? '#fff' : T.fg, fontFamily: T.fontDisplay, fontSize: 15, fontWeight: 700 }}>
            {pct.toFixed(0)}%
          </div>
        </div>
        <div style={{ fontSize: 9.5, fontFamily: T.fontMono, color: T.fgMuted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {(widget.field ?? '').replace(/_/g, ' ')}
        </div>
        {val !== undefined && <div style={{ fontSize: 11, fontFamily: T.fontMono, color: accent }}>{Number(val).toFixed(2)}</div>}
      </div>
    );
  }

  if (widget.type === 'progress_bar') {
    const val = data?.fields?.[widget.field];
    const cfgMin = (widget.config?.min as number) ?? 0;
    const cfgMax = (widget.config?.max as number) ?? 100;
    const pct = val !== undefined ? Math.min(100, Math.max(0, ((val - cfgMin) / (cfgMax - cfgMin)) * 100)) : 0;
    const accent = WIDGET_ACCENT.progress_bar;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', padding: '0 16px', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 9.5, fontFamily: T.fontMono, color: T.fgMuted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{(widget.field ?? '').replace(/_/g, ' ')}</span>
          <span style={{ fontFamily: T.fontDisplay, fontSize: 22, color: T.primary }}>{val !== undefined ? Number(val).toFixed(1) : '—'}</span>
        </div>
        <div style={{ height: 14, background: T.border, overflow: 'hidden', borderRadius: 3, position: 'relative' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: accent, transition: 'width 0.8s ease', borderRadius: 3 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: T.fontMono, color: T.fgFaint }}>
          <span>{cfgMin}</span><span>{Math.round(pct)}%</span><span>{cfgMax}</span>
        </div>
      </div>
    );
  }

  if (widget.type === 'line_chart') {
    const pts = (Array.isArray(data) ? data : []).map((p: any) => ({ ts: new Date(p.ts).getTime(), value: p.value }));
    return pts.length > 0
      ? <div style={{ padding: '6px 4px 2px', height: '100%' }}><LineChart series={[{ name: widget.field ?? '', data: pts, color: T.primary }]} height={chartH} showArea /></div>
      : empty('No data yet');
  }

  if (widget.type === 'multi_line_chart') {
    const seriesArr: any[] = Array.isArray(data) ? data : [];
    if (seriesArr.length === 0) return empty('No series data');
    const chartSeries = seriesArr.map((s: any) => ({
      name: s.name ?? s.field ?? '',
      color: s.color || T.primary,
      data: (s.data ?? []).map((p: any) => ({ ts: new Date(p.ts).getTime(), value: p.value })),
    }));
    return <div style={{ padding: '6px 4px 2px', height: '100%' }}><LineChart series={chartSeries} height={chartH} /></div>;
  }

  if (widget.type === 'bar_chart') {
    const pts = (Array.isArray(data) ? data : []).slice(-24).map((p: any) => ({
      label: new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      value: p.value,
    }));
    return pts.length > 0
      ? <div style={{ padding: '6px 4px 2px', height: '100%' }}><BarChart data={pts} color={T.primary} height={chartH} /></div>
      : empty('No data yet');
  }

  if (widget.type === 'scatter_chart') {
    const xData: any[] = data?.xData ?? [];
    const yData: any[] = data?.yData ?? [];
    if (xData.length === 0 || yData.length === 0) return empty('No scatter data');
    const pairs: { x: number; y: number }[] = [];
    for (const xp of xData) {
      const xt = new Date(xp.ts).getTime();
      const best = yData.reduce((b: any, yp: any) =>
        Math.abs(new Date(yp.ts).getTime() - xt) < Math.abs(new Date(b.ts).getTime() - xt) ? yp : b, yData[0]);
      if (Math.abs(new Date(best.ts).getTime() - xt) < 120_000) pairs.push({ x: xp.value, y: best.value });
    }
    if (pairs.length === 0) return empty('No paired points');
    const xs = pairs.map(p => p.x); const ys = pairs.map(p => p.y);
    const minX = Math.min(...xs); const maxX = Math.max(...xs) || minX + 1;
    const minY = Math.min(...ys); const maxY = Math.max(...ys) || minY + 1;
    const W = 300; const H = Math.max(180, chartH); const pad = { t: 8, r: 8, b: 28, l: 40 };
    const px = (v: number) => pad.l + ((v - minX) / (maxX - minX)) * (W - pad.l - pad.r);
    const py = (v: number) => H - pad.b - ((v - minY) / (maxY - minY)) * (H - pad.t - pad.b);
    return (
      <div style={{ height: '100%', padding: '4px 0 0' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
          <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke={T.border} strokeWidth={1} />
          <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke={T.border} strokeWidth={1} />
          {pairs.map((p, i) => <circle key={i} cx={px(p.x)} cy={py(p.y)} r={3.5} fill={WIDGET_ACCENT.scatter_chart} fillOpacity={0.65} />)}
          <text x={W / 2} y={H - 4} textAnchor="middle" style={{ fontSize: 8, fontFamily: T.fontMono, fill: T.fgMuted }}>{data?.xField ?? 'X'}</text>
          <text x={8} y={H / 2} textAnchor="middle" transform={`rotate(-90,8,${H / 2})`} style={{ fontSize: 8, fontFamily: T.fontMono, fill: T.fgMuted }}>{data?.yField ?? 'Y'}</text>
        </svg>
      </div>
    );
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
    const mapData = Array.isArray(data) ? { devices: data, geofences: [] } : (data ?? { devices: [], geofences: [] });
    const devices: any[] = (mapData.devices ?? []).filter(Boolean);
    const geofences: any[] = mapData.geofences ?? [];
    if (devices.length === 0) return empty('No location data');
    return <ShareMap devices={devices} geofences={geofences} T={T} />;
  }

  if (widget.type === 'text') {
    const text = (widget.config?.text as string) ?? '';
    const fontSize = (widget.config?.fontSize as number) ?? 16;
    const isDisplay = (widget.config?.font as string) !== 'mono';
    const align = (widget.config?.align as string) ?? 'left';
    const color = (widget.config?.color as string) ?? T.fg;
    return (
      <div style={{ padding: '12px 16px', height: '100%', overflowY: 'auto', display: 'flex', alignItems: 'center' }}>
        <div style={{
          fontFamily: isDisplay ? T.fontDisplay : T.fontMono,
          fontSize, color, lineHeight: 1.55,
          textAlign: align as React.CSSProperties['textAlign'],
          whiteSpace: 'pre-wrap', width: '100%',
        }}>
          {text || <span style={{ opacity: 0.3 }}>No content</span>}
        </div>
      </div>
    );
  }

  if (widget.type === 'separator') {
    const orientation = (widget.config?.orientation as string) ?? 'horizontal';
    const thickness = (widget.config?.thickness as number) ?? 1;
    const color = (widget.config?.color as string) ?? T.border;
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '0 8px' }}>
        {orientation === 'vertical'
          ? <div style={{ width: thickness, height: '80%', background: color }} />
          : <div style={{ height: thickness, width: '100%', background: color }} />}
      </div>
    );
  }

  return empty(widget.type.replace(/_/g, ' '));
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
    { key: 'satellite', label: 'SAT' }, { key: 'hybrid', label: 'HYB' },
    { key: 'roadmap', label: 'MAP' }, { key: 'terrain', label: 'TRN' },
  ];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 200 }}>
      {/* Map type pill */}
      <div style={{
        position: 'absolute', top: 10, right: 10, zIndex: 10,
        display: 'flex', gap: 2, background: T.bg + 'e8', border: `1px solid ${T.border}`,
        padding: 3, backdropFilter: 'blur(8px)',
      }}>
        {MAP_TYPES.map(({ key, label }) => (
          <button key={key} onClick={() => setMapType(key)} style={{
            padding: '4px 9px', border: 'none', cursor: 'pointer', fontSize: 9.5, fontFamily: T.fontMono, letterSpacing: '0.06em',
            background: mapType === key ? T.primary : 'transparent',
            color: mapType === key ? '#fff' : T.fgMuted,
            transition: 'all 0.15s',
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
        shapes.push(new win.google.maps.Polygon({
          paths: gf.coordinates, strokeColor: gf.color ?? '#FF5B1F', strokeOpacity: 0.9, strokeWeight: 2,
          fillColor: gf.color ?? '#FF5B1F', fillOpacity: 0.15, map,
        }));
      } else if (gf.type === 'circle' && gf.center) {
        shapes.push(new win.google.maps.Circle({
          center: gf.center, radius: gf.radius ?? 100,
          strokeColor: gf.color ?? '#FF5B1F', strokeOpacity: 0.9, strokeWeight: 2,
          fillColor: gf.color ?? '#FF5B1F', fillOpacity: 0.15, map,
        }));
      }
    }
    return () => shapes.forEach(s => s.setMap(null));
  }, [map, geofences]);

  return null;
}

/* ── Device marker — Orion-themed concentric ring pin ────────────────── */
const CAT_COLORS: Record<string, string> = {
  tracker: '#FF5B1F', environmental: '#10B981', energy: '#FACC15', water: '#3B82F6',
  industrial: '#F97316', gateway: '#06B6D4', research: '#EC4899', telemetry: '#8B5CF6',
  pump: '#14B8A6', mobile: '#F59E0B', fixed: '#6366F1', custom: '#8B5CF6',
};

function DeviceMarker({ device, T }: { device: any; T: Tokens }) {
  const [hovered, setHovered] = useState(false);
  const loc = device.location;
  if (!loc?.lat) return null;
  const color = CAT_COLORS[device.category] ?? T.primary;
  const isOnline = device.status === 'online';

  return (
    <AdvancedMarker position={{ lat: loc.lat, lng: loc.lng ?? loc.lon ?? 0 }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ position: 'relative', cursor: 'pointer' }}
      >
        {/* Hover tooltip */}
        {hovered && (
          <div style={{
            position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
            background: T.surface, border: `1px solid ${T.borderStrong}`,
            padding: '10px 14px', whiteSpace: 'nowrap', boxShadow: T.shadowHover, minWidth: 150,
            pointerEvents: 'none',
          }}>
            {/* Triangle pointer */}
            <div style={{
              position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)',
              width: 8, height: 8, background: T.surface, border: `1px solid ${T.borderStrong}`,
              borderTop: 'none', borderLeft: 'none', rotate: '45deg',
            }} />
            <div style={{ fontSize: 12, fontWeight: 600, color: T.fg, marginBottom: 3 }}>{device.name}</div>
            <div style={{ fontSize: 9.5, fontFamily: T.fontMono, color: T.fgMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{device.category}</div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9.5, fontFamily: T.fontMono,
              padding: '2px 8px', letterSpacing: '0.06em',
              background: isOnline ? T.good + '22' : T.border,
              color: isOnline ? T.good : T.fgMuted,
            }}>
              {isOnline && <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.good, animation: 'pulse 2s infinite' }} />}
              {device.status?.toUpperCase()}
            </span>
          </div>
        )}

        {/* Pulsing ring for online devices */}
        {isOnline && (
          <div style={{
            position: 'absolute', inset: -10,
            borderRadius: '50%', border: `1.5px solid ${color}`,
            animation: 'orion-pulse 2.5s ease-out infinite',
            pointerEvents: 'none',
          }} />
        )}

        {/* Orion-branded pin: concentric circles matching logo */}
        <svg
          width={28} height={28} viewBox="0 0 28 28" fill="none"
          style={{ display: 'block', filter: `drop-shadow(0 2px 6px ${color}66)`, transition: 'transform 0.15s', transform: hovered ? 'scale(1.25)' : 'scale(1)' }}
        >
          {/* Outer ring */}
          <circle cx="14" cy="14" r="12" stroke={color} strokeWidth="2" fill={T.surface} fillOpacity="0.92" />
          {/* Middle ring */}
          <circle cx="14" cy="14" r="7" stroke={color} strokeWidth="1.5" opacity="0.45" fill="none" />
          {/* Center dot */}
          <circle cx="14" cy="14" r="3" fill={color} />
        </svg>
      </div>
    </AdvancedMarker>
  );
}

/* ── CSV download helper ─────────────────────────────────────────────── */
function downloadCsv(filename: string, headers: string[], rows: any[]) {
  const header = headers.map(h => `"${h}"`).join(',');
  const body = rows.join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function ExportBtn({ onClick, T }: { onClick: () => void; T: Tokens }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 8px', border: `1px solid ${T.border}`, background: 'transparent',
        color: T.fgMuted, fontSize: 9.5, fontFamily: T.fontMono, letterSpacing: '0.06em',
        cursor: 'pointer', transition: 'all 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = T.fg; (e.currentTarget as HTMLElement).style.borderColor = T.borderStrong; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = T.fgMuted; (e.currentTarget as HTMLElement).style.borderColor = T.border; }}
    >
      <Download size={9} />CSV
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
    downloadCsv(`${field}-${new Date().toISOString().slice(0,10)}.csv`, ['timestamp', field], rows);
  };

  if (isLoading) return <div style={{ height: 280, background: T.surfaceActive, animation: 'pulse 2s infinite' }} />;
  if (pts.length === 0) return <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.fgMuted, fontFamily: T.fontMono, fontSize: 12 }}>No data</div>;
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 5 }}>
        <ExportBtn onClick={exportCsv} T={T} />
      </div>
      <LineChart series={[{ name: field, data: pts, color }]} height={280} showArea />
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
    downloadCsv(`${field}-${new Date().toISOString().slice(0,10)}.csv`, ['timestamp', field], csvRows);
  };

  if (isLoading) return <div style={{ height: 280, background: T.surfaceActive, animation: 'pulse 2s infinite' }} />;
  if (rows.length === 0) return <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.fgMuted, fontFamily: T.fontMono, fontSize: 12 }}>No data in range</div>;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 14px 0' }}>
        <ExportBtn onClick={exportCsv} T={T} />
      </div>
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 320 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: T.fontMono, fontSize: 11 }}>
          <thead style={{ position: 'sticky', top: 0, background: T.surfaceActive, zIndex: 1 }}>
            <tr>
              <th style={{ padding: '9px 16px', textAlign: 'left', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.fgMuted, borderBottom: `1px solid ${T.border}`, fontWeight: 600 }}>Timestamp</th>
              <th style={{ padding: '9px 16px', textAlign: 'right', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color, borderBottom: `1px solid ${T.border}`, fontWeight: 600 }}>
                {field.replace(/_/g, ' ')}{fm?.unit ? ` (${fm.unit})` : ''}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: any, i: number) => (
              <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : T.surfaceHover }}>
                <td style={{ padding: '8px 16px', color: T.fgMuted, whiteSpace: 'nowrap', borderBottom: `1px solid ${T.border}` }}>{new Date(row.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                <td style={{ padding: '8px 16px', textAlign: 'right', color, borderBottom: `1px solid ${T.border}`, fontVariantNumeric: 'tabular-nums' }}>{typeof row.value === 'number' ? row.value.toFixed(4) : String(row.value ?? '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Fixed "Made with Orion" badge (Framer-style) ───────────────────── */
function MadeWithBadge() {
  const { T } = useT();
  return (
    <a
      href="https://orion.vortan.io"
      target="_blank"
      rel="noreferrer"
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 60,
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 10px',
        background: T.surface, border: `1px solid ${T.border}`,
        boxShadow: T.shadowCard,
        fontSize: 10, fontFamily: T.fontMono, color: T.fgMuted,
        textDecoration: 'none', transition: 'color 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = T.fg; (e.currentTarget as HTMLElement).style.borderColor = T.borderStrong; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = T.fgMuted; (e.currentTarget as HTMLElement).style.borderColor = T.border; }}
    >
      <OrionMark size={12} />
      Made with Orion
    </a>
  );
}

/* ── Section heading — font mixing signature ─────────────────────────── */
function SectionHeading({ label, T }: { label: string; T: Tokens }) {
  const words = label.split(' ');
  const rest = words.slice(0, -1).join(' ');
  const last = words.slice(-1)[0];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
      <div style={{ fontFamily: T.fontDisplay, fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, flexShrink: 0, color: T.fg }}>
        {rest ? <>{rest}{' '}<em style={{ fontStyle: 'italic', color: T.primary }}>{last}</em></> : <em style={{ fontStyle: 'italic', color: T.primary }}>{last}</em>}
      </div>
      <div style={{ flex: 1, height: 1, background: T.border }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   ROOT — resolves token, wraps in ThemeProvider
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

  return (
    <ThemeProvider>
      {isLoading
        ? <LoadingScreen />
        : deviceData?.device
          ? <DeviceShareView token={token!} data={deviceData} />
          : pageData?.page
            ? <PageShareView pageData={pageData} />
            : <NotFoundScreen />}
    </ThemeProvider>
  );
}

/* ── Loading screen — animated Orion radar ───────────────────────────── */
function LoadingScreen() {
  const { T } = useT();
  return (
    <div style={{
      minHeight: '100vh', background: T.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 0, position: 'relative', overflow: 'hidden',
    }}>
      <style>{`
        @keyframes orion-spin { to { transform: rotate(360deg); } }
        @keyframes orion-pulse { 0%{transform:scale(0.8);opacity:0.6} 100%{transform:scale(2.4);opacity:0} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes fade-up { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
      `}</style>

      {/* Radial background glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(ellipse 60% 60% at 50% 48%, ${T.primaryMuted} 0%, transparent 70%)`,
      }} />

      {/* Animated logo stack */}
      <div style={{ position: 'relative', width: 100, height: 100, marginBottom: 36 }}>
        {/* Outer pulse ring 1 */}
        <div style={{
          position: 'absolute', inset: -16, borderRadius: '50%',
          border: `1px solid ${T.primary}`,
          animation: 'orion-pulse 2.6s ease-out infinite',
        }} />
        {/* Outer pulse ring 2 (offset) */}
        <div style={{
          position: 'absolute', inset: -16, borderRadius: '50%',
          border: `1px solid ${T.primary}`,
          animation: 'orion-pulse 2.6s ease-out 0.9s infinite',
        }} />
        {/* Spinning logo */}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'orion-spin 10s linear infinite',
        }}>
          <OrionMark size={100} color={T.primary} />
        </div>
      </div>

      {/* Wordmark */}
      <div style={{ textAlign: 'center', zIndex: 1, animation: 'fade-up 0.6s ease both 0.2s' }}>
        <div style={{
          fontFamily: T.fontDisplay, fontSize: 52, fontWeight: 700,
          letterSpacing: '-0.05em', lineHeight: 1, color: T.fg,
        }}>
          Orion<em style={{ color: T.primary, fontStyle: 'italic' }}>.</em>
        </div>
        <div style={{
          fontFamily: T.fontMono, fontSize: 10, letterSpacing: '0.24em',
          color: T.fgMuted, marginTop: 10, textTransform: 'uppercase',
          animation: 'pulse 2s ease infinite',
        }}>
          Loading · Please wait
        </div>
      </div>
    </div>
  );
}

/* ── Not found screen ────────────────────────────────────────────────── */
function NotFoundScreen() {
  const { T } = useT();
  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.fg, display: 'flex', flexDirection: 'column' }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}} @keyframes orion-spin{to{transform:rotate(360deg)}}`}</style>
      <TopNav />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32 }}>
        <OrionMark size={48} />
        <div style={{ fontFamily: T.fontDisplay, fontSize: 'clamp(28px,4vw,48px)', letterSpacing: '-0.03em', color: T.fg }}>
          Link <em style={{ color: T.primary, fontStyle: 'italic' }}>expired</em>
        </div>
        <p style={{ fontSize: 14, color: T.fgMuted, maxWidth: 380, textAlign: 'center', lineHeight: 1.7, margin: 0 }}>
          This share link has expired or doesn't exist.<br />Ask the sender for a fresh link.
        </p>
        <a href="https://orion.vortan.io" style={{ fontSize: 12, fontFamily: T.fontMono, color: T.primary, textDecoration: 'none', letterSpacing: '0.08em', marginTop: 4 }}>
          EXPLORE ORION →
        </a>
      </div>
      <PageFooter />
    </div>
  );
}
