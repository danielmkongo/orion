// ── Statistics ─────────────────────────────────────────────────────────────

export function mean(data: number[]): number {
  if (!data.length) return 0;
  return data.reduce((s, v) => s + v, 0) / data.length;
}

export function rms(data: number[]): number {
  if (!data.length) return 0;
  return Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
}

export function variance(data: number[]): number {
  if (!data.length) return 0;
  const m = mean(data);
  return data.reduce((s, v) => s + (v - m) ** 2, 0) / data.length;
}

export function stdDev(data: number[]): number {
  return Math.sqrt(variance(data));
}

export interface Stats {
  mean: number; rms: number; stdDev: number; variance: number;
  min: number; max: number; peakToPeak: number; crestFactor: number;
  count: number;
}

export function computeStats(data: number[]): Stats {
  if (!data.length) return { mean: 0, rms: 0, stdDev: 0, variance: 0, min: 0, max: 0, peakToPeak: 0, crestFactor: 0, count: 0 };
  const m = mean(data);
  const r = rms(data);
  const s = stdDev(data);
  const min = Math.min(...data);
  const max = Math.max(...data);
  return {
    mean: m, rms: r, stdDev: s, variance: s * s,
    min, max, peakToPeak: max - min,
    crestFactor: r > 0 ? Math.max(...data.map(Math.abs)) / r : 0,
    count: data.length,
  };
}

// ── Transforms ─────────────────────────────────────────────────────────────

export function movingAverage(data: number[], windowSize: number): number[] {
  const w = Math.max(1, Math.round(windowSize));
  return data.map((_, i) => {
    const half = Math.floor(w / 2);
    const start = Math.max(0, i - half);
    const end = Math.min(data.length, i + half + 1);
    const slice = data.slice(start, end);
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  });
}

export function exponentialMA(data: number[], alpha: number): number[] {
  const a = Math.min(1, Math.max(0.001, alpha));
  const result: number[] = [];
  let prev = data[0] ?? 0;
  for (const v of data) { prev = a * v + (1 - a) * prev; result.push(prev); }
  return result;
}

export function differentiate(data: number[]): number[] {
  return data.map((v, i) => i === 0 ? 0 : v - data[i - 1]);
}

export function integrate(data: number[]): number[] {
  let sum = 0;
  return data.map(v => { sum += v; return sum; });
}

// ── FFT (Cooley-Tukey, in-place) ───────────────────────────────────────────

function nextPow2(n: number): number {
  let p = 1; while (p < n) p <<= 1; return p;
}

export function hannWindow(data: number[]): number[] {
  const n = data.length;
  return data.map((v, i) => v * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1))));
}

export function zeroPadToPow2(data: number[]): number[] {
  const n = nextPow2(data.length);
  return [...data, ...new Array(n - data.length).fill(0)];
}

function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let tRe = 1, tIm = 0;
      for (let j = 0; j < (len >> 1); j++) {
        const uRe = re[i + j], uIm = im[i + j];
        const vRe = re[i + j + (len >> 1)] * tRe - im[i + j + (len >> 1)] * tIm;
        const vIm = re[i + j + (len >> 1)] * tIm + im[i + j + (len >> 1)] * tRe;
        re[i + j] = uRe + vRe; im[i + j] = uIm + vIm;
        re[i + j + (len >> 1)] = uRe - vRe; im[i + j + (len >> 1)] = uIm - vIm;
        const nTRe = tRe * wRe - tIm * wIm;
        tIm = tRe * wIm + tIm * wRe;
        tRe = nTRe;
      }
    }
  }
}

export interface FFTBin { freq: number; magnitude: number; power: number; powerDb: number; }

export function computePSD(values: number[], sampleRateHz: number): FFTBin[] {
  if (values.length < 4 || sampleRateHz <= 0) return [];
  const windowed = hannWindow(values);
  const padded = zeroPadToPow2(windowed);
  const n = padded.length;
  const re = new Float64Array(padded), im = new Float64Array(n);
  fftInPlace(re, im);
  let maxPow = 0;
  const bins: FFTBin[] = [];
  for (let k = 1; k < n / 2; k++) {
    const mag = (2 * Math.sqrt(re[k] ** 2 + im[k] ** 2)) / n;
    const power = mag * mag;
    if (power > maxPow) maxPow = power;
    bins.push({ freq: (k * sampleRateHz) / n, magnitude: mag, power, powerDb: 0 });
  }
  for (const b of bins) b.powerDb = maxPow > 0 ? 10 * Math.log10(b.power / maxPow + 1e-12) : -120;
  return bins;
}

// ── Filters (biquad IIR — Audio EQ Cookbook, zero-phase forward-backward) ──

