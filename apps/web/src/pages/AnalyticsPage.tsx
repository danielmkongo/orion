import React, {
  useState, useRef, useMemo, useEffect, useCallback, useId,
} from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import {
  Activity, X, Download, ChevronDown, Waves, RefreshCw,
  BarChart2, Box, Layers, Maximize2, Minimize2,
} from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { devicesApi } from '@/api/devices';
import { telemetryApi } from '@/api/telemetry';
import {
  computeStats, movingAverage, exponentialMA, differentiate, integrate,
  computePSD, applyLowPass, applyHighPass, applyBandPass, applyNotch,
  detectSampleRate, niceTicks, fmtFreq, fmtPeriod,
  computeHistogram, correlationMatrix, computeSpectrogram,
  type Stats, type FFTBin,
} from '@/lib/dsp';

// ── Constants ────────────────────────────────────────────────────────────────

const COLORS  = ['#ff5b1f','#3b82f6','#22c55e','#a855f7','#f59e0b','#ec4899','#14b8a6','#f97316'];
const O_COLORS = ['#ffb38a','#93c5fd','#86efac','#d8b4fe','#fde68a','#fbcfe8','#99f6e4','#fdba74'];
const RANGES = [
  { label:'1H', ms:3_600_000 }, { label:'6H', ms:21_600_000 },
  { label:'24H', ms:86_400_000 }, { label:'7D', ms:604_800_000 }, { label:'30D', ms:2_592_000_000 },
];

type Tab = 'signal' | 'spectrum' | 'stats' | '3d';
type OvType = 'moving_avg'|'exp_ma'|'differentiate'|'integrate'|'lowpass'|'highpass'|'bandpass'|'notch';

interface Overlay { id:string; type:OvType; label:string; fieldKey:string; color:string; params:Record<string,number>; }
interface Point   { ts:number; value:number; }
interface Series  { name:string; data:Point[]; color:string; fieldKey:string; }

// ── Helpers ──────────────────────────────────────────────────────────────────

function rangeBounds(ms: number) {
  const now = Date.now();
  return { from: new Date(now - ms).toISOString(), to: new Date(now + 86_400_000).toISOString() };
}

function fmtTs(ts: number, spanMs: number): string {
  const d = new Date(ts), tz = 'UTC';
  if (spanMs > 7*864e5) return d.toLocaleDateString('en', { month:'short', day:'numeric', timeZone:tz });
  if (spanMs > 864e5)   return d.toLocaleDateString('en', { month:'short', day:'numeric', timeZone:tz }) + ' ' + d.toLocaleTimeString('en', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone:tz });
  if (spanMs > 36e5)    return d.toLocaleTimeString('en', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone:tz });
  return d.toLocaleTimeString('en', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false, timeZone:tz });
}

function fmt4(n: number): string {
  if (!isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 10000) return n.toFixed(0);
  if (a >= 100)   return n.toFixed(1);
  if (a >= 1)     return n.toFixed(2);
  return n.toFixed(4);
}

function lerpColor(t: number, c1: string, c2: string): string {
  const h = (s: string) => [parseInt(s.slice(1,3),16), parseInt(s.slice(3,5),16), parseInt(s.slice(5,7),16)] as const;
  const [r1,g1,b1] = h(c1), [r2,g2,b2] = h(c2);
  return `rgb(${Math.round(r1+t*(r2-r1))},${Math.round(g1+t*(g2-g1))},${Math.round(b1+t*(b2-b1))})`;
}

const INFERNO = [[0,0,4],[40,11,84],[101,21,110],[159,42,99],[212,72,66],[245,125,21],[252,193,57],[253,231,37]] as const;
function infernoHex(t: number): string {
  const n = INFERNO.length - 1;
  const i = Math.min(n - 1, Math.floor(t * n));
  const f = t * n - i;
  const [r1,g1,b1] = INFERNO[i], [r2,g2,b2] = INFERNO[i+1];
  return `rgb(${Math.round(r1+f*(r2-r1))},${Math.round(g1+f*(g2-g1))},${Math.round(b1+f*(b2-b1))})`;
}

function exportCSV(series: Series[], overlaySeries: Series[], windowTs: [number,number]|null) {
  const all = [...series, ...overlaySeries];
  const tsSet = new Set<number>();
  all.forEach(s => s.data.forEach(p => { if (!windowTs || (p.ts >= windowTs[0] && p.ts <= windowTs[1])) tsSet.add(p.ts); }));
  const sorted = [...tsSet].sort((a,b) => a-b);
  const header = ['timestamp', ...all.map(s => s.name)].join(',');
  const rows = sorted.map(ts => [new Date(ts).toISOString(), ...all.map(s => { const p = s.data.find(x => x.ts === ts); return p ? fmt4(p.value) : ''; })].join(','));
  const blob = new Blob([header+'\n'+rows.join('\n')], { type:'text/csv' });
  const a = Object.assign(document.createElement('a'), { href:URL.createObjectURL(blob), download:'orion-analytics.csv' });
  a.click(); URL.revokeObjectURL(a.href);
}

// ── Signal Chart (SVG, window-selection) ────────────────────────────────────

const SP = { top:20, right:24, bottom:42, left:58 };

