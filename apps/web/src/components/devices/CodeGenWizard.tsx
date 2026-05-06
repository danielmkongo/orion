import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Copy, Download, ChevronRight, Wifi, Radio, Cpu, Terminal, Check, Save, Pencil, Loader } from 'lucide-react';
import apiClient from '@/api/client';
import { useAuthStore } from '@/store/auth.store';
import toast from 'react-hot-toast';
import { copyText } from '@/lib/utils';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

/* ── Hardware catalogue ────────────────────────────────────────────── */
interface HardwareOption {
  id: string;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  fileExt: string;
  configFields: Array<{
    key: string; label: string;
    type: 'number' | 'text' | 'select';
    default: string | number;
    options?: string[];
    hint?: string;
  }>;
}

const HARDWARE: HardwareOption[] = [
  {
    id: 'espressif-wifi', label: 'Espressif + WiFi', sublabel: 'Arduino framework · WiFi.h',
    icon: <Wifi size={18} />, fileExt: 'ino',
    configFields: [
      { key: 'intervalSeconds', label: 'Send interval (s)', type: 'number', default: 60 },
      { key: 'deepSleep', label: 'Deep sleep between sends', type: 'select', default: 'no', options: ['no', 'yes'] },
    ],
  },
  {
    id: 'espressif-simcom-ppp', label: 'Espressif + SIMCom - PPP', sublabel: 'Arduino-esp32 PPP library',
    icon: <Radio size={18} />, fileExt: 'ino',
    configFields: [
      { key: 'intervalSeconds', label: 'Send interval (s)', type: 'number', default: 60 },
      { key: 'modemModel', label: 'Modem model', type: 'select', default: 'SIM800', options: ['SIM800', 'SIM7600'] },
      { key: 'apn', label: 'APN', type: 'text', default: 'internet' },
      { key: 'txPin', label: 'UART TX (modem RX)', type: 'number', default: 17 },
      { key: 'rxPin', label: 'UART RX (modem TX)', type: 'number', default: 16 },
      { key: 'rstPin', label: 'Reset pin', type: 'number', default: 5 },
    ],
  },
  {
    id: 'espressif-simcom-at', label: 'Espressif + SIMCom - AT', sublabel: 'HardwareSerial · AT commands',
    icon: <Terminal size={18} />, fileExt: 'ino',
    configFields: [
      { key: 'intervalSeconds', label: 'Send interval (s)', type: 'number', default: 60 },
      { key: 'apn', label: 'APN', type: 'text', default: 'internet' },
      { key: 'txPin', label: 'UART TX (modem RX)', type: 'number', default: 17 },
      { key: 'rxPin', label: 'UART RX (modem TX)', type: 'number', default: 16 },
    ],
  },
  {
    id: 'arduino-simcom-at', label: 'Arduino + SIMCom - AT', sublabel: 'SoftwareSerial · AT commands',
    icon: <Cpu size={18} />, fileExt: 'ino',
    configFields: [
      { key: 'intervalSeconds', label: 'Send interval (s)', type: 'number', default: 60 },
      { key: 'apn', label: 'APN', type: 'text', default: 'internet' },
      { key: 'rxPin', label: 'SoftwareSerial RX', type: 'number', default: 7 },
      { key: 'txPin', label: 'SoftwareSerial TX', type: 'number', default: 8 },
    ],
  },
  {
    id: 'raspberry-pi', label: 'Raspberry Pi', sublabel: 'MicroPython · urequests / umqtt',
    icon: <Cpu size={18} />, fileExt: 'py',
    configFields: [
      { key: 'intervalSeconds', label: 'Send interval (s)', type: 'number', default: 60 },
      { key: 'deepSleep', label: 'Deep sleep between sends', type: 'select', default: 'no', options: ['no', 'yes'] },
    ],
  },
];

const PROTOCOL_COLORS: Record<string, string> = {
  http: 'hsl(var(--good))', mqtt: 'hsl(var(--primary))', tcp: 'hsl(var(--info))',
  udp: 'hsl(var(--info))', coap: 'hsl(var(--warn))', websocket: '#A06CD5',
};

