import { useState } from 'react';
import { X, Copy, Download, ChevronRight, Wifi, Radio, Cpu, Terminal, Check } from 'lucide-react';
import apiClient from '@/api/client';
import toast from 'react-hot-toast';
import { copyText } from '@/lib/utils';

/* ── Hardware catalogue ────────────────────────────────────────────── */
interface HardwareOption {
  id: string;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  fileExt: string;
  configFields: ConfigField[];
}

interface ConfigField {
  key: string;
  label: string;
  type: 'number' | 'text' | 'select';
  default: string | number;
  options?: string[];
  hint?: string;
}

const HARDWARE: HardwareOption[] = [
  {
    id: 'esp32-wifi',
    label: 'ESP32 + WiFi',
    sublabel: 'WiFi.h · HTTPClient.h',
    icon: <Wifi size={20} />,
    fileExt: 'ino',
    configFields: [
      { key: 'intervalSeconds', label: 'Send interval (seconds)', type: 'number', default: 60 },
      { key: 'deepSleep', label: 'Deep sleep between sends', type: 'select', default: 'no', options: ['no', 'yes'] },
    ],
  },
  {
    id: 'esp32-ppp',
    label: 'ESP32 + SIMCom GSM',
    sublabel: 'PPP · Arduino-esp32',
    icon: <Radio size={20} />,
    fileExt: 'ino',
    configFields: [
      { key: 'intervalSeconds', label: 'Send interval (seconds)', type: 'number', default: 60 },
      { key: 'modemModel',      label: 'Modem model',             type: 'select', default: 'SIM800', options: ['SIM800', 'SIM7600'] },
      { key: 'apn',             label: 'APN',                     type: 'text',   default: 'internet' },
      { key: 'txPin',           label: 'UART TX pin (modem RX)',  type: 'number', default: 17 },
      { key: 'rxPin',           label: 'UART RX pin (modem TX)',  type: 'number', default: 16 },
      { key: 'rstPin',          label: 'Reset pin',               type: 'number', default: 5 },
    ],
  },
  {
    id: 'esp32-at',
    label: 'ESP32 + GSM (AT)',
    sublabel: 'AT commands · HardwareSerial',
    icon: <Terminal size={20} />,
    fileExt: 'ino',
    configFields: [
      { key: 'intervalSeconds', label: 'Send interval (seconds)', type: 'number', default: 60 },
      { key: 'apn',             label: 'APN',                     type: 'text',   default: 'internet' },
      { key: 'txPin',           label: 'UART TX pin (modem RX)',  type: 'number', default: 17 },
      { key: 'rxPin',           label: 'UART RX pin (modem TX)',  type: 'number', default: 16 },
    ],
  },
  {
    id: 'arduino-sim800',
    label: 'Arduino + SIM800',
    sublabel: 'SoftwareSerial · AT commands',
    icon: <Cpu size={20} />,
    fileExt: 'ino',
    configFields: [
      { key: 'intervalSeconds', label: 'Send interval (seconds)', type: 'number', default: 60 },
      { key: 'apn',             label: 'APN',                     type: 'text',   default: 'internet' },
      { key: 'rxPin',           label: 'SoftwareSerial RX pin',   type: 'number', default: 7 },
      { key: 'txPin',           label: 'SoftwareSerial TX pin',   type: 'number', default: 8 },
    ],
  },
  {
    id: 'pico-w',
    label: 'Raspberry Pi Pico W',
    sublabel: 'MicroPython · urequests',
    icon: <Cpu size={20} />,
    fileExt: 'py',
    configFields: [
      { key: 'intervalSeconds', label: 'Send interval (seconds)', type: 'number', default: 60 },
      { key: 'deepSleep', label: 'Deep sleep between sends', type: 'select', default: 'no', options: ['no', 'yes'] },
    ],
  },
];

type Step = 'hardware' | 'config' | 'code';

interface Props {
  deviceId: string;
  deviceName: string;
  onClose: () => void;
}

