import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import apiClient from '@/api/client';
import { devicesApi } from '@/api/devices';
import { timeAgo } from '@/lib/utils';
import { Terminal, Send, Loader2, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

export function CommandsPage() {
  const [deviceId, setDeviceId]     = useState('');
  const [cmdName, setCmdName]       = useState('');
  const [payload, setPayload]       = useState('{}');
  const [sending, setSending]       = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const queryClient = useQueryClient();

  const { data: devicesData } = useQuery({
    queryKey: ['devices', 'commands-page'],
    queryFn: () => devicesApi.list({ limit: 100 }),
  });

  const { data: commandsData, isLoading } = useQuery({
    queryKey: ['commands', deviceId],
    queryFn: () => apiClient.get('/commands', {
      params: { limit: 100, ...(deviceId ? { deviceId } : {}) },
    }).then(r => r.data),
    refetchInterval: 10_000,
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => apiClient.post(`/commands/${id}/cancel`),
    onSuccess: () => { toast.success('Cancelled'); queryClient.invalidateQueries({ queryKey: ['commands'] }); },
  });

  const devices  = devicesData?.devices ?? [];
  const commands = commandsData?.data ?? commandsData?.commands ?? [];

  const selectedDevice = (devices as any[]).find(d => (d._id ?? d.id) === deviceId) as any;
  const schemaCommands: any[] = selectedDevice?.meta?.commands ?? [];

  const sendCmd = async (name: string, p: object = {}) => {
    if (!deviceId) { toast.error('Select a device first'); return; }
    setSending(true);
    try {
      await apiClient.post('/commands', { deviceId, name, payload: p });
      toast.success(`Command "${name}" sent`);
      queryClient.invalidateQueries({ queryKey: ['commands'] });
    } catch { toast.error('Failed to send command'); }
    finally { setSending(false); }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cmdName) return;
    let p = {};
    try { p = JSON.parse(payload); } catch {}
    await sendCmd(cmdName, p);
    setCmdName(''); setPayload('{}');
  };

  const filtered = deviceId
    ? (commands as any[]).filter(c => c.deviceId === deviceId)
    : (commands as any[]);

  return (
    <div className="page">
      {/* ── Page header ── */}
      <div className="ph">
        <div>
          <div style={{ marginBottom: 6 }}>
            <span className="eyebrow">Operate · Remote control</span>
          </div>
          <h1><em>Commands</em>.</h1>
          <p className="lede">Send and track remote device commands. Each payload is delivered over MQTT or HTTP depending on device protocol.</p>
        </div>
      </div>

      {/* ── Device selector ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Target device</div>
        <div style={{ display: 'flex', gap: 0, overflowX: 'auto', borderTop: '1px solid hsl(var(--fg))', borderBottom: '1px solid hsl(var(--border))' }}>
          <button
            onClick={() => setDeviceId('')}
            style={{
              flex: '0 0 auto', padding: '12px 18px',
              background: !deviceId ? 'hsl(var(--surface-raised))' : 'transparent',
              border: 0,
              borderRight: '1px solid hsl(var(--border))',
              borderTop: !deviceId ? '2px solid hsl(var(--primary))' : '2px solid transparent',
              marginTop: -1,
              cursor: 'pointer', fontSize: 12.5,
              color: !deviceId ? 'hsl(var(--fg))' : 'hsl(var(--muted-fg))',
            }}
          >
            All devices
          </button>
          {(devices as any[]).map(d => {
            const id = d._id ?? d.id;
            const isSel = id === deviceId;
            return (
              <button
                key={id}
                onClick={() => setDeviceId(id)}
                style={{
                  flex: '0 0 auto', minWidth: 160, textAlign: 'left',
                  padding: '12px 16px',
                  background: isSel ? 'hsl(var(--surface-raised))' : 'transparent',
                  border: 0,
                  borderRight: '1px solid hsl(var(--border))',
                  borderTop: isSel ? '2px solid hsl(var(--primary))' : '2px solid transparent',
                  marginTop: -1,
                  cursor: 'pointer', transition: 'background 0.1s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className={`dot dot-${d.status === 'online' ? 'online' : d.status === 'error' ? 'error' : 'offline'}`} />
                  <span style={{ fontSize: 12.5, fontWeight: isSel ? 500 : 400 }}>{d.name}</span>
                </div>
                <div className="mono faint" style={{ fontSize: 10, marginTop: 3 }}>{d.protocol?.toUpperCase()}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Schema quick-send commands ── */}
      {selectedDevice && schemaCommands.length > 0 && (
        <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={12} /> Quick commands — {selectedDevice.name}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {schemaCommands.map((sc: any) => (
              <button
                key={sc.name}
                onClick={() => sendCmd(sc.name, sc.defaultPayload ?? {})}
                disabled={sending}
                className="btn btn-sm"
                style={{ gap: 6, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em' }}
                title={sc.description ?? sc.name}
              >
                <Send size={11} />
                {sc.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Advanced / custom command ── */}
      <div className="panel" style={{ padding: 20, marginBottom: 32 }}>
        <button
          onClick={() => setShowAdvanced(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 0, cursor: 'pointer', padding: 0, width: '100%', textAlign: 'left' }}
        >
          <Terminal size={13} style={{ color: 'hsl(var(--muted-fg))' }} />
          <span className="eyebrow">Custom command</span>
          {showAdvanced ? <ChevronUp size={12} style={{ marginLeft: 'auto', color: 'hsl(var(--muted-fg))' }} /> : <ChevronDown size={12} style={{ marginLeft: 'auto', color: 'hsl(var(--muted-fg))' }} />}
        </button>

        {showAdvanced && (
          <form onSubmit={handleSend} style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
              {!deviceId && (
                <div style={{ minWidth: 200 }}>
                  <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Target device</label>
                  <select value={deviceId} onChange={e => setDeviceId(e.target.value)} className="select" required>
                    <option value="">Select device…</option>
                    {(devices as any[]).map(d => (
                      <option key={d._id ?? d.id} value={d._id ?? d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ minWidth: 180 }}>
                <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Command name</label>
                <input
                  value={cmdName}
                  onChange={e => setCmdName(e.target.value)}
                  className="input mono"
                  placeholder="reboot, get_status…"
                  required
                />
              </div>
              <div style={{ minWidth: 240, flex: 1 }}>
                <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Payload (JSON)</label>
                <input
                  value={payload}
                  onChange={e => setPayload(e.target.value)}
                  className="input mono"
                  style={{ fontSize: 12 }}
                  placeholder="{}"
                />
              </div>
              <button type="submit" disabled={sending || !deviceId} className="btn btn-primary" style={{ gap: 6 }}>
                {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ── History ── */}
      <div className="section">
        <div>
          <div className="ssh">
            {selectedDevice ? `${selectedDevice.name}` : 'All devices'}<br />history
          </div>
          <p className="dim" style={{ fontSize: 13, marginTop: 8, maxWidth: '28ch' }}>
            {filtered.length} command{filtered.length !== 1 ? 's' : ''} dispatched
            {selectedDevice ? ` to ${selectedDevice.name}` : ''}.
          </p>
        </div>
        <div style={{ minWidth: 0 }}>
          {isLoading ? (
            <div className="skeleton" style={{ height: 200 }} />
          ) : filtered.length === 0 ? (
            <div className="panel" style={{ padding: '48px 16px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, marginBottom: 8 }}>
                No commands {selectedDevice ? `sent to ${selectedDevice.name}` : 'sent yet'}
              </div>
              <p className="dim" style={{ fontSize: 13 }}>
                {selectedDevice ? 'Use the quick commands or custom command form above.' : 'Select a device and dispatch your first command.'}
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>№</th>
                    {!selectedDevice && <th>Device</th>}
                    <th>Command</th>
                    <th>Status</th>
                    <th className="hide-sm">Sent</th>
                    <th className="hide-sm">Response</th>
                    <th style={{ width: 60 }} />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((cmd: any, i: number) => (
                    <tr key={cmd._id}>
                      <td className="row-n">{String(i + 1).padStart(2, '0')}</td>
                      {!selectedDevice && (
                        <td style={{ fontSize: 13 }}>
                          {(devices as any[]).find(d => d._id === cmd.deviceId)?.name ?? (
                            <span className="mono faint">{cmd.deviceId?.slice(-8)}</span>
                          )}
                        </td>
                      )}
                      <td>
                        <code className="acc mono" style={{ fontSize: 12 }}>{cmd.name}</code>
                      </td>
                      <td>
                        <span className={`tag tag-${cmd.status === 'executed' ? 'online' : cmd.status === 'failed' || cmd.status === 'timeout' ? 'error' : cmd.status === 'pending' || cmd.status === 'sent' ? 'warn' : 'offline'}`}>
                          {cmd.status}
                        </span>
                      </td>
                      <td className="hide-sm mono faint" style={{ fontSize: 11 }}>{timeAgo(cmd.createdAt)}</td>
                      <td className="hide-sm mono faint" style={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cmd.errorMessage ?? (cmd.response ? JSON.stringify(cmd.response).slice(0, 60) : '—')}
                      </td>
                      <td>
                        {['pending', 'sent'].includes(cmd.status) && (
                          <button
                            onClick={() => cancelMut.mutate(cmd._id)}
                            className="btn btn-sm btn-ghost"
                            style={{ color: 'hsl(var(--bad))', fontSize: 11 }}
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