/* ── Minimal syntax highlighter ───────────────────────────────────── */
function highlight(code: string, lang: 'c' | 'py'): React.ReactNode[] {
  const C_KW  = /\b(void|int|float|double|bool|char|long|short|unsigned|byte|String|uint8_t|uint16_t|uint32_t|int32_t|size_t|setup|loop|if|else|for|while|do|switch|case|break|continue|return|true|false|null|nullptr|const|static|struct|enum|typedef|new|delete|include|define|pragma|ifdef|ifndef|endif|elif|undef)\b/g;
  const PY_KW = /\b(def|class|import|from|while|if|elif|else|for|in|return|True|False|None|with|as|try|except|finally|pass|raise|and|or|not|lambda|yield|global|nonlocal|async|await|print)\b/g;
  const KW_RE = lang === 'py' ? PY_KW : C_KW;

  const segments: Array<{ text: string; type: string }> = [];
  let rest = code;

  const TOKEN = lang === 'py'
    ? /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d+\.?\d*(?:[eE][+-]?\d+)?[fFuUlL]*\b)/g
    : /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(#\s*(include|define|pragma|ifndef|ifdef|endif|elif|undef)[^\n]*)|("(?:[^"\\]|\\.)*")|(L?"(?:[^"\\]|\\.)*")|(\b\d+\.?\d*(?:[eE][+-]?\d+)?[fFuUlL]*\b)/g;

  let lastIdx = 0;
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(rest)) !== null) {
    if (m.index > lastIdx) segments.push({ text: rest.slice(lastIdx, m.index), type: 'plain' });
    if (m[1]) segments.push({ text: m[0], type: 'comment' });
    else if (m[2] && lang !== 'py') segments.push({ text: m[0], type: 'preproc' });
    else if (lang === 'py' && m[2]) segments.push({ text: m[0], type: 'string' });
    else if (m[3] || m[4]) segments.push({ text: m[0], type: lang === 'py' ? 'number' : 'string' });
    else segments.push({ text: m[0], type: 'number' });
    lastIdx = TOKEN.lastIndex;
  }
  if (lastIdx < rest.length) segments.push({ text: rest.slice(lastIdx), type: 'plain' });

  return segments.map((seg, i) => {
    if (seg.type === 'comment') return <span key={i} style={{ color: 'hsl(var(--muted-fg))', fontStyle: 'italic' }}>{seg.text}</span>;
    if (seg.type === 'preproc') return <span key={i} style={{ color: 'hsl(var(--warn))' }}>{seg.text}</span>;
    if (seg.type === 'string')  return <span key={i} style={{ color: 'hsl(var(--good))' }}>{seg.text}</span>;
    if (seg.type === 'number')  return <span key={i} style={{ color: 'hsl(var(--info))' }}>{seg.text}</span>;
    // plain: split on keywords
    const parts = seg.text.split(KW_RE);
    return <span key={i}>{parts.map((p, j) => {
      if (!p) return null;
      KW_RE.lastIndex = 0;
      if (new RegExp(`^(${KW_RE.source.slice(3, -3)})$`).test(p)) {
        return <span key={j} style={{ color: 'hsl(var(--primary))' }}>{p}</span>;
      }
      if (p.includes('TODO')) {
        return <span key={j}>{p.split('TODO').map((t, k) => k === 0 ? t : <><span style={{ color: 'hsl(var(--warn))', fontWeight: 700 }}>TODO</span>{t}</>)}</span>;
      }
      return p;
    })}</span>;
  });
}

/* ── Props ─────────────────────────────────────────────────────────── */
interface Props {
  deviceId: string;
  deviceName: string;
  deviceProtocol: string;
  serialNumber?: string;
  onClose: () => void;
}

type Step = 'hardware' | 'config' | 'generating' | 'result';

