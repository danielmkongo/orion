import React, {
  useState, useRef, useMemo, useEffect, useCallback, useId,
} from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import {
  Activity, X, Download, ChevronDown, Waves, RefreshCw,
  BarChart2, Box, Filter, Sigma, GitBranch, Maximize2, Minimize2,
} from 'lucide-react';
import { devicesApi } from '@/api/devices';
import { telemetryApi } from '@/api/telemetry';
import { useUIStore } from '@/store/ui.store';
import {
  computeStats, movingAverage, exponentialMA, differentiate, integrate,
  computePSD, applyLowPass, applyHighPass, applyBandPass, applyNotch,
  detectSampleRate, niceTicks, fmtFreq, fmtPeriod,
  computeHistogram, correlationMatrix, computeSpectrogram,
  type FFTBin,
} from '@/lib/dsp';

// ── Constants ────────────────────────────────────────────────────────────────

const COLORS  = ['#ff5b1f','#3b82f6','#22c55e','#a855f7','#f59e0b','#ec4899','#14b8a6','#f97316'];
const O_COLORS = ['#ffb38a','#93c5fd','#86efac','#d8b4fe','#fde68a','#fbcfe8','#99f6e4','#fdba74'];
const RANGES = [
  { label:'1H', ms:3_600_000 }, { label:'6H', ms:21_600_000 },
  { label:'24H', ms:86_400_000 }, { label:'7D', ms:604_800_000 }, { label:'30D', ms:2_592_000_000 },
];
const FEATURE_DEFS = [
  { key:'rms',   label:'RMS Energy',   abbr:'RMS'  },
  { key:'mean',  label:'Mean',         abbr:'μ'    },
  { key:'std',   label:'Std Dev',      abbr:'σ'    },
  { key:'pp',    label:'Peak-to-Peak', abbr:'P-P'  },
  { key:'crest', label:'Crest Factor', abbr:'CF'   },
  { key:'skew',  label:'Skewness',     abbr:'Skew' },
  { key:'kurt',  label:'Kurtosis',     abbr:'Kurt' },
  { key:'min',   label:'Minimum',      abbr:'Min'  },
  { key:'max',   label:'Maximum',      abbr:'Max'  },
];

type OvType = 'moving_avg'|'exp_ma'|'differentiate'|'integrate'|'lowpass'|'highpass'|'bandpass'|'notch';
interface Overlay { id:string; type:OvType; label:string; fieldKey:string; color:string; params:Record<string,number>; }
interface Point   { ts:number; value:number; }
interface Series  { name:string; data:Point[]; color:string; fieldKey:string; }
type FeatVec = Record<string,number>;
interface FeatureCloud { name:string; color:string; vecs:FeatVec[]; }

// ── Helpers ──────────────────────────────────────────────────────────────────

function rangeBounds(ms:number) {
  const now = Date.now();
  return { from: new Date(now-ms).toISOString(), to: new Date(now+86_400_000).toISOString() };
}
function fmtTs(ts:number, spanMs:number):string {
  const d = new Date(ts), tz='UTC';
  if (spanMs>7*864e5) return d.toLocaleDateString('en',{month:'short',day:'numeric',timeZone:tz});
  if (spanMs>864e5)   return d.toLocaleDateString('en',{month:'short',day:'numeric',timeZone:tz})+' '+d.toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:tz});
  if (spanMs>36e5)    return d.toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:tz});
  return d.toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:tz});
}
function fmt4(n:number):string {
  if (!isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a>=10000) return n.toFixed(0);
  if (a>=100)   return n.toFixed(1);
  if (a>=1)     return n.toFixed(2);
  return n.toFixed(4);
}
function lerpColor(t:number,c1:string,c2:string):string {
  const h=(s:string)=>[parseInt(s.slice(1,3),16),parseInt(s.slice(3,5),16),parseInt(s.slice(5,7),16)] as const;
  const [r1,g1,b1]=h(c1),[r2,g2,b2]=h(c2);
  return `rgb(${Math.round(r1+t*(r2-r1))},${Math.round(g1+t*(g2-g1))},${Math.round(b1+t*(b2-b1))})`;
}
const INFERNO=[[0,0,4],[40,11,84],[101,21,110],[159,42,99],[212,72,66],[245,125,21],[252,193,57],[253,231,37]] as const;
function infernoHex(t:number):string {
  const n=INFERNO.length-1,i=Math.min(n-1,Math.floor(t*n)),f=t*n-i;
  const [r1,g1,b1]=INFERNO[i],[r2,g2,b2]=INFERNO[i+1];
  return `rgb(${Math.round(r1+f*(r2-r1))},${Math.round(g1+f*(g2-g1))},${Math.round(b1+f*(b2-b1))})`;
}
function exportCSV(series:Series[],overlaySeries:Series[],windowTs:[number,number]|null) {
  const all=[...series,...overlaySeries];
  const tsSet=new Set<number>();
  all.forEach(s=>s.data.forEach(p=>{if(!windowTs||(p.ts>=windowTs[0]&&p.ts<=windowTs[1]))tsSet.add(p.ts);}));
  const sorted=[...tsSet].sort((a,b)=>a-b);
  const header=['timestamp',...all.map(s=>s.name)].join(',');
  const rows=sorted.map(ts=>[new Date(ts).toISOString(),...all.map(s=>{const p=s.data.find(x=>x.ts===ts);return p?fmt4(p.value):'';})].join(','));
  const blob=new Blob([header+'\n'+rows.join('\n')],{type:'text/csv'});
  const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'orion-analytics.csv'});
  a.click();URL.revokeObjectURL(a.href);
}
function extractWindowedFeatures(data:Point[],wSz:number):FeatVec[] {
  if (data.length<wSz) return [];
  const hop=Math.max(1,Math.floor(wSz/2));
  const out:FeatVec[]=[];
  for (let i=0;i+wSz<=data.length;i+=hop) {
    const vals=data.slice(i,i+wSz).map(p=>p.value);
    const s=computeStats(vals);
    const n=vals.length,mean=s.mean,std=s.stdDev||1;
    const skew=vals.reduce((a,v)=>a+((v-mean)/std)**3,0)/n;
    const kurt=vals.reduce((a,v)=>a+((v-mean)/std)**4,0)/n-3;
    out.push({rms:s.rms,mean:s.mean,std:s.stdDev,pp:s.peakToPeak,crest:s.crestFactor,skew,kurt,min:s.min,max:s.max});
  }
  return out;
}

// ── Signal Chart ─────────────────────────────────────────────────────────────

