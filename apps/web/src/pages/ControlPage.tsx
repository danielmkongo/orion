import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import apiClient from '@/api/client';
import { devicesApi } from '@/api/devices';
import { timeAgo } from '@/lib/utils';
import {
  Send, Loader2,
  Terminal, RefreshCw, SlidersHorizontal,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { CommandWidget } from '@/components/devices/CommandWidget';
import type { DeviceCommand } from '@/components/devices/CommandWidget';

const CMD_STATUS_CFG: Record<string, { tag: string }> = {
  pending:      { tag: 'tag-warn'    },
  sent:         { tag: 'tag-info'    },
  acknowledged: { tag: 'tag-info'    },
  executed:     { tag: 'tag-online'  },
  failed:       { tag: 'tag-error'   },
  timeout:      { tag: 'tag-error'   },
  cancelled:    { tag: 'tag-offline' },
};

export function ControlPage() {
  const [deviceId, setDeviceId]     = useState('');
  const [cmdName, setCmdName]       = useState('');
  const [payload, setPayload]       = useState('{}');
  const [terminalOpen, setTerminal] = useState(false);
  const [sending, setSending]       = useState(false);
  const queryClient = useQueryClient();

  const { data: devicesData } = useQuery({
    queryKey: ['devices', 'control-page'],
    queryFn: () => devicesApi.list({ limit: 100 }),
  });

  const { data: commandsData, isLoading: cmdLoading } = useQuery({
    queryKey: ['commands', 'all'],
    queryFn: () => apiClient.get('/commands', { params: { limit: 50 } }).then(r => r.data),
    refetchInterval: 8_000,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/commands/${id}/cancel`),
    onSuccess: () => { toast.success('Cancelled'); queryClient.invalidateQueries({ queryKey: ['commands'] }); },
  });

  const devices  = devicesData?.devices ?? [];
  const commands = commandsData?.data ?? commandsData?.commands ?? [];

  useEffect(() => {
    if (!deviceId && devices.length > 0) setDeviceId((devices[0] as any)._id);
  }, [devices, deviceId]);

  const selectedDevice = devices.find((d: any) => d._id === deviceId) as any;
  const schemaCommands: DeviceCommand[] = selectedDevice?.meta?.commands ?? [];

  const sendControl = async (name: string, formattedPayload: string) => {
    if (!deviceId) return;
    try {
      let parsed = {};
      try { parsed = JSON.parse(formattedPayload); } catch {}
      await apiClient.post('/commands', { deviceId, name, payload: parsed });
      toast.success(`Sent: ${name}`);
      queryClient.invalidateQueries({ queryKey: ['commands'] });
    } catch { toast.error('Failed to send command'); }
  };

  const sendTerminal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceId || !cmdName) return;
    setSending(true);
    try {
      let p = {};
      try { p = JSON.parse(payload); } catch {}
      await apiClient.post('/commands', { deviceId, name: cmdName, payload: p });
      toast.success('Command sent');
      setCmdName(''); setPayload('{}');
      queryClient.invalidateQueries({ queryKey: ['commands'] });
    } catch { toast.error('Failed'); }
    finally { setSending(false); }
  };

  const actionCmds = schemaCommands.filter(c => c.type === 'action');
  const boolCmds   = schemaCommands.filter(c => c.type === 'boolean');
  const numberCmds = schemaCommands.filter(c => c.type === 'number');
  const enumCmds   = schemaCommands.filter(c => c.type === 'enum');
  const stringCmds = schemaCommands.filter(c => c.type === 'string');

  return (
    <div className="page">
      {/* ── Page header ── */}
      <div className="ph">
        <div>
          <div style={{ marginBottom: 6 }}><span className="eyebrow">Operate · Remote control</span></div>
          <h1><em>Control</em>.</h1>
          <p className="lede">Send schema-driven commands and operate devices in real time via MQTT or HTTP.</p>
        </div>
      </div>

      {/* ── Device selector strip ── */}
      <div style={{
        borderTop: '2px solid hsl(var(--fg))', borderBottom: '1px solid hsl(var(--border))',
        display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto',
        marginBottom: 8,
      }}>
        {(devices as any[]).map(d => (
          <button
            key={d._id}
            onClick={() => setDeviceId(d._id)}
            style={{
              padding: '10px 18px', flexShrink: 0, fontSize: 13,
              fontWeight: deviceId === d._id ? 500 : 400,
              color: deviceId === d._id ? 'hsl(var(--fg))' : 'hsl(var(--muted-fg))',
              background: 'transparent', border: 'none',
              borderTop: `2px solid ${deviceId === d._id ? 'hsl(var(--primary))' : 'transparent'}`,
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: d.status === 'online' ? 'hsl(var(--good))' : 'hsl(var(--muted-fg))',
                flexShrink: 0,
              }} />
              {d.name}
            </span>
          </button>
        ))}
        {devices.length === 0 && (
          <span className="dim" style={{ padding: '10px 18px', fontSize: 13 }}>No devices found</span>
        )}
      </div>

      {/* ── Section I: Controls ── */}
      {deviceId && (
        <div className="section">
          <div>
            <div className="ssh">Device<br />Controls</div>
            <p className="dim" style={{ fontSize: 13, marginTop: 8, maxWidth: '22ch' }}>
              {selectedDevice?.name}<br />
              {schemaCommands.length} command{schemaCommands.length !== 1 ? 's' : ''} defined.
            </p>
          </div>
          <div>
            {schemaCommands.length === 0 ? (
              <div className="panel" style={{ padding: '48px 24px', textAlign: 'center' }}>
                <SlidersHorizontal size={28} style={{ color: 'hsl(var(--muted-fg))', margin: '0 auto 12px' }} />
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, marginBottom: 8 }}>
                  No <em style={{ color: 'hsl(var(--primary))' }}>commands</em> defined
                </div>
                <p className="dim" style={{ fontSize: 13 }}>
                  Add commands in the device settings to generate controls automatically.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                {actionCmds.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <Terminal size={13} className="faint" />
                      <span className="eyebrow" style={{ fontSize: 9 }}>Actions</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                      {actionCmds.map((cmd, i) => (
                        <motion.div key={cmd.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                          <CommandWidget cmd={cmd} payloadFormat={selectedDevice?.payloadFormat} onSend={sendControl} />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
                {boolCmds.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span className="eyebrow" style={{ fontSize: 9 }}>Toggles</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                      {boolCmds.map((cmd, i) => (
                        <motion.div key={cmd.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                          <CommandWidget cmd={cmd} payloadFormat={selectedDevice?.payloadFormat} onSend={sendControl} />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
                {numberCmds.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span className="eyebrow" style={{ fontSize: 9 }}>Setpoints</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                      {numberCmds.map((cmd, i) => (
                        <motion.div key={cmd.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                          <CommandWidget cmd={cmd} payloadFormat={selectedDevice?.payloadFormat} onSend={sendControl} />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
                {enumCmds.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span className="eyebrow" style={{ fontSize: 9 }}>Selectors</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                      {enumCmds.map((cmd, i) => (
                        <motion.div key={cmd.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                          <CommandWidget cmd={cmd} payloadFormat={selectedDevice?.payloadFormat} onSend={sendControl} />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
                {stringCmds.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span className="eyebrow" style={{ fontSize: 9 }}>Text Controls</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                      {stringCmds.map((cmd, i) => (
                        <motion.div key={cmd.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                          <CommandWidget cmd={cmd} payloadFormat={selectedDevice?.payloadFormat} onSend={sendControl} />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Section II: Raw Terminal ── */}
      <div className="section">
        <div>
          <div className="ssh">Raw<br />Terminal</div>
          <p className="dim" style={{ fontSize: 13, marginTop: 8, maxWidth: '22ch' }}>
            Send arbitrary commands with a custom JSON payload.
          </p>
          <button
            className="btn btn-ghost btn-sm" style={{ marginTop: 12, gap: 6, fontSize: 12 }}
            onClick={() => setTerminal(v => !v)}
          >
            <Terminal size={12} /> {terminalOpen ? 'Collapse' : 'Expand'}
          </button>
        </div>
        <div>
          {terminalOpen ? (
            <div className="panel" style={{ padding: 20 }}>
              <form onSubmit={sendTerminal} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                <div style={{ minWidth: 200 }}>
                  <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Target device</label>
                  <select value={deviceId} onChange={e => setDeviceId(e.target.value)} className="select" required>
                    <option value="">Select device…</option>
                    {(devices as any[]).map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                  </select>
                </div>
                <div style={{ minWidth: 180 }}>
                  <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Command name</label>
                  <input value={cmdName} onChange={e => setCmdName(e.target.value)} className="input mono" placeholder="reboot, get_status…" required />
                </div>
                <div style={{ minWidth: 240, flex: 1 }}>
                  <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Payload (JSON)</label>
                  <input value={payload} onChange={e => setPayload(e.target.value)} className="input mono" style={{ fontSize: 12 }} placeholder="{}" />
                </div>
                <button type="submit" disabled={sending || !deviceId} className="btn btn-primary" style={{ gap: 6 }}>
                  {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </form>
            </div>
          ) : (
            <div className="panel" style={{ padding: '14px 20px' }}>
              <p className="dim" style={{ fontSize: 13 }}>Terminal collapsed. Click Expand to open.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Section III: Command History ── */}
      <div className="section">
        <div>
          <div className="ssh">Command<br />History</div>
          <p className="dim" style={{ fontSize: 13, marginTop: 8, maxWidth: '22ch' }}>
            {commands.length} record{commands.length !== 1 ? 's' : ''} dispatched.
          </p>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['commands'] })}
            className="btn btn-ghost btn-sm btn-icon" style={{ marginTop: 12 }}
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
        </div>
        <div className="panel table-responsive">
          {cmdLoading ? (
            <div style={{ padding: 32, textAlign: 'center' }} className="mono faint">Loading…</div>
          ) : commands.length === 0 ? (
            <div style={{ padding: '48px 16px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, marginBottom: 8 }}>
                No <em style={{ color: 'hsl(var(--primary))' }}>commands</em> yet
              </div>
              <p className="dim" style={{ fontSize: 13 }}>Use controls above or the terminal to send commands.</p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>№</th>
                  <th>Device</th>
                  <th>Command</th>
                  <th>Status</th>
                  <th className="hide-sm">Sent</th>
                  <th className="hide-sm">Response</th>
                  <th style={{ width: 60 }} />
                </tr>
              </thead>
              <tbody>
                {(commands as any[]).map((cmd, i) => {
                  const sc = CMD_STATUS_CFG[cmd.status] ?? { tag: 'tag-offline' };
                  const devName = (devices as any[]).find(d => d._id === cmd.deviceId)?.name ?? (
                    <span className="mono faint">{cmd.deviceId?.slice(-8)}</span>
                  );
                  return (
                    <motion.tr key={cmd._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}>
                      <td className="row-n">{String(i + 1).padStart(2, '0')}</td>
                      <td style={{ fontSize: 13 }}>{devName}</td>
                      <td><code className="acc mono" style={{ fontSize: 12 }}>{cmd.name}</code></td>
                      <td><span className={`tag ${sc.tag}`}>{cmd.status}</span></td>
                      <td className="hide-sm mono faint" style={{ fontSize: 11 }}>{timeAgo(cmd.createdAt)}</td>
                      <td className="hide-sm mono faint" style={{ fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cmd.errorMessage ?? (cmd.response ? JSON.stringify(cmd.response).slice(0, 50) : '—')}
                      </td>
                      <td>
                        {['pending', 'sent'].includes(cmd.status) && (
                          <button onClick={() => cancelMutation.mutate(cmd._id)}
                            className="btn btn-ghost btn-sm" style={{ color: 'hsl(var(--bad))', fontSize: 11 }}>
                            Cancel
                          </button>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
