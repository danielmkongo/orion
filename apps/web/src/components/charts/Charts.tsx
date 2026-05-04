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

/**
 * Bucket-based decimation — keeps local min+max per bucket so shape is preserved
 * even when source has hundreds of points. Target ~120 rendered points.
 */
function decimate(data: { ts: number; value: number }[], maxPts = 120): { ts: number; value: number }[] {
  if (data.length <= maxPts) return data;
  const bucketSize = data.length / maxPts;
  const out: { ts: number; value: number }[] = [data[0]];
  for (let b = 1; b < maxPts - 1; b++) {
    const start = Math.floor(b * bucketSize);
    const end   = Math.floor((b + 1) * bucketSize);
    const bucket = data.slice(start, end);
    const minP = bucket.reduce((a, c) => c.value < a.value ? c : a, bucket[0]);
    const maxP = bucket.reduce((a, c) => c.value > a.value ? c : a, bucket[0]);
    // push in time order
    if (minP.ts <= maxP.ts) { out.push(minP); if (minP.ts !== maxP.ts) out.push(maxP); }
    else                    { out.push(maxP); if (minP.ts !== maxP.ts) out.push(minP); }
  }
  out.push(data[data.length - 1]);
  return out;
}

/** Catmull-Rom → cubic Bézier smooth path */
function smoothCurve(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  const T = 0.4;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 2)];
    const p1 = pts[i - 1];
    const p2 = pts[i];
    const p3 = pts[Math.min(pts.length - 1, i + 1)];
    const cp1x = p1.x + (p2.x - p0.x) * T;
    const cp1y = p1.y + (p2.y - p0.y) * T;
    const cp2x = p2.x - (p3.x - p1.x) * T;
    const cp2y = p2.y - (p3.y - p1.y) * T;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
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
    items: Array<{ name: string; value: number; color: string; y: number }>;
    ts: string;
  } | null>(null);

  const PAD = { top: 16, right: 16, bottom: 32, left: 48 };

  const normalize_ = (s: ChartSeries) =>
    decimate(s.data.map(p => ({ ts: typeof p.ts === 'string' ? new Date(p.ts).getTime() : p.ts, value: p.value })));

  const allMapped = series.flatMap(normalize_);
  const isEmpty = !w || allMapped.length === 0;

  const allTs = allMapped.map(d => d.ts);
  const minTs = Math.min(...allTs);
  const maxTs = Math.max(...allTs);
  const allVals = allMapped.map(d => d.value);
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  // Give a little breathing room so the line doesn't hug the top/bottom
  const pad5 = (rawMax - rawMin) * 0.08 || 1;
  const globalMin = rawMin - pad5;
  const globalMax = rawMax + pad5;
  const globalRange = globalMax - globalMin || 1;

  const innerW = w - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const xScale = (ts: number) =>
    PAD.left + (maxTs === minTs ? innerW / 2 : ((ts - minTs) / (maxTs - minTs)) * innerW);

  const globalY = (v: number) => PAD.top + innerH - ((v - globalMin) / globalRange) * innerH;

  const makeLocalY = (data: { ts: number; value: number }[]) => {
    const mn = Math.min(...data.map(d => d.value));
    const mx = Math.max(...data.map(d => d.value));
    const p = (mx - mn) * 0.08 || 1;
    const rng = (mx + p) - (mn - p) || 1;
    return (v: number) => PAD.top + innerH - ((v - (mn - p)) / rng) * innerH;
  };

  const fmtV = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (abs >= 1000) return `${(v / 1000).toFixed(1)}k`;
    if (abs >= 10 || Number.isInteger(v)) return v.toFixed(0);
    return v.toFixed(1);
  };

  const fmtTs = (ts: number) => {
    const d = new Date(ts);
    const hrs = (maxTs - minTs) / 3_600_000;
    if (hrs > 48) return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
    return d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
  };

  const toXY = (data: { ts: number; value: number }[], yFn: (v: number) => number) =>
    data.map(p => ({ x: xScale(p.ts), y: yFn(p.value) }));

  const buildPath = (data: { ts: number; value: number }[], yFn: (v: number) => number) =>
    smoothCurve(toXY(data, yFn));

  const buildArea = (data: { ts: number; value: number }[], yFn: (v: number) => number) => {
    if (data.length < 2) return '';
    const xy = toXY(data, yFn);
    const line = smoothCurve(xy);
    const bot = (PAD.top + innerH).toFixed(1);
    return `${line} L ${xy[xy.length - 1].x.toFixed(1)},${bot} L ${xy[0].x.toFixed(1)},${bot} Z`;
  };

  const yTicks = 4;
  const tickVals = Array.from({ length: yTicks + 1 }, (_, i) => globalMin + (i / yTicks) * globalRange);

  const pivotData = normalize_(series[0]);
  const xTickStep = Math.max(1, Math.floor(pivotData.length / 5));
  const xTicks = pivotData.filter((_, i) => i % xTickStep === 0 || i === pivotData.length - 1);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!pivotData.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    let closestIdx = 0;
    let closestDist = Infinity;
    pivotData.forEach((p, i) => {
      const dist = Math.abs(xScale(p.ts) - mx);
      if (dist < closestDist) { closestDist = dist; closestIdx = i; }
    });
    const pt = pivotData[closestIdx];
    const items = series.map((s, si) => {
      const color = s.color ?? PALETTE[si % PALETTE.length];
      const mapped = normalize_(s);
      const yFn = normalize ? makeLocalY(mapped) : globalY;
      const val = s.data[closestIdx]?.value ?? 0;
      return { name: s.name, value: val, color, y: yFn(val) };
    });
    setHover({ x: xScale(pt.ts), items, ts: fmtTs(pt.ts) });
  }, [series, pivotData]); // eslint-disable-line react-hooks/exhaustive-deps

  const baselineY = PAD.top + innerH;

  return (
    <div ref={wrapRef} style={{ position: 'relative', height }}>
      {isEmpty ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height, opacity: 0.35 }}>
          <span style={{ fontSize: 13, fontFamily: 'var(--font-mono, monospace)' }}>No data</span>
        </div>
      ) : (
        <svg
          width={w} height={height}
          style={{ overflow: 'visible', display: 'block', cursor: 'crosshair' }}
          shapeRendering="geometricPrecision"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            {series.map((s, si) => {
              const color = s.color ?? PALETTE[si % PALETTE.length];
              return (
                <linearGradient key={si} id={`${uid}-g${si}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={color} stopOpacity="0.28" />
                  <stop offset="45%"  stopColor={color} stopOpacity="0.10" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
              );
            })}
            {/* Clip path so area doesn't overflow below baseline */}
            <clipPath id={`${uid}-clip`}>
              <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} />
            </clipPath>
          </defs>

          {/* Subtle Y grid lines */}
          {tickVals.map((v, i) => (
            <line key={i}
              x1={PAD.left} x2={w - PAD.right}
              y1={globalY(v)} y2={globalY(v)}
              stroke="currentColor" strokeOpacity={i === 0 ? 0 : 0.07} strokeWidth={1}
              strokeDasharray={i === 0 ? undefined : '3 4'}
            />
          ))}

          {/* Baseline */}
          <line x1={PAD.left} x2={w - PAD.right} y1={baselineY} y2={baselineY}
            stroke="currentColor" strokeOpacity={0.14} strokeWidth={1} />

          {/* Y labels */}
          {tickVals.map((v, i) => (
            <text key={i}
              x={PAD.left - 8} y={globalY(v)}
              textAnchor="end" dominantBaseline="middle"
              fill="currentColor" fillOpacity={0.38} fontSize={10}
              fontFamily="var(--font-mono, monospace)">
              {fmtV(v)}
            </text>
          ))}

          {/* X labels */}
          {xTicks.map((p, i) => (
            <text key={i}
              x={xScale(p.ts)} y={height - 6}
              textAnchor="middle"
              fill="currentColor" fillOpacity={0.38} fontSize={10}
              fontFamily="var(--font-mono, monospace)">
              {fmtTs(p.ts)}
            </text>
          ))}

          {/* Area fills (clipped) */}
          {showArea && series.map((s, si) => {
            const color = s.color ?? PALETTE[si % PALETTE.length];
            const mapped = normalize_(s);
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
            const mapped = normalize_(s);
            const yFn = normalize ? makeLocalY(mapped) : globalY;
            return (
              <path key={si}
                d={buildPath(mapped, yFn)}
                fill="none" stroke={color}
                strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
              />
            );
          })}

          {/* Hover crosshair */}
          {hover && (
            <line
              x1={hover.x} x2={hover.x} y1={PAD.top} y2={baselineY}
              stroke="currentColor" strokeOpacity={0.2} strokeWidth={1}
            />
          )}

          {/* Hover dots */}
          {hover && hover.items.map((item, i) => (
            <g key={i}>
              <circle cx={hover.x} cy={item.y} r={5} fill={item.color} opacity={0.9} />
              <circle cx={hover.x} cy={item.y} r={3} fill="var(--chart-dot-bg, #fff)" opacity={0.85} />
            </g>
          ))}
        </svg>
      )}

      {/* Tooltip */}
      {!isEmpty && hover && (
        <div style={{
          position: 'absolute',
          top: PAD.top + 4,
          left: hover.x > w * 0.62 ? hover.x - 12 : hover.x + 12,
          transform: hover.x > w * 0.62 ? 'translateX(-100%)' : 'none',
          pointerEvents: 'none',
          background: 'var(--tt-bg, rgba(10,10,9,0.92))',
          border: '1px solid var(--tt-border, rgba(255,255,255,0.09))',
          backdropFilter: 'blur(12px)',
          padding: '8px 12px',
          minWidth: 110,
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        }}>
          <div style={{ fontSize: 9.5, fontFamily: 'var(--font-mono, monospace)', color: 'var(--tt-ts, rgba(200,200,190,0.55))', marginBottom: 7, letterSpacing: '0.05em' }}>
            {hover.ts}
          </div>
          {hover.items.map(item => (
            <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <span style={{ width: 8, height: 2, background: item.color, borderRadius: 1, flexShrink: 0 }} />
              <span style={{ fontSize: 10.5, color: 'var(--tt-label, rgba(200,200,190,0.6))', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name}
              </span>
              <strong style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)', color: item.color, letterSpacing: '-0.02em' }}>
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
            {/* Track lines */}
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

  // Vertical
  const slotW = innerW / data.length;
  const barW = Math.max(3, slotW * 0.55);
  const baselineY = PAD.top + innerH;

  return (
    <div ref={ref} style={{ height }}>
      {!isEmpty && (
        <svg width={w} height={height} style={{ overflow: 'visible', display: 'block' }}>
          {/* Grid lines */}
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
          {/* Baseline */}
          <line x1={PAD.left} x2={w - PAD.right} y1={baselineY} y2={baselineY}
            stroke="currentColor" strokeOpacity={0.14} strokeWidth={1} />
          {/* Bars */}
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