const SP={top:20,right:24,bottom:42,left:58};
function SignalChart({series,overlays:ovSeries,windowTs,onWindow,height=320,svgRef:extRef}:{
  series:Series[];overlays:Series[];windowTs:[number,number]|null;
  onWindow:(w:[number,number]|null)=>void;height?:number;svgRef?:React.RefObject<SVGSVGElement>;
}) {
  const uid=useId();
  const cRef=useRef<HTMLDivElement>(null);
  const iRef=useRef<SVGSVGElement>(null);
  const svgRef=extRef??iRef;
  const [W,setW]=useState(800);
  const [drag,setDrag]=useState<{type:'new'|'move'|'L'|'R';aTs:number;aW?:[number,number]}|null>(null);
  const [hx,setHx]=useState<number|null>(null);
  useEffect(()=>{if(!cRef.current)return;const ro=new ResizeObserver(([e])=>setW(Math.floor(e.contentRect.width)));ro.observe(cRef.current);return()=>ro.disconnect();},[]);
  const iW=W-SP.left-SP.right,iH=height-SP.top-SP.bottom;
  const all=useMemo(()=>[...series,...ovSeries].flatMap(s=>s.data),[series,ovSeries]);
  const {mnTs,mxTs,mnV,mxV}=useMemo(()=>{
    if(!all.length)return{mnTs:0,mxTs:1,mnV:0,mxV:1};
    const ts=all.map(p=>p.ts),vs=all.map(p=>p.value);
    return{mnTs:Math.min(...ts),mxTs:Math.max(...ts),mnV:Math.min(...vs),mxV:Math.max(...vs)};
  },[all]);
  const span=mxTs-mnTs||1,vRange=mxV-mnV||1,vPad=vRange*0.08;
  const yMn=mnV-vPad,yMx=mxV+vPad;
  const tsX=useCallback((ts:number)=>SP.left+(ts-mnTs)/span*iW,[mnTs,span,iW]);
  const vY=useCallback((v:number)=>SP.top+(1-(v-yMn)/(yMx-yMn))*iH,[yMn,yMx,iH]);
  const xTs=useCallback((x:number)=>mnTs+(x-SP.left)/iW*span,[mnTs,span,iW]);
  const clX=(x:number)=>Math.max(SP.left,Math.min(SP.left+iW,x));
  const clTs=(t:number)=>Math.max(mnTs,Math.min(mxTs,t));
  const pathD=(data:Point[])=>data.length<2?'':data.map((p,i)=>`${i?'L':'M'}${tsX(p.ts).toFixed(1)},${vY(p.value).toFixed(1)}`).join(' ');
  const yTicks=useMemo(()=>niceTicks(yMn,yMx,6),[yMn,yMx]);
  const xTicks=useMemo(()=>{const n=Math.max(3,Math.floor(iW/90));return Array.from({length:n+1},(_,i)=>mnTs+i*span/n);},[mnTs,span,iW]);
  const wx1=windowTs?Math.max(SP.left,tsX(windowTs[0])):null;
  const wx2=windowTs?Math.min(SP.left+iW,tsX(windowTs[1])):null;
  const HW=7;
  const getX=(e:React.MouseEvent)=>{const r=svgRef.current!.getBoundingClientRect();return clX(e.clientX-r.left);};
  const onMD=(e:React.MouseEvent<SVGSVGElement>)=>{
    if(e.button!==0)return;const x=getX(e),ts=xTs(x);
    if(windowTs&&wx1!==null&&wx2!==null){
      if(Math.abs(x-wx1)<=HW){setDrag({type:'L',aTs:ts,aW:windowTs});return;}
      if(Math.abs(x-wx2)<=HW){setDrag({type:'R',aTs:ts,aW:windowTs});return;}
      if(x>wx1&&x<wx2){setDrag({type:'move',aTs:ts,aW:windowTs});return;}
    }
    setDrag({type:'new',aTs:ts});onWindow([clTs(ts),clTs(ts)]);
  };
  const onMM=(e:React.MouseEvent<SVGSVGElement>)=>{
    const x=getX(e),ts=xTs(x);setHx(x);
    if(!drag)return;const d=ts-drag.aTs;
    if(drag.type==='new'){const a=drag.aTs,b=clTs(ts);onWindow([Math.min(a,b),Math.max(a,b)]);}
    else if(drag.type==='L'&&drag.aW)onWindow([clTs(drag.aW[0]+d),drag.aW[1]]);
    else if(drag.type==='R'&&drag.aW)onWindow([drag.aW[0],clTs(drag.aW[1]+d)]);
    else if(drag.type==='move'&&drag.aW){const sp2=drag.aW[1]-drag.aW[0],ns=clTs(drag.aW[0]+d);onWindow([ns,clTs(ns+sp2)]);}
  };
  const cursor=drag?(drag.type==='move'?'grabbing':'ew-resize'):(wx1!==null&&wx2!==null&&hx!==null&&(Math.abs(hx-wx1)<=HW||Math.abs(hx-wx2)<=HW))?'ew-resize':(wx1!==null&&wx2!==null&&hx!==null&&hx>wx1&&hx<wx2)?'grab':'crosshair';
  const clip=`${uid}-c`;
  return (
    <div ref={cRef} style={{width:'100%'}}>
      <svg ref={svgRef} width={W} height={height} style={{display:'block',cursor,userSelect:'none'}}
        onMouseDown={onMD} onMouseMove={onMM} onMouseUp={()=>setDrag(null)} onMouseLeave={()=>{setDrag(null);setHx(null);}}>
        <defs><clipPath id={clip}><rect x={SP.left} y={SP.top} width={iW} height={iH}/></clipPath></defs>
        {yTicks.map((v,i)=><line key={i} x1={SP.left} y1={vY(v)} x2={SP.left+iW} y2={vY(v)} stroke="hsl(var(--border))" strokeWidth={0.5}/>)}
        {xTicks.map((t,i)=><line key={i} x1={tsX(t)} y1={SP.top} x2={tsX(t)} y2={SP.top+iH} stroke="hsl(var(--border))" strokeWidth={0.5}/>)}
        {wx1!==null&&wx2!==null&&wx1<wx2&&<>
          <rect x={wx1} y={SP.top} width={Math.max(0,wx2-wx1)} height={iH} fill="hsl(var(--primary)/0.07)" clipPath={`url(#${clip})`}/>
          <line x1={wx1} y1={SP.top} x2={wx1} y2={SP.top+iH} stroke="hsl(var(--primary))" strokeWidth={1.5} strokeOpacity={0.7}/>
          <line x1={wx2} y1={SP.top} x2={wx2} y2={SP.top+iH} stroke="hsl(var(--primary))" strokeWidth={1.5} strokeOpacity={0.7}/>
          <rect x={wx1-HW/2} y={SP.top+iH/2-18} width={HW} height={36} rx={3} fill="hsl(var(--primary))" opacity={0.45}/>
          <rect x={wx2-HW/2} y={SP.top+iH/2-18} width={HW} height={36} rx={3} fill="hsl(var(--primary))" opacity={0.45}/>
          {wx2-wx1>50&&<text x={(wx1+wx2)/2} y={SP.top+14} textAnchor="middle" fontSize={8} fontFamily="var(--font-mono)" fill="hsl(var(--primary))" fillOpacity={0.8}>{((windowTs![1]-windowTs![0])/60000).toFixed(1)} min window</text>}
        </>}
        {series.map((s,i)=><path key={i} d={pathD(s.data)} fill="none" stroke={s.color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${clip})`}/>)}
        {ovSeries.map((s,i)=><path key={i} d={pathD(s.data)} fill="none" stroke={s.color} strokeWidth={1.75} strokeDasharray="6 3" strokeLinejoin="round" clipPath={`url(#${clip})`}/>)}
        {hx!==null&&<line x1={hx} y1={SP.top} x2={hx} y2={SP.top+iH} stroke="hsl(var(--fg))" strokeWidth={0.4} strokeOpacity={0.3} clipPath={`url(#${clip})`}/>}
        <line x1={SP.left} y1={SP.top} x2={SP.left} y2={SP.top+iH} stroke="hsl(var(--border))"/>
        {yTicks.map((v,i)=><text key={i} x={SP.left-7} y={vY(v)+3.5} textAnchor="end" fontSize={9} fontFamily="var(--font-mono)" fill="hsl(var(--muted-fg))">{fmt4(v)}</text>)}
        <line x1={SP.left} y1={SP.top+iH} x2={SP.left+iW} y2={SP.top+iH} stroke="hsl(var(--border))"/>
        {xTicks.map((t,i)=><text key={i} x={tsX(t)} y={SP.top+iH+14} textAnchor="middle" fontSize={9} fontFamily="var(--font-mono)" fill="hsl(var(--muted-fg))">{fmtTs(t,span)}</text>)}
        {windowTs&&wx1!==null&&wx2!==null&&wx2-wx1>80&&<>
          <text x={wx1+3} y={SP.top+iH-4} fontSize={7} fontFamily="var(--font-mono)" fill="hsl(var(--primary))" fillOpacity={0.7}>{fmtTs(windowTs[0],span)}</text>
          <text x={wx2-3} y={SP.top+iH-4} textAnchor="end" fontSize={7} fontFamily="var(--font-mono)" fill="hsl(var(--primary))" fillOpacity={0.7}>{fmtTs(windowTs[1],span)}</text>
        </>}
      </svg>
    </div>
  );
}

// ── PSD Chart ────────────────────────────────────────────────────────────────

function PSDChart({bins,sampleRateHz,height=220,color='#ff5b1f'}:{bins:FFTBin[];sampleRateHz:number;height?:number;color?:string}) {
  const uid=useId();
  const cRef=useRef<HTMLDivElement>(null);
  const [W,setW]=useState(800);
  const [hi,setHi]=useState<number|null>(null);
  useEffect(()=>{if(!cRef.current)return;const ro=new ResizeObserver(([e])=>setW(Math.floor(e.contentRect.width)));ro.observe(cRef.current);return()=>ro.disconnect();},[]);
  if(!bins.length)return <div style={{height,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--font-mono)',fontSize:11,color:'hsl(var(--muted-fg))'}}>Select a window on the signal to compute spectrum</div>;
  const P={top:16,right:24,bottom:36,left:52},iW=W-P.left-P.right,iH=height-P.top-P.bottom;
  const freqs=bins.map(b=>b.freq);
  const mnF=Math.min(...freqs),mxF=Math.max(...freqs),mnP=Math.max(-60,Math.min(...bins.map(b=>b.powerDb))),mxP=0;
  const fX=(f:number)=>P.left+(f-mnF)/(mxF-mnF||1)*iW;
  const pY=(p:number)=>P.top+(1-(p-mnP)/(mxP-mnP))*iH;
  const bW=Math.max(1,iW/bins.length-0.5);
  const peak=bins.reduce((a,b)=>b.powerDb>a.powerDb?b:a,bins[0]);
  const yT=niceTicks(mnP,mxP,5),xT=niceTicks(mnF,mxF,5);
  const clip=`${uid}-pc`;
  return (
    <div ref={cRef} style={{width:'100%'}}>
      <svg width={W} height={height} style={{display:'block'}}
        onMouseMove={e=>{const r=e.currentTarget.getBoundingClientRect();const x=e.clientX-r.left;const idx=Math.round((x-P.left)/iW*(bins.length-1));setHi(idx>=0&&idx<bins.length?idx:null);}}
        onMouseLeave={()=>setHi(null)}>
        <defs>
          <clipPath id={clip}><rect x={P.left} y={P.top} width={iW} height={iH}/></clipPath>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.9}/><stop offset="100%" stopColor={color} stopOpacity={0.1}/>
          </linearGradient>
        </defs>
        {yT.map((v,i)=><line key={i} x1={P.left} y1={pY(v)} x2={P.left+iW} y2={pY(v)} stroke="hsl(var(--border))" strokeWidth={0.5}/>)}
        {bins.map((b,i)=>{const x=fX(b.freq),y=pY(b.powerDb),bh=Math.max(0,iH-(y-P.top));return <rect key={i} x={x} y={y} width={bW} height={bh} fill={i===hi?color:`url(#${uid}-bg)`} clipPath={`url(#${clip})`}/>;  })}
        {peak&&<><line x1={fX(peak.freq)} y1={P.top} x2={fX(peak.freq)} y2={pY(peak.powerDb)} stroke={color} strokeWidth={1} strokeDasharray="3 4" strokeOpacity={0.5}/><text x={fX(peak.freq)+4} y={P.top+13} fontSize={8} fontFamily="var(--font-mono)" fill={color} fillOpacity={0.85}>{fmtFreq(peak.freq)} · T={fmtPeriod(peak.freq)}</text></>}
        {hi!==null&&bins[hi]&&(()=>{const b=bins[hi],x=fX(b.freq),tx=x>W-140?x-128:x+8;return <g><rect x={tx} y={P.top+4} width={124} height={38} rx={3} fill="hsl(var(--surface))" stroke="hsl(var(--border))"/><text x={tx+7} y={P.top+18} fontSize={9} fontFamily="var(--font-mono)" fill="hsl(var(--fg))">{fmtFreq(b.freq)}</text><text x={tx+7} y={P.top+32} fontSize={9} fontFamily="var(--font-mono)" fill="hsl(var(--muted-fg))">{b.powerDb.toFixed(1)} dB · T={fmtPeriod(b.freq)}</text></g>;})()}
        <line x1={P.left} y1={P.top} x2={P.left} y2={P.top+iH} stroke="hsl(var(--border))"/>
        {yT.map((v,i)=><text key={i} x={P.left-5} y={pY(v)+3.5} textAnchor="end" fontSize={9} fontFamily="var(--font-mono)" fill="hsl(var(--muted-fg))">{v.toFixed(0)}dB</text>)}
        <line x1={P.left} y1={P.top+iH} x2={P.left+iW} y2={P.top+iH} stroke="hsl(var(--border))"/>
        {xT.map((f,i)=><text key={i} x={fX(f)} y={P.top+iH+14} textAnchor="middle" fontSize={8} fontFamily="var(--font-mono)" fill="hsl(var(--muted-fg))">{fmtFreq(f)}</text>)}
      </svg>
    </div>
  );
}

// ── Spectrogram ───────────────────────────────────────────────────────────────

function Spectrogram({values,sampleRateHz,height=200}:{values:number[];sampleRateHz:number;height?:number}) {
  const cRef=useRef<HTMLCanvasElement>(null);
  const wRef=useRef<HTMLDivElement>(null);
  const [W,setW]=useState(600);
  useEffect(()=>{if(!wRef.current)return;const ro=new ResizeObserver(([e])=>setW(Math.floor(e.contentRect.width)));ro.observe(wRef.current);return()=>ro.disconnect();},[]);
  const{times,freqs,powerDb}=useMemo(()=>computeSpectrogram(values,sampleRateHz),[values,sampleRateHz]);
  useEffect(()=>{
    const canvas=cRef.current;if(!canvas||!times.length||!freqs.length)return;
    canvas.width=W;canvas.height=height;
    const ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,W,height);
    const PL=52,PB=28,iW=W-PL-8,iH=height-PB-4,nT=times.length,nF=freqs.length;
    const cW=Math.max(1,Math.ceil(iW/nT)),cH=Math.max(1,Math.ceil(iH/nF));
    for(let ti=0;ti<nT;ti++)for(let fi=0;fi<nF;fi++){const db=powerDb[ti]?.[fi]??-120;const t=Math.max(0,Math.min(1,(db+60)/60));ctx.fillStyle=infernoHex(t);ctx.fillRect(PL+Math.floor(ti*iW/nT),4+Math.floor((nF-1-fi)*iH/nF),cW+1,cH+1);}
    ctx.strokeStyle='hsl(50,4%,18%)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(PL,4);ctx.lineTo(PL,4+iH);ctx.lineTo(PL+iW,4+iH);ctx.stroke();
    ctx.fillStyle='#6b6960';ctx.font='9px JetBrains Mono, monospace';ctx.textAlign='right';
    [0,0.25,0.5,0.75,1].forEach(t=>{const f=freqs[Math.round(t*(nF-1))]??0;ctx.fillText(fmtFreq(f),PL-4,4+(1-t)*iH+3);});
    ctx.textAlign='center';
    [0,0.25,0.5,0.75,1].forEach(t=>{const ti2=Math.round(t*(nT-1));ctx.fillText(`${(times[ti2]??0).toFixed(0)}s`,PL+t*iW,4+iH+14);});
    ctx.textAlign='left';ctx.fillStyle='#9a968c';ctx.fillText('-60 dB',PL,4+iH+24);ctx.textAlign='right';ctx.fillText('0 dB',PL+iW,4+iH+24);
  },[times,freqs,powerDb,W,height]);
  if(!times.length)return <div style={{height,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--font-mono)',fontSize:11,color:'hsl(var(--muted-fg))'}}>Not enough data for spectrogram (need ≥ 32 points)</div>;
  return <div ref={wRef} style={{width:'100%'}}><canvas ref={cRef} style={{display:'block',width:'100%',height}}/></div>;
}

// ── Histogram Grid ────────────────────────────────────────────────────────────

function HistogramGrid({series}:{series:Series[]}) {
  if(!series.length)return <div style={{padding:32,textAlign:'center',color:'hsl(var(--muted-fg))',fontFamily:'var(--font-mono)',fontSize:11}}>No data</div>;
  return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:16,padding:20}}>
      {series.map((s,si)=>{
        const vals=s.data.map(p=>p.value);
        const bins=computeHistogram(vals,24);
        const maxF=Math.max(...bins.map(b=>b.freq),0.001);
        const W=280,H=140,PL=44,PB=24,PT=8,PR=8,iW=W-PL-PR,iH=H-PB-PT,bW=iW/bins.length;
        return (
          <div key={si} style={{border:'1px solid hsl(var(--border))',padding:'12px 12px 8px',background:'hsl(var(--surface))'}}>
            <div style={{fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'0.1em',textTransform:'uppercase',color:s.color,marginBottom:8}}>{s.name}</div>
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:'block'}}>
              {[0,0.25,0.5,0.75,1].map((t,i)=><line key={i} x1={PL} y1={PT+iH*(1-t)} x2={PL+iW} y2={PT+iH*(1-t)} stroke="hsl(var(--border))" strokeWidth={0.5}/>)}
              {bins.map((b,i)=>{const bH=Math.max(1,(b.freq/maxF)*iH);return <rect key={i} x={PL+i*bW+0.5} y={PT+iH-bH} width={Math.max(1,bW-1)} height={bH} fill={s.color} fillOpacity={0.75}/>;  })}
              <line x1={PL} y1={PT} x2={PL} y2={PT+iH} stroke="hsl(var(--border))"/>
              <line x1={PL} y1={PT+iH} x2={PL+iW} y2={PT+iH} stroke="hsl(var(--border))"/>
              {[0,0.5,1].map((t,i)=>{const v=bins[Math.round(t*(bins.length-1))]?.bin??0;return <text key={i} x={PL+t*iW} y={PT+iH+14} textAnchor="middle" fontSize={8} fontFamily="var(--font-mono)" fill="hsl(var(--muted-fg))">{fmt4(v)}</text>;})}
              {[0,0.5,1].map((t,i)=>{const f=t*maxF;return <text key={i} x={PL-4} y={PT+iH*(1-t)+3.5} textAnchor="end" fontSize={8} fontFamily="var(--font-mono)" fill="hsl(var(--muted-fg))">{(f*100).toFixed(0)}%</text>;})}
              {vals.length>4&&(()=>{
                const m=vals.reduce((s,v)=>s+v,0)/vals.length,sd=Math.sqrt(vals.reduce((s,v)=>s+(v-m)**2,0)/vals.length)||1;
                const mn=Math.min(...vals),mx=Math.max(...vals),range=mx-mn||1;
                const pts=Array.from({length:60},(_,i)=>{const x=mn+i*range/59;const y=Math.exp(-0.5*((x-m)/sd)**2)/(sd*Math.sqrt(2*Math.PI));return `${PL+(x-mn)/range*iW},${PT+iH-(y*(range/bins.length)/maxF)*iH}`;});
                return <polyline points={pts.join(' ')} fill="none" stroke="hsl(var(--fg))" strokeWidth={1} strokeOpacity={0.25} strokeDasharray="3 2"/>;
              })()}
            </svg>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:4,marginTop:4,fontSize:9,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))'}}>
              {(()=>{const st=computeStats(vals);return[['μ',st.mean],['σ',st.stdDev],['RMS',st.rms],['P-P',st.peakToPeak]].map(([k,v])=><div key={String(k)}><span style={{opacity:0.6}}>{k} </span><span style={{color:'hsl(var(--fg))'}}>{fmt4(Number(v))}</span></div>);})()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Correlation Heatmap ───────────────────────────────────────────────────────

function CorrelationHeatmap({series}:{series:Series[]}) {
  if(series.length<2)return <div style={{padding:24,textAlign:'center',fontFamily:'var(--font-mono)',fontSize:11,color:'hsl(var(--muted-fg))'}}>Select ≥ 2 parameters to see correlations</div>;
  const m=series.length,vals=series.map(s=>s.data.map(p=>p.value)),corr=correlationMatrix(vals);
  const N=56,pad={t:8,l:80,b:48,r:8},W=pad.l+m*N+pad.r,H=pad.t+m*N+pad.b;
  const corrColor=(r:number):string=>r>=0?`hsl(16,${Math.round(r*100)}%,${Math.round(60-r*25)}%)`:`hsl(224,${Math.round(-r*100)}%,${Math.round(60+r*25)}%)`;
  return (
    <div style={{padding:'0 20px 20px',display:'flex',gap:40,flexWrap:'wrap',alignItems:'flex-start'}}>
      <div style={{border:'1px solid hsl(var(--border))',padding:'12px 16px',background:'hsl(var(--surface))'}}>
        <div style={{fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'0.12em',textTransform:'uppercase',color:'hsl(var(--muted-fg))',marginBottom:10}}>Pearson Correlation Matrix</div>
        <svg width={W} height={H} style={{display:'block',overflow:'visible'}}>
          {series.map((s,i)=><React.Fragment key={i}>
            <text x={pad.l-6} y={pad.t+i*N+N/2+3.5} textAnchor="end" fontSize={10} fontFamily="var(--font-mono)" fill={s.color}>{s.name.substring(0,12)}</text>
            <text x={pad.l+i*N+N/2} y={pad.t+m*N+14} textAnchor="middle" fontSize={10} fontFamily="var(--font-mono)" fill={s.color}>{s.name.substring(0,8)}</text>
          </React.Fragment>)}
          {Array.from({length:m},(_,i)=>Array.from({length:m},(_,j)=>{const r=corr[i][j];return(
            <g key={`${i}-${j}`}>
              <rect x={pad.l+j*N} y={pad.t+i*N} width={N} height={N} fill={corrColor(r)} rx={2}/>
              <text x={pad.l+j*N+N/2} y={pad.t+i*N+N/2+3.5} textAnchor="middle" fontSize={Math.min(11,N*0.35)} fontFamily="var(--font-mono)" fill="hsl(var(--fg))" fillOpacity={0.9} fontWeight={i===j?600:400}>{r.toFixed(2)}</text>
            </g>
          );})).flat()}
          <text x={pad.l} y={H-4} fontSize={8} fontFamily="var(--font-mono)" fill="hsl(var(--muted-fg))">■ orange = positive · ■ blue = negative</text>
        </svg>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:8,paddingTop:32}}>
        {series.map((s,i)=>{
          const vals2=s.data.map(p=>p.value),st=computeStats(vals2),n=vals2.length,mean=st.mean,std=st.stdDev||1;
          const skew=vals2.reduce((a,v)=>a+((v-mean)/std)**3,0)/n;
          const kurt=vals2.reduce((a,v)=>a+((v-mean)/std)**4,0)/n-3;
          return <div key={i} style={{fontSize:10,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))'}}>
            <span style={{color:s.color,fontWeight:600}}>{s.name}</span> · Skew <span style={{color:'hsl(var(--fg))'}}>{skew.toFixed(2)}</span> · Kurt <span style={{color:'hsl(var(--fg))'}}>{kurt.toFixed(2)}</span>
          </div>;
        })}
      </div>
    </div>
  );
}

// ── Feature Scatter 3D ────────────────────────────────────────────────────────

function FeatureScatter3D({clouds,axisX,axisY,axisZ,height=440}:{clouds:FeatureCloud[];axisX:string;axisY:string;axisZ:string;height?:number}) {
  const wRef=useRef<HTMLDivElement>(null);
  const cRef=useRef<HTMLCanvasElement>(null);
  const [W,setW]=useState(700);
  const [az,setAz]=useState(0.6);
  const [el,setEl]=useState(0.45);
  const [dragging,setDragging]=useState<{x:number;y:number;az:number;el:number}|null>(null);
  useEffect(()=>{if(!wRef.current)return;const ro=new ResizeObserver(([e])=>setW(Math.floor(e.contentRect.width)));ro.observe(wRef.current);return()=>ro.disconnect();},[]);

  useEffect(()=>{
    const canvas=cRef.current;if(!canvas)return;
    canvas.width=W;canvas.height=height;
    const ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,W,height);
    const hasClouds=clouds.some(c=>c.vecs.length>0);
    if(!hasClouds){
      ctx.fillStyle='#6b6960';ctx.font='11px JetBrains Mono, monospace';ctx.textAlign='center';
      ctx.fillText('Select parameters to explore feature space',W/2,height/2-10);
      ctx.fillStyle='#4a4844';ctx.font='9px JetBrains Mono, monospace';
      ctx.fillText('Each point = one time window · each cloud = one parameter',W/2,height/2+10);
      return;
    }
    const cx=W/2,cy=height/2,scale=Math.min(W,height)*0.37;
    const cosAz=Math.cos(az),sinAz=Math.sin(az),cosEl=Math.cos(el),sinEl=Math.sin(el);
    function proj([x,y,z]:[number,number,number]):{sx:number;sy:number;depth:number}{
      const x2=x*cosAz+z*sinAz,z2=-x*sinAz+z*cosAz;
      const y3=y*cosEl-z2*sinEl,z3=y*sinEl+z2*cosEl;
      return{sx:cx+x2*scale,sy:cy-y3*scale,depth:z3};
    }
    // Gather all values to normalise across all clouds
    const allX=clouds.flatMap(c=>c.vecs.map(v=>v[axisX]??0));
    const allY=clouds.flatMap(c=>c.vecs.map(v=>v[axisY]??0));
    const allZ=clouds.flatMap(c=>c.vecs.map(v=>v[axisZ]??0));
    const norm1d=(vals:number[])=>{const mn=Math.min(...vals),mx=Math.max(...vals),r=mx-mn||1;return(v:number)=>2*(v-mn)/r-1;};
    const nX=norm1d(allX),nY=norm1d(allY),nZ=norm1d(allZ);

    // Grid
    ctx.strokeStyle='rgba(100,100,90,0.1)';ctx.lineWidth=0.5;
    for(let g=-1;g<=1;g+=0.5){
      const a=proj([g,-1,0]),b=proj([g,1,0]);ctx.beginPath();ctx.moveTo(a.sx,a.sy);ctx.lineTo(b.sx,b.sy);ctx.stroke();
      const c=proj([-1,g,0]),d=proj([1,g,0]);ctx.beginPath();ctx.moveTo(c.sx,c.sy);ctx.lineTo(d.sx,d.sy);ctx.stroke();
    }
    // Axes
    const axLen=0.95;
    const xDef=FEATURE_DEFS.find(f=>f.key===axisX),yDef=FEATURE_DEFS.find(f=>f.key===axisY),zDef=FEATURE_DEFS.find(f=>f.key===axisZ);
    const axDefs:[[number,number,number],string][]=[[[axLen,0,0],xDef?.abbr??axisX],[[0,axLen,0],yDef?.abbr??axisY],[[0,0,axLen],zDef?.abbr??axisZ]];
    ctx.lineWidth=1;ctx.setLineDash([4,4]);
    axDefs.forEach(([pos,label],ai)=>{
      const p0=proj([0,0,0]),p1=proj(pos);
      ctx.strokeStyle=COLORS[ai]+'66';ctx.beginPath();ctx.moveTo(p0.sx,p0.sy);ctx.lineTo(p1.sx,p1.sy);ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle=COLORS[ai];ctx.font='bold 10px JetBrains Mono, monospace';ctx.textAlign='center';ctx.fillText(label,p1.sx,p1.sy-6);
      ctx.setLineDash([4,4]);
    });
    ctx.setLineDash([]);
    // All points depth-sorted
    const allPts=clouds.flatMap(cloud=>cloud.vecs.map(vec=>({pt:[nX(vec[axisX]??0),nY(vec[axisY]??0),nZ(vec[axisZ]??0)] as [number,number,number],color:cloud.color})));
    const sorted=allPts.map(item=>({...item,p:proj(item.pt)})).sort((a,b)=>a.p.depth-b.p.depth);
    sorted.forEach(({p,color})=>{
      const r=Math.max(2,4*(1-(p.depth+1)/3));
      ctx.beginPath();ctx.arc(p.sx,p.sy,r,0,Math.PI*2);ctx.fillStyle=color+'bb';ctx.fill();
    });
    // Legend
    ctx.font='10px JetBrains Mono, monospace';
    clouds.filter(c=>c.vecs.length>0).forEach((cloud,i)=>{
      const ly=22+i*20;
      ctx.fillStyle=cloud.color+'cc';ctx.beginPath();ctx.arc(16,ly-4,5,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=cloud.color;ctx.textAlign='left';ctx.fillText(`${cloud.name} (${cloud.vecs.length})`,26,ly);
    });
    // Info
    ctx.fillStyle='#4a4844';ctx.font='9px JetBrains Mono, monospace';ctx.textAlign='left';
    ctx.fillText('drag to rotate · each point = one time window',12,height-10);
    // Axis labels on bottom
    ctx.fillStyle='#6b6960';ctx.textAlign='left';
    ctx.fillText(`X: ${xDef?.label??axisX}  Y: ${yDef?.label??axisY}  Z: ${zDef?.label??axisZ}`,cx-120,height-10);
  },[clouds,axisX,axisY,axisZ,az,el,W,height]);

  return (
    <div ref={wRef} style={{width:'100%'}}>
      <canvas ref={cRef} style={{display:'block',width:'100%',height,cursor:dragging?'grabbing':'grab'}}
        onMouseDown={e=>setDragging({x:e.clientX,y:e.clientY,az,el})}
        onMouseMove={e=>{if(!dragging)return;const dx=e.clientX-dragging.x,dy=e.clientY-dragging.y;setAz(dragging.az+dx*0.008);setEl(Math.max(-1.4,Math.min(1.4,dragging.el-dy*0.008)));}}
        onMouseUp={()=>setDragging(null)} onMouseLeave={()=>setDragging(null)}/>
    </div>
  );
}

// ── Stats Strip ───────────────────────────────────────────────────────────────

function StatsStrip({series,windowTs}:{series:Series[];windowTs:[number,number]|null}) {
  if(!series.length)return null;
  return (
    <div style={{display:'flex',flexWrap:'wrap',borderTop:'1px solid hsl(var(--border))'}}>
      {series.map(s=>{
        const pts=windowTs?s.data.filter(p=>p.ts>=windowTs[0]&&p.ts<=windowTs[1]):s.data;
        const st=computeStats(pts.map(p=>p.value));
        const fields:[string,number][]=[['Mean',st.mean],['RMS',st.rms],['σ',st.stdDev],['Min',st.min],['Max',st.max],['P-P',st.peakToPeak],['Crest',st.crestFactor]];
        return (
          <div key={s.fieldKey} style={{display:'flex',alignItems:'center',flexWrap:'wrap',padding:'10px 14px',borderRight:'1px solid hsl(var(--border))',gap:14}}>
            <div style={{display:'flex',alignItems:'center',gap:6,minWidth:80}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:s.color,flexShrink:0}}/>
              <div style={{fontFamily:'var(--font-mono)',fontSize:9,color:s.color,letterSpacing:'0.1em',textTransform:'uppercase'}}>{s.name}</div>
            </div>
            {fields.map(([k,v])=>(
              <div key={k} style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:38}}>
                <div style={{fontSize:7.5,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))',letterSpacing:'0.08em',textTransform:'uppercase'}}>{k}</div>
                <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'hsl(var(--fg))',marginTop:1}}>{fmt4(v)}</div>
              </div>
            ))}
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:32}}>
              <div style={{fontSize:7.5,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))',letterSpacing:'0.08em',textTransform:'uppercase'}}>N</div>
              <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'hsl(var(--fg))',marginTop:1}}>{st.count}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Analysis Card ─────────────────────────────────────────────────────────────