function biquad(data: number[], b0: number, b1: number, b2: number, a1: number, a2: number): number[] {
  const out = new Array(data.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x0 = data[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y0; x2 = x1; x1 = x0; y2 = y1; y1 = y0;
  }
  return out;
}

function zeroPhase(data: number[], b0: number, b1: number, b2: number, a1: number, a2: number): number[] {
  const fwd = biquad(data, b0, b1, b2, a1, a2);
  return biquad([...fwd].reverse(), b0, b1, b2, a1, a2).reverse();
}

function safeW(cutoffHz: number, srHz: number): number {
  const nyq = srHz / 2;
  return 2 * Math.PI * Math.min(Math.max(cutoffHz, srHz * 0.0001), nyq * 0.999) / srHz;
}

export function applyLowPass(data: number[], cutoffHz: number, sampleRateHz: number): number[] {
  if (data.length < 4) return data;
  const w = safeW(cutoffHz, sampleRateHz);
  const cosW = Math.cos(w), sinW = Math.sin(w), alpha = sinW / Math.SQRT2;
  const a0 = 1 + alpha;
  return zeroPhase(data, (1 - cosW) / 2 / a0, (1 - cosW) / a0, (1 - cosW) / 2 / a0, (-2 * cosW) / a0, (1 - alpha) / a0);
}

export function applyHighPass(data: number[], cutoffHz: number, sampleRateHz: number): number[] {
  if (data.length < 4) return data;
  const w = safeW(cutoffHz, sampleRateHz);
  const cosW = Math.cos(w), sinW = Math.sin(w), alpha = sinW / Math.SQRT2;
  const a0 = 1 + alpha;
  return zeroPhase(data, (1 + cosW) / 2 / a0, -(1 + cosW) / a0, (1 + cosW) / 2 / a0, (-2 * cosW) / a0, (1 - alpha) / a0);
}

export function applyBandPass(data: number[], centerHz: number, bwOctaves: number, sampleRateHz: number): number[] {
  if (data.length < 4) return data;
  const w = safeW(centerHz, sampleRateHz);
  const cosW = Math.cos(w), sinW = Math.sin(w);
  const alpha = sinW * Math.sinh((Math.LN2 / 2) * bwOctaves * (w / sinW));
  const a0 = 1 + alpha;
  return zeroPhase(data, (sinW / 2) / a0, 0, -(sinW / 2) / a0, (-2 * cosW) / a0, (1 - alpha) / a0);
}

export function applyNotch(data: number[], centerHz: number, bwOctaves: number, sampleRateHz: number): number[] {
  if (data.length < 4) return data;
  const w = safeW(centerHz, sampleRateHz);
  const cosW = Math.cos(w), sinW = Math.sin(w);
  const alpha = sinW * Math.sinh((Math.LN2 / 2) * bwOctaves * (w / sinW));
  const a0 = 1 + alpha;
  return zeroPhase(data, 1 / a0, (-2 * cosW) / a0, 1 / a0, (-2 * cosW) / a0, (1 - alpha) / a0);
}

// ── Utilities ──────────────────────────────────────────────────────────────

export function detectSampleRate(timestamps: number[]): number {
  if (timestamps.length < 2) return 1;
  const deltas = timestamps.slice(1).map((t, i) => t - timestamps[i]).filter(d => d > 0);
  if (!deltas.length) return 1;
  const sorted = [...deltas].sort((a, b) => a - b);
  return 1000 / sorted[Math.floor(sorted.length / 2)];
}

export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) return [min];
  const range = max - min;
  const exp = Math.floor(Math.log10(range / count));
  const step = (() => {
    const raw = range / count / 10 ** exp;
    const nice = raw < 1.5 ? 1 : raw < 3.5 ? 2 : raw < 7.5 ? 5 : 10;
    return nice * 10 ** exp;
  })();
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.01; v += step) {
    const rounded = parseFloat(v.toFixed(10));
    if (rounded >= min - step * 0.01 && rounded <= max + step * 0.01) ticks.push(rounded);
  }
  return ticks;
}

export function fmtFreq(hz: number): string {
  if (hz >= 1) return `${hz.toFixed(3)} Hz`;
  if (hz >= 0.001) return `${(hz * 1000).toFixed(2)} mHz`;
  return `${(hz * 1000000).toFixed(1)} µHz`;
}

