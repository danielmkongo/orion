import { useState } from 'react';
import { motion } from 'framer-motion';
import { Send, Minus, Plus } from 'lucide-react';

export interface DeviceCommand {
  name: string;
  label?: string;
  type: 'action' | 'boolean' | 'number' | 'enum' | 'string';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  values?: string[];
}

interface CommandWidgetProps {
  cmd: DeviceCommand;
  payloadFormat?: string;
  onSend: (name: string, payload: string) => void;
  compact?: boolean;
}

function formatPayload(cmd: DeviceCommand, value: unknown, payloadFormat?: string): string {
  const name = cmd.name;
  switch (payloadFormat) {
    case 'xml':
      return `<command><name>${name}</name><value>${value}</value></command>`;
    case 'csv':
      return `${name},${value}`;
    default:
      return JSON.stringify({ [name]: value });
  }
}

export function CommandWidget({ cmd, payloadFormat, onSend, compact = false }: CommandWidgetProps) {
  const [boolOn, setBoolOn] = useState(false);
  const [numVal, setNumVal] = useState<number>(cmd.min ?? 0);
  const [numDirty, setNumDirty] = useState(false);
  const [enumVal, setEnumVal] = useState<string>(cmd.values?.[0] ?? '');
  const [strVal, setStrVal] = useState('');

  const label = cmd.label || cmd.name;
  const min = cmd.min ?? 0;
  const max = cmd.max ?? 100;
  const step = cmd.step ?? 1;

  const panelStyle: React.CSSProperties = compact
    ? { padding: '12px 16px' }
    : { padding: '16px 20px' };

  const titleStyle: React.CSSProperties = compact
    ? { fontSize: 13, fontWeight: 500 }
    : { fontSize: 14.5, fontWeight: 500 };

  const eyebrowStyle: React.CSSProperties = { fontSize: 9, marginTop: 3 };

  /* ── Action button ─────────────────────────── */
  if (cmd.type === 'action') {
    return (
      <motion.div
        className="panel"
        style={panelStyle}
        initial={compact ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={titleStyle}>{label}</div>
            <div className="eyebrow" style={eyebrowStyle}>Action · {cmd.name}</div>
          </div>
          <button
            onClick={() => onSend(cmd.name, formatPayload(cmd, null, payloadFormat))}
            className="btn btn-primary btn-sm"
            style={{ gap: 5, flexShrink: 0 }}
          >
            <Send size={11} /> {compact ? 'Send' : `Trigger ${label}`}
          </button>
        </div>
      </motion.div>
    );
  }

  /* ── Boolean toggle ────────────────────────── */
  if (cmd.type === 'boolean') {
    return (
      <motion.div
        className="panel"
        style={panelStyle}
        initial={compact ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={titleStyle}>{label}</div>
            <div className="eyebrow" style={eyebrowStyle}>Toggle · {cmd.name}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{
              fontSize: 11, fontFamily: 'var(--font-mono)',
              color: boolOn ? 'hsl(var(--good))' : 'hsl(var(--muted-fg))',
            }}>
              {boolOn ? 'ON' : 'OFF'}
            </span>
            <label className="switch">
              <input
                type="checkbox"
                checked={boolOn}
                onChange={e => {
                  setBoolOn(e.target.checked);
                  onSend(cmd.name, formatPayload(cmd, e.target.checked, payloadFormat));
                }}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span />
            </label>
          </div>
        </div>
      </motion.div>
    );
  }

  /* ── Number / slider ───────────────────────── */
  if (cmd.type === 'number') {
    const pct = max > min ? ((numVal - min) / (max - min)) * 100 : 0;
    return (
      <motion.div
        className="panel"
        style={{ ...panelStyle, display: 'flex', flexDirection: 'column', gap: compact ? 10 : 14 }}
        initial={compact ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={titleStyle}>{label}</div>
            <div className="eyebrow" style={eyebrowStyle}>
              Slider{cmd.unit ? ` · ${cmd.unit}` : ''} · {cmd.name}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <button
              onClick={() => { setNumVal(v => Math.max(min, +(v - step).toFixed(10))); setNumDirty(true); }}
              className="btn btn-ghost btn-sm btn-icon"
            ><Minus size={11} /></button>
            <input
              type="number" value={numVal} min={min} max={max} step={step}
              onChange={e => { setNumVal(Number(e.target.value)); setNumDirty(true); }}
              className="input mono"
              style={{ width: 68, height: 30, textAlign: 'center', fontSize: 13 }}
            />
            <button
              onClick={() => { setNumVal(v => Math.min(max, +(v + step).toFixed(10))); setNumDirty(true); }}
              className="btn btn-ghost btn-sm btn-icon"
            ><Plus size={11} /></button>
            {cmd.unit && <span className="mono faint" style={{ fontSize: 12 }}>{cmd.unit}</span>}
          </div>
        </div>
        <input
          type="range" min={min} max={max} step={step} value={numVal}
          onChange={e => { setNumVal(Number(e.target.value)); setNumDirty(true); }}
          style={{ width: '100%', accentColor: 'hsl(var(--primary))', cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="mono faint" style={{ fontSize: 10 }}>{min}{cmd.unit ? ` ${cmd.unit}` : ''}</span>
          <span className="mono faint" style={{ fontSize: 10 }}>{((min + max) / 2).toFixed(step < 1 ? 1 : 0)}</span>
          <span className="mono faint" style={{ fontSize: 10 }}>{max}{cmd.unit ? ` ${cmd.unit}` : ''}</span>
        </div>
        <button
          onClick={() => { onSend(cmd.name, formatPayload(cmd, numVal, payloadFormat)); setNumDirty(false); }}
          disabled={!numDirty}
          className="btn btn-primary btn-sm"
          style={{ gap: 5 }}
        >
          <Send size={11} /> Set {label} · {numVal}{cmd.unit ? ` ${cmd.unit}` : ''}
        </button>
      </motion.div>
    );
  }

  /* ── Enum / select ─────────────────────────── */
  if (cmd.type === 'enum') {
    const options = cmd.values ?? [];
    return (
      <motion.div
        className="panel"
        style={panelStyle}
        initial={compact ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <div style={titleStyle}>{label}</div>
          <div className="eyebrow" style={eyebrowStyle}>Select · {cmd.name}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: compact ? 10 : 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => { setEnumVal(opt); onSend(cmd.name, formatPayload(cmd, opt, payloadFormat)); }}
              className="btn btn-sm"
              style={{
                fontSize: 12,
                background: enumVal === opt ? 'hsl(var(--primary))' : 'transparent',
                color: enumVal === opt ? '#fff' : 'inherit',
                border: `1px solid ${enumVal === opt ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`,
              }}
            >
              {opt}
            </button>
          ))}
          {options.length === 0 && <span className="dim" style={{ fontSize: 12 }}>No options defined</span>}
        </div>
      </motion.div>
    );
  }

  /* ── String / text ─────────────────────────── */
  if (cmd.type === 'string') {
    return (
      <motion.div
        className="panel"
        style={{ ...panelStyle, display: 'flex', flexDirection: 'column', gap: compact ? 8 : 12 }}
        initial={compact ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <div style={titleStyle}>{label}</div>
          <div className="eyebrow" style={eyebrowStyle}>Text · {cmd.name}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={strVal}
            onChange={e => setStrVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && strVal.trim()) {
                onSend(cmd.name, formatPayload(cmd, strVal, payloadFormat));
                setStrVal('');
              }
            }}
            placeholder={`Enter ${label}…`}
            className="input"
            style={{ flex: 1 }}
          />
          <button
            onClick={() => {
              if (strVal.trim()) {
                onSend(cmd.name, formatPayload(cmd, strVal, payloadFormat));
                setStrVal('');
              }
            }}
            disabled={!strVal.trim()}
            className="btn btn-primary btn-sm"
          >
            <Send size={11} />
          </button>
        </div>
      </motion.div>
    );
  }

  return null;
}
