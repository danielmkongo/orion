import React, { useState, useRef, useMemo, useEffect, useCallback, useId } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { Activity, Plus, X, Download, ChevronDown, Waves, BarChart2, RefreshCw } from 'lucide-react';
import { devicesApi } from '@/api/devices';
import { telemetryApi } from '@/api/telemetry';
import {
  computeStats, movingAverage, exponentialMA, differentiate, integrate,
  computePSD, applyLowPass, applyHighPass, applyBandPass, applyNotch,
  detectSampleRate, niceTicks, fmtFreq, fmtPeriod,
  type Stats, type FFTBin,
} from '@/lib/dsp';

const COLORS = ['#ff5b1f','#3b82f6','#22c55e','#a855f7','#f59e0b','#ec4899','#14b8a6','#f97316'];
const OVERLAY_ALPHA = ['#ff9f6b','#93c5fd','#86efac','#d8b4fe','#fcd34d','#fbcfe8','#99f6e4','#fdba74'];
const RANGES = [
  { label: '1H', value: '1h', ms: 3_600_000 },
  { label: '6H', value: '6h', ms: 21_600_000 },
  { label: '24H', value: '24h', ms: 86_400_000 },
  { label: '7D', value: '7d', ms: 604_800_000 },
  { label: '30D', value: '30d', ms: 2_592_000_000 },
];

type OverlayType = 'moving_avg' | 'exp_ma' | 'differentiate' | 'integrate' | 'lowpass' | 'highpass' | 'bandpass' | 'notch';
interface Overlay {
  id: string; type: OverlayType; label: string; fieldKey: string;
  color: string; params: Record<string, number>;
}
interface Point { ts: number; value: number; }
interface Series { name: string; data: Point[]; color: string; fieldKey: string; }

function getRangeBounds(rangeValue: string): { from: string; to: string } {
  const r = RANGES.find(x => x.value === rangeValue) ?? RANGES[2];
  const now = Date.now();
  return {
    from: new Date(now - r.ms).toISOString(),
    to: new Date(now + 86_400_000).toISOString(),
  };
}

function fmtTs(ts: number, totalMs: number): string {
  const d = new Date(ts);
  if (totalMs > 7 * 86_400_000) return d.toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  if (totalMs > 86_400_000) return d.toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }) + ' ' + d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
  if (totalMs > 3_600_000) return d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
  return d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC' });
}