function SignalChart({ series, overlays: ovSeries, windowTs, onWindow, height=360, svgRef: extRef }: {
  series: Series[]; overlays: Series[]; windowTs:[number,number]|null;
  onWindow:(w:[number,number]|null)=>void; height?:number; svgRef?:React.RefObject<SVGSVGElement>;
}) {
  const uid = useId();
  const cRef = useRef<HTMLDivElement>(null);
  const iRef = useRef<SVGSVGElement>(null);
  const svgRef = extRef ?? iRef;
  const [W, setW] = useState(800);
  const [drag, setDrag] = useState<{type:'new'|'move'|'L'|'R'; aTs:number; aW?:[number,number]}|null>(null);
  const [hx, setHx] = useState<number|null>(null);

  useEffect(() => {
    if (!cRef.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(cRef.current); return () => ro.disconnect();
  }, []);

  const iW = W - SP.left - SP.right, iH = height - SP.top - SP.bottom;
  const all = useMemo(() => [...series, ...ovSeries].flatMap(s => s.data), [series, ovSeries]);

  const { mnTs, mxTs, mnV, mxV } = useMemo(() => {
    if (!all.length) return { mnTs:0, mxTs:1, mnV:0, mxV:1 };
    const ts = all.map(p=>p.ts), vs = all.map(p=>p.value);
    return { mnTs:Math.min(...ts), mxTs:Math.max(...ts), mnV:Math.min(...vs), mxV:Math.max(...vs) };
  }, [all]);

  const span = mxTs - mnTs || 1, vRange = mxV - mnV || 1, vPad = vRange * 0.08;
  const yMn = mnV - vPad, yMx = mxV + vPad;

  const tsX = useCallback((ts:number) => SP.left + (ts-mnTs)/span*iW, [mnTs,span,iW]);
  const vY  = useCallback((v:number)  => SP.top + (1-(v-yMn)/(yMx-yMn))*iH, [yMn,yMx,iH]);
  const xTs = useCallback((x:number)  => mnTs + (x-SP.left)/iW*span, [mnTs,span,iW]);
  const clX = (x:number) => Math.max(SP.left, Math.min(SP.left+iW, x));
  const clTs = (t:number) => Math.max(mnTs, Math.min(mxTs, t));

  const path = (data:Point[]) => data.length < 2 ? '' :
    data.map((p,i)=>`${i?'L':'M'}${tsX(p.ts).toFixed(1)},${vY(p.value).toFixed(1)}`).join(' ');

  const yTicks = useMemo(()=>niceTicks(yMn,yMx,6),[yMn,yMx]);
  const xTicks = useMemo(()=>{
    const n = Math.max(3, Math.floor(iW/90));
    return Array.from({length:n+1},(_,i)=>mnTs+i*span/n);
  },[mnTs,span,iW]);

  const wx1 = windowTs ? Math.max(SP.left, tsX(windowTs[0])) : null;
  const wx2 = windowTs ? Math.min(SP.left+iW, tsX(windowTs[1])) : null;
  const HW = 7;

  const getX = (e:React.MouseEvent) => { const r = svgRef.current!.getBoundingClientRect(); return clX(e.clientX-r.left); };

  const onMD = (e:React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const x = getX(e), ts = xTs(x);
    if (windowTs && wx1!==null && wx2!==null) {
      if (Math.abs(x-wx1)<=HW) { setDrag({type:'L',aTs:ts,aW:windowTs}); return; }
      if (Math.abs(x-wx2)<=HW) { setDrag({type:'R',aTs:ts,aW:windowTs}); return; }
      if (x>wx1 && x<wx2)      { setDrag({type:'move',aTs:ts,aW:windowTs}); return; }
    }
    setDrag({type:'new',aTs:ts}); onWindow([clTs(ts),clTs(ts)]);
  };
  const onMM = (e:React.MouseEvent<SVGSVGElement>) => {
    const x = getX(e), ts = xTs(x); setHx(x);
    if (!drag) return;
    const d = ts - drag.aTs;
    if (drag.type==='new') { const a=drag.aTs,b=clTs(ts); onWindow([Math.min(a,b),Math.max(a,b)]); }
    else if (drag.type==='L' && drag.aW) onWindow([clTs(drag.aW[0]+d),drag.aW[1]]);
    else if (drag.type==='R' && drag.aW) onWindow([drag.aW[0],clTs(drag.aW[1]+d)]);
    else if (drag.type==='move' && drag.aW) {
      const sp2 = drag.aW[1]-drag.aW[0], ns=clTs(drag.aW[0]+d);
      onWindow([ns,clTs(ns+sp2)]);
    }
  };
  const onMU = () => setDrag(null);
  const onML = () => { setDrag(null); setHx(null); };

  const cursor = drag ? (drag.type==='move'?'grabbing':'ew-resize')
    : (wx1!==null&&wx2!==null&&hx!==null&&(Math.abs(hx-wx1)<=HW||Math.abs(hx-wx2)<=HW)) ? 'ew-resize'
    : (wx1!==null&&wx2!==null&&hx!==null&&hx>wx1&&hx<wx2) ? 'grab' : 'crosshair';

  const clip = `${uid}-c`;

  return (
    <div ref={cRef} style={{width:'100%'}}>
      <svg ref={svgRef} width={W} height={height}
        style={{display:'block',cursor,userSelect:'none'}}
        onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onML}>
        <defs>
          <clipPath id={clip}><rect x={SP.left} y={SP.top} width={iW} height={iH}/></clipPath>
        </defs>
        {yTicks.map((v,i)=><line key={i} x1={SP.left} y1={vY(v)} x2={SP.left+iW} y2={vY(v)} stroke="hsl(var(--border))" strokeWidth={0.5}/>)}
        {xTicks.map((t,i)=><line key={i} x1={tsX(t)} y1={SP.top} x2={tsX(t)} y2={SP.top+iH} stroke="hsl(var(--border))" strokeWidth={0.5}/>)}

        {wx1!==null&&wx2!==null&&wx1<wx2&&<>
          <rect x={wx1} y={SP.top} width={Math.max(0,wx2-wx1)} height={iH}
            fill="hsl(var(--primary)/0.07)" clipPath={`url(#${clip})`}/>
          <line x1={wx1} y1={SP.top} x2={wx1} y2={SP.top+iH} stroke="hsl(var(--primary))" strokeWidth={1.5} strokeOpacity={0.7}/>
          <line x1={wx2} y1={SP.top} x2={wx2} y2={SP.top+iH} stroke="hsl(var(--primary))" strokeWidth={1.5} strokeOpacity={0.7}/>
          <rect x={wx1-HW/2} y={SP.top+iH/2-18} width={HW} height={36} rx={3} fill="hsl(var(--primary))" opacity={0.45}/>
          <rect x={wx2-HW/2} y={SP.top+iH/2-18} width={HW} height={36} rx={3} fill="hsl(var(--primary))" opacity={0.45}/>
          {wx2-wx1>50&&<text x={(wx1+wx2)/2} y={SP.top+14} textAnchor="middle"
            fontSize={8} fontFamily="var(--font-mono)" fill="hsl(var(--primary))" fillOpacity={0.8}>
            {((windowTs![1]-windowTs![0])/60000).toFixed(1)} min window
          </text>}
        </>}

        {series.map((s,i)=><path key={i} d={path(s.data)} fill="none" stroke={s.color}
          strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${clip})`}/>)}
        {ovSeries.map((s,i)=><path key={i} d={path(s.data)} fill="none" stroke={s.color}
          strokeWidth={1.75} strokeDasharray="6 3" strokeLinejoin="round" clipPath={`url(#${clip})`}/>)}
        {hx!==null&&<line x1={hx} y1={SP.top} x2={hx} y2={SP.top+iH}
          stroke="hsl(var(--fg))" strokeWidth={0.4} strokeOpacity={0.3} clipPath={`url(#${clip})`}/>}

        <line x1={SP.left} y1={SP.top} x2={SP.left} y2={SP.top+iH} stroke="hsl(var(--border))"/>
        {yTicks.map((v,i)=><text key={i} x={SP.left-7} y={vY(v)+3.5} textAnchor="end"
          fontSize={9} fontFamily="var(--font-mono)" fill="hsl(var(--muted-fg))">{fmt4(v)}</text>)}
        <line x1={SP.left} y1={SP.top+iH} x2={SP.left+iW} y2={SP.top+iH} stroke="hsl(var(--border))"/>
        {xTicks.map((t,i)=><text key={i} x={tsX(t)} y={SP.top+iH+14} textAnchor="middle"
          fontSize={9} fontFamily="var(--font-mono)" fill="hsl(var(--muted-fg))">{fmtTs(t,span)}</text>)}

        {windowTs&&wx1!==null&&wx2!==null&&wx2-wx1>80&&<>
          <text x={wx1+3} y={SP.top+iH-4} fontSize={7} fontFamily="var(--font-mono)" fill="hsl(var(--primary))" fillOpacity={0.7}>{fmtTs(windowTs[0],span)}</text>
          <text x={wx2-3} y={SP.top+iH-4} textAnchor="end" fontSize={7} fontFamily="var(--font-mono)" fill="hsl(var(--primary))" fillOpacity={0.7}>{fmtTs(windowTs[1],span)}</text>
        </>}
      </svg>
    </div>
  );
}

// ── PSD Chart ─────────────────────────────────────────────────────────────────

function PSDChart({ bins, sampleRateHz, height=220, color='#ff5b1f' }: { bins:FFTBin[]; sampleRateHz:number; height?:number; color?:string }) {
  const uid = useId();
  const cRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(800);
  const [hi, setHi] = useState<number|null>(null);
  useEffect(()=>{ if(!cRef.current) return; const ro=new ResizeObserver(([e])=>setW(Math.floor(e.contentRect.width))); ro.observe(cRef.current); return ()=>ro.disconnect(); },[]);
  if (!bins.length) return <div style={{height,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--font-mono)',fontSize:11,color:'hsl(var(--muted-fg))'}}>Select a window on the signal to compute spectrum</div>;
  const P={top:16,right:24,bottom:36,left:52}, iW=W-P.left-P.right, iH=height-P.top-P.bottom;
  const freqs=bins.map(b=>b.freq), powers=bins.map(b=>b.powerDb);
  const mnF=Math.min(...freqs),mxF=Math.max(...freqs), mnP=Math.max(-60,Math.min(...powers)),mxP=0;
  const fX=(f:number)=>P.left+(f-mnF)/(mxF-mnF||1)*iW;
  const pY=(p:number)=>P.top+(1-(p-mnP)/(mxP-mnP))*iH;
  const bW=Math.max(1,iW/bins.length-0.5);
  const peak=bins.reduce((a,b)=>b.powerDb>a.powerDb?b:a,bins[0]);
  const yT=niceTicks(mnP,mxP,5), xT=niceTicks(mnF,mxF,5);
  const clip=`${uid}-pc`;
  return (
    <div ref={cRef} style={{width:'100%'}}>
      <svg width={W} height={height} style={{display:'block'}}
        onMouseMove={e=>{const r=e.currentTarget.getBoundingClientRect(); const x=e.clientX-r.left; const idx=Math.round((x-P.left)/iW*(bins.length-1)); setHi(idx>=0&&idx<bins.length?idx:null);}}
        onMouseLeave={()=>setHi(null)}>
        <defs>
          <clipPath id={clip}><rect x={P.left} y={P.top} width={iW} height={iH}/></clipPath>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.9}/>
            <stop offset="100%" stopColor={color} stopOpacity={0.1}/>
          </linearGradient>
        </defs>
        {yT.map((v,i)=><line key={i} x1={P.left} y1={pY(v)} x2={P.left+iW} y2={pY(v)} stroke="hsl(var(--border))" strokeWidth={0.5}/>)}
        {bins.map((b,i)=>{const x=fX(b.freq),y=pY(b.powerDb),bh=Math.max(0,iH-(y-P.top)); return <rect key={i} x={x} y={y} width={bW} height={bh} fill={i===hi?color:`url(#${uid}-bg)`} clipPath={`url(#${clip})`}/>; })}
        {peak&&<>
          <line x1={fX(peak.freq)} y1={P.top} x2={fX(peak.freq)} y2={pY(peak.powerDb)} stroke={color} strokeWidth={1} strokeDasharray="3 4" strokeOpacity={0.5}/>
          <text x={fX(peak.freq)+4} y={P.top+13} fontSize={8} fontFamily="var(--font-mono)" fill={color} fillOpacity={0.85}>{fmtFreq(peak.freq)} · T={fmtPeriod(peak.freq)}</text>
        </>}
        {hi!==null&&bins[hi]&&(()=>{const b=bins[hi],x=fX(b.freq),tx=x>W-140?x-128:x+8; return <g>
          <rect x={tx} y={P.top+4} width={124} height={38} rx={3} fill="hsl(var(--surface))" stroke="hsl(var(--border))"/>
          <text x={tx+7} y={P.top+18} fontSize={9} fontFamily="var(--font-mono)" fill="hsl(var(--fg))">{fmtFreq(b.freq)}</text>
          <text x={tx+7} y={P.top+32} fontSize={9} fontFamily="var(--font-mono)" fill="hsl(var(--muted-fg))">{b.powerDb.toFixed(1)} dB · T={fmtPeriod(b.freq)}</text>
        </g>;})()}
        <line x1={P.left} y1={P.top} x2={P.left} y2={P.top+iH} stroke="hsl(var(--border))"/>
        {yT.map((v,i)=><text key={i} x={P.left-5} y={pY(v)+3.5} textAnchor="end" fontSize={9} fontFamily="var(--font-mono)" fill="hsl(var(--muted-fg))">{v.toFixed(0)}dB</text>)}
        <line x1={P.left} y1={P.top+iH} x2={P.left+iW} y2={P.top+iH} stroke="hsl(var(--border))"/>
        {xT.map((f,i)=><text key={i} x={fX(f)} y={P.top+iH+14} textAnchor="middle" fontSize={8} fontFamily="var(--font-mono)" fill="hsl(var(--muted-fg))">{fmtFreq(f)}</text>)}
      </svg>
    </div>
  );
}

// ── Spectrogram (Canvas) ─────────────────────────────────────────────────────

function Spectrogram({ values, sampleRateHz, height=200 }: { values:number[]; sampleRateHz:number; height?:number }) {
  const cRef = useRef<HTMLCanvasElement>(null);
  const wRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  useEffect(()=>{ if(!wRef.current) return; const ro=new ResizeObserver(([e])=>setW(Math.floor(e.contentRect.width))); ro.observe(wRef.current); return ()=>ro.disconnect(); },[]);

  const { times, freqs, powerDb } = useMemo(()=>computeSpectrogram(values, sampleRateHz),[values, sampleRateHz]);

  useEffect(() => {
    const canvas = cRef.current; if (!canvas || !times.length || !freqs.length) return;
    canvas.width = W; canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0,0,W,height);
    const PL=52,PB=28,iW=W-PL-8,iH=height-PB-4;
    const nT=times.length, nF=freqs.length;
    const cW=Math.max(1,Math.ceil(iW/nT)), cH=Math.max(1,Math.ceil(iH/nF));
    for (let ti=0; ti<nT; ti++) {
      for (let fi=0; fi<nF; fi++) {
        const db = powerDb[ti]?.[fi] ?? -120;
        const t = Math.max(0, Math.min(1, (db+60)/60));
        ctx.fillStyle = infernoHex(t);
        ctx.fillRect(PL+Math.floor(ti*iW/nT), 4+Math.floor((nF-1-fi)*iH/nF), cW+1, cH+1);
      }
    }
    // Axes
    ctx.strokeStyle = 'hsl(50,4%,18%)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PL,4); ctx.lineTo(PL,4+iH); ctx.lineTo(PL+iW,4+iH); ctx.stroke();
    ctx.fillStyle = '#6b6960'; ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    [0,0.25,0.5,0.75,1].forEach(t => {
      const f = freqs[Math.round(t*(nF-1))] ?? 0;
      const y = 4 + (1-t)*iH;
      ctx.fillText(fmtFreq(f), PL-4, y+3);
    });
    ctx.textAlign = 'center';
    [0,0.25,0.5,0.75,1].forEach(t => {
      const ti2 = Math.round(t*(nT-1));
      const label = `${(times[ti2]??0).toFixed(0)}s`;
      ctx.fillText(label, PL+t*iW, 4+iH+14);
    });
    // Colorbar label
    ctx.textAlign = 'left'; ctx.fillStyle = '#9a968c';
    ctx.fillText('-60 dB', PL, 4+iH+24); ctx.textAlign='right'; ctx.fillText('0 dB', PL+iW, 4+iH+24);
  }, [times, freqs, powerDb, W, height]);

  if (!times.length) return <div style={{height,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--font-mono)',fontSize:11,color:'hsl(var(--muted-fg))'}}>Not enough data for spectrogram (need ≥ 32 points)</div>;

  return (
    <div ref={wRef} style={{width:'100%'}}>
      <canvas ref={cRef} style={{display:'block',width:'100%',height}} />
    </div>
  );
}

// ── Histogram Grid ───────────────────────────────────────────────────────────

function HistogramGrid({ series }: { series:Series[] }) {
  if (!series.length) return <div style={{padding:32,textAlign:'center',color:'hsl(var(--muted-fg))',fontFamily:'var(--font-mono)',fontSize:11}}>No data</div>;
  return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:16}}>
      {series.map((s,si) => {
        const vals = s.data.map(p=>p.value);
        const bins = computeHistogram(vals, 24);
        const maxF = Math.max(...bins.map(b=>b.freq), 0.001);
        const W=280,H=140,PL=44,PB=24,PT=8,PR=8;
        const iW=W-PL-PR,iH=H-PB-PT;
        const bW=iW/bins.length;
        return (
          <div key={si} className="panel" style={{padding:'12px 12px 8px'}}>
            <div style={{fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'0.1em',textTransform:'uppercase',color:s.color,marginBottom:8}}>{s.name}</div>
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:'block'}}>
              {[0,0.25,0.5,0.75,1].map((t,i)=><line key={i} x1={PL} y1={PT+iH*(1-t)} x2={PL+iW} y2={PT+iH*(1-t)} stroke="hsl(var(--border))" strokeWidth={0.5}/>)}
              {bins.map((b,i)=>{
                const bH=Math.max(1,(b.freq/maxF)*iH);
                return <rect key={i} x={PL+i*bW+0.5} y={PT+iH-bH} width={Math.max(1,bW-1)} height={bH} fill={s.color} fillOpacity={0.75}/>;
              })}
              <line x1={PL} y1={PT} x2={PL} y2={PT+iH} stroke="hsl(var(--border))"/>
              <line x1={PL} y1={PT+iH} x2={PL+iW} y2={PT+iH} stroke="hsl(var(--border))"/>
              {[0,0.5,1].map((t,i)=>{ const v=bins[Math.round(t*(bins.length-1))]?.bin??0; return <text key={i} x={PL+t*iW} y={PT+iH+14} textAnchor="middle" fontSize={8} fontFamily="var(--font-mono)" fill="hsl(var(--muted-fg))">{fmt4(v)}</text>; })}
              {[0,0.5,1].map((t,i)=>{ const f=t*maxF; return <text key={i} x={PL-4} y={PT+iH*(1-t)+3.5} textAnchor="end" fontSize={8} fontFamily="var(--font-mono)" fill="hsl(var(--muted-fg))">{(f*100).toFixed(0)}%</text>; })}
              {/* Normal distribution overlay */}
              {vals.length>4&&(()=>{
                const m=vals.reduce((s,v)=>s+v,0)/vals.length;
                const sd=Math.sqrt(vals.reduce((s,v)=>s+(v-m)**2,0)/vals.length)||1;
                const mn=Math.min(...vals),mx=Math.max(...vals),range=mx-mn||1;
                const pts=Array.from({length:60},(_,i)=>{
                  const x=mn+i*range/59;
                  const y=Math.exp(-0.5*((x-m)/sd)**2)/(sd*Math.sqrt(2*Math.PI));
                  return `${PL+(x-mn)/range*iW},${PT+iH-(y*(range/bins.length)/maxF)*iH}`;
                });
                return <polyline points={pts.join(' ')} fill="none" stroke="hsl(var(--fg))" strokeWidth={1} strokeOpacity={0.25} strokeDasharray="3 2"/>;
              })()}
            </svg>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:4,marginTop:4,fontSize:9,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))'}}>
              {[['μ',computeStats(vals).mean],['σ',computeStats(vals).stdDev],['P-P',computeStats(vals).peakToPeak]].map(([k,v])=>(
                <div key={String(k)}><span style={{opacity:0.6}}>{k} </span><span style={{color:'hsl(var(--fg))'}}>{fmt4(Number(v))}</span></div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Correlation Heatmap ──────────────────────────────────────────────────────

function CorrelationHeatmap({ series }: { series:Series[] }) {
  if (series.length < 2) return <div style={{padding:24,textAlign:'center',fontFamily:'var(--font-mono)',fontSize:11,color:'hsl(var(--muted-fg))'}}>Select ≥ 2 parameters to see correlations</div>;
  const m = series.length;
  const vals = series.map(s => s.data.map(p=>p.value));
  const corr = correlationMatrix(vals);
  const N = 56, cellSize = N, pad = { t:8, l:80, b:48, r:8 };
  const W = pad.l + m*cellSize + pad.r, H = pad.t + m*cellSize + pad.b;
  const corrColor = (r: number): string => {
    if (r>=0) return `hsl(16,${Math.round(r*100)}%,${Math.round(60-r*25)}%)`;
    return `hsl(224,${Math.round(-r*100)}%,${Math.round(60+r*25)}%)`;
  };
  return (
    <div className="panel" style={{padding:'12px 16px',display:'inline-block',maxWidth:'100%',overflowX:'auto'}}>
      <div style={{fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'0.12em',textTransform:'uppercase',color:'hsl(var(--muted-fg))',marginBottom:10}}>Pearson Correlation Matrix</div>
      <svg width={W} height={H} style={{display:'block'}}>
        {series.map((s,i)=><React.Fragment key={i}>
          <text x={pad.l-6} y={pad.t+i*cellSize+cellSize/2+3.5} textAnchor="end" fontSize={10} fontFamily="var(--font-mono)" fill={s.color}>{s.name.substring(0,10)}</text>
          <text x={pad.l+i*cellSize+cellSize/2} y={pad.t+m*cellSize+14} textAnchor="middle" fontSize={10} fontFamily="var(--font-mono)" fill={s.color}>{s.name.substring(0,8)}</text>
        </React.Fragment>)}
        {Array.from({length:m},(_,i)=>Array.from({length:m},(_,j)=>{
          const r=corr[i][j];
          return <g key={`${i}-${j}`}>
            <rect x={pad.l+j*cellSize} y={pad.t+i*cellSize} width={cellSize} height={cellSize} fill={corrColor(r)} rx={2} style={{transition:'fill 0.2s'}}/>
            <text x={pad.l+j*cellSize+cellSize/2} y={pad.t+i*cellSize+cellSize/2+3.5} textAnchor="middle"
              fontSize={Math.min(11,cellSize*0.35)} fontFamily="var(--font-mono)" fill="hsl(var(--fg))" fillOpacity={0.9} fontWeight={i===j?600:400}>
              {r.toFixed(2)}
            </text>
          </g>;
        }))}
        <text x={pad.l} y={H-4} fontSize={8} fontFamily="var(--font-mono)" fill="hsl(var(--muted-fg))">■ orange = positive · ■ blue = negative</text>
      </svg>
    </div>
  );
}

// ── 3D Scatter (Canvas, PCA or direct) ──────────────────────────────────────

type Cloud = { name: string; color: string; pts: [number,number,number][]; };

function Scatter3D({ series, windowTs, height=440 }: { series:Series[]; windowTs:[number,number]|null; height?:number }) {
  const wRef = useRef<HTMLDivElement>(null);
  const cRef = useRef<HTMLCanvasElement>(null);
  const [W, setW] = useState(600);
  const [az, setAz] = useState(0.6);
  const [el, setEl] = useState(0.45);
  const [dragging, setDragging] = useState<{x:number;y:number;az:number;el:number}|null>(null);

  useEffect(()=>{ if(!wRef.current) return; const ro=new ResizeObserver(([e])=>setW(Math.floor(e.contentRect.width))); ro.observe(wRef.current); return ()=>ro.disconnect(); },[]);

  const { points3D, labels, c0, c1, clouds } = useMemo(() => {
    const filtered = series.map(s => ({
      ...s,
      data: windowTs ? s.data.filter(p=>p.ts>=windowTs[0]&&p.ts<=windowTs[1]) : s.data,
    }));

    const primaryColor = filtered[0]?.color ?? COLORS[0];
    const darkenedPrimary = lerpColor(0.15, '#111111', primaryColor);
    const emptyReturn = { points3D:[] as [number,number,number][], labels:['x(t)','x(t-1)','x(t-2)'], c0:darkenedPrimary, c1:primaryColor, clouds:null as Cloud[]|null };

    if (filtered.length === 0 || filtered.every(s=>s.data.length===0)) return emptyReturn;

    if (filtered.length === 1) {
      // Single parameter: phase space reconstruction x(t), x(t-1), x(t-2)
      const vals = filtered[0].data.map(p=>p.value);
      const pts = vals.slice(2).map((v,i)=>[vals[i+2],vals[i+1],vals[i]] as [number,number,number]);
      return { points3D: pts, labels:['x(t)','x(t-1)','x(t-2)'], c0:darkenedPrimary, c1:primaryColor, clouds:null };
    }

    // 2+ parameters: each gets its own phase-space cloud normalized to [-1,1] independently.
    // Overlaying them shows how each parameter's dynamics cluster — correlated parameters
    // overlap, uncorrelated ones separate cleanly (Edge Impulse-style feature view).
    const paramClouds: Cloud[] = filtered
      .filter(s => s.data.length >= 3)
      .map(s => {
        const raw = s.data.map(p=>p.value);
        const mn = Math.min(...raw), mx = Math.max(...raw), r = mx-mn||1;
        const n = raw.map(v => 2*(v-mn)/r-1);
        const pts = n.slice(2).map((v,i)=>[n[i+2],n[i+1],n[i]] as [number,number,number]);
        return { name: s.name, color: s.color, pts };
      })
      .filter(c => c.pts.length > 0);

    return { points3D:[], labels:['x(t)','x(t-1)','x(t-2)'], c0:primaryColor, c1:primaryColor, clouds:paramClouds };
  }, [series, windowTs]);

  useEffect(() => {
    const canvas = cRef.current; if (!canvas) return;
    canvas.width = W; canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0,0,W,height);

    const isEmpty = clouds ? clouds.every(c=>c.pts.length===0) : points3D.length===0;
    if (isEmpty) {
      ctx.fillStyle='#6b6960'; ctx.font='11px JetBrains Mono, monospace';
      ctx.textAlign='center'; ctx.fillText('Select a device and ≥ 1 parameter', W/2, height/2);
      return;
    }

    const cx=W/2, cy=height/2, scale=Math.min(W,height)*0.38;
    const cosAz=Math.cos(az),sinAz=Math.sin(az),cosEl=Math.cos(el),sinEl=Math.sin(el);
    function proj([x,y,z]:[number,number,number]):{sx:number;sy:number;depth:number} {
      const x2=x*cosAz+z*sinAz, z2=-x*sinAz+z*cosAz;
      const y3=y*cosEl-z2*sinEl, z3=y*sinEl+z2*cosEl;
      return {sx:cx+x2*scale, sy:cy-y3*scale, depth:z3};
    }

    // Grid
    ctx.strokeStyle='rgba(100,100,90,0.12)'; ctx.lineWidth=0.5;
    for (let g=-1;g<=1;g+=0.5) {
      const a=proj([g,-1,0]),b=proj([g,1,0]); ctx.beginPath(); ctx.moveTo(a.sx,a.sy); ctx.lineTo(b.sx,b.sy); ctx.stroke();
      const c=proj([-1,g,0]),d2=proj([1,g,0]); ctx.beginPath(); ctx.moveTo(c.sx,c.sy); ctx.lineTo(d2.sx,d2.sy); ctx.stroke();
    }

    // Axes
    const axLen=0.95;
    const axes:[[number,number,number],[number,number,number],string][] = [
      [[axLen,0,0],[-axLen,0,0],labels[0]??'X'],
      [[0,axLen,0],[0,-axLen,0],labels[1]??'Y'],
      [[0,0,axLen],[0,0,-axLen],labels[2]??'Z'],
    ];
    ctx.lineWidth=1; ctx.setLineDash([4,4]);
    axes.forEach(([pos,,label],ai)=>{
      const p0=proj([0,0,0]),p1=proj(pos as [number,number,number]);
      ctx.strokeStyle=COLORS[ai]+'55';
      ctx.beginPath(); ctx.moveTo(p0.sx,p0.sy); ctx.lineTo(p1.sx,p1.sy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle=COLORS[ai]; ctx.font='bold 10px JetBrains Mono, monospace';
      ctx.textAlign='center'; ctx.fillText(label,p1.sx,p1.sy-6);
      ctx.setLineDash([4,4]);
    });
    ctx.setLineDash([]);

    if (clouds && clouds.length > 0) {
      // Multi-parameter: depth-sort across all clouds, draw each point in its parameter color
      const allPts = clouds.flatMap(cloud=>cloud.pts.map(pt=>({pt,color:cloud.color})));
      allPts.map(item=>({...item,p:proj(item.pt)})).sort((a,b)=>a.p.depth-b.p.depth)
        .forEach(({p,color})=>{
          const r=Math.max(1.5,3*(1-(p.depth+1)/3));
          ctx.beginPath(); ctx.arc(p.sx,p.sy,r,0,Math.PI*2);
          ctx.fillStyle=color+'aa'; ctx.fill();
        });
      // Per-parameter legend
      ctx.font='10px JetBrains Mono, monospace';
      clouds.forEach((cloud,i)=>{
        const ly=18+i*18;
        ctx.fillStyle=cloud.color+'dd'; ctx.beginPath(); ctx.arc(16,ly-4,5,0,Math.PI*2); ctx.fill();
        ctx.fillStyle=cloud.color; ctx.textAlign='left'; ctx.fillText(cloud.name,26,ly);
      });
      ctx.fillStyle='#6b6960'; ctx.font='9px JetBrains Mono, monospace'; ctx.textAlign='left';
      ctx.fillText(`${allPts.length} pts · overlapping = correlated · drag to rotate`, 12, height-10);
    } else {
      // Single parameter: time gradient in field color
      const coords=[0,1,2].map(d=>{const vs=points3D.map(p=>p[d]);const mn=Math.min(...vs),mx=Math.max(...vs),r=mx-mn||1;return{min:mn,range:r};});
      const norm=points3D.map(p=>[2*(p[0]-coords[0].min)/coords[0].range-1,2*(p[1]-coords[1].min)/coords[1].range-1,2*(p[2]-coords[2].min)/coords[2].range-1] as [number,number,number]);
      const indexed=norm.map((pt,i)=>({pt,i,proj:proj(pt)})).sort((a,b)=>a.proj.depth-b.proj.depth);
      const n=indexed.length;
      indexed.forEach(({proj:p},order)=>{
        const t=order/Math.max(1,n-1);
        const col=lerpColor(t,c0,c1);
        const r=Math.max(1.5,3.5*(1-(p.depth+1)/3));
        ctx.beginPath(); ctx.arc(p.sx,p.sy,r,0,Math.PI*2); ctx.fillStyle=col+'cc'; ctx.fill();
      });
      const grd=ctx.createLinearGradient(W-90,height-24,W-10,height-24);
      grd.addColorStop(0,c0); grd.addColorStop(1,c1);
      ctx.fillStyle=grd; ctx.fillRect(W-90,height-18,80,6);
      ctx.fillStyle='#6b6960'; ctx.font='9px JetBrains Mono, monospace';
      ctx.textAlign='left'; ctx.fillText('Earlier',W-90,height-22);
      ctx.textAlign='right'; ctx.fillText('Recent',W-6,height-22);
      ctx.fillStyle='#6b6960'; ctx.font='10px JetBrains Mono, monospace'; ctx.textAlign='left';
      ctx.fillText(`Phase space · ${n} pts · drag to rotate`,12,height-10);
    }
  }, [points3D, labels, az, el, W, height, c0, c1, clouds]);

  const onMD=(e:React.MouseEvent)=>setDragging({x:e.clientX,y:e.clientY,az,el});
  const onMM=(e:React.MouseEvent)=>{
    if(!dragging) return;
    setAz(dragging.az+(e.clientX-dragging.x)*0.008);
    setEl(Math.max(-1.4,Math.min(1.4,dragging.el-(e.clientY-dragging.y)*0.008)));
  };

  return (
    <div ref={wRef} style={{width:'100%'}}>
      <canvas ref={cRef} style={{display:'block',width:'100%',height,cursor:dragging?'grabbing':'grab'}}
        onMouseDown={onMD} onMouseMove={onMM} onMouseUp={()=>setDragging(null)} onMouseLeave={()=>setDragging(null)}/>
    </div>
  );
}

// ── Stats Row ────────────────────────────────────────────────────────────────

function StatsRow({ series, windowTs }: { series:Series[]; windowTs:[number,number]|null }) {
  if (!series.length) return null;
  return (
    <div style={{display:'flex',flexWrap:'wrap',gap:0,borderTop:'1px solid hsl(var(--border))'}}>
      {series.map(s=>{
        const pts = windowTs ? s.data.filter(p=>p.ts>=windowTs[0]&&p.ts<=windowTs[1]) : s.data;
        const st = computeStats(pts.map(p=>p.value));
        const fields:[string,number][] = [['Mean',st.mean],['RMS',st.rms],['Std',st.stdDev],['Min',st.min],['Max',st.max],['P-P',st.peakToPeak],['Crest',st.crestFactor]];
        return (
          <div key={s.fieldKey} style={{display:'flex',alignItems:'center',flexWrap:'wrap',padding:'8px 12px',borderRight:'1px solid hsl(var(--border))',gap:12}}>
            <div style={{fontFamily:'var(--font-mono)',fontSize:9,color:s.color,letterSpacing:'0.1em',textTransform:'uppercase',minWidth:60}}>{s.name}</div>
            {fields.map(([k,v])=>(
              <div key={k} style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:36}}>
                <div style={{fontSize:7.5,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))',letterSpacing:'0.08em',textTransform:'uppercase'}}>{k}</div>
                <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'hsl(var(--fg))',marginTop:1}}>{fmt4(v)}</div>
              </div>
            ))}
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:36}}>
              <div style={{fontSize:7.5,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))',letterSpacing:'0.08em',textTransform:'uppercase'}}>N</div>
              <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'hsl(var(--fg))',marginTop:1}}>{st.count}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function AnalyticsPage() {
  const [deviceId,    setDeviceId]    = useState('');
  const [selFields,   setSelFields]   = useState<string[]>([]);
  const [rangeMs,     setRangeMs]     = useState(RANGES[2].ms);
  const [windowTs,    setWindowTs]    = useState<[number,number]|null>(null);
  const [overlays,    setOverlays]    = useState<Overlay[]>([]);
  const [tab,         setTab]         = useState<Tab>('signal');
  const [opField,     setOpField]     = useState('');
  const [maW,         setMaW]         = useState(10);
  const [emaA,        setEmaA]        = useState(0.2);
  const [fType,       setFType]       = useState<'lowpass'|'highpass'|'bandpass'|'notch'>('lowpass');
  const [fCut,        setFCut]        = useState(0.001);
  const [fCenter,     setFCenter]     = useState(0.001);
  const [fBW,         setFBW]         = useState(1);
  const [fftField,    setFftField]    = useState('');
  const [showPipeline,setShowPipeline]= useState(true);
  const [splitView,   setSplitView]   = useState(false);
  const [focusMode,   setFocusMode]   = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // Focus mode: collapse the app sidebar for full-width analytics
  useEffect(() => {
    if (focusMode) useUIStore.getState().setSidebarCollapsed(true);
    return () => { useUIStore.getState().setSidebarCollapsed(false); };
  }, [focusMode]);

  // Devices
  const { data: devData } = useQuery({ queryKey:['devices-analytics'], queryFn:()=>devicesApi.list({limit:200}) });
  const devices = devData?.devices ?? [];

  // Device detail (schema)
  const { data: deviceData } = useQuery({ queryKey:['device-analytics-detail',deviceId], queryFn:()=>devicesApi.get(deviceId), enabled:!!deviceId });

  // Latest telemetry (for fields fallback)
  const { data: latestTelem } = useQuery({ queryKey:['analytics-latest',deviceId], queryFn:()=>telemetryApi.latest(deviceId), enabled:!!deviceId });

  const schemaFields: any[] = deviceData?.meta?.schema ?? [];

  // Merge schema + live telemetry fields
  const numericFields = useMemo(()=>{
    const fromSchema = schemaFields.filter((f:any)=>!f.type||f.type==='number'||f.type==='float'||f.type==='integer');
    if (fromSchema.length) return fromSchema;
    const liveFields = latestTelem?.fields ?? {};
    return Object.entries(liveFields)
      .filter(([,v])=>typeof v === 'number')
      .map(([k],i)=>({ key:k, label:k.replace(/_/g,' '), type:'number', chartColor:COLORS[i%COLORS.length] }));
  }, [schemaFields, latestTelem]);

  const { from, to } = useMemo(()=>rangeBounds(rangeMs), [rangeMs]);

  const fieldQueries = useQueries({
    queries: selFields.map(field => ({
      queryKey: ['analytics-series', deviceId, field, rangeMs],
      queryFn:  () => telemetryApi.series(deviceId, field, from, to, 2000),
      enabled:  !!deviceId && !!field,
      refetchInterval: 30_000,
    })),
  });

  // Build raw series
  const series: Series[] = useMemo(()=>selFields.map((k,i)=>{
    const meta = numericFields.find((f:any)=>f.key===k);
    const color = meta?.chartColor ?? COLORS[i%COLORS.length];
    const pts: Point[] = (fieldQueries[i]?.data?.data??[])
      .map((p:any)=>({ ts:new Date(p.ts).getTime(), value:p.value??0 }))
      .sort((a:Point,b:Point)=>a.ts-b.ts);
    return { name: meta?.label ?? k.replace(/_/g,' '), data:pts, color, fieldKey:k };
  }), [selFields, fieldQueries, numericFields]);

  const activeOp = opField || selFields[0] || '';
  const activeFft = fftField || selFields[0] || '';

  // Compute overlay series
  const overlaySeries: Series[] = useMemo(()=>overlays.map(ov=>{
    const base = series.find(s=>s.fieldKey===ov.fieldKey);
    if (!base) return null;
    const vals = base.data.map(p=>p.value);
    let proc: number[];
    switch (ov.type) {
      case 'moving_avg':    proc = movingAverage(vals,  ov.params.w??10); break;
      case 'exp_ma':        proc = exponentialMA(vals,  ov.params.a??0.2); break;
      case 'differentiate': proc = differentiate(vals); break;
      case 'integrate':     proc = integrate(vals); break;
      case 'lowpass':       proc = applyLowPass(vals,   ov.params.cut,  ov.params.sr); break;
      case 'highpass':      proc = applyHighPass(vals,  ov.params.cut,  ov.params.sr); break;
      case 'bandpass':      proc = applyBandPass(vals,  ov.params.cen,  ov.params.bw, ov.params.sr); break;
      case 'notch':         proc = applyNotch(vals,     ov.params.cen,  ov.params.bw, ov.params.sr); break;
      default: proc = vals;
    }
    return { name:ov.label, color:ov.color, fieldKey:ov.fieldKey, data:base.data.map((p,i)=>({ ts:p.ts, value:proc[i]??0 })) } satisfies Series;
  }).filter(Boolean) as Series[], [overlays, series]);

  const sr = useMemo(()=>{
    const base=series.find(s=>s.fieldKey===activeFft)??series[0];
    return base?.data.length?detectSampleRate(base.data.map(p=>p.ts)):1;
  },[series,activeFft]);

  const nyquist = sr / 2;

  const psdBins: FFTBin[] = useMemo(()=>{
    const base=series.find(s=>s.fieldKey===activeFft)??series[0];
    if (!base?.data.length) return [];
    const pts=(windowTs?base.data.filter(p=>p.ts>=windowTs[0]&&p.ts<=windowTs[1]):base.data);
    if (pts.length<8) return [];
    return computePSD(pts.map(p=>p.value), sr);
  },[series,activeFft,windowTs,sr]);

  const spectroVals = useMemo(()=>{
    const base=series.find(s=>s.fieldKey===activeFft)??series[0];
    if (!base?.data.length) return [];
    const pts=(windowTs?base.data.filter(p=>p.ts>=windowTs[0]&&p.ts<=windowTs[1]):base.data);
    return pts.map(p=>p.value);
  },[series,activeFft,windowTs]);

  // Auto-select first field
  useEffect(()=>{ if(numericFields.length&&selFields.length===0) setSelFields([numericFields[0].key]); },[numericFields.length,deviceId]);
  useEffect(()=>{ setSelFields([]); setWindowTs(null); setOverlays([]); },[deviceId]);
  useEffect(()=>{ setWindowTs(null); },[rangeMs]);

  const toggleField = (k:string) => setSelFields(prev=>prev.includes(k)?(prev.length>1?prev.filter(f=>f!==k):prev):[...prev,k]);

  const addOverlay = (type:OvType, label:string, params:Record<string,number>) => {
    setOverlays(prev=>[...prev,{id:`${Date.now()}`,type,label,fieldKey:activeOp,color:O_COLORS[prev.length%O_COLORS.length],params}]);
  };

  const applyFilter = ()=>{
    const base=series.find(s=>s.fieldKey===activeOp); if(!base?.data.length) return;
    const s2=detectSampleRate(base.data.map(p=>p.ts));
    if (fType==='lowpass')   addOverlay('lowpass',   `LP ${fmtFreq(fCut)}`,    {cut:fCut,sr:s2});
    else if (fType==='highpass')  addOverlay('highpass',  `HP ${fmtFreq(fCut)}`,    {cut:fCut,sr:s2});
    else if (fType==='bandpass')  addOverlay('bandpass',  `BP ${fmtFreq(fCenter)}`,  {cen:fCenter,bw:fBW,sr:s2});
    else                          addOverlay('notch',     `Notch ${fmtFreq(fCenter)}`,{cen:fCenter,bw:fBW,sr:s2});
  };

  const loading = fieldQueries.some(q=>q.isLoading);

  const inp: React.CSSProperties = {
    background:'hsl(var(--surface))', border:'1px solid hsl(var(--border))',
    color:'hsl(var(--fg))', fontFamily:'var(--font-mono)', fontSize:11,
    padding:'5px 8px', width:'100%',
  };
  const lbl: React.CSSProperties = {
    display:'block', fontSize:8.5, fontFamily:'var(--font-mono)',
    letterSpacing:'0.12em', textTransform:'uppercase', color:'hsl(var(--muted-fg))', marginBottom:3,
  };

  const TABS: {id:Tab;label:string;icon:React.ReactNode}[] = [
    {id:'signal',   label:'Signal',      icon:<Activity   size={12}/>},
    {id:'spectrum', label:'Spectrum',    icon:<Waves      size={12}/>},
    {id:'stats',    label:'Statistics',  icon:<BarChart2  size={12}/>},
    {id:'3d',       label:'3D Explorer', icon:<Box        size={12}/>},
  ];

  return (
    <div style={{padding:'28px 28px 64px',maxWidth:1440,margin:'0 auto'}}>

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
        <div>
          <div className="eyebrow" style={{marginBottom:6,fontSize:9.5}}>Signal Intelligence</div>
          <h1 style={{fontFamily:'var(--font-display)',fontSize:40,lineHeight:1,margin:0,letterSpacing:'-0.03em'}}>
            Analytics
          </h1>
        </div>
        <div style={{display:'flex',gap:8,marginTop:8}}>
          <button className="btn btn-sm btn-outline" onClick={()=>exportCSV(series,overlaySeries,windowTs)} style={{gap:5}}><Download size={12}/>CSV</button>
          <button className="btn btn-sm btn-outline" onClick={()=>{ const c=document.createElement('canvas');c.width=svgRef.current?.clientWidth??800;c.height=svgRef.current?.clientHeight??360;const s=new XMLSerializer();const blob=new Blob([s.serializeToString(svgRef.current!)],{type:'image/svg+xml'});const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'signal.svg'});a.click(); }} style={{gap:5}}><Download size={12}/>SVG</button>
          <button className="btn btn-sm btn-outline" onClick={()=>setFocusMode(v=>!v)} title={focusMode?'Exit focus mode':'Focus mode — hide sidebar'} style={{gap:5}}>
            {focusMode ? <Minimize2 size={12}/> : <Maximize2 size={12}/>}
            {focusMode ? 'Exit focus' : 'Focus'}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{display:'flex',gap:12,marginBottom:20,flexWrap:'wrap',alignItems:'flex-end',padding:'12px 16px',background:'hsl(var(--surface))',border:'1px solid hsl(var(--border))'}}>
        <div style={{minWidth:200}}>
          <label style={lbl}>Device</label>
          <div style={{position:'relative'}}>
            <select value={deviceId} onChange={e=>{setDeviceId(e.target.value);}}
              style={{...inp,paddingRight:26,appearance:'none',cursor:'pointer',minWidth:200}}>
              <option value="">— Select device —</option>
              {devices.map((d:any)=><option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
            <ChevronDown size={11} style={{position:'absolute',right:7,top:'50%',transform:'translateY(-50%)',pointerEvents:'none',color:'hsl(var(--muted-fg))'}}/>
          </div>
        </div>

        {deviceId && numericFields.length > 0 && (
          <div style={{flex:1}}>
            <label style={lbl}>Parameters <span style={{opacity:0.5}}>({selFields.length} selected)</span></label>
            <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
              {numericFields.map((f:any,i:number)=>{
                const color = f.chartColor??COLORS[i%COLORS.length];
                const active = selFields.includes(f.key);
                return (
                  <button key={f.key} onClick={()=>toggleField(f.key)} style={{
                    padding:'5px 11px',fontSize:11,fontFamily:'var(--font-mono)',
                    borderLeft:`3px solid ${active?color:'hsl(var(--border))'}`,
                    border:`1px solid ${active?color:'hsl(var(--border))'}`,
                    borderLeftWidth:3,
                    background: active?`${color}15`:'transparent',
                    color: active?color:'hsl(var(--muted-fg))',
                    cursor:'pointer',transition:'all 0.1s',
                  }}>
                    {f.label||f.key.replace(/_/g,' ')}
                    {f.unit&&<span style={{opacity:0.45,marginLeft:4,fontSize:9}}>{f.unit}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {deviceId && !numericFields.length && !loading && (
          <div style={{fontFamily:'var(--font-mono)',fontSize:11,color:'hsl(var(--muted-fg))'}}>
            No numeric fields found for this device
          </div>
        )}

        <div>
          <label style={lbl}>Range</label>
          <div className="seg">
            {RANGES.map(r=><button key={r.ms} className={rangeMs===r.ms?'on':''} onClick={()=>setRangeMs(r.ms)}>{r.label}</button>)}
          </div>
        </div>

        <div style={{display:'flex',alignItems:'flex-end',gap:8}}>
          {windowTs&&<button className="btn btn-sm" onClick={()=>setWindowTs(null)} style={{gap:5,color:'hsl(var(--primary))'}}><X size={11}/>Clear window</button>}
          {loading&&<RefreshCw size={13} style={{animation:'spin 1s linear infinite',color:'hsl(var(--muted-fg))',marginBottom:6}}/>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:0,marginBottom:0,borderBottom:'1px solid hsl(var(--border))'}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            display:'flex',alignItems:'center',gap:6,
            padding:'10px 18px',fontSize:11,fontFamily:'var(--font-mono)',
            background:'transparent',border:'none',
            borderBottom:`2px solid ${tab===t.id?'hsl(var(--primary))':'transparent'}`,
            color: tab===t.id?'hsl(var(--primary))':'hsl(var(--muted-fg))',
            cursor:'pointer',transition:'all 0.1s',letterSpacing:'0.06em',textTransform:'uppercase',
          }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── Signal Tab ── */}
      {tab==='signal'&&(
        <div style={{display:'grid',gridTemplateColumns:showPipeline?'1fr 320px':'1fr',gap:0,border:'1px solid hsl(var(--border))',borderTop:'none'}}>
          <div style={{minWidth:0}}>
            {series.length===0?(
              <div style={{height:360,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',color:'hsl(var(--muted-fg))'}}>
                <Activity size={36} strokeWidth={1} style={{opacity:0.2,marginBottom:14}}/>
                <div style={{fontFamily:'var(--font-mono)',fontSize:11}}>Select a device and parameters above</div>
                <div style={{fontFamily:'var(--font-mono)',fontSize:10,opacity:0.55,marginTop:5}}>Then drag on the chart to select an analysis window</div>
              </div>
            ):(
              <>
                <div style={{padding:'8px 14px 4px',borderBottom:'1px solid hsl(var(--border))',display:'flex',gap:14,flexWrap:'wrap',alignItems:'center'}}>
                  {[...series,...overlaySeries].map((s,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:5,fontSize:9.5,fontFamily:'var(--font-mono)',color:s.color}}>
                      <svg width={16} height={6}><line x1={0} y1={3} x2={16} y2={3} stroke={s.color} strokeWidth={i<series.length?2:1.5} strokeDasharray={i<series.length?undefined:'5 3'}/></svg>
                      {s.name}
                    </div>
                  ))}
                  <div style={{marginLeft:'auto',display:'flex',gap:10}}>
                    {overlaySeries.length>0&&<button onClick={()=>setSplitView(v=>!v)} style={{fontSize:9,fontFamily:'var(--font-mono)',background:'none',border:0,cursor:'pointer',color:splitView?'hsl(var(--primary))':'hsl(var(--muted-fg))',display:'flex',alignItems:'center',gap:4}}>
                      <svg width={10} height={10} viewBox="0 0 10 10"><rect x={0} y={0} width={10} height={4} rx={1} fill="currentColor" opacity={0.7}/><rect x={0} y={6} width={10} height={4} rx={1} fill="currentColor" opacity={0.4}/></svg>
                      {splitView?'Merged':'Split view'}
                    </button>}
                    <button onClick={()=>setShowPipeline(v=>!v)} style={{fontSize:9,fontFamily:'var(--font-mono)',background:'none',border:0,cursor:'pointer',color:'hsl(var(--muted-fg))',display:'flex',alignItems:'center',gap:4}}>
                      <Layers size={10}/>{showPipeline?'Hide':'Show'} pipeline
                    </button>
                  </div>
                </div>
                {splitView && overlaySeries.length > 0 ? (
                  <>
                    <div style={{borderBottom:'2px dashed hsl(var(--border))',position:'relative'}}>
                      <span style={{position:'absolute',top:6,left:14,fontSize:8,fontFamily:'var(--font-mono)',letterSpacing:'0.1em',textTransform:'uppercase',color:'hsl(var(--muted-fg))'}}>Original signal</span>
                      <SignalChart series={series} overlays={[]} windowTs={windowTs} onWindow={setWindowTs} height={200} svgRef={svgRef}/>
                    </div>
                    <div style={{position:'relative'}}>
                      <span style={{position:'absolute',top:6,left:14,fontSize:8,fontFamily:'var(--font-mono)',letterSpacing:'0.1em',textTransform:'uppercase',color:'hsl(var(--primary))',opacity:0.8}}>DSP output</span>
                      <SignalChart series={overlaySeries} overlays={[]} windowTs={windowTs} onWindow={()=>{}} height={200}/>
                    </div>
                  </>
                ) : (
                  <SignalChart series={series} overlays={overlaySeries} windowTs={windowTs} onWindow={setWindowTs} height={340} svgRef={svgRef}/>
                )}
                <StatsRow series={series} windowTs={windowTs}/>
              </>
            )}
          </div>

          {/* Pipeline panel */}
          {showPipeline&&(
            <div style={{borderLeft:'1px solid hsl(var(--border))',display:'flex',flexDirection:'column',maxHeight:600,overflowY:'auto'}}>
              <div style={{padding:'12px 14px',borderBottom:'1px solid hsl(var(--border))',fontSize:9,fontFamily:'var(--font-mono)',letterSpacing:'0.14em',textTransform:'uppercase',color:'hsl(var(--muted-fg))'}}>DSP Pipeline</div>

              {/* Pipeline visualization */}
              <div style={{padding:'10px 14px',display:'flex',flexDirection:'column',gap:4}}>
                <div style={{padding:'7px 10px',background:'hsl(var(--surface-raised))',fontSize:10,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))'}}>
                  <span style={{color:'hsl(var(--fg))'}}>INPUT</span> · {series.reduce((s,x)=>s+x.data.length,0)} pts · {selFields.length} field{selFields.length!==1?'s':''}
                </div>
                {overlays.length===0&&<div style={{textAlign:'center',fontSize:9,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))',padding:'4px 0',opacity:0.5}}>↓ no operations applied</div>}
                {overlays.map((ov,i)=>(
                  <div key={ov.id} style={{display:'flex',flexDirection:'column',gap:2}}>
                    <div style={{textAlign:'center',fontSize:9,color:'hsl(var(--muted-fg))',opacity:0.4}}>↓</div>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 10px',background:'hsl(var(--surface-raised))',borderLeft:`3px solid ${ov.color}`}}>
                      <div>
                        <div style={{fontSize:9.5,fontFamily:'var(--font-mono)',color:ov.color}}>{ov.label}</div>
                        <div style={{fontSize:8,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))',marginTop:1}}>{numericFields.find((f:any)=>f.key===ov.fieldKey)?.label ?? ov.fieldKey.replace(/_/g,' ')}</div>
                      </div>
                      <button onClick={()=>setOverlays(p=>p.filter(o=>o.id!==ov.id))} style={{background:'none',border:0,cursor:'pointer',color:'hsl(var(--muted-fg))',padding:0}}><X size={11}/></button>
                    </div>
                  </div>
                ))}
                {overlays.length>0&&<>
                  <div style={{textAlign:'center',fontSize:9,color:'hsl(var(--muted-fg))',opacity:0.4}}>↓</div>
                  <div style={{padding:'6px 10px',background:'hsl(var(--surface-raised))',fontSize:10,fontFamily:'var(--font-mono)',color:'hsl(var(--good))'}}>OUTPUT · shown on chart</div>
                </>}
              </div>

              <div style={{padding:'0 14px 14px',display:'flex',flexDirection:'column',gap:10,borderTop:'1px solid hsl(var(--border))',paddingTop:12}}>
                <div style={{fontSize:8.5,fontFamily:'var(--font-mono)',letterSpacing:'0.12em',textTransform:'uppercase',color:'hsl(var(--muted-fg))'}}>Add Operation</div>

                {selFields.length>1&&<div><label style={lbl}>Apply to</label>
                  <select value={activeOp} onChange={e=>setOpField(e.target.value)} style={inp}>
                    {selFields.map(k=>{const m=numericFields.find((f:any)=>f.key===k); return <option key={k} value={k}>{m?.label||k.replace(/_/g,' ')}</option>;})}
                  </select>
                </div>}

                <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:5,alignItems:'flex-end'}}>
                  <div><label style={lbl}>Moving Avg · window</label>
                    <input type="number" min={2} max={200} value={maW} onChange={e=>setMaW(+e.target.value)} style={inp}/>
                  </div>
                  <button className="btn btn-sm" onClick={()=>addOverlay('moving_avg',`MA(${maW})`,{w:maW})} disabled={!selFields.length}>+</button>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:5,alignItems:'flex-end'}}>
                  <div><label style={lbl}>Exp MA · α</label>
                    <input type="number" min={0.01} max={1} step={0.01} value={emaA} onChange={e=>setEmaA(+e.target.value)} style={inp}/>
                  </div>
                  <button className="btn btn-sm" onClick={()=>addOverlay('exp_ma',`EMA(${emaA})`,{a:emaA})} disabled={!selFields.length}>+</button>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5}}>
                  <button className="btn btn-sm btn-outline" onClick={()=>addOverlay('differentiate','d/dt',{})} disabled={!selFields.length}>d/dt</button>
                  <button className="btn btn-sm btn-outline" onClick={()=>addOverlay('integrate','∫dt',{})} disabled={!selFields.length}>∫ dt</button>
                </div>

                {/* Filters */}
                <div style={{borderTop:'1px solid hsl(var(--border))',paddingTop:10}}>
                  <div style={{fontSize:8.5,fontFamily:'var(--font-mono)',letterSpacing:'0.12em',textTransform:'uppercase',color:'hsl(var(--muted-fg))',marginBottom:8}}>Filter</div>
                  <div className="seg" style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',marginBottom:8}}>
                    {(['lowpass','highpass','bandpass','notch'] as const).map(t=>(
                      <button key={t} className={fType===t?'on':''} onClick={()=>setFType(t)} style={{fontSize:8.5}}>
                        {t==='lowpass'?'LP':t==='highpass'?'HP':t==='bandpass'?'BP':'Ntch'}
                      </button>
                    ))}
                  </div>
                  {(fType==='lowpass'||fType==='highpass')&&(
                    <div style={{marginBottom:6}}>
                      <label style={lbl}>{fType==='lowpass'?'LP':'HP'} cutoff · {fmtFreq(fCut)} · T={fmtPeriod(fCut)}</label>
                      <input type="number" min={0} max={nyquist*0.99} step={nyquist/200} value={fCut} onChange={e=>setFCut(+e.target.value)} style={inp}/>
                      <div style={{fontSize:8,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))',marginTop:3,opacity:0.6}}>Nyquist: {fmtFreq(nyquist)}</div>
                    </div>
                  )}
                  {(fType==='bandpass'||fType==='notch')&&(<>
                    <div style={{marginBottom:6}}><label style={lbl}>Center · {fmtFreq(fCenter)}</label>
                      <input type="number" min={0} max={nyquist*0.99} step={nyquist/200} value={fCenter} onChange={e=>setFCenter(+e.target.value)} style={inp}/>
                    </div>
                    <div style={{marginBottom:6}}><label style={lbl}>Bandwidth (octaves)</label>
                      <input type="number" min={0.1} max={4} step={0.1} value={fBW} onChange={e=>setFBW(+e.target.value)} style={inp}/>
                    </div>
                  </>)}
                  <button className="btn btn-sm btn-primary" style={{width:'100%'}} onClick={applyFilter} disabled={!selFields.length}>Apply Filter</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Spectrum Tab ── */}
      {tab==='spectrum'&&(
        <div style={{border:'1px solid hsl(var(--border))',borderTop:'none'}}>
          <div style={{padding:'10px 16px',borderBottom:'1px solid hsl(var(--border))',display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
            <span style={{fontSize:9.5,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))',letterSpacing:'0.1em',textTransform:'uppercase'}}>FFT · PSD (Hann) · sr={fmtFreq(sr)} · Nyq={fmtFreq(nyquist)}</span>
            {selFields.length>1&&(
              <select value={activeFft} onChange={e=>setFftField(e.target.value)} style={{...inp,width:150}}>
                {selFields.map(k=>{const m=numericFields.find((f:any)=>f.key===k); return <option key={k} value={k}>{m?.label||k.replace(/_/g,' ')}</option>;})}
              </select>
            )}
            {!windowTs&&<span style={{fontSize:9,fontFamily:'var(--font-mono)',color:'hsl(var(--primary))',opacity:0.7}}>Tip: select a window on the Signal tab for windowed FFT</span>}
          </div>
          <div style={{padding:'0 0 4px'}}>
            <div style={{padding:'8px 16px 0',fontSize:9,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))',textTransform:'uppercase',letterSpacing:'0.1em'}}>Power Spectral Density</div>
            <PSDChart bins={psdBins} sampleRateHz={sr} height={220} color={(series.find(s=>s.fieldKey===activeFft)??series[0])?.color}/>
          </div>
          <div style={{borderTop:'1px solid hsl(var(--border))',padding:'8px 16px 0'}}>
            <div style={{fontSize:9,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:4}}>Spectrogram (time × frequency)</div>
            <Spectrogram values={spectroVals} sampleRateHz={sr} height={200}/>
            <div style={{padding:'6px 0 8px',fontSize:8.5,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))'}}>Color: dark = low power · bright = high power</div>
          </div>
        </div>
      )}

      {/* ── Statistics Tab ── */}
      {tab==='stats'&&(
        <div style={{border:'1px solid hsl(var(--border))',borderTop:'none',padding:20}}>
          {series.length===0?(
            <div style={{padding:32,textAlign:'center',fontFamily:'var(--font-mono)',fontSize:11,color:'hsl(var(--muted-fg))'}}>Select a device and parameters to see statistics</div>
          ):(
            <div style={{display:'flex',flexDirection:'column',gap:24}}>
              <div>
                <div style={{fontSize:9,fontFamily:'var(--font-mono)',letterSpacing:'0.14em',textTransform:'uppercase',color:'hsl(var(--muted-fg))',marginBottom:12}}>Value Distribution</div>
                <HistogramGrid series={series}/>
              </div>
              <div>
                <div style={{fontSize:9,fontFamily:'var(--font-mono)',letterSpacing:'0.14em',textTransform:'uppercase',color:'hsl(var(--muted-fg))',marginBottom:12}}>Correlation Analysis</div>
                <CorrelationHeatmap series={series}/>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 3D Explorer Tab ── */}
      {tab==='3d'&&(
        <div style={{border:'1px solid hsl(var(--border))',borderTop:'none'}}>
          <div style={{padding:'10px 16px',borderBottom:'1px solid hsl(var(--border))'}}>
            <span style={{fontSize:9.5,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))',letterSpacing:'0.1em',textTransform:'uppercase'}}>
              {selFields.length>=2?`Phase space · ${selFields.length} parameters · overlapping clouds = correlated dynamics`:'Phase space reconstruction · x(t), x(t-1), x(t-2)'}
            </span>
          </div>
          <Scatter3D series={series} windowTs={windowTs} height={460}/>
          <div style={{padding:'8px 16px',fontSize:8.5,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))',borderTop:'1px solid hsl(var(--border))'}}>
            {selFields.length<2?'Add more parameters to see overlaid phase-space clouds · drag to rotate':'Each parameter gets its own colored cloud · overlapping regions = similar dynamics · drag to rotate'}
          </div>
        </div>
      )}
    </div>
  );
}