export function CodeGenWizard({ deviceId, deviceName, onClose }: Props) {
  const [step, setStep] = useState<Step>('hardware');
  const [selectedHw, setSelectedHw] = useState<HardwareOption | null>(null);
  const [config, setConfig] = useState<Record<string, string | number>>({});
  const [generatedCode, setGeneratedCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const selectHardware = (hw: HardwareOption) => {
    setSelectedHw(hw);
    const defaults: Record<string, string | number> = {};
    hw.configFields.forEach(f => { defaults[f.key] = f.default; });
    setConfig(defaults);
    setStep('config');
  };

  const generate = async () => {
    if (!selectedHw) return;
    setLoading(true);
    try {
      const res = await apiClient.post('/ai/codegen', {
        deviceId,
        hardware: selectedHw.id,
        config,
      });
      setGeneratedCode(res.data.code ?? '');
      setStep('code');
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Code generation failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    await copyText(generatedCode);
    setCopied(true);
    toast.success('Code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!selectedHw) return;
    const safeName = deviceName.toLowerCase().replace(/\s+/g, '_');
    const filename = `${safeName}_firmware.${selectedHw.fileExt}`;
    const blob = new Blob([generatedCode], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        width: 560, height: '100vh', display: 'flex', flexDirection: 'column',
        background: 'hsl(var(--surface))', borderLeft: '1px solid hsl(var(--border))',
        boxShadow: '-16px 0 48px rgba(0,0,0,0.4)',
        animation: 'slideInRight 0.22s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid hsl(var(--border))',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {step !== 'hardware' && (
                <button
                  onClick={() => setStep(step === 'code' ? 'config' : 'hardware')}
                  className="btn btn-ghost btn-sm btn-icon"
                  style={{ marginRight: 4 }}
                >
                  <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} />
                </button>
              )}
              <div className="eyebrow" style={{ fontSize: 9 }}>
                {step === 'hardware' ? 'Step 1 of 3' : step === 'config' ? 'Step 2 of 3' : 'Step 3 of 3'}
              </div>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, marginTop: 2 }}>
              {step === 'hardware' && 'Select hardware'}
              {step === 'config'   && selectedHw?.label}
              {step === 'code'     && <>Generated <em>firmware</em></>}
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-icon"><X size={16} /></button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 2, background: 'hsl(var(--border))', flexShrink: 0 }}>
          <div style={{
            height: '100%', background: 'hsl(var(--primary))', transition: 'width 0.3s ease',
            width: step === 'hardware' ? '33%' : step === 'config' ? '66%' : '100%',
          }} />
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

          {/* ── Step 1: hardware selection ── */}
          {step === 'hardware' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p className="dim" style={{ fontSize: 13, marginBottom: 8 }}>
                Choose the microcontroller and connectivity method. The firmware will be tailored to your device's data schema and API credentials.
              </p>
              {HARDWARE.map(hw => (
                <button
                  key={hw.id}
                  onClick={() => selectHardware(hw)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px',
                    background: 'hsl(var(--bg))', border: '1px solid hsl(var(--border))',
                    cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s, background 0.15s',
                    width: '100%',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'hsl(var(--primary))';
                    (e.currentTarget as HTMLElement).style.background = 'hsl(var(--surface-raised))';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'hsl(var(--border))';
                    (e.currentTarget as HTMLElement).style.background = 'hsl(var(--bg))';
                  }}
                >
                  <div style={{
                    width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'hsl(var(--surface-raised))', border: '1px solid hsl(var(--border))',
                    color: 'hsl(var(--primary))', flexShrink: 0,
                  }}>
                    {hw.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>{hw.label}</div>
                    <div className="mono faint" style={{ fontSize: 10.5, marginTop: 2 }}>{hw.sublabel}</div>
                  </div>
                  <ChevronRight size={14} style={{ color: 'hsl(var(--muted-fg))', flexShrink: 0 }} />
                </button>
              ))}
            </div>
          )}

          {/* ── Step 2: config ── */}
          {step === 'config' && selectedHw && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <p className="dim" style={{ fontSize: 13 }}>
                Customise the hardware parameters. The device API key and endpoint are injected automatically from your device profile.
              </p>
              {selectedHw.configFields.map(field => (
                <div key={field.key}>
                  <label style={{ display: 'block', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'hsl(var(--muted-fg))', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {field.label}
                  </label>
                  {field.type === 'select' ? (
                    <select
                      className="input"
                      value={config[field.key] ?? field.default}
                      onChange={e => setConfig(c => ({ ...c, [field.key]: e.target.value }))}
                    >
                      {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      className="input"
                      type={field.type === 'number' ? 'number' : 'text'}
                      value={config[field.key] ?? field.default}
                      onChange={e => setConfig(c => ({
                        ...c,
                        [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value,
                      }))}
                    />
                  )}
                  {field.hint && <p className="dim" style={{ fontSize: 11, marginTop: 4 }}>{field.hint}</p>}
                </div>
              ))}

              <div style={{ borderTop: '1px solid hsl(var(--border))', paddingTop: 20, display: 'flex', gap: 10 }}>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1, gap: 8 }}
                  onClick={generate}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                      Generating…
                    </>
                  ) : 'Generate firmware'}
                </button>
                <button className="btn btn-ghost" onClick={() => setStep('hardware')}>Back</button>
              </div>
            </div>
          )}

          {/* ── Step 3: generated code ── */}
          {step === 'code' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
              <div style={{
                background: 'hsl(var(--bg))', border: '1px solid hsl(var(--border))',
                padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'hsl(var(--muted-fg))' }}>
                    {selectedHw?.label} · <span style={{ color: 'hsl(var(--good))' }}>Ready to flash</span>
                  </div>
                  <div className="mono faint" style={{ fontSize: 9.5, marginTop: 2 }}>
                    Fill in TODO stubs with your sensor read logic before flashing.
                  </div>
                </div>
              </div>

              <pre style={{
                flex: 1, margin: 0, padding: '16px 18px', overflowY: 'auto',
                background: 'hsl(var(--bg))', border: '1px solid hsl(var(--border))',
                fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.65,
                whiteSpace: 'pre', overflowX: 'auto',
                maxHeight: 'calc(100vh - 340px)',
              }}>
                {generatedCode}
              </pre>
            </div>
          )}
        </div>

        {/* Footer actions (code step only) */}
        {step === 'code' && (
          <div style={{
            padding: '14px 24px', borderTop: '1px solid hsl(var(--border))',
            display: 'flex', gap: 10, flexShrink: 0,
          }}>
            <button className="btn btn-primary" style={{ gap: 7, flex: 1 }} onClick={handleCopy}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied!' : 'Copy code'}
            </button>
            <button className="btn btn-outline" style={{ gap: 7 }} onClick={handleDownload}>
              <Download size={13} />
              Download
            </button>
            <button className="btn btn-ghost" onClick={() => setStep('hardware')}>
              Regenerate
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