export function CodeGenWizard({ deviceId, deviceName, deviceProtocol, onClose }: Props) {
  const [step, setStep]           = useState<Step>('hardware');
  const [hw, setHw]               = useState<HardwareOption | null>(null);
  const [cfg, setCfg]             = useState<Record<string, string | number>>({});
  const [code, setCode]           = useState('');
  const [editMode, setEditMode]   = useState(false);
  const [draftCode, setDraftCode] = useState('');
  const [copied, setCopied]       = useState(false);

  // Queue / streaming state
  const [queued, setQueued]   = useState(false);
  const [position, setPosition] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const codeRef  = useRef('');

  // Save state
  const [saving, setSaving]       = useState(false);
  const [saveName, setSaveName]   = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [savedId, setSavedId]     = useState<string | null>(null);

  /* ── Countdown ticker ── */
  useEffect(() => {
    if (!queued || countdown <= 0) return;
    const t = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [queued, countdown]);

  /* ── Select hardware ── */
  const selectHardware = (option: HardwareOption) => {
    setHw(option);
    const defaults: Record<string, string | number> = {};
    option.configFields.forEach(f => { defaults[f.key] = f.default; });
    setCfg(defaults);
    setStep('config');
  };

  /* ── Start streaming generation ── */
  const generate = useCallback(async () => {
    if (!hw) return;
    setStep('generating');
    setCode(''); setQueued(false); setPosition(0); codeRef.current = '';

    const token = useAuthStore.getState().accessToken;
    let controller: AbortController | null = new AbortController();
    abortRef.current = () => controller?.abort();

    try {
      const res = await fetch(`${API_BASE}/ai/codegen/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ deviceId, hardware: hw.id, config: cfg }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? 'Orion AI generation failed');
        setStep('config');
        return;
      }

      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const evt = JSON.parse(raw);
            if (evt.type === 'queued') {
              setQueued(true);
              setPosition(evt.position ?? 1);
              setCountdown(evt.estimatedSeconds ?? 60);
              if (evt.remaining != null) setRemaining(evt.remaining);
            } else if (evt.type === 'chunk') {
              setQueued(false);
              codeRef.current += evt.text;
              setCode(codeRef.current);
            } else if (evt.type === 'done') {
              if (evt.remaining != null) setRemaining(evt.remaining);
              // Strip any markdown fences
              const clean = codeRef.current.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
              codeRef.current = clean;
              setCode(clean);
              setDraftCode(clean);
              setSaveName(`${deviceName} · ${hw.label}`);
              setStep('result');
            } else if (evt.type === 'cancelled') {
              setStep('config');
            } else if (evt.type === 'error') {
              toast.error(evt.message ?? 'Orion AI error');
              setStep('config');
            }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        toast.error('Connection error');
        setStep('config');
      } else {
        setStep('config');
      }
    } finally {
      controller = null;
      abortRef.current = null;
    }
  }, [hw, cfg, deviceId, deviceName]);

  /* ── Cancel queue ── */
  const cancel = () => {
    abortRef.current?.();
    setStep('config');
    setQueued(false);
  };

  /* ── Copy ── */
  const handleCopy = async () => {
    await copyText(editMode ? draftCode : code);
    setCopied(true);
    toast.success('Code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  /* ── Download ── */
  const handleDownload = () => {
    if (!hw) return;
    const safeName = deviceName.toLowerCase().replace(/\s+/g, '_');
    const blob = new Blob([editMode ? draftCode : code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = `${safeName}_firmware.${hw.fileExt}`; a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Save ── */
  const handleSave = async () => {
    if (!hw || !saveName.trim()) return;
    setSaving(true);
    const finalCode = editMode ? draftCode : code;
    try {
      if (savedId) {
        await apiClient.patch(`/generated-codes/${savedId}`, { name: saveName, code: finalCode });
        toast.success('Saved!');
      } else {
        const res = await apiClient.post('/generated-codes', {
          deviceId, name: saveName, hardware: hw.id,
          protocol: deviceProtocol, code: finalCode,
        });
        setSavedId(res.data._id);
        toast.success('Saved to library!');
      }
      setShowSaveInput(false);
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const protocolColor = PROTOCOL_COLORS[deviceProtocol] ?? 'hsl(var(--fg))';
  const lang: 'c' | 'py' = hw?.fileExt === 'py' ? 'py' : 'c';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: 580, display: 'flex', flexDirection: 'column',
        background: 'hsl(var(--surface))', borderLeft: '1px solid hsl(var(--border))',
        boxShadow: '-24px 0 64px rgba(0,0,0,0.45)',
        animation: 'cg-slide 0.22s cubic-bezier(0.4,0,0.2,1)',
      }}>

        {/* ── Header ── */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid hsl(var(--border))', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {step !== 'hardware' && step !== 'generating' && (
            <button onClick={() => setStep(step === 'result' ? 'config' : 'hardware')} className="btn btn-ghost btn-sm btn-icon">
              <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} />
            </button>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="eyebrow" style={{ fontSize: 9 }}>
                {step === 'hardware' ? 'Step 1 · Select hardware' : step === 'config' ? 'Step 2 · Configure' : step === 'generating' ? 'Generating…' : 'Step 3 · Result'}
              </span>
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: protocolColor, letterSpacing: '0.08em' }}>
                {deviceProtocol.toUpperCase()}
              </span>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, marginTop: 1 }}>
              {step === 'hardware' && 'Orion AI — Select hardware'}
              {step === 'config'    && hw?.label}
              {step === 'generating' && <>Generating <em>firmware</em></>}
              {step === 'result'    && <>Generated <em>firmware</em></>}
            </div>
          </div>
          {remaining != null && (
            <span className="mono faint" style={{ fontSize: 9.5 }}>{remaining}/hr left</span>
          )}
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-icon"><X size={15} /></button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 2, background: 'hsl(var(--border))', flexShrink: 0 }}>
          <div style={{
            height: '100%', background: 'hsl(var(--primary))', transition: 'width 0.3s ease',
            width: step === 'hardware' ? '25%' : step === 'config' ? '50%' : step === 'generating' ? '75%' : '100%',
          }} />
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: step === 'result' ? 0 : 22 }}>

          {/* Step 1 — hardware */}
          {step === 'hardware' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="dim" style={{ fontSize: 12, marginBottom: 10 }}>
                Choose your hardware. The firmware will use <span style={{ color: protocolColor }}>{deviceProtocol.toUpperCase()}</span> as configured on this device.
              </p>
              {HARDWARE.map(h => (
                <button key={h.id} onClick={() => selectHardware(h)} className="panel" style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px',
                  cursor: 'pointer', textAlign: 'left', border: '1px solid hsl(var(--border))',
                  background: 'hsl(var(--bg))', width: '100%', transition: 'border-color 0.15s',
                }} onMouseEnter={e => (e.currentTarget.style.borderColor = 'hsl(var(--primary))')}
                   onMouseLeave={e => (e.currentTarget.style.borderColor = 'hsl(var(--border))')}>
                  <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'hsl(var(--surface-raised))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--primary))', flexShrink: 0 }}>
                    {h.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 14 }}>{h.label}</div>
                    <div className="mono faint" style={{ fontSize: 10, marginTop: 1 }}>{h.sublabel}</div>
                  </div>
                  <ChevronRight size={13} style={{ color: 'hsl(var(--muted-fg))' }} />
                </button>
              ))}
            </div>
          )}

          {/* Step 2 — config */}
          {step === 'config' && hw && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="tag" style={{ background: 'hsl(var(--surface-raised))', border: '1px solid hsl(var(--border))', fontSize: 10 }}>
                  {hw.label}
                </span>
                <span className="tag" style={{ background: 'hsl(var(--surface-raised))', border: `1px solid ${protocolColor}`, color: protocolColor, fontSize: 10 }}>
                  {deviceProtocol.toUpperCase()}
                </span>
              </div>
              <p className="dim" style={{ fontSize: 12 }}>
                Device credentials are injected automatically. Fill in the hardware-specific parameters below.
              </p>
              {hw.configFields.map(field => (
                <div key={field.key}>
                  <label style={{ display: 'block', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'hsl(var(--muted-fg))', marginBottom: 5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {field.label}
                  </label>
                  {field.type === 'select' ? (
                    <select className="input" value={cfg[field.key] ?? field.default} onChange={e => setCfg(c => ({ ...c, [field.key]: e.target.value }))}>
                      {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input className="input" type={field.type === 'number' ? 'number' : 'text'} value={cfg[field.key] ?? field.default}
                      onChange={e => setCfg(c => ({ ...c, [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value }))} />
                  )}
                </div>
              ))}
              <div style={{ paddingTop: 8, display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={generate}>
                  Generate firmware
                </button>
                <button className="btn btn-ghost" onClick={() => setStep('hardware')}>Back</button>
              </div>
            </div>
          )}

          {/* Step 3 — generating (streaming + queue) */}
          {step === 'generating' && (
            <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
              {queued ? (
                <>
                  <div style={{ width: 48, height: 48, border: '2px solid hsl(var(--border))', borderTopColor: 'hsl(var(--primary))', borderRadius: '50%', animation: 'cg-spin 0.9s linear infinite' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>
                      {position} request{position !== 1 ? 's' : ''} ahead
                    </div>
                    <div className="mono faint" style={{ fontSize: 11, marginTop: 6 }}>
                      Estimated wait · <span style={{ color: 'hsl(var(--primary))' }}>{countdown}s</span>
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={cancel} style={{ marginTop: 8 }}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <div style={{ width: 44, height: 44, border: '2px solid hsl(var(--border))', borderTopColor: 'hsl(var(--primary))', borderRadius: '50%', animation: 'cg-spin 0.7s linear infinite' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>
                      Orion AI is writing your firmware
                    </div>
                    <div className="mono faint" style={{ fontSize: 10.5, marginTop: 5 }}>
                      {hw?.label} · {deviceProtocol.toUpperCase()}
                    </div>
                  </div>
                  {code && (
                    <pre style={{
                      width: '100%', maxHeight: 200, overflowY: 'auto', margin: 0,
                      padding: '12px 14px', background: 'hsl(var(--bg))',
                      border: '1px solid hsl(var(--border))', fontFamily: 'var(--font-mono)',
                      fontSize: 10, lineHeight: 1.6, whiteSpace: 'pre', overflowX: 'auto',
                    }}>
                      {code}<span style={{ animation: 'cg-blink 1s step-end infinite', color: 'hsl(var(--primary))' }}>▌</span>
                    </pre>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 4 — result */}
          {step === 'result' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* Toolbar */}
              <div style={{ padding: '10px 22px', borderBottom: '1px solid hsl(var(--border))', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span className="mono faint" style={{ fontSize: 10, flex: 1 }}>
                  {hw?.label} · <span style={{ color: protocolColor }}>{deviceProtocol.toUpperCase()}</span>
                  {savedId && <span style={{ color: 'hsl(var(--good))', marginLeft: 8 }}>· Saved</span>}
                </span>
                <button
                  className={`btn btn-ghost btn-sm btn-icon${editMode ? ' active' : ''}`}
                  onClick={() => { setEditMode(v => !v); setDraftCode(code); }}
                  title={editMode ? 'View' : 'Edit'}
                  style={{ color: editMode ? 'hsl(var(--primary))' : undefined }}
                >
                  <Pencil size={12} />
                </button>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={handleCopy} title="Copy">
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                </button>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={handleDownload} title="Download">
                  <Download size={12} />
                </button>
                {!showSaveInput && (
                  <button className="btn btn-sm" style={{ gap: 5 }} onClick={() => setShowSaveInput(true)}>
                    <Save size={11} /> {savedId ? 'Update' : 'Save'}
                  </button>
                )}
              </div>

              {/* Save name input */}
              {showSaveInput && (
                <div style={{ padding: '10px 22px', borderBottom: '1px solid hsl(var(--border))', display: 'flex', gap: 8, flexShrink: 0, background: 'hsl(var(--surface-raised))' }}>
                  <input
                    className="input"
                    style={{ flex: 1, fontSize: 12 }}
                    placeholder="Name this snippet…"
                    value={saveName}
                    onChange={e => setSaveName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                    autoFocus
                  />
                  <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !saveName.trim()}>
                    {saving ? <Loader size={11} style={{ animation: 'cg-spin 0.7s linear infinite' }} /> : 'Save'}
                  </button>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowSaveInput(false)}><X size={12} /></button>
                </div>
              )}

              {/* Code view / edit */}
              {editMode ? (
                <textarea
                  value={draftCode}
                  onChange={e => setDraftCode(e.target.value)}
                  spellCheck={false}
                  style={{
                    flex: 1, resize: 'none', margin: 0, padding: '16px 20px',
                    background: 'hsl(var(--bg))', border: 'none', outline: 'none',
                    fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.65,
                    color: 'hsl(var(--fg))', whiteSpace: 'pre', overflowX: 'auto',
                    minHeight: 400,
                  }}
                />
              ) : (
                <pre style={{
                  flex: 1, margin: 0, padding: '16px 20px', overflowY: 'auto', overflowX: 'auto',
                  background: 'hsl(var(--bg))', fontFamily: 'var(--font-mono)',
                  fontSize: 11, lineHeight: 1.65, whiteSpace: 'pre',
                  minHeight: 400,
                }}>
                  {highlight(code, lang)}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {step === 'result' && (
          <div style={{ padding: '12px 22px', borderTop: '1px solid hsl(var(--border))', display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="btn btn-primary btn-sm" style={{ gap: 6 }} onClick={() => { setStep('hardware'); setCode(''); setSavedId(null); }}>
              Generate another
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
            {editMode && draftCode !== code && (
              <button className="btn btn-sm" style={{ marginLeft: 'auto', gap: 5 }} onClick={() => { setCode(draftCode); setEditMode(false); if (savedId) handleSave(); }}>
                <Check size={11} /> Apply changes
              </button>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes cg-slide { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes cg-spin  { to { transform: rotate(360deg); } }
        @keyframes cg-blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}
