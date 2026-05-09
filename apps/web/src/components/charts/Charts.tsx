import React, { useRef, useEffect, useState, useCallback, type RefObject } from 'react';

function useWidth(ref: RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.offsetWidth);
    const ro = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

const PALETTE = ['#FF6A30', '#5B8DEF', '#22C55E', '#F59E0B', '#8B5CF6', '#06B6D4', '#F43F5E', '#10B981'];

function decimate(data: { ts: number; value: number }[], maxPts = 200): { ts: number; value: number }[] {
  if (data.length <= maxPts) return data;
  const bucketSize = data.length / maxPts;
  const out: { ts: number; value: number }[] = [data[0]];
  for (let b = 1; b < maxPts - 1; b++) {
    const start = Math.floor(b * bucketSize);
    const end   = Math.floor((b + 1) * bucketSize);
    const bucket = data.slice(start, end);
    const minP = bucket.reduce((a, c) => c.value < a.value ? c : a, bucket[0]);
    const maxP = bucket.reduce((a, c) => c.value > a.value ? c : a, bucket[0]);
    if (minP.ts <= maxP.ts) { out.push(minP); if (minP.ts !== maxP.ts) out.push(maxP); }
    else                    { out.push(maxP); if (minP.ts !== maxP.ts) out.push(minP); }
  }
  out.push(data[data.length - 1]);
  return out;
}