function fmt4(n: number): string {
  if (!isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 10000) return n.toFixed(0);
  if (abs >= 100) return n.toFixed(1);
  if (abs >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function downloadCSV(series: Series[], overlaySeries: Series[], windowTs: [number, number] | null) {
  const all = [...series, ...overlaySeries];
  const tsSet = new Set<number>();
  all.forEach(s => s.data.forEach(p => {
    if (!windowTs || (p.ts >= windowTs[0] && p.ts <= windowTs[1])) tsSet.add(p.ts);
  }));
  const tsList = [...tsSet].sort((a, b) => a - b);
  const header = ['timestamp', ...all.map(s => s.name)].join(',');
  const rows = tsList.map(ts => {
    const d = new Date(ts);
    const tsStr = `${d.toISOString().replace('T', ' ').substring(0, 19)}`;
    const vals = all.map(s => {
      const pt = s.data.find(p => p.ts === ts);
      return pt !== undefined ? fmt4(pt.value) : '';
    });
    return [tsStr, ...vals].join(',');
  });
  const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'orion-analytics.csv'; a.click();
  URL.revokeObjectURL(url);
}

function downloadSVG(svgEl: SVGSVGElement | null) {
  if (!svgEl) return;
  const serializer = new XMLSerializer();
  const src = '<?xml version="1.0" standalone="no"?>\n' + serializer.serializeToString(svgEl);
  const blob = new Blob([src], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'orion-analytics.svg'; a.click();
  URL.revokeObjectURL(url);
}

// ── Signal Chart ────────────────────────────────────────────────────────────

const PAD = { top: 20, right: 24, bottom: 42, left: 58 };

interface SignalChartProps {
  series: Series[];
  overlaySeries: Series[];
  windowTs: [number, number] | null;
  onWindowChange: (w: [number, number] | null) => void;
  height?: number;
  svgRef?: React.RefObject<SVGSVGElement>;
}

function SignalChart({ series, overlaySeries, windowTs, onWindowChange, height = 340, svgRef: externalSvgRef }: SignalChartProps) {
  const uid = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const internalSvgRef = useRef<SVGSVGElement>(null);
  const svgRef = externalSvgRef ?? internalSvgRef;
  const [svgW, setSvgW] = useState(800);
  const [drag, setDrag] = useState<{ type: 'new' | 'move' | 'left' | 'right'; anchorTs: number; anchorWin?: [number, number] } | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; ts: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => setSvgW(Math.floor(e.contentRect.width)));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const innerW = svgW - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const allPoints = useMemo(() => [...series, ...overlaySeries].flatMap(s => s.data), [series, overlaySeries]);

  const { minTs, maxTs, minVal, maxVal } = useMemo(() => {
    if (!allPoints.length) return { minTs: 0, maxTs: 1, minVal: 0, maxVal: 1 };
    const tss = allPoints.map(p => p.ts);
    const vals = allPoints.map(p => p.value);
    return { minTs: Math.min(...tss), maxTs: Math.max(...tss), minVal: Math.min(...vals), maxVal: Math.max(...vals) };
  }, [allPoints]);

  const totalMs = maxTs - minTs || 1;
  const valRange = maxVal - minVal || 1;
  const valPad = valRange * 0.08;
  const yMin = minVal - valPad, yMax = maxVal + valPad;

  const tsToX = useCallback((ts: number) => PAD.left + ((ts - minTs) / totalMs) * innerW, [minTs, totalMs, innerW]);
  const valToY = useCallback((v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * innerH, [yMin, yMax, innerH]);
  const xToTs = useCallback((x: number) => minTs + ((x - PAD.left) / innerW) * totalMs, [minTs, totalMs, innerW]);

  const buildPath = (data: Point[]) =>
    data.length < 2 ? '' :
    data.map((p, i) => `${i === 0 ? 'M' : 'L'}${tsToX(p.ts).toFixed(1)},${valToY(p.value).toFixed(1)}`).join(' ');

  const yTicks = useMemo(() => niceTicks(yMin, yMax, 6), [yMin, yMax]);
  const xTicks = useMemo(() => {
    const count = Math.max(3, Math.floor(innerW / 90));
    const step = totalMs / count;
    const ticks = [];
    for (let i = 0; i <= count; i++) ticks.push(minTs + i * step);
    return ticks;
  }, [minTs, totalMs, innerW]);

  const wx1 = windowTs ? Math.max(PAD.left, tsToX(windowTs[0])) : null;
  const wx2 = windowTs ? Math.min(PAD.left + innerW, tsToX(windowTs[1])) : null;

  const HANDLE_W = 8;
  const clampX = (x: number) => Math.max(PAD.left, Math.min(PAD.left + innerW, x));
  const clampTs = (ts: number) => Math.max(minTs, Math.min(maxTs, ts));

  const getSvgX = (e: React.MouseEvent): number => {
    const rect = svgRef.current!.getBoundingClientRect();
    return clampX(e.clientX - rect.left);
  };

  const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const x = getSvgX(e);
    const ts = xToTs(x);
    if (windowTs && wx1 !== null && wx2 !== null) {
      if (Math.abs(x - wx1) <= HANDLE_W) { setDrag({ type: 'left', anchorTs: ts, anchorWin: windowTs }); return; }
      if (Math.abs(x - wx2) <= HANDLE_W) { setDrag({ type: 'right', anchorTs: ts, anchorWin: windowTs }); return; }
      if (x > wx1 && x < wx2) { setDrag({ type: 'move', anchorTs: ts, anchorWin: windowTs }); return; }
    }
    setDrag({ type: 'new', anchorTs: ts });
    onWindowChange([clampTs(ts), clampTs(ts)]);
  };

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const x = getSvgX(e);
    const ts = xToTs(x);
    setHoverX(x);
    setTooltip({ x, y: e.clientY, ts });
    if (!drag) return;
    if (drag.type === 'new') {
      const a = drag.anchorTs, b = clampTs(ts);
      onWindowChange([Math.min(a, b), Math.max(a, b)]);
    } else if (drag.type === 'left' && drag.anchorWin) {
      const delta = ts - drag.anchorTs;
      onWindowChange([clampTs(drag.anchorWin[0] + delta), drag.anchorWin[1]]);
    } else if (drag.type === 'right' && drag.anchorWin) {
      const delta = ts - drag.anchorTs;
      onWindowChange([drag.anchorWin[0], clampTs(drag.anchorWin[1] + delta)]);
    } else if (drag.type === 'move' && drag.anchorWin) {
      const delta = ts - drag.anchorTs;
      const span = drag.anchorWin[1] - drag.anchorWin[0];
      const newStart = clampTs(drag.anchorWin[0] + delta);
      onWindowChange([newStart, clampTs(newStart + span)]);
    }
  };

  const onMouseUp = () => setDrag(null);
  const onMouseLeave = () => { setDrag(null); setHoverX(null); setTooltip(null); };

  const cursor = drag
    ? (drag.type === 'move' ? 'grabbing' : 'ew-resize')
    : (windowTs && wx1 !== null && wx2 !== null && hoverX !== null && (Math.abs(hoverX - wx1) <= HANDLE_W || Math.abs(hoverX - wx2) <= HANDLE_W))
      ? 'ew-resize'
      : (windowTs && wx1 !== null && wx2 !== null && hoverX !== null && hoverX > wx1 && hoverX < wx2)
        ? 'grab' : 'crosshair';

  const clipId = `${uid}-clip`;

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
      <svg
        ref={svgRef} width={svgW} height={height}
        style={{ display: 'block', cursor, userSelect: 'none', touchAction: 'none' }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} />
          </clipPath>
        </defs>

        {/* Grid */}
        {yTicks.map((v, i) => (
          <line key={i} x1={PAD.left} y1={valToY(v)} x2={PAD.left + innerW} y2={valToY(v)}
            stroke="hsl(var(--border))" strokeWidth={0.5} />
        ))}
        {xTicks.map((ts, i) => (
          <line key={i} x1={tsToX(ts)} y1={PAD.top} x2={tsToX(ts)} y2={PAD.top + innerH}
            stroke="hsl(var(--border))" strokeWidth={0.5} />
        ))}

        {/* Window overlay */}
        {wx1 !== null && wx2 !== null && wx1 < wx2 && (
          <g>
            <rect x={wx1} y={PAD.top} width={Math.max(0, wx2 - wx1)} height={innerH}
              fill="hsl(var(--primary) / 0.06)" clipPath={`url(#${clipId})`} />
            <line x1={wx1} y1={PAD.top} x2={wx1} y2={PAD.top + innerH}
              stroke="hsl(var(--primary))" strokeWidth={1.5} strokeOpacity={0.6} />
            <line x1={wx2} y1={PAD.top} x2={wx2} y2={PAD.top + innerH}
              stroke="hsl(var(--primary))" strokeWidth={1.5} strokeOpacity={0.6} />
            <rect x={wx1 - HANDLE_W / 2} y={PAD.top + innerH / 2 - 16} width={HANDLE_W} height={32}
              rx={3} fill="hsl(var(--primary))" opacity={0.5} />
            <rect x={wx2 - HANDLE_W / 2} y={PAD.top + innerH / 2 - 16} width={HANDLE_W} height={32}
              rx={3} fill="hsl(var(--primary))" opacity={0.5} />
            <text x={(wx1 + wx2) / 2} y={PAD.top + 13} textAnchor="middle"
              fontSize={8.5} fontFamily="var(--font-mono)" fill="hsl(var(--primary))" fillOpacity={0.8}>
              {((windowTs![1] - windowTs![0]) / 60000).toFixed(1)} min
            </text>
          </g>
        )}

        {/* Raw series */}
        {series.map((s, i) => (
          <path key={i} d={buildPath(s.data)} fill="none" stroke={s.color}
            strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round"
            clipPath={`url(#${clipId})`} />
        ))}

        {/* Overlay series (dashed) */}
        {overlaySeries.map((s, i) => (
          <path key={i} d={buildPath(s.data)} fill="none" stroke={s.color}
            strokeWidth={1.5} strokeDasharray="5 3" strokeLinejoin="round"
            clipPath={`url(#${clipId})`} />
        ))}

        {/* Hover line */}
        {hoverX !== null && (
          <line x1={hoverX} y1={PAD.top} x2={hoverX} y2={PAD.top + innerH}
            stroke="hsl(var(--fg))" strokeWidth={0.5} strokeOpacity={0.3}
            clipPath={`url(#${clipId})`} />
        )}

        {/* Y axis */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + innerH}
          stroke="hsl(var(--border))" strokeWidth={1} />
        {yTicks.map((v, i) => (
          <text key={i} x={PAD.left - 7} y={valToY(v) + 3.5} textAnchor="end"
            fontSize={9} fontFamily="var(--font-mono)" fill="hsl(var(--muted-fg))">
            {fmt4(v)}
          </text>
        ))}

        {/* X axis */}
        <line x1={PAD.left} y1={PAD.top + innerH} x2={PAD.left + innerW} y2={PAD.top + innerH}
          stroke="hsl(var(--border))" strokeWidth={1} />
        {xTicks.map((ts, i) => (
          <text key={i} x={tsToX(ts)} y={PAD.top + innerH + 14} textAnchor="middle"
            fontSize={9} fontFamily="var(--font-mono)" fill="hsl(var(--muted-fg))">
            {fmtTs(ts, totalMs)}
          </text>
        ))}

        {/* Window time labels */}
        {windowTs && wx1 !== null && wx2 !== null && wx2 - wx1 > 60 && (
          <>
            <text x={wx1 + 4} y={PAD.top + innerH - 5} fontSize={7.5} fontFamily="var(--font-mono)" fill="hsl(var(--primary))" fillOpacity={0.8}>
              {fmtTs(windowTs[0], totalMs)}
            </text>
            <text x={wx2 - 4} y={PAD.top + innerH - 5} textAnchor="end" fontSize={7.5} fontFamily="var(--font-mono)" fill="hsl(var(--primary))" fillOpacity={0.8}>
              {fmtTs(windowTs[1], totalMs)}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

// ── PSD Chart ───────────────────────────────────────────────────────────────

function PSDChart({ bins, sampleRateHz, height = 200 }: { bins: FFTBin[]; sampleRateHz: number; height?: number }) {
  const uid = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgW, setSvgW] = useState(800);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => setSvgW(Math.floor(e.contentRect.width)));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  if (!bins.length) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--muted-fg))', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      Select a window on the signal chart to compute spectrum
    </div>
  );

  const fp = { top: 16, right: 24, bottom: 38, left: 54 };
  const iW = svgW - fp.left - fp.right;
  const iH = height - fp.top - fp.bottom;

  const freqs = bins.map(b => b.freq);
  const powers = bins.map(b => b.powerDb);
  const minF = Math.min(...freqs), maxF = Math.max(...freqs);
  const minP = Math.max(-60, Math.min(...powers)), maxP = 0;

  const fToX = (f: number) => fp.left + ((f - minF) / (maxF - minF || 1)) * iW;
  const pToY = (p: number) => fp.top + (1 - (p - minP) / (maxP - minP)) * iH;

  const clipId = `${uid}-psd`;
  const barW = Math.max(1, iW / bins.length - 0.5);
  const peakBin = bins.reduce((a, b) => b.powerDb > a.powerDb ? b : a, bins[0]);

  const yTicks = niceTicks(minP, maxP, 5);
  const xTicks = niceTicks(minF, maxF, 5);

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg width={svgW} height={height} style={{ display: 'block' }}
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const frac = (x - fp.left) / iW;
          const idx = Math.round(frac * (bins.length - 1));
          setHoverIdx(idx >= 0 && idx < bins.length ? idx : null);
        }}
        onMouseLeave={() => setHoverIdx(null)}>
        <defs>
          <clipPath id={clipId}><rect x={fp.left} y={fp.top} width={iW} height={iH} /></clipPath>
          <linearGradient id={`${uid}-bar`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff5b1f" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#ff5b1f" stopOpacity={0.15} />
          </linearGradient>
        </defs>

        {yTicks.map((v, i) => (
          <line key={i} x1={fp.left} y1={pToY(v)} x2={fp.left + iW} y2={pToY(v)}
            stroke="hsl(var(--border))" strokeWidth={0.5} />
        ))}

        {bins.map((b, i) => {
          const x = fToX(b.freq);
          const y = pToY(b.powerDb);
          const bh = Math.max(0, iH - (y - fp.top));
          return (
            <rect key={i} x={x} y={y} width={barW} height={bh}
              fill={i === hoverIdx ? '#ff5b1f' : `url(#${uid}-bar)`}
              clipPath={`url(#${clipId})`} />
          );
        })}

        {/* Peak marker */}
        {peakBin && (
          <g>
            <line x1={fToX(peakBin.freq)} y1={fp.top} x2={fToX(peakBin.freq)} y2={pToY(peakBin.powerDb)}
              stroke="#ff5b1f" strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.5} />
            <text x={fToX(peakBin.freq) + 4} y={fp.top + 12} fontSize={8} fontFamily="var(--font-mono)" fill="#ff5b1f" fillOpacity={0.8}>
              {fmtFreq(peakBin.freq)} · T={fmtPeriod(peakBin.freq)}
            </text>
          </g>
        )}

        {/* Hover tooltip */}
        {hoverIdx !== null && bins[hoverIdx] && (() => {
          const b = bins[hoverIdx];
          const x = fToX(b.freq);
          const tooltipX = x > svgW - 140 ? x - 128 : x + 8;
          return (
            <g>
              <rect x={tooltipX} y={fp.top + 4} width={120} height={38} rx={3}
                fill="hsl(var(--surface))" stroke="hsl(var(--border))" />
              <text x={tooltipX + 8} y={fp.top + 18} fontSize={9} fontFamily="var(--font-mono)" fill="hsl(var(--fg))">
                {fmtFreq(b.freq)}
              </text>
              <text x={tooltipX + 8} y={fp.top + 32} fontSize={9} fontFamily="var(--font-mono)" fill="hsl(var(--muted-fg))">
                {b.powerDb.toFixed(1)} dB · T={fmtPeriod(b.freq)}
              </text>
            </g>
          );
        })()}

        {/* Y axis */}
        <line x1={fp.left} y1={fp.top} x2={fp.left} y2={fp.top + iH} stroke="hsl(var(--border))" />
        {yTicks.map((v, i) => (
          <text key={i} x={fp.left - 6} y={pToY(v) + 3.5} textAnchor="end"
            fontSize={9} fontFamily="var(--font-mono)" fill="hsl(var(--muted-fg))">
            {v.toFixed(0)}dB
          </text>
        ))}

        {/* X axis */}
        <line x1={fp.left} y1={fp.top + iH} x2={fp.left + iW} y2={fp.top + iH} stroke="hsl(var(--border))" />
        {xTicks.map((f, i) => (
          <text key={i} x={fToX(f)} y={fp.top + iH + 14} textAnchor="middle"
            fontSize={8.5} fontFamily="var(--font-mono)" fill="hsl(var(--muted-fg))">
            {fmtFreq(f)}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ── Stats Panel ─────────────────────────────────────────────────────────────

function StatsPanel({ series, windowTs }: { series: Series[]; windowTs: [number, number] | null }) {
  const statsBySeries = useMemo(() => series.map(s => {
    const pts = windowTs
      ? s.data.filter(p => p.ts >= windowTs[0] && p.ts <= windowTs[1])
      : s.data;
    return { name: s.name, color: s.color, stats: computeStats(pts.map(p => p.value)) };
  }), [series, windowTs]);

  const rows: { key: keyof Stats; label: string }[] = [
    { key: 'mean', label: 'Mean' },
    { key: 'rms', label: 'RMS' },
    { key: 'stdDev', label: 'Std Dev' },
    { key: 'variance', label: 'Variance' },
    { key: 'min', label: 'Min' },
    { key: 'max', label: 'Max' },
    { key: 'peakToPeak', label: 'Peak-to-Peak' },
    { key: 'crestFactor', label: 'Crest Factor' },
    { key: 'count', label: 'Samples' },
  ];

  if (!series.length) return (
    <div style={{ padding: '24px 16px', textAlign: 'center', color: 'hsl(var(--muted-fg))', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
      Select a device and parameters
    </div>
  );

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 12, fontSize: 9.5, letterSpacing: '0.14em' }}>
        {windowTs ? 'Window Statistics' : 'Full Range Statistics'}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '5px 8px 5px 0', color: 'hsl(var(--muted-fg))', fontWeight: 500, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid hsl(var(--border))', whiteSpace: 'nowrap' }}>Stat</th>
              {statsBySeries.map(s => (
                <th key={s.name} style={{ textAlign: 'right', padding: '5px 8px', color: s.color, fontWeight: 600, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid hsl(var(--border))', whiteSpace: 'nowrap' }}>
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, label }) => (
              <tr key={key} style={{ borderBottom: '1px solid hsl(var(--border) / 0.5)' }}>
                <td style={{ padding: '5px 8px 5px 0', color: 'hsl(var(--muted-fg))', whiteSpace: 'nowrap' }}>{label}</td>
                {statsBySeries.map(s => (
                  <td key={s.name} style={{ padding: '5px 8px', textAlign: 'right', color: 'hsl(var(--fg))', fontVariantNumeric: 'tabular-nums' }}>
                    {key === 'count' ? s.stats[key] : fmt4(s.stats[key] as number)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function AnalyticsPage() {
  const [deviceId, setDeviceId] = useState<string>('');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [range, setRange] = useState('24h');
  const [windowTs, setWindowTs] = useState<[number, number] | null>(null);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [showFFT, setShowFFT] = useState(true);
  const [normalizeY, setNormalizeY] = useState(false);

  // Operation form state
  const [opField, setOpField] = useState('');
  const [maWindow, setMaWindow] = useState(10);
  const [emaAlpha, setEmaAlpha] = useState(0.2);
  const [filterType, setFilterType] = useState<'lowpass' | 'highpass' | 'bandpass' | 'notch'>('lowpass');
  const [filterCutoff, setFilterCutoff] = useState(0.001);
  const [filterCenter, setFilterCenter] = useState(0.001);
  const [filterBW, setFilterBW] = useState(1);
  const [fftField, setFftField] = useState('');

  const signalSvgRef = useRef<SVGSVGElement>(null);

  // Queries
  const { data: devicesData } = useQuery({
    queryKey: ['devices-list-analytics'],
    queryFn: () => devicesApi.list({ limit: 200 }),
  });
  const devices = devicesData?.devices ?? [];

  const { data: deviceData } = useQuery({
    queryKey: ['device-analytics', deviceId],
    queryFn: () => devicesApi.get(deviceId),
    enabled: !!deviceId,
  });

  const schemaFields: any[] = deviceData?.meta?.schema ?? [];
  const numericFields = schemaFields.filter((f: any) => !f.type || f.type === 'number');

  const { from, to } = useMemo(() => getRangeBounds(range), [range]);

  const fieldQueries = useQueries({
    queries: selectedFields.map(field => ({
      queryKey: ['analytics-series', deviceId, field, range],
      queryFn: () => telemetryApi.series(deviceId, field, from, to, 2000),
      enabled: !!deviceId && !!field,
      refetchInterval: 30_000,
    })),
  });

  // Build series
  const series: Series[] = useMemo(() => selectedFields.map((k, i) => {
    const meta = schemaFields.find((f: any) => f.key === k);
    const color = meta?.chartColor ?? COLORS[i % COLORS.length];
    const raw = fieldQueries[i]?.data?.data ?? [];
    const pts: Point[] = raw.map((p: any) => ({ ts: new Date(p.ts).getTime(), value: p.value ?? 0 }));
    pts.sort((a, b) => a.ts - b.ts);
    if (!normalizeY || pts.length < 2) return { name: meta?.label || k.replace(/_/g, ' '), data: pts, color, fieldKey: k };
    const vals = pts.map(p => p.value);
    const mn = Math.min(...vals), mx = Math.max(...vals);
    const norm = pts.map(p => ({ ...p, value: mx > mn ? (p.value - mn) / (mx - mn) : 0 }));
    return { name: meta?.label || k.replace(/_/g, ' '), data: norm, color, fieldKey: k };
  }), [selectedFields, fieldQueries, schemaFields, normalizeY]);

  // Active field for ops
  const activeOpField = opField || selectedFields[0] || '';
  const activeFftField = fftField || selectedFields[0] || '';

  // Compute overlays
  const overlaySeries: Series[] = useMemo(() => {
    return overlays.map(ov => {
      const base = series.find(s => s.fieldKey === ov.fieldKey);
      if (!base) return null;
      const vals = base.data.map(p => p.value);
      let processed: number[];
      switch (ov.type) {
        case 'moving_avg':   processed = movingAverage(vals, ov.params.window ?? 10); break;
        case 'exp_ma':       processed = exponentialMA(vals, ov.params.alpha ?? 0.2); break;
        case 'differentiate': processed = differentiate(vals); break;
        case 'integrate':    processed = integrate(vals); break;
        case 'lowpass':      processed = applyLowPass(vals, ov.params.cutoff, ov.params.sr); break;
        case 'highpass':     processed = applyHighPass(vals, ov.params.cutoff, ov.params.sr); break;
        case 'bandpass':     processed = applyBandPass(vals, ov.params.center, ov.params.bw, ov.params.sr); break;
        case 'notch':        processed = applyNotch(vals, ov.params.center, ov.params.bw, ov.params.sr); break;
        default: processed = vals;
      }
      return {
        name: ov.label, color: ov.color, fieldKey: ov.fieldKey,
        data: base.data.map((p, i) => ({ ts: p.ts, value: processed[i] ?? 0 })),
      } satisfies Series;
    }).filter(Boolean) as Series[];
  }, [overlays, series]);

  // Detect sample rate for active series
  const sampleRateHz = useMemo(() => {
    const base = series.find(s => s.fieldKey === activeFftField) ?? series[0];
    if (!base?.data.length) return 1;
    return detectSampleRate(base.data.map(p => p.ts));
  }, [series, activeFftField]);

  // FFT data (windowed or full)
  const psdBins: FFTBin[] = useMemo(() => {
    const base = series.find(s => s.fieldKey === activeFftField) ?? series[0];
    if (!base?.data.length) return [];
    const pts = windowTs
      ? base.data.filter(p => p.ts >= windowTs[0] && p.ts <= windowTs[1])
      : base.data;
    if (pts.length < 8) return [];
    return computePSD(pts.map(p => p.value), sampleRateHz);
  }, [series, activeFftField, windowTs, sampleRateHz]);

  // Auto-select first field when device changes
  useEffect(() => {
    if (numericFields.length && selectedFields.length === 0) {
      setSelectedFields([numericFields[0].key]);
    }
  }, [numericFields.length, deviceId]);

  useEffect(() => { setSelectedFields([]); setWindowTs(null); setOverlays([]); }, [deviceId]);
  useEffect(() => { setWindowTs(null); }, [range]);

  const toggleField = (k: string) => setSelectedFields(prev =>
    prev.includes(k) ? (prev.length > 1 ? prev.filter(f => f !== k) : prev) : [...prev, k]
  );

  const addOverlay = (type: OverlayType, label: string, params: Record<string, number>) => {
    const idx = overlays.length;
    setOverlays(prev => [...prev, {
      id: `${Date.now()}`, type, label,
      fieldKey: activeOpField, color: OVERLAY_ALPHA[idx % OVERLAY_ALPHA.length], params,
    }]);
  };

  const applyFilter = () => {
    const base = series.find(s => s.fieldKey === activeOpField);
    if (!base?.data.length) return;
    const sr = detectSampleRate(base.data.map(p => p.ts));
    if (filterType === 'lowpass') addOverlay('lowpass', `LP ${fmtFreq(filterCutoff)}`, { cutoff: filterCutoff, sr });
    else if (filterType === 'highpass') addOverlay('highpass', `HP ${fmtFreq(filterCutoff)}`, { cutoff: filterCutoff, sr });
    else if (filterType === 'bandpass') addOverlay('bandpass', `BP ${fmtFreq(filterCenter)}`, { center: filterCenter, bw: filterBW, sr });
    else addOverlay('notch', `Notch ${fmtFreq(filterCenter)}`, { center: filterCenter, bw: filterBW, sr });
  };

  const isLoading = fieldQueries.some(q => q.isLoading);
  const nyquist = sampleRateHz / 2;

  const statsForPanel = useMemo(() => {
    const all = [...series, ...overlaySeries];
    return all.filter(s => selectedFields.includes(s.fieldKey));
  }, [series, overlaySeries, selectedFields]);

  // Input style helper
  const inputStyle: React.CSSProperties = {
    background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))',
    color: 'hsl(var(--fg))', fontFamily: 'var(--font-mono)', fontSize: 11,
    padding: '5px 8px', borderRadius: 0, width: '100%',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 9, fontFamily: 'var(--font-mono)',
    letterSpacing: '0.12em', textTransform: 'uppercase',
    color: 'hsl(var(--muted-fg))', marginBottom: 4,
  };

  return (
    <div style={{ padding: '32px 32px 64px', maxWidth: 1400, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Signal Intelligence</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 36, lineHeight: 1, margin: 0, letterSpacing: '-0.02em' }}>
            Analytics
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-outline" onClick={() => downloadCSV(series, overlaySeries, windowTs)}
            title="Export data as CSV" style={{ gap: 6 }}>
            <Download size={12} /> CSV
          </button>
          <button className="btn btn-sm btn-outline" onClick={() => downloadSVG(signalSvgRef.current)}
            title="Export chart as SVG" style={{ gap: 6 }}>
            <Download size={12} /> SVG
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {/* Device selector */}
        <div>
          <label style={labelStyle}>Device</label>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
              style={{ ...inputStyle, width: 220, paddingRight: 28, appearance: 'none', cursor: 'pointer' }}>
              <option value="">— Select device —</option>
              {devices.map((d: any) => (
                <option key={d._id} value={d._id}>{d.name}</option>
              ))}
            </select>
            <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'hsl(var(--muted-fg))' }} />
          </div>
        </div>

        {/* Field chips */}
        {deviceId && numericFields.length > 0 && (
          <div>
            <label style={labelStyle}>Parameters</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {numericFields.map((f: any, i: number) => {
                const color = f.chartColor ?? COLORS[i % COLORS.length];
                const active = selectedFields.includes(f.key);
                return (
                  <button key={f.key} onClick={() => toggleField(f.key)}
                    style={{
                      padding: '4px 10px', fontSize: 11, fontFamily: 'var(--font-mono)',
                      border: `1px solid ${active ? color : 'hsl(var(--border))'}`,
                      background: active ? `${color}18` : 'transparent',
                      color: active ? color : 'hsl(var(--muted-fg))',
                      cursor: 'pointer', transition: 'all 0.12s',
                      borderLeft: active ? `3px solid ${color}` : '1px solid hsl(var(--border))',
                    }}>
                    {f.label || f.key.replace(/_/g, ' ')}
                    {f.unit && <span style={{ opacity: 0.55, marginLeft: 4 }}>{f.unit}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Range */}
        <div>
          <label style={labelStyle}>Range</label>
          <div className="seg">
            {RANGES.map(r => (
              <button key={r.value} className={range === r.value ? 'on' : ''} onClick={() => setRange(r.value)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Normalize toggle */}
        <div>
          <label style={labelStyle}>Y Axis</label>
          <div className="seg">
            <button className={!normalizeY ? 'on' : ''} onClick={() => setNormalizeY(false)}>Raw</button>
            <button className={normalizeY ? 'on' : ''} onClick={() => setNormalizeY(true)}>Norm</button>
          </div>
        </div>

        {/* Window clear */}
        {windowTs && (
          <button className="btn btn-sm" style={{ gap: 6, alignSelf: 'flex-end', color: 'hsl(var(--primary))' }}
            onClick={() => setWindowTs(null)}>
            <X size={12} /> Clear window
          </button>
        )}

        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
            <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite', color: 'hsl(var(--muted-fg))' }} />
          </div>
        )}
      </div>

      {/* Main grid: chart + sidebar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, marginBottom: 24 }}>

        {/* Signal chart */}
        <div>
          <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid hsl(var(--border))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'hsl(var(--muted-fg))', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Signal · {series.reduce((s, x) => s + x.data.length, 0)} pts
                {windowTs && <span style={{ color: 'hsl(var(--primary))', marginLeft: 8 }}>
                  · window: {((windowTs[1] - windowTs[0]) / 60000).toFixed(1)} min
                </span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[...series, ...overlaySeries].map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'var(--font-mono)', color: s.color }}>
                    <svg width={14} height={6}>
                      <line x1={0} y1={3} x2={14} y2={3} stroke={s.color} strokeWidth={i < series.length ? 2 : 1.5} strokeDasharray={i < series.length ? 'none' : '4 2'} />
                    </svg>
                    {s.name}
                  </div>
                ))}
              </div>
            </div>
            {series.length === 0 ? (
              <div style={{ height: 340, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--muted-fg))' }}>
                <Activity size={32} strokeWidth={1} style={{ marginBottom: 12, opacity: 0.3 }} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>Select a device and parameters above</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, marginTop: 4, opacity: 0.6 }}>Then drag on the chart to select a window</div>
              </div>
            ) : (
              <SignalChart
                series={series} overlaySeries={overlaySeries}
                windowTs={windowTs} onWindowChange={setWindowTs}
                height={340} svgRef={signalSvgRef}
              />
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Stats */}
          <div className="panel" style={{ padding: '14px 16px' }}>
            <StatsPanel series={statsForPanel} windowTs={windowTs} />
          </div>

          {/* Operations */}
          <div className="panel" style={{ padding: '14px 16px' }}>
            <div className="eyebrow" style={{ marginBottom: 14, fontSize: 9.5, letterSpacing: '0.14em' }}>Operations</div>

            {selectedFields.length > 1 && (
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Apply to field</label>
                <select value={activeOpField} onChange={e => setOpField(e.target.value)} style={{ ...inputStyle }}>
                  {selectedFields.map(k => {
                    const meta = schemaFields.find((f: any) => f.key === k);
                    return <option key={k} value={k}>{meta?.label || k}</option>;
                  })}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Moving average */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'flex-end' }}>
                <div>
                  <label style={labelStyle}>Moving Average · window pts</label>
                  <input type="number" min={2} max={200} value={maWindow} onChange={e => setMaWindow(+e.target.value)} style={inputStyle} />
                </div>
                <button className="btn btn-sm" style={{ whiteSpace: 'nowrap' }}
                  onClick={() => addOverlay('moving_avg', `MA(${maWindow})`, { window: maWindow })}
                  disabled={!selectedFields.length}>Apply</button>
              </div>

              {/* EMA */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'flex-end' }}>
                <div>
                  <label style={labelStyle}>Exp. Moving Average · α (0–1)</label>
                  <input type="number" min={0.01} max={1} step={0.01} value={emaAlpha} onChange={e => setEmaAlpha(+e.target.value)} style={inputStyle} />
                </div>
                <button className="btn btn-sm" style={{ whiteSpace: 'nowrap' }}
                  onClick={() => addOverlay('exp_ma', `EMA(${emaAlpha})`, { alpha: emaAlpha })}
                  disabled={!selectedFields.length}>Apply</button>
              </div>

              {/* Differentiate / Integrate */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <button className="btn btn-sm btn-outline"
                  onClick={() => addOverlay('differentiate', 'd/dt', {})}
                  disabled={!selectedFields.length}>Differentiate</button>
                <button className="btn btn-sm btn-outline"
                  onClick={() => addOverlay('integrate', '∫dt', {})}
                  disabled={!selectedFields.length}>Integrate</button>
              </div>
            </div>

            {/* Filters */}
            <div style={{ borderTop: '1px solid hsl(var(--border))', marginTop: 14, paddingTop: 14 }}>
              <div className="eyebrow" style={{ marginBottom: 12, fontSize: 9.5, letterSpacing: '0.14em' }}>Filters</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <label style={labelStyle}>Type</label>
                  <div className="seg" style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
                    {(['lowpass', 'highpass', 'bandpass', 'notch'] as const).map(t => (
                      <button key={t} className={filterType === t ? 'on' : ''} onClick={() => setFilterType(t)}
                        style={{ fontSize: 9, letterSpacing: '0.04em' }}>
                        {t === 'lowpass' ? 'LP' : t === 'highpass' ? 'HP' : t === 'bandpass' ? 'BP' : 'Notch'}
                      </button>
                    ))}
                  </div>
                </div>

                {(filterType === 'lowpass' || filterType === 'highpass') && (
                  <div>
                    <label style={labelStyle}>
                      Cutoff · {fmtFreq(filterCutoff)} · T={fmtPeriod(filterCutoff)}
                      {nyquist > 0 && <span style={{ marginLeft: 4, opacity: 0.6 }}>(Nyq: {fmtFreq(nyquist)})</span>}
                    </label>
                    <input type="number" min={0} max={nyquist * 0.999} step={nyquist / 100}
                      value={filterCutoff} onChange={e => setFilterCutoff(+e.target.value)} style={inputStyle} />
                  </div>
                )}

                {(filterType === 'bandpass' || filterType === 'notch') && (
                  <>
                    <div>
                      <label style={labelStyle}>Center · {fmtFreq(filterCenter)} · T={fmtPeriod(filterCenter)}</label>
                      <input type="number" min={0} max={nyquist * 0.999} step={nyquist / 100}
                        value={filterCenter} onChange={e => setFilterCenter(+e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Bandwidth · {filterBW.toFixed(1)} octave(s)</label>
                      <input type="number" min={0.1} max={4} step={0.1}
                        value={filterBW} onChange={e => setFilterBW(+e.target.value)} style={inputStyle} />
                    </div>
                  </>
                )}

                <button className="btn btn-sm btn-primary" onClick={applyFilter} disabled={!selectedFields.length}>
                  Apply Filter
                </button>
              </div>
            </div>

            {/* Active overlays */}
            {overlays.length > 0 && (
              <div style={{ borderTop: '1px solid hsl(var(--border))', marginTop: 14, paddingTop: 14 }}>
                <div className="eyebrow" style={{ marginBottom: 8, fontSize: 9.5 }}>Active Overlays</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {overlays.map(ov => (
                    <div key={ov.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: 'hsl(var(--surface-raised))', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg width={14} height={6}><line x1={0} y1={3} x2={14} y2={3} stroke={ov.color} strokeWidth={1.5} strokeDasharray="4 2" /></svg>
                        <span style={{ color: ov.color }}>{ov.label}</span>
                        <span style={{ color: 'hsl(var(--muted-fg))', opacity: 0.7 }}>· {ov.fieldKey}</span>
                      </div>
                      <button onClick={() => setOverlays(prev => prev.filter(o => o.id !== ov.id))}
                        style={{ background: 'none', border: 0, cursor: 'pointer', color: 'hsl(var(--muted-fg))', padding: 0, display: 'flex' }}>
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FFT / Frequency Domain */}
      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid hsl(var(--border))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Waves size={14} style={{ color: 'hsl(var(--primary))' }} />
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'hsl(var(--muted-fg))', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Frequency Domain · PSD (Hann window)
            </span>
            {psdBins.length > 0 && (
              <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', color: 'hsl(var(--muted-fg))', opacity: 0.7 }}>
                · sr={fmtFreq(sampleRateHz)} · {psdBins.length} bins · Nyq={fmtFreq(nyquist)}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {selectedFields.length > 1 && (
              <select value={activeFftField} onChange={e => setFftField(e.target.value)}
                style={{ ...inputStyle, width: 130, paddingRight: 4 }}>
                {selectedFields.map(k => {
                  const meta = schemaFields.find((f: any) => f.key === k);
                  return <option key={k} value={k}>{meta?.label || k}</option>;
                })}
              </select>
            )}
            <button onClick={() => setShowFFT(v => !v)}
              style={{ background: 'none', border: 0, cursor: 'pointer', color: 'hsl(var(--muted-fg))', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
              {showFFT ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        {showFFT && (
          <div style={{ padding: '8px 0' }}>
            <PSDChart bins={psdBins} sampleRateHz={sampleRateHz} height={220} />
          </div>
        )}
      </div>
    </div>
  );
}
