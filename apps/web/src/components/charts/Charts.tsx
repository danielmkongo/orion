import { useRef, useEffect, useState, useCallback, type RefObject } from 'react';

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

export interface ChartSeries {
  name: string;
  data: Array<{ ts: number | string; value: number }>;
  color?: string;
}

// ─── LineChart ──────────────────────────────────────────────────────────────
export function LineChart({
  series,
  height = 260,
  showArea = true,
  normalize = false,
}: {
  series: ChartSeries[];
  height?: number;
  showArea?: boolean;
  normalize?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const w = useWidth(wrapRef);
  const uid = useRef(`lc-${Math.random().toString(36).slice(2)}`).current;
  const [hover, setHover] = useState<{
    x: number;
    items: Array<{ name: string; value: number; color: string }>;
    ts: string;
  } | null>(null);

  const PAD = { top: 12, right: 12, bottom: 28, left: 44 };

  const normalize_ = (s: ChartSeries) =>
    s.data.map(p => ({ ts: typeof p.ts === 'string' ? new Date(p.ts).getTime() : p.ts, value: p.value }));

  const allMapped = series.flatMap(normalize_);

  const isEmpty = !w || allMapped.length === 0;

  const allTs = allMapped.map(d => d.ts);
  const minTs = Math.min(...allTs);
  const maxTs = Math.max(...allTs);
  const allVals = allMapped.map(d => d.value);
  const globalMin = Math.min(...allVals);
  const globalMax = Math.max(...allVals);
  const globalRange = globalMax - globalMin || 1;

  const innerW = w - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const xScale = (ts: number) =>
    PAD.left + (maxTs === minTs ? innerW / 2 : ((ts - minTs) / (maxTs - minTs)) * innerW);

  const globalY = (v: number) => PAD.top + innerH - ((v - globalMin) / globalRange) * innerH;

  const makeLocalY = (data: { ts: number; value: number }[]) => {
    const mn = Math.min(...data.map(d => d.value));
    const mx = Math.max(...data.map(d => d.value));
    const rng = mx - mn || 1;
    return (v: number) => PAD.top + innerH - ((v - mn) / rng) * innerH;
  };

  const fmtV = (v: number) => {
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
    if (Math.abs(v) >= 10 || Number.isInteger(v)) return v.toFixed(0);
    return v.toFixed(1);
  };

  const fmtTs = (ts: number) => {
    const d = new Date(ts);
    const hrs = (maxTs - minTs) / 3_600_000;
    if (hrs > 48) return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
    return d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
  };

  const buildPath = (data: { ts: number; value: number }[], yFn: (v: number) => number) =>
    data.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.ts).toFixed(1)} ${yFn(p.value).toFixed(1)}`).join(' ');

  const buildArea = (data: { ts: number; value: number }[], yFn: (v: number) => number) => {
    if (data.length < 2) return '';
    const line = buildPath(data, yFn);
    const bot = (PAD.top + innerH).toFixed(1);
    return `${line} L ${xScale(data[data.length - 1].ts).toFixed(1)} ${bot} L ${xScale(data[0].ts).toFixed(1)} ${bot} Z`;
  };

  const yTicks = 4;
  const tickVals = Array.from({ length: yTicks + 1 }, (_, i) => globalMin + (i / yTicks) * globalRange);

  const pivotData = normalize_(series[0]);
  const xTickStep = Math.max(1, Math.floor(pivotData.length / 5));
  const xTicks = pivotData.filter((_, i) => i % xTickStep === 0 || i === pivotData.length - 1);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    let closestIdx = 0;
    let closestDist = Infinity;
    pivotData.forEach((p, i) => {
      const dist = Math.abs(xScale(p.ts) - mx);
      if (dist < closestDist) { closestDist = dist; closestIdx = i; }
    });
    const pt = pivotData[closestIdx];
    const items = series.map((s, si) => ({
      name: s.name,
      value: s.data[closestIdx]?.value ?? 0,
      color: s.color ?? PALETTE[si % PALETTE.length],
    }));
    setHover({ x: xScale(pt.ts), items, ts: fmtTs(pt.ts) });
  }, [series, pivotData]);// eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={wrapRef} style={{ position: 'relative', height }}>
      {isEmpty ? (
        <div className="flex items-center justify-center h-full">
          <span style={{ fontSize: 13, opacity: 0.45 }}>No data</span>
        </div>
      ) : (
      <svg
        width={w} height={height}
        style={{ overflow: 'visible', display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {series.map((s, si) => {
            const color = s.color ?? PALETTE[si % PALETTE.length];
            return (
              <linearGradient key={si} id={`${uid}-g${si}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            );
          })}
        </defs>

        {/* Y grid */}
        {tickVals.map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={w - PAD.right} y1={globalY(v)} y2={globalY(v)}
              stroke="currentColor" strokeOpacity={0.06} strokeWidth={1} />
            <text x={PAD.left - 6} y={globalY(v)} textAnchor="end" dominantBaseline="middle"
              fill="currentColor" fillOpacity={0.45} fontSize={10}
              fontFamily="var(--font-mono, monospace)">
              {fmtV(v)}
            </text>
          </g>
        ))}

        {/* X ticks */}
        {xTicks.map((p, i) => (
          <text key={i} x={xScale(p.ts)} y={height - 6} textAnchor="middle"
            fill="currentColor" fillOpacity={0.4} fontSize={10}
            fontFamily="var(--font-mono, monospace)">
            {fmtTs(p.ts)}
          </text>
        ))}

        {/* Series */}
        {series.map((s, si) => {
          const color = s.color ?? PALETTE[si % PALETTE.length];
          const mapped = normalize_(s);
          const yFn = normalize ? makeLocalY(mapped) : globalY;
          return (
            <g key={si}>
              {showArea && <path d={buildArea(mapped, yFn)} fill={`url(#${uid}-g${si})`} />}
              <path d={buildPath(mapped, yFn)} fill="none" stroke={color}
                strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}

        {/* Hover line */}
        {hover && (
          <line x1={hover.x} x2={hover.x} y1={PAD.top} y2={PAD.top + innerH}
            stroke="currentColor" strokeOpacity={0.15} strokeWidth={1} strokeDasharray="3 3" />
        )}
      </svg>
      )}

      {/* Tooltip */}
      {!isEmpty && hover && (
        <div className="tt" style={{
          position: 'absolute', top: PAD.top,
          left: hover.x > w * 0.65 ? hover.x - 8 : hover.x + 8,
          transform: hover.x > w * 0.65 ? 'translateX(-100%)' : 'none',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 10, opacity: 0.55, marginBottom: 4, fontFamily: 'var(--font-mono)' }}>
            {hover.ts}
          </div>
          {hover.items.map(item => (
            <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ width: 6, height: 6, borderRadius: 1, background: item.color, flexShrink: 0 }} />
              <span style={{ opacity: 0.65, fontSize: 11, marginRight: 4 }}>{item.name}</span>
              <strong style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                {typeof item.value === 'number' ? item.value.toFixed(2) : item.value}
              </strong>
            </div>
          ))}
        </div>
      )}
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
  const path = isEmpty ? '' : pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = isEmpty ? '' : `${path} L ${pts[pts.length - 1].x.toFixed(1)} ${height} L 0 ${height} Z`;

  return (
    <div ref={ref} style={{ height }}>
      {isEmpty ? (
        <div style={{ height }} />
      ) : (
      <svg width={w} height={height} style={{ overflow: 'hidden', display: 'block' }}>
        {fill && (
          <>
            <defs>
              <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.28" />
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

  const isEmpty = !w || data.length === 0;
  const maxV = isEmpty ? 1 : Math.max(...data.map(d => d.value)) || 1;
  const PAD = { top: 8, right: horizontal ? 48 : 8, bottom: horizontal ? 8 : 24, left: horizontal ? 96 : 8 };
  const innerW = w - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const slotH = innerH / data.length;
  const barH = slotH * 0.55;
  const slotW = innerW / data.length;
  const barW = slotW * 0.6;

  return (
    <div ref={ref} style={{ height }}>
      {isEmpty ? (
        <div style={{ height }} />
      ) : (
      <svg width={w} height={height} style={{ overflow: 'visible', display: 'block' }}>
        {data.map((d, i) => {
          const bc = d.color ?? color;
          if (horizontal) {
            const y = PAD.top + i * slotH + (slotH - barH) / 2;
            const bw = (d.value / maxV) * innerW;
            return (
              <g key={i}>
                <text x={PAD.left - 6} y={y + barH / 2} textAnchor="end" dominantBaseline="middle"
                  fill="currentColor" fillOpacity={0.6} fontSize={10}
                  fontFamily="var(--font-mono, monospace)">
                  {d.label.length > 14 ? `${d.label.slice(0, 13)}…` : d.label}
                </text>
                <rect x={PAD.left} y={y} width={Math.max(0, bw)} height={barH} fill={bc} />
                <text x={PAD.left + bw + 5} y={y + barH / 2} dominantBaseline="middle"
                  fill="currentColor" fillOpacity={0.55} fontSize={10}
                  fontFamily="var(--font-mono, monospace)">
                  {d.value < 1 ? `${(d.value * 100).toFixed(1)}%` : typeof d.value === 'number' && d.value <= 100 ? `${d.value.toFixed(1)}%` : d.value.toFixed(0)}
                </text>
              </g>
            );
          } else {
            const x = PAD.left + i * slotW + (slotW - barW) / 2;
            const bh = (d.value / maxV) * innerH;
            const y = PAD.top + innerH - bh;
            return (
              <g key={i}>
                <rect x={x} y={y} width={barW} height={bh} fill={bc} />
                <text x={x + barW / 2} y={height - 6} textAnchor="middle"
                  fill="currentColor" fillOpacity={0.5} fontSize={10}
                  fontFamily="var(--font-mono, monospace)">
                  {d.label}
                </text>
              </g>
            );
          }
        })}
        {!horizontal && [0.25, 0.5, 0.75, 1.0].map((f, i) => {
          const y = PAD.top + innerH - f * innerH;
          return (
            <g key={i}>
              <line x1={PAD.left} x2={w - PAD.right} y1={y} y2={y}
                stroke="currentColor" strokeOpacity={0.06} strokeWidth={1} />
              <text x={PAD.left - 4} y={y} textAnchor="end" dominantBaseline="middle"
                fill="currentColor" fillOpacity={0.4} fontSize={9}
                fontFamily="var(--font-mono, monospace)">
                {(maxV * f).toFixed(0)}
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