export function fmtPeriod(hz: number): string {
  if (hz <= 0) return '—';
  const s = 1 / hz;
  if (s < 60) return `${s.toFixed(1)}s`;
  if (s < 3600) return `${(s / 60).toFixed(1)}min`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86400).toFixed(1)}d`;
}

// ── Histogram ──────────────────────────────────────────────────────────────

export interface HistBin { bin: number; lo: number; hi: number; count: number; freq: number; }

export function computeHistogram(data: number[], bins = 24): HistBin[] {
  if (!data.length) return [];
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const w = range / bins;
  const counts = new Array(bins).fill(0);
  for (const v of data) counts[Math.min(bins - 1, Math.floor((v - min) / w))]++;
  return counts.map((count, i) => ({
    bin: min + (i + 0.5) * w, lo: min + i * w, hi: min + (i + 1) * w,
    count, freq: count / data.length,
  }));
}

// ── Correlation Matrix ─────────────────────────────────────────────────────

export function correlationMatrix(series: number[][]): number[][] {
  const m = series.length;
  return Array.from({ length: m }, (_, i) =>
    Array.from({ length: m }, (_, j) => {
      if (i === j) return 1;
      const n = Math.min(series[i].length, series[j].length);
      if (n < 2) return 0;
      const xi = series[i].slice(0, n), xj = series[j].slice(0, n);
      const mi = mean(xi), mj = mean(xj);
      let num = 0, di = 0, dj = 0;
      for (let k = 0; k < n; k++) {
        const a = xi[k] - mi, b = xj[k] - mj;
        num += a * b; di += a * a; dj += b * b;
      }
      return di * dj > 0 ? num / Math.sqrt(di * dj) : 0;
    })
  );
}

// ── Spectrogram ────────────────────────────────────────────────────────────

export interface Spectrogram { times: number[]; freqs: number[]; powerDb: number[][]; }

export function computeSpectrogram(values: number[], sampleRateHz: number, windowPts?: number, hopPts?: number): Spectrogram {
  if (values.length < 8) return { times: [], freqs: [], powerDb: [] };
  const wSize = windowPts ?? Math.max(8, Math.min(64, (() => { let p = 1; while (p * 16 < values.length) p <<= 1; return p; })()));
  const hop = hopPts ?? Math.max(1, Math.floor(wSize / 4));
  const times: number[] = [], powerDb: number[][] = [];
  for (let start = 0; start + wSize <= values.length; start += hop) {
    const seg = hannWindow(values.slice(start, start + wSize));
    const re = new Float64Array(seg), im = new Float64Array(wSize);
    fftInPlace(re, im);
    let maxP = 0;
    const bins: number[] = [];
    for (let k = 1; k < wSize / 2; k++) {
      const p = (re[k] ** 2 + im[k] ** 2) / (wSize * wSize);
      if (p > maxP) maxP = p;
      bins.push(p);
    }
    times.push((start + wSize / 2) / sampleRateHz);
    powerDb.push(bins.map(p => maxP > 0 ? 10 * Math.log10(p / maxP + 1e-12) : -120));
  }
  const freqs = Array.from({ length: Math.floor(wSize / 2) - 1 }, (_, k) => ((k + 1) * sampleRateHz) / wSize);
  return { times, freqs, powerDb };
}

// ── PCA (Jacobi eigendecomposition) ────────────────────────────────────────

export interface PCAResult {
  scores: number[][];        // [n_samples × k] projected coordinates
  explainedVar: number[];    // fraction of variance per component
  loadings: number[][];      // [k × m_features] eigenvectors
}

function jacobiEigen(A: number[][]): { vecs: number[][]; vals: number[] } {
  const n = A.length;
  const a = A.map(r => [...r]);
  const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => +(i === j)));
  for (let iter = 0; iter < 150 * n; iter++) {
    let maxV = 0, p = 0, q = 1;
    for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) if (Math.abs(a[i][j]) > maxV) { maxV = Math.abs(a[i][j]); p = i; q = j; }
    if (maxV < 1e-10) break;
    const th = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
    const c = Math.cos(th), s = Math.sin(th);
    const na = a.map(r => [...r]);
    na[p][p] = c*c*a[p][p] - 2*s*c*a[p][q] + s*s*a[q][q];
    na[q][q] = s*s*a[p][p] + 2*s*c*a[p][q] + c*c*a[q][q];
    na[p][q] = na[q][p] = 0;
    for (let r = 0; r < n; r++) if (r !== p && r !== q) {
      na[r][p] = na[p][r] = c*a[r][p] - s*a[r][q];
      na[r][q] = na[q][r] = s*a[r][p] + c*a[r][q];
    }
    for (let i = 0; i < n; i++) a[i] = na[i];
    for (let r = 0; r < n; r++) { const vp = V[r][p], vq = V[r][q]; V[r][p] = c*vp - s*vq; V[r][q] = s*vp + c*vq; }
  }
  const vals = a.map((r, i) => r[i]);
  const order = vals.map((_, i) => i).sort((a, b) => vals[b] - vals[a]);
  return { vals: order.map(i => vals[i]), vecs: order.map(i => V.map(r => r[i])) };
}

export function runPCA(data: number[][], k = 3): PCAResult {
  if (data.length < 2 || !data[0]?.length) return { scores: [], explainedVar: [], loadings: [] };
  const n = data.length, m = data[0].length;
  const means = Array.from({ length: m }, (_, j) => mean(data.map(r => r[j] ?? 0)));
  const stds  = Array.from({ length: m }, (_, j) => { const s = stdDev(data.map(r => (r[j] ?? 0) - means[j])); return s > 1e-10 ? s : 1; });
  const X = data.map(r => r.map((v, j) => (v - means[j]) / stds[j]));
  const cov = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => X.reduce((s, r) => s + r[i] * r[j], 0) / (n - 1)));
  const { vals, vecs } = jacobiEigen(cov);
  const nc = Math.min(k, m);
  const totalVar = vals.reduce((s, v) => s + Math.max(0, v), 0);
  return {
    scores: X.map(r => vecs.slice(0, nc).map(v => r.reduce((s, x, j) => s + x * (v[j] ?? 0), 0))),
    explainedVar: vals.slice(0, nc).map(v => Math.max(0, v) / (totalVar || 1)),
    loadings: vecs.slice(0, nc),
  };
}