/** Fritsch-Carlson monotone cubic — no Y overshoots, no X backtracking */
function smoothCurve(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  if (pts.length === 2) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)}`;
  const n = pts.length;
  const dx: number[] = [], dy: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x;
    dy[i] = pts[i + 1].y - pts[i].y;
    m[i] = dy[i] / (dx[i] || 1);
  }
  const t: number[] = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] === 0 || m[i] === 0 || (m[i - 1] > 0) !== (m[i] > 0)) {
      t[i] = 0;
    } else {
      const common = dx[i - 1] + dx[i];
      t[i] = 3 * common / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
    }
  }
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i];
    const cp1x = pts[i].x + h / 3;
    const cp1y = pts[i].y + t[i] * h / 3;
    const cp2x = pts[i + 1].x - h / 3;
    const cp2y = pts[i + 1].y - t[i + 1] * h / 3;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

export interface ChartSeries {
  name: string;
  data: Array<{ ts: number | string; value: number }>;
  color?: string;
}

// ─── LineChart ──────────────────────────────────────────────────────────────
export function LineChart({
  series,
  height = 260,
  showArea = false,
  normalize = false,
  theme,
}: {
  series: ChartSeries[];
  height?: number;
  showArea?: boolean;
  normalize?: boolean;
  theme?: 'light' | 'dark';
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const w = useWidth(wrapRef);
  const uid = useRef(`lc-${Math.random().toString(36).slice(2)}`).current;
  const [hover, setHover] = useState<{
    x: number;
    items: Array<{ name: string; value: number; color: string; y: number }>;
    tsLabel: string;
  } | null>(null);

  const PAD = { top: 20, right: 20, bottom: 40, left: 54 };

  const prep = (s: ChartSeries) =>
    decimate(s.data.map(p => ({
      ts: typeof p.ts === 'string' ? new Date(p.ts).getTime() : (p.ts as number),
      value: p.value,
    })));

  const allMapped = series.flatMap(prep);
  const isEmpty = !w || allMapped.length === 0;

  const allTs   = allMapped.map(d => d.ts);
  const allVals = allMapped.map(d => d.value);
  const minTs = Math.min(...allTs);
  const maxTs = Math.max(...allTs);
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const pad5 = (rawMax - rawMin) * 0.10 || Math.abs(rawMax) * 0.10 || 1;
  const globalMin = rawMin - pad5;
  const globalMax = rawMax + pad5;
  const globalRange = globalMax - globalMin || 1;

  const innerW = w - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const xScale = (ts: number) =>
    PAD.left + (maxTs === minTs ? innerW / 2 : ((ts - minTs) / (maxTs - minTs)) * innerW);

  const globalY = (v: number) =>
    PAD.top + innerH - ((v - globalMin) / globalRange) * innerH;

  const makeLocalY = (data: { ts: number; value: number }[]) => {
    const mn = Math.min(...data.map(d => d.value));
    const mx = Math.max(...data.map(d => d.value));
    const p = (mx - mn) * 0.10 || Math.abs(mx) * 0.10 || 1;
    const rng = (mx + p) - (mn - p) || 1;
    return (v: number) => PAD.top + innerH - ((v - (mn - p)) / rng) * innerH;
  };

  const fmtV = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000)    return `${(v / 1_000).toFixed(1)}k`;
    if (abs >= 100 || Number.isInteger(v)) return v.toFixed(0);
    if (abs >= 10) return v.toFixed(1);
    return v.toFixed(2);
  };

  const totalHrs = (maxTs - minTs) / 3_600_000;

  const fmtTs = (ts: number): string => {
    const d = new Date(ts);
    if (totalHrs > 7 * 24) return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
    if (totalHrs > 24)     return d.toLocaleDateString('en', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false });
    if (totalHrs > 1)      return d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false });
    return d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  const toXY = (data: { ts: number; value: number }[], yFn: (v: number) => number) =>
    data.map(p => ({ x: xScale(p.ts), y: yFn(p.value) }));

  const buildPath = (data: { ts: number; value: number }[], yFn: (v: number) => number) =>
    smoothCurve(toXY(data, yFn));

  const buildArea = (data: { ts: number; value: number }[], yFn: (v: number) => number) => {
    if (data.length < 1) return '';
    const xy = toXY(data, yFn);
    if (xy.length === 1) return ''; // single point — no area
    const line = smoothCurve(xy);
    const bot = (PAD.top + innerH).toFixed(1);
    return `${line} L ${xy[xy.length - 1].x.toFixed(1)},${bot} L ${xy[0].x.toFixed(1)},${bot} Z`;
  };

  // Y axis ticks
  const Y_TICKS = 4;
  const tickVals = Array.from({ length: Y_TICKS + 1 }, (_, i) => globalMin + (i / Y_TICKS) * globalRange);

  // X axis ticks — pixel-distance deduplication to prevent overlap/doubling
  const pivotData = prep(series[0] ?? { name: '', data: [] });
  const MIN_X_PX = 68;
  const targetCount = Math.max(2, Math.floor(innerW / MIN_X_PX));
  const rawStep = Math.max(1, Math.floor(pivotData.length / targetCount));
  const candidates = pivotData.filter((_, i) => i % rawStep === 0);
  const lastP = pivotData[pivotData.length - 1];
  if (lastP && candidates[candidates.length - 1]?.ts !== lastP.ts) candidates.push(lastP);
  const xTicks = candidates.reduce((acc: typeof candidates, p) => {
    if (!acc.length) return [p];
    if (xScale(p.ts) - xScale(acc[acc.length - 1].ts) >= MIN_X_PX) acc.push(p);
    return acc;
  }, []);

  // Show data dots when dataset is sparse
  const showDots = allMapped.length > 0 && allMapped.length <= 60;

  const baselineY = PAD.top + innerH;

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!pivotData.length || !w) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    let ci = 0, cd = Infinity;
    pivotData.forEach((p, i) => {
      const dist = Math.abs(xScale(p.ts) - mx);
      if (dist < cd) { cd = dist; ci = i; }
    });
    const pt = pivotData[ci];
    const items = series.map((s, si) => {
      const color = s.color ?? PALETTE[si % PALETTE.length];
      const mapped = prep(s);
      const yFn = normalize ? makeLocalY(mapped) : globalY;
      const closest = mapped.reduce((a, b) => Math.abs(b.ts - pt.ts) < Math.abs(a.ts - pt.ts) ? b : a, mapped[0]);
      const val = closest?.value ?? 0;
      return { name: s.name, value: val, color, y: yFn(val) };
    });
    setHover({ x: xScale(pt.ts), items, tsLabel: fmtTs(pt.ts) });
  }, [series, pivotData, w, normalize]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDark = theme !== 'light';
  const themeVars = theme != null ? {
    '--tt-bg': isDark ? 'rgba(12,12,11,0.96)' : 'rgba(252,251,249,0.97)',
    '--tt-border': isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.09)',
    '--tt-ts': isDark ? 'rgba(200,200,190,0.45)' : 'rgba(60,55,45,0.45)',
    '--tt-label': isDark ? 'rgba(200,200,190,0.55)' : 'rgba(60,55,45,0.60)',
    '--chart-dot-bg': isDark ? '#fff' : '#0B0B0A',
    '--tt-shadow': isDark ? '0 8px 32px rgba(0,0,0,0.5)' : '0 4px 20px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
  } : {};

  return (
    <div ref={wrapRef} style={{ position: 'relative', height, ...themeVars } as React.CSSProperties}>
      {isEmpty ? (
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}>
          <span style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.05em' }}>No data</span>
        </div>
      ) : (
        <svg
          width={w} height={height}
          style={{ overflow: 'hidden', display: 'block', cursor: 'crosshair' }}
          shapeRendering="geometricPrecision"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            {series.map((s, si) => {
              const color = s.color ?? PALETTE[si % PALETTE.length];
              return (
                <linearGradient key={si} id={`${uid}-g${si}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={color} stopOpacity="0.22" />
                  <stop offset="60%"  stopColor={color} stopOpacity="0.06" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
              );
            })}
            <clipPath id={`${uid}-clip`}>
              <rect x={PAD.left} y={PAD.top - 4} width={innerW} height={innerH + 8} />
            </clipPath>
          </defs>

          {/* Y gridlines */}
          {tickVals.map((v, i) => (
            i > 0 && (
              <line key={i}
                x1={PAD.left} x2={PAD.left + innerW}
                y1={globalY(v)} y2={globalY(v)}
                stroke="currentColor" strokeOpacity={0.06} strokeWidth={1}
                strokeDasharray="4 5"
              />
            )
          ))}

          {/* Baseline */}
          <line x1={PAD.left} x2={PAD.left + innerW} y1={baselineY} y2={baselineY}
            stroke="currentColor" strokeOpacity={0.12} strokeWidth={1} />

          {/* Y labels */}
          {tickVals.map((v, i) => (
            <text key={i}
              x={PAD.left - 10} y={globalY(v)}
              textAnchor="end" dominantBaseline="middle"
              fill="currentColor" fillOpacity={0.35} fontSize={10}
              fontFamily="var(--font-mono, monospace)">
              {fmtV(v)}
            </text>
          ))}

          {/* X labels */}
          {xTicks.map((p, i) => (
            <text key={i}
              x={Math.min(Math.max(xScale(p.ts), PAD.left + 4), PAD.left + innerW - 4)}
              y={height - 8}
              textAnchor="middle"
              fill="currentColor" fillOpacity={0.38} fontSize={10}
              fontFamily="var(--font-mono, monospace)">
              {fmtTs(p.ts)}
            </text>
          ))}

          {/* Area fills */}
          {showArea && series.map((s, si) => {
            const color = s.color ?? PALETTE[si % PALETTE.length];
            const mapped = prep(s);
            const yFn = normalize ? makeLocalY(mapped) : globalY;
            return (
              <path key={si}
                d={buildArea(mapped, yFn)}
                fill={`url(#${uid}-g${si})`}
                clipPath={`url(#${uid}-clip)`}
              />
            );
          })}

          {/* Lines */}
          {series.map((s, si) => {
            const color = s.color ?? PALETTE[si % PALETTE.length];
            const mapped = prep(s);
            const yFn = normalize ? makeLocalY(mapped) : globalY;
            return (
              <path key={si}
                d={buildPath(mapped, yFn)}
                fill="none" stroke={color}
                strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round"
                clipPath={`url(#${uid}-clip)`}
              />
            );
          })}

          {/* Data dots — shown when dataset is sparse */}
          {showDots && series.map((s, si) => {
            const color = s.color ?? PALETTE[si % PALETTE.length];
            const mapped = prep(s);
            const yFn = normalize ? makeLocalY(mapped) : globalY;
            return mapped.map((p, pi) => (
              <circle key={`${si}-${pi}`}
                cx={xScale(p.ts)} cy={yFn(p.value)} r={3}
                fill={color} opacity={0.9}
                clipPath={`url(#${uid}-clip)`}
              />
            ));
          })}

          {/* Hover crosshair */}
          {hover && (
            <line
              x1={hover.x} x2={hover.x} y1={PAD.top} y2={baselineY}
              stroke="currentColor" strokeOpacity={0.15} strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}

          {/* Hover dots */}
          {hover && hover.items.map((item, i) => (
            <g key={i}>
              <circle cx={hover.x} cy={item.y} r={5} fill={item.color} opacity={0.9} />
              <circle cx={hover.x} cy={item.y} r={2.5} fill="var(--chart-dot-bg, #fff)" opacity={0.9} />
            </g>
          ))}
        </svg>
      )}

      {/* Tooltip */}
      {!isEmpty && hover && (() => {
        const tooltipW = 140;
        const leftPos = hover.x + tooltipW + 16 > w ? hover.x - tooltipW - 12 : hover.x + 12;
        return (
          <div style={{
            position: 'absolute',
            top: PAD.top,
            left: leftPos,
            pointerEvents: 'none',
            background: 'var(--tt-bg, rgba(12,12,11,0.93))',
            border: '1px solid var(--tt-border, rgba(255,255,255,0.08))',
            backdropFilter: 'blur(16px)',
            padding: '8px 12px',
            minWidth: tooltipW,
            boxShadow: 'var(--tt-shadow, 0 8px 32px rgba(0,0,0,0.5))',
          }}>
            <div style={{ fontSize: 9.5, fontFamily: 'var(--font-mono, monospace)', color: 'var(--tt-ts, rgba(200,200,190,0.45))', marginBottom: 7, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
              {hover.tsLabel}
            </div>
            {hover.items.map(item => (
              <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                <span style={{ width: 8, height: 2, background: item.color, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: 'var(--tt-label, rgba(200,200,190,0.55))', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.name}
                </span>
                <strong style={{ fontSize: 11.5, fontFamily: 'var(--font-mono, monospace)', color: item.color, letterSpacing: '-0.02em' }}>
                  {typeof item.value === 'number' ? fmtV(item.value) : item.value}
                </strong>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

// ─── Sparkline ──────────────────────────────────────────────────────────────
export function Sparkline({
  data,
  color = '#FF6A30',
  height = 32,
  fill = true,
}: {
  data: number[];
  color?: string;
  height?: number;
  fill?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const w = useWidth(ref);
  const uid = useRef(`sp-${Math.random().toString(36).slice(2)}`).current;

  const isEmpty = !w || data.length < 2;
  const minV = isEmpty ? 0 : Math.min(...data);
  const maxV = isEmpty ? 0 : Math.max(...data);
  const range = isEmpty ? 1 : (maxV - minV || 1);
  const pts = isEmpty ? [] : data.map((v, i) => ({
    x: (i / (data.length - 1)) * w,
    y: (height - 2) - ((v - minV) / range) * (height - 4) + 1,
  }));
  const path = isEmpty ? '' : smoothCurve(pts);
  const area = isEmpty ? '' : `${path} L ${pts[pts.length - 1].x.toFixed(1)} ${height} L 0 ${height} Z`;

  return (
    <div ref={ref} style={{ height }}>
      {!isEmpty && (
        <svg width={w} height={height} style={{ overflow: 'hidden', display: 'block' }}>
          {fill && (
            <>
              <defs>
                <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={color} stopOpacity="0.3" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area} fill={`url(#${uid})`} />
            </>
          )}
          <path d={path} fill="none" stroke={color} strokeWidth={1.5}
            strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}

// ─── BarChart ───────────────────────────────────────────────────────────────
export function BarChart({
  data,
  height = 200,
  color = '#FF6A30',
  horizontal = false,
}: {
  data: Array<{ label: string; value: number; color?: string }>;
  height?: number;
  color?: string;
  horizontal?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const w = useWidth(ref);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const isEmpty = !w || data.length === 0;
  const maxV = isEmpty ? 1 : Math.max(...data.map(d => d.value)) || 1;
  const PAD = { top: 8, right: horizontal ? 52 : 8, bottom: horizontal ? 8 : 28, left: horizontal ? 96 : 8 };
  const innerW = w - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const RADIUS = 3;

  if (horizontal) {
    const slotH = innerH / data.length;
    const barH = Math.max(4, slotH * 0.52);
    return (
      <div ref={ref} style={{ height }}>
        {!isEmpty && (
          <svg width={w} height={height} style={{ overflow: 'visible', display: 'block' }}>
            {data.map((_, i) => {
              const y = PAD.top + i * slotH + (slotH - barH) / 2 + barH / 2;
              return <line key={i} x1={PAD.left} x2={w - PAD.right} y1={y} y2={y}
                stroke="currentColor" strokeOpacity={0.05} strokeWidth={barH} />;
            })}
            {data.map((d, i) => {
              const bc = d.color ?? color;
              const y = PAD.top + i * slotH + (slotH - barH) / 2;
              const bw = Math.max(0, (d.value / maxV) * innerW);
              const isHov = hoveredIdx === i;
              return (
                <g key={i}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  style={{ cursor: 'default' }}>
                  <text x={PAD.left - 8} y={y + barH / 2} textAnchor="end" dominantBaseline="middle"
                    fill="currentColor" fillOpacity={0.5} fontSize={10}
                    fontFamily="var(--font-mono, monospace)">
                    {d.label.length > 14 ? `${d.label.slice(0, 13)}…` : d.label}
                  </text>
                  <rect x={PAD.left} y={y} width={bw} height={barH}
                    rx={RADIUS} ry={RADIUS}
                    fill={bc} opacity={isHov ? 1 : 0.82} />
                  <text x={PAD.left + bw + 6} y={y + barH / 2} dominantBaseline="middle"
                    fill="currentColor" fillOpacity={0.5} fontSize={10}
                    fontFamily="var(--font-mono, monospace)">
                    {d.value.toFixed(1)}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    );
  }

  const slotW = innerW / data.length;
  const barW = Math.max(3, slotW * 0.55);
  const baselineY = PAD.top + innerH;

  return (
    <div ref={ref} style={{ height }}>
      {!isEmpty && (
        <svg width={w} height={height} style={{ overflow: 'visible', display: 'block' }}>
          {[0.25, 0.5, 0.75, 1.0].map((f, i) => {
            const y = PAD.top + innerH - f * innerH;
            return (
              <g key={i}>
                <line x1={PAD.left} x2={w - PAD.right} y1={y} y2={y}
                  stroke="currentColor" strokeOpacity={0.07} strokeWidth={1} strokeDasharray="3 4" />
                <text x={PAD.left - 4} y={y} textAnchor="end" dominantBaseline="middle"
                  fill="currentColor" fillOpacity={0.38} fontSize={9}
                  fontFamily="var(--font-mono, monospace)">
                  {(maxV * f).toFixed(0)}
                </text>
              </g>
            );
          })}
          <line x1={PAD.left} x2={w - PAD.right} y1={baselineY} y2={baselineY}
            stroke="currentColor" strokeOpacity={0.14} strokeWidth={1} />
          {data.map((d, i) => {
            const bc = d.color ?? color;
            const x = PAD.left + i * slotW + (slotW - barW) / 2;
            const bh = Math.max(1, (d.value / maxV) * innerH);
            const y = baselineY - bh;
            const isHov = hoveredIdx === i;
            return (
              <g key={i}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{ cursor: 'default' }}>
                <rect x={x} y={y} width={barW} height={bh}
                  rx={RADIUS} ry={RADIUS}
                  fill={bc} opacity={isHov ? 1 : 0.8} />
                {isHov && (
                  <text x={x + barW / 2} y={y - 5} textAnchor="middle"
                    fill={bc} fontSize={10} fontFamily="var(--font-mono, monospace)">
                    {d.value.toFixed(1)}
                  </text>
                )}
                <text x={x + barW / 2} y={height - 8} textAnchor="middle"
                  fill="currentColor" fillOpacity={0.4} fontSize={9.5}
                  fontFamily="var(--font-mono, monospace)">
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// ─── Donut ──────────────────────────────────────────────────────────────────
export function Donut({
  segments,
  size = 120,
  thickness = 14,
  centerText,
  gap = 1.5,
}: {
  segments: Array<{ name: string; value: number; color: string }>;
  size?: number;
  thickness?: number;
  centerText?: React.ReactNode;
  gap?: number;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  const gapAngle = (gap / 360) * circ;

  if (total === 0) {
    return (
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeOpacity={0.08} strokeWidth={thickness} />
        </svg>
        {centerText && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {centerText}
          </div>
        )}
      </div>
    );
  }

  let cumulative = 0;
  const arcs = segments.map(seg => {
    const frac = seg.value / total;
    const dashLen = Math.max(0, frac * circ - gapAngle);
    const dashGap = circ - dashLen;
    const rotation = (cumulative / total) * 360 - 90;
    cumulative += seg.value;
    return { ...seg, dashLen, dashGap, rotation };
  });

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeOpacity={0.07} strokeWidth={thickness} />
        {arcs.map((arc, i) => (
          <circle key={i} cx={cx} cy={cy} r={r}
            fill="none" stroke={arc.color} strokeWidth={thickness}
            strokeDasharray={`${arc.dashLen.toFixed(2)} ${arc.dashGap.toFixed(2)}`}
            transform={`rotate(${arc.rotation.toFixed(2)} ${cx} ${cy})`}
            strokeLinecap="butt"
          />
        ))}
      </svg>
      {centerText && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {centerText}
        </div>
      )}
    </div>
  );
}