function AnalysisCard({id,icon,title,badge,description,open,onToggle,children}:{
  id:string;icon:React.ReactNode;title:string;badge?:string;description:string;
  open:boolean;onToggle:()=>void;children:React.ReactNode;
}) {
  return (
    <div style={{border:'1px solid hsl(var(--border))',marginBottom:12,background:'hsl(var(--surface))'}}>
      <button onClick={onToggle} style={{width:'100%',display:'flex',alignItems:'center',gap:12,padding:'14px 20px',background:'none',border:'none',cursor:'pointer',textAlign:'left',borderBottom:open?'1px solid hsl(var(--border))':'none'}}>
        <span style={{color:'hsl(var(--primary))',display:'flex',flexShrink:0}}>{icon}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:2}}>
            <span style={{fontSize:13,fontWeight:600,color:'hsl(var(--fg))'}}>{title}</span>
            {badge&&<span style={{fontSize:8,fontFamily:'var(--font-mono)',padding:'2px 7px',background:'hsl(var(--primary)/0.1)',color:'hsl(var(--primary))',letterSpacing:'0.1em',textTransform:'uppercase',flexShrink:0}}>{badge}</span>}
          </div>
          <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))'}}>  {description}</div>
        </div>
        <ChevronDown size={14} style={{color:'hsl(var(--muted-fg))',transform:open?'rotate(180deg)':'none',transition:'transform 0.2s',flexShrink:0}}/>
      </button>
      {open&&<div>{children}</div>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function AnalyticsPage() {
  // Selection
  const [deviceId,    setDeviceId]    = useState('');
  const [selFields,   setSelFields]   = useState<string[]>([]);
  const [rangeMs,     setRangeMs]     = useState(RANGES[2].ms);
  const [windowTs,    setWindowTs]    = useState<[number,number]|null>(null);

  // Open modules
  const [openModules, setOpenModules] = useState<Set<string>>(()=>new Set(['stats']));
  const toggleModule = (id:string) => setOpenModules(prev=>{const s=new Set(prev);s.has(id)?s.delete(id):s.add(id);return s;});

  // DSP pipeline
  const [overlays,    setOverlays]    = useState<Overlay[]>([]);
  const [opField,     setOpField]     = useState('');
  const [maW,         setMaW]         = useState(10);
  const [emaA,        setEmaA]        = useState(0.2);
  const [fType,       setFType]       = useState<'lowpass'|'highpass'|'bandpass'|'notch'>('lowpass');
  const [fCut,        setFCut]        = useState(0.001);
  const [fCenter,     setFCenter]     = useState(0.001);
  const [fBW,         setFBW]         = useState(1);

  // Spectrum
  const [fftField,    setFftField]    = useState('');

  // Feature 3D
  const [fxX,         setFxX]         = useState('rms');
  const [fxY,         setFxY]         = useState('std');
  const [fxZ,         setFxZ]         = useState('mean');
  const [winSz,       setWinSz]       = useState(20);

  // Focus mode
  const [focusMode,   setFocusMode]   = useState(false);
  const prevSidebarRef = useRef(false);
  const toggleFocus = () => {
    if (!focusMode) {
      prevSidebarRef.current = useUIStore.getState().sidebarCollapsed;
      useUIStore.getState().setSidebarCollapsed(true);
    } else {
      useUIStore.getState().setSidebarCollapsed(prevSidebarRef.current);
    }
    setFocusMode(v=>!v);
  };
  // Restore sidebar on unmount
  useEffect(()=>()=>{ if(focusMode) useUIStore.getState().setSidebarCollapsed(prevSidebarRef.current); },[focusMode]);

  const svgRef = useRef<SVGSVGElement>(null);

  // ── Data fetching
  const {data:devData} = useQuery({queryKey:['devices-analytics'],queryFn:()=>devicesApi.list({limit:200})});
  const devices = devData?.devices ?? [];
  const {data:deviceData} = useQuery({queryKey:['device-analytics-detail',deviceId],queryFn:()=>devicesApi.get(deviceId),enabled:!!deviceId});
  const {data:latestTelem} = useQuery({queryKey:['analytics-latest',deviceId],queryFn:()=>telemetryApi.latest(deviceId),enabled:!!deviceId});

  const schemaFields: any[] = (deviceData?.meta as any)?.dataSchema?.fields ?? [];
  const numericFields = useMemo(()=>{
    const fromSchema = schemaFields.filter((f:any)=>!f.type||f.type==='number'||f.type==='float'||f.type==='integer');
    if (fromSchema.length) return fromSchema;
    const liveFields = latestTelem?.fields ?? {};
    return Object.entries(liveFields).filter(([,v])=>typeof v==='number').map(([k],i)=>({key:k,label:k.replace(/_/g,' '),type:'number',chartColor:COLORS[i%COLORS.length]}));
  },[schemaFields,latestTelem]);

  const {from,to}=useMemo(()=>rangeBounds(rangeMs),[rangeMs]);
  const fieldQueries=useQueries({queries:selFields.map(field=>({queryKey:['analytics-series',deviceId,field,rangeMs],queryFn:()=>telemetryApi.series(deviceId,field,from,to,2000),enabled:!!deviceId&&!!field,refetchInterval:30_000}))});

  const series:Series[]=useMemo(()=>selFields.map((k,i)=>{
    const meta=numericFields.find((f:any)=>f.key===k);
    const color=meta?.chartColor??COLORS[i%COLORS.length];
    const pts:Point[]=(fieldQueries[i]?.data?.data??[]).map((p:any)=>({ts:new Date(p.ts).getTime(),value:p.value??0})).sort((a:Point,b:Point)=>a.ts-b.ts);
    return{name:meta?.label??k.replace(/_/g,' '),data:pts,color,fieldKey:k};
  }),[selFields,fieldQueries,numericFields]);

  const activeOp=opField||selFields[0]||'';
  const activeFft=fftField||selFields[0]||'';

  const overlaySeries:Series[]=useMemo(()=>overlays.map(ov=>{
    const base=series.find(s=>s.fieldKey===ov.fieldKey);if(!base)return null;
    const vals=base.data.map(p=>p.value);
    let proc:number[];
    switch(ov.type){
      case 'moving_avg':    proc=movingAverage(vals,ov.params.w??10);break;
      case 'exp_ma':        proc=exponentialMA(vals,ov.params.a??0.2);break;
      case 'differentiate': proc=differentiate(vals);break;
      case 'integrate':     proc=integrate(vals);break;
      case 'lowpass':       proc=applyLowPass(vals,ov.params.cut,ov.params.sr);break;
      case 'highpass':      proc=applyHighPass(vals,ov.params.cut,ov.params.sr);break;
      case 'bandpass':      proc=applyBandPass(vals,ov.params.cen,ov.params.bw,ov.params.sr);break;
      case 'notch':         proc=applyNotch(vals,ov.params.cen,ov.params.bw,ov.params.sr);break;
      default:proc=vals;
    }
    return{name:ov.label,color:ov.color,fieldKey:ov.fieldKey,data:base.data.map((p,i)=>({ts:p.ts,value:proc[i]??0}))} satisfies Series;
  }).filter(Boolean) as Series[],[overlays,series]);

  const sr=useMemo(()=>{const base=series.find(s=>s.fieldKey===activeFft)??series[0];return base?.data.length?detectSampleRate(base.data.map(p=>p.ts)):1;},[series,activeFft]);
  const nyquist=sr/2;
  const psdBins:FFTBin[]=useMemo(()=>{
    const base=series.find(s=>s.fieldKey===activeFft)??series[0];if(!base?.data.length)return[];
    const pts=(windowTs?base.data.filter(p=>p.ts>=windowTs[0]&&p.ts<=windowTs[1]):base.data);if(pts.length<8)return[];
    return computePSD(pts.map(p=>p.value),sr);
  },[series,activeFft,windowTs,sr]);
  const spectroVals=useMemo(()=>{
    const base=series.find(s=>s.fieldKey===activeFft)??series[0];if(!base?.data.length)return[];
    return(windowTs?base.data.filter(p=>p.ts>=windowTs[0]&&p.ts<=windowTs[1]):base.data).map(p=>p.value);
  },[series,activeFft,windowTs]);

  // Feature clouds for 3D explorer
  const featureClouds:FeatureCloud[]=useMemo(()=>series.map(s=>{
    const data=windowTs?s.data.filter(p=>p.ts>=windowTs[0]&&p.ts<=windowTs[1]):s.data;
    return{name:s.name,color:s.color,vecs:extractWindowedFeatures(data,Math.max(3,winSz))};
  }),[series,windowTs,winSz]);

  // Effects
  useEffect(()=>{if(numericFields.length&&selFields.length===0)setSelFields([numericFields[0].key]);},[numericFields.length,deviceId]);
  useEffect(()=>{setSelFields([]);setWindowTs(null);setOverlays([]);},[deviceId]);
  useEffect(()=>{setWindowTs(null);},[rangeMs]);

  const toggleField=(k:string)=>setSelFields(prev=>prev.includes(k)?(prev.length>1?prev.filter(f=>f!==k):prev):[...prev,k]);
  const addOverlay=(type:OvType,label:string,params:Record<string,number>)=>{
    setOverlays(prev=>[...prev,{id:`${Date.now()}`,type,label,fieldKey:activeOp,color:O_COLORS[prev.length%O_COLORS.length],params}]);
  };
  const applyFilter=()=>{
    const base=series.find(s=>s.fieldKey===activeOp);if(!base?.data.length)return;
    const s2=detectSampleRate(base.data.map(p=>p.ts));
    if(fType==='lowpass')addOverlay('lowpass',`LP ${fmtFreq(fCut)}`,{cut:fCut,sr:s2});
    else if(fType==='highpass')addOverlay('highpass',`HP ${fmtFreq(fCut)}`,{cut:fCut,sr:s2});
    else if(fType==='bandpass')addOverlay('bandpass',`BP ${fmtFreq(fCenter)}`,{cen:fCenter,bw:fBW,sr:s2});
    else addOverlay('notch',`Notch ${fmtFreq(fCenter)}`,{cen:fCenter,bw:fBW,sr:s2});
  };

  const loading=fieldQueries.some(q=>q.isLoading);

  const inp:React.CSSProperties={background:'hsl(var(--surface))',border:'1px solid hsl(var(--border))',color:'hsl(var(--fg))',fontFamily:'var(--font-mono)',fontSize:11,padding:'5px 8px',width:'100%'};
  const lbl:React.CSSProperties={display:'block',fontSize:8.5,fontFamily:'var(--font-mono)',letterSpacing:'0.12em',textTransform:'uppercase',color:'hsl(var(--muted-fg))',marginBottom:3};

  return (
    <div className="page">

      {/* ── Header ── */}
      <div className="ph" style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div>
          <span className="eyebrow">Signal Intelligence</span>
          <h1><em>Analytics</em>.</h1>
        </div>
        <div style={{display:'flex',gap:8,marginTop:8,alignItems:'center'}}>
          {loading&&<RefreshCw size={13} style={{animation:'spin 1s linear infinite',color:'hsl(var(--muted-fg))'}}/>}
          <button className="btn btn-sm btn-outline" onClick={()=>exportCSV(series,overlaySeries,windowTs)} style={{gap:5}}><Download size={12}/>CSV</button>
          <button className="btn btn-sm btn-outline" onClick={()=>{const s=new XMLSerializer();const blob=new Blob([s.serializeToString(svgRef.current!)],{type:'image/svg+xml'});const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'signal.svg'});a.click();}} style={{gap:5}}><Download size={12}/>SVG</button>
          <button className="btn btn-sm btn-outline" onClick={toggleFocus} style={{gap:5}} title={focusMode?'Exit focus mode':'Focus mode — hides navigation'}>
            {focusMode?<Minimize2 size={13}/>:<Maximize2 size={13}/>}
            {focusMode?'Exit Focus':'Focus'}
          </button>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div style={{display:'flex',gap:12,marginBottom:20,flexWrap:'wrap',alignItems:'flex-end',padding:'14px 18px',background:'hsl(var(--surface))',border:'1px solid hsl(var(--border))'}}>
        <div style={{minWidth:200}}>
          <label style={lbl}>Device</label>
          <div style={{position:'relative'}}>
            <select value={deviceId} onChange={e=>setDeviceId(e.target.value)} style={{...inp,paddingRight:26,appearance:'none',cursor:'pointer',minWidth:200}}>
              <option value="">— Select device —</option>
              {devices.map((d:any)=><option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
            <ChevronDown size={11} style={{position:'absolute',right:7,top:'50%',transform:'translateY(-50%)',pointerEvents:'none',color:'hsl(var(--muted-fg))'}}/>
          </div>
        </div>

        {deviceId&&numericFields.length>0&&(
          <div style={{flex:1}}>
            <label style={lbl}>Parameters <span style={{opacity:0.5}}>({selFields.length} active)</span></label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {numericFields.map((f:any,i:number)=>{
                const color=f.chartColor??COLORS[i%COLORS.length];
                const active=selFields.includes(f.key);
                return (
                  <button key={f.key} onClick={()=>toggleField(f.key)} style={{
                    padding:'5px 12px',fontSize:11,fontFamily:'var(--font-mono)',
                    border:`1px solid ${active?color:'hsl(var(--border))'}`,
                    borderLeft:`3px solid ${active?color:'hsl(var(--border))'}`,
                    background:active?`${color}15`:'transparent',
                    color:active?color:'hsl(var(--muted-fg))',
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

        {deviceId&&!numericFields.length&&!loading&&(
          <div style={{fontFamily:'var(--font-mono)',fontSize:11,color:'hsl(var(--muted-fg))'}}>No numeric fields found — configure schema in device settings</div>
        )}

        <div>
          <label style={lbl}>Range</label>
          <div className="seg">{RANGES.map(r=><button key={r.ms} className={rangeMs===r.ms?'on':''} onClick={()=>setRangeMs(r.ms)}>{r.label}</button>)}</div>
        </div>
        {windowTs&&<button className="btn btn-sm" onClick={()=>setWindowTs(null)} style={{gap:5,color:'hsl(var(--primary))',marginBottom:1}}><X size={11}/>Clear window</button>}
      </div>

      {/* ── Signal Panel ── */}
      <div style={{border:'1px solid hsl(var(--border))',marginBottom:16,background:'hsl(var(--surface))'}}>
        {/* Legend */}
        <div style={{padding:'8px 18px 6px',borderBottom:'1px solid hsl(var(--border))',display:'flex',gap:16,flexWrap:'wrap',alignItems:'center'}}>
          <span style={{fontSize:9,fontFamily:'var(--font-mono)',letterSpacing:'0.12em',textTransform:'uppercase',color:'hsl(var(--muted-fg))'}}>Signal View</span>
          {[...series,...overlaySeries].map((s,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',gap:5,fontSize:10,fontFamily:'var(--font-mono)',color:s.color}}>
              <svg width={18} height={6}><line x1={0} y1={3} x2={18} y2={3} stroke={s.color} strokeWidth={i<series.length?2:1.5} strokeDasharray={i<series.length?undefined:'5 3'}/></svg>
              {s.name}
            </div>
          ))}
          {!series.length&&<span style={{fontSize:10,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))',opacity:0.6}}>Select a device and parameters above — drag on the chart to select an analysis window</span>}
          {windowTs&&<span style={{marginLeft:'auto',fontSize:9,fontFamily:'var(--font-mono)',color:'hsl(var(--primary))',opacity:0.8}}>Window: {((windowTs[1]-windowTs[0])/60000).toFixed(1)} min · {series.reduce((s,x)=>s+(windowTs?x.data.filter(p=>p.ts>=windowTs[0]&&p.ts<=windowTs[1]).length:x.data.length),0)} pts</span>}
        </div>

        {series.length===0?(
          <div style={{height:280,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,color:'hsl(var(--muted-fg))'}}>
            <Activity size={40} strokeWidth={1} style={{opacity:0.15}}/>
            <div style={{fontFamily:'var(--font-mono)',fontSize:12}}>No data selected</div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:10,opacity:0.55}}>Choose a device and enable at least one parameter</div>
          </div>
        ):(
          <>
            <SignalChart series={series} overlays={overlaySeries} windowTs={windowTs} onWindow={setWindowTs} height={320} svgRef={svgRef}/>
            <StatsStrip series={series} windowTs={windowTs}/>
          </>
        )}
      </div>

      {/* ── Analysis Modules ── */}

      {/* 1. Statistical Analysis */}
      <AnalysisCard id="stats" icon={<BarChart2 size={16}/>} title="Statistical Analysis" badge={series.length?`${series.length} field${series.length>1?'s':''}`:undefined} description="Value distributions, histograms with normal fit, Pearson correlation matrix, skewness & kurtosis" open={openModules.has('stats')} onToggle={()=>toggleModule('stats')}>
        {series.length===0?(
          <div style={{padding:32,textAlign:'center',fontFamily:'var(--font-mono)',fontSize:11,color:'hsl(var(--muted-fg))'}}>Select parameters to compute statistics</div>
        ):(
          <>
            <div style={{padding:'12px 20px 4px',fontSize:9,fontFamily:'var(--font-mono)',letterSpacing:'0.14em',textTransform:'uppercase',color:'hsl(var(--muted-fg))'}}>Value Distribution</div>
            <HistogramGrid series={series}/>
            <div style={{borderTop:'1px solid hsl(var(--border))',padding:'12px 20px 4px',fontSize:9,fontFamily:'var(--font-mono)',letterSpacing:'0.14em',textTransform:'uppercase',color:'hsl(var(--muted-fg))'}}>Correlation Analysis</div>
            <CorrelationHeatmap series={series}/>
          </>
        )}
      </AnalysisCard>

      {/* 2. Spectral Analysis */}
      <AnalysisCard id="spectral" icon={<Waves size={16}/>} title="Spectral Analysis" badge="FFT" description="Power spectral density (Hann window), spectrogram, dominant frequency & period — use window selection for windowed FFT" open={openModules.has('spectral')} onToggle={()=>toggleModule('spectral')}>
        <div style={{padding:'10px 20px',borderBottom:'1px solid hsl(var(--border))',display:'flex',gap:14,alignItems:'center',flexWrap:'wrap'}}>
          <span style={{fontSize:9.5,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))',letterSpacing:'0.1em',textTransform:'uppercase'}}>sr={fmtFreq(sr)} · Nyquist={fmtFreq(nyquist)}</span>
          {selFields.length>1&&(
            <select value={activeFft} onChange={e=>setFftField(e.target.value)} style={{...inp,width:160}}>
              {selFields.map(k=>{const m=numericFields.find((f:any)=>f.key===k);return <option key={k} value={k}>{m?.label||k.replace(/_/g,' ')}</option>;})}
            </select>
          )}
          {!windowTs&&<span style={{fontSize:9,fontFamily:'var(--font-mono)',color:'hsl(var(--primary))',opacity:0.7}}>Tip: drag on signal chart to select a window for windowed FFT</span>}
        </div>
        <div style={{padding:'12px 20px 0',fontSize:9,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))',textTransform:'uppercase',letterSpacing:'0.1em'}}>Power Spectral Density</div>
        <PSDChart bins={psdBins} sampleRateHz={sr} height={220} color={(series.find(s=>s.fieldKey===activeFft)??series[0])?.color}/>
        <div style={{borderTop:'1px solid hsl(var(--border))',padding:'12px 20px 0',fontSize:9,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))',textTransform:'uppercase',letterSpacing:'0.1em'}}>Spectrogram · time × frequency</div>
        <Spectrogram values={spectroVals} sampleRateHz={sr} height={200}/>
        <div style={{padding:'6px 20px 12px',fontSize:8.5,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))'}}>Colormap: dark=low power · bright=high power (inferno)</div>
      </AnalysisCard>

      {/* 3. DSP Processing */}
      <AnalysisCard id="dsp" icon={<Filter size={16}/>} title="DSP Processing" badge={overlays.length?`${overlays.length} op${overlays.length>1?'s':''}`:undefined} description="Apply moving averages, EMA, differentiation, integration, and Butterworth IIR filters — see before/after comparison" open={openModules.has('dsp')} onToggle={()=>toggleModule('dsp')}>
        <div style={{display:'grid',gridTemplateColumns:'300px 1fr'}}>

          {/* Pipeline controls */}
          <div style={{borderRight:'1px solid hsl(var(--border))',display:'flex',flexDirection:'column',gap:0}}>
            {/* Applied ops */}
            <div style={{padding:'12px 14px',borderBottom:'1px solid hsl(var(--border))'}}>
              <div style={{fontSize:8.5,fontFamily:'var(--font-mono)',letterSpacing:'0.12em',textTransform:'uppercase',color:'hsl(var(--muted-fg))',marginBottom:8}}>Pipeline</div>
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                <div style={{padding:'7px 10px',background:'hsl(var(--surface-raised,var(--surface)))',border:'1px solid hsl(var(--border))',fontSize:10,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))'}}>
                  <span style={{color:'hsl(var(--fg))'}}>INPUT</span> · {series.reduce((s,x)=>s+x.data.length,0)} pts
                </div>
                {overlays.length===0&&<div style={{textAlign:'center',fontSize:9,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))',padding:'6px 0',opacity:0.45}}>↓ no operations yet</div>}
                {overlays.map((ov,i)=>(
                  <div key={ov.id} style={{display:'flex',flexDirection:'column',gap:2}}>
                    <div style={{textAlign:'center',fontSize:9,color:'hsl(var(--muted-fg))',opacity:0.35}}>↓</div>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 10px',border:'1px solid hsl(var(--border))',borderLeft:`3px solid ${ov.color}`}}>
                      <div>
                        <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:ov.color}}>{ov.label}</div>
                        <div style={{fontSize:8,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))',marginTop:1}}>{numericFields.find((f:any)=>f.key===ov.fieldKey)?.label??ov.fieldKey.replace(/_/g,' ')}</div>
                      </div>
                      <button onClick={()=>setOverlays(p=>p.filter(o=>o.id!==ov.id))} style={{background:'none',border:0,cursor:'pointer',color:'hsl(var(--muted-fg))',padding:0}}><X size={11}/></button>
                    </div>
                  </div>
                ))}
                {overlays.length>0&&<>
                  <div style={{textAlign:'center',fontSize:9,color:'hsl(var(--muted-fg))',opacity:0.35}}>↓</div>
                  <div style={{padding:'6px 10px',border:'1px solid hsl(var(--border))',fontSize:10,fontFamily:'var(--font-mono)',color:'hsl(var(--good,#22c55e))'}}>OUTPUT → chart</div>
                </>}
              </div>
            </div>

            {/* Add operations */}
            <div style={{padding:'12px 14px',flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:10}}>
              <div style={{fontSize:8.5,fontFamily:'var(--font-mono)',letterSpacing:'0.12em',textTransform:'uppercase',color:'hsl(var(--muted-fg))'}}>Add Operation</div>

              {selFields.length>1&&<div><label style={lbl}>Apply to</label>
                <select value={activeOp} onChange={e=>setOpField(e.target.value)} style={inp}>
                  {selFields.map(k=>{const m=numericFields.find((f:any)=>f.key===k);return <option key={k} value={k}>{m?.label||k.replace(/_/g,' ')}</option>;})}
                </select>
              </div>}

              <div style={{borderTop:'1px solid hsl(var(--border))',paddingTop:8}}>
                <div style={{fontSize:8.5,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))',marginBottom:6,letterSpacing:'0.1em',textTransform:'uppercase'}}>Smoothing</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:5,alignItems:'flex-end',marginBottom:6}}>
                  <div><label style={lbl}>Moving Avg · window pts</label><input type="number" min={2} max={200} value={maW} onChange={e=>setMaW(+e.target.value)} style={inp}/></div>
                  <button className="btn btn-sm" onClick={()=>addOverlay('moving_avg',`MA(${maW})`,{w:maW})} disabled={!selFields.length}>+</button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:5,alignItems:'flex-end'}}>
                  <div><label style={lbl}>Exp MA · α (0–1)</label><input type="number" min={0.01} max={1} step={0.01} value={emaA} onChange={e=>setEmaA(+e.target.value)} style={inp}/></div>
                  <button className="btn btn-sm" onClick={()=>addOverlay('exp_ma',`EMA(α=${emaA})`,{a:emaA})} disabled={!selFields.length}>+</button>
                </div>
              </div>

              <div style={{borderTop:'1px solid hsl(var(--border))',paddingTop:8}}>
                <div style={{fontSize:8.5,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))',marginBottom:6,letterSpacing:'0.1em',textTransform:'uppercase'}}>Calculus</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5}}>
                  <button className="btn btn-sm btn-outline" onClick={()=>addOverlay('differentiate','d/dt',{})} disabled={!selFields.length}>d/dt · Derivative</button>
                  <button className="btn btn-sm btn-outline" onClick={()=>addOverlay('integrate','∫ dt',{})} disabled={!selFields.length}>∫ dt · Integral</button>
                </div>
              </div>

              <div style={{borderTop:'1px solid hsl(var(--border))',paddingTop:8}}>
                <div style={{fontSize:8.5,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))',marginBottom:8,letterSpacing:'0.1em',textTransform:'uppercase'}}>IIR Filter (Butterworth)</div>
                <div className="seg" style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',marginBottom:8}}>
                  {(['lowpass','highpass','bandpass','notch'] as const).map(t=>(
                    <button key={t} className={fType===t?'on':''} onClick={()=>setFType(t)} style={{fontSize:8.5}}>
                      {t==='lowpass'?'LP':t==='highpass'?'HP':t==='bandpass'?'BP':'Notch'}
                    </button>
                  ))}
                </div>
                {(fType==='lowpass'||fType==='highpass')&&(
                  <div style={{marginBottom:6}}>
                    <label style={lbl}>Cutoff · {fmtFreq(fCut)} · T={fmtPeriod(fCut)}</label>
                    <input type="number" min={0} max={nyquist*0.99} step={nyquist/200} value={fCut} onChange={e=>setFCut(+e.target.value)} style={inp}/>
                    <div style={{fontSize:8,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))',marginTop:3,opacity:0.6}}>Nyquist: {fmtFreq(nyquist)}</div>
                  </div>
                )}
                {(fType==='bandpass'||fType==='notch')&&(<>
                  <div style={{marginBottom:6}}><label style={lbl}>Center · {fmtFreq(fCenter)}</label><input type="number" min={0} max={nyquist*0.99} step={nyquist/200} value={fCenter} onChange={e=>setFCenter(+e.target.value)} style={inp}/></div>
                  <div style={{marginBottom:6}}><label style={lbl}>Bandwidth (octaves)</label><input type="number" min={0.1} max={4} step={0.1} value={fBW} onChange={e=>setFBW(+e.target.value)} style={inp}/></div>
                </>)}
                <button className="btn btn-sm btn-primary" style={{width:'100%',marginTop:2}} onClick={applyFilter} disabled={!selFields.length}>Apply Filter</button>
              </div>
            </div>
          </div>

          {/* Before / After view */}
          <div style={{minWidth:0}}>
            {overlays.length===0?(
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:280,gap:10,color:'hsl(var(--muted-fg))'}}>
                <Filter size={32} strokeWidth={1} style={{opacity:0.15}}/>
                <div style={{fontFamily:'var(--font-mono)',fontSize:11}}>No operations applied yet</div>
                <div style={{fontFamily:'var(--font-mono)',fontSize:10,opacity:0.55}}>Add an operation from the left panel</div>
              </div>
            ):(
              <>
                <div style={{padding:'6px 16px',borderBottom:'1px solid hsl(var(--border))',fontSize:9,fontFamily:'var(--font-mono)',letterSpacing:'0.1em',textTransform:'uppercase',color:'hsl(var(--muted-fg))'}}>Original signal</div>
                <SignalChart series={series} overlays={[]} windowTs={windowTs} onWindow={setWindowTs} height={200}/>
                <div style={{padding:'6px 16px',borderTop:'1px solid hsl(var(--border))',borderBottom:'1px solid hsl(var(--border))',fontSize:9,fontFamily:'var(--font-mono)',letterSpacing:'0.1em',textTransform:'uppercase',color:'hsl(var(--primary))'}}>DSP output ↓ ({overlays.length} operation{overlays.length>1?'s':''})</div>
                <SignalChart series={overlaySeries} overlays={[]} windowTs={windowTs} onWindow={()=>{}} height={200}/>
              </>
            )}
          </div>
        </div>
      </AnalysisCard>

      {/* 4. Feature Explorer 3D */}
      <AnalysisCard id="3d" icon={<Box size={16}/>} title="Feature Explorer · 3D" badge="ML READY" description="Extract statistical features from time windows — visualise each parameter as a coloured cloud to see clustering, separation & correlation in feature space" open={openModules.has('3d')} onToggle={()=>toggleModule('3d')}>

        {/* Controls bar */}
        <div style={{display:'flex',gap:14,alignItems:'flex-end',padding:'14px 20px',borderBottom:'1px solid hsl(var(--border))',flexWrap:'wrap'}}>
          {/* Axis selectors */}
          {(['X','Y','Z'] as const).map((axis,ai)=>{
            const val=[fxX,fxY,fxZ][ai];
            const setter=[setFxX,setFxY,setFxZ][ai];
            const axisColor=COLORS[ai];
            return (
              <div key={axis} style={{minWidth:140}}>
                <label style={{...lbl,color:axisColor}}>{axis} Axis</label>
                <div style={{position:'relative'}}>
                  <select value={val} onChange={e=>setter(e.target.value)} style={{...inp,borderColor:axisColor+'55',paddingRight:24,appearance:'none',cursor:'pointer'}}>
                    {FEATURE_DEFS.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                  <ChevronDown size={10} style={{position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',pointerEvents:'none',color:axisColor}}/>
                </div>
              </div>
            );
          })}

          {/* Window size */}
          <div style={{minWidth:130}}>
            <label style={lbl}>Window size · {winSz} pts</label>
            <input type="range" min={4} max={Math.max(10,Math.min(200,Math.floor((series[0]?.data.length??100)/4)))} value={winSz} onChange={e=>setWinSz(+e.target.value)} style={{width:'100%',accentColor:'hsl(var(--primary))'}}/>
          </div>

          <div style={{fontFamily:'var(--font-mono)',fontSize:9,color:'hsl(var(--muted-fg))',maxWidth:260,lineHeight:1.5}}>
            {featureClouds.length>0&&featureClouds.some(c=>c.vecs.length>0)?(
              <>Each point = {winSz}-sample window · {featureClouds.filter(c=>c.vecs.length>0).map(c=>`${c.name}: ${c.vecs.length} pts`).join(' · ')}</>
            ):'Select parameters and adjust window size'}
          </div>
        </div>

        <FeatureScatter3D clouds={featureClouds} axisX={fxX} axisY={fxY} axisZ={fxZ} height={500}/>

        <div style={{padding:'8px 20px',borderTop:'1px solid hsl(var(--border))',display:'flex',gap:24,flexWrap:'wrap'}}>
          <div style={{fontSize:8.5,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))',lineHeight:1.6}}>
            <span style={{color:'hsl(var(--fg))',fontWeight:600}}>Clustering</span> · Separate clouds = parameters have distinct dynamics. Overlapping = correlated behaviour.
          </div>
          <div style={{fontSize:8.5,fontFamily:'var(--font-mono)',color:'hsl(var(--muted-fg))',lineHeight:1.6}}>
            <span style={{color:'hsl(var(--fg))',fontWeight:600}}>ML use</span> · Export CSV → use feature vectors as training data for classifiers or anomaly detectors.
          </div>
        </div>
      </AnalysisCard>

    </div>
  );
}
