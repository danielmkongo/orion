import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import apiClient from '@/api/client';
import { devicesApi } from '@/api/devices';
import { timeAgo } from '@/lib/utils';
import { Terminal, Send, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export function CommandsPage() {
  const [deviceId, setDeviceId] = useState('');
  const [cmdName, setCmdName]   = useState('');
  const [payload, setPayload]   = useState('{}');
  const [sending, setSending]   = useState(false);
  const queryClient = useQueryClient();

  const { data: devicesData } = useQuery({
    queryKey: ['devices', 'commands-page'],
    queryFn: () => devicesApi.list({ limit: 100 }),
  });

  const { data: commandsData, isLoading } = useQuery({
    queryKey: ['commands', 'all'],
    queryFn: () => apiClient.get('/commands', { params: { limit: 100 } }).then(r => r.data),
    refetchInterval: 10_000,
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => apiClient.post(`/commands/${id}/cancel`),
    onSuccess: () => { toast.success('Cancelled'); queryClient.invalidateQueries({ queryKey: ['commands'] }); },
  });

  const devices  = devicesData?.devices ?? [];
  const commands = commandsData?.data ?? commandsData?.commands ?? [];

  const handleSend = async (e: React.FormEvent) => {
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
    } catch { toast.error('Failed to send command'); }
    finally { setSending(false); }
  };

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

      {/* ── Send form ── */}
      <div className="panel" style={{ padding: 24, marginBottom: 32 }}>
        <div className="eyebrow" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Terminal size={13} /> Send command
        </div>
        <form onSubmit={handleSend}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ minWidth: 200 }}>
              <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Target device</label>
              <select value={deviceId} onChange={e => setDeviceId(e.target.value)} className="select" required>
                <option value="">Select device…</option>
                {(devices as any[]).map(d => (
                  <option key={d._id} value={d._id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div style={{ minWidth: 180 }}>
              <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Command</label>
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
            <button type="submit" disabled={sending} className="btn btn-primary" style={{ gap: 6 }}>
              {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      </div>

      {/* ── History ── */}
      <div className="section">
        <div>
          <div className="ssh"><span className="no">№ I</span>Command<br />history</div>
          <p className="dim" style={{ fontSize: 13, marginTop: 8, maxWidth: '28ch' }}>
            {commands.length} command{commands.length !== 1 ? 's' : ''} dispatched.
          </p>
        </div>
        <div className="table-responsive">
          {isLoading ? (
            <div className="skeleton" style={{ height: 200 }} />
          ) : commands.length === 0 ? (
            <div className="panel" style={{ padding: '48px 16px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, marginBottom: 8 }}>No commands sent yet</div>
              <p className="dim" style={{ fontSize: 13 }}>Use the form above to dispatch your first command.</p>
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
                {(commands as any[]).map((cmd, i) => (
                  <tr key={cmd._id}>
                    <td className="row-n">{String(i + 1).padStart(2, '0')}</td>
                    <td style={{ fontSize: 13 }}>
                      {(devices as any[]).find(d => d._id === cmd.deviceId)?.name ?? (
                        <span className="mono faint">{cmd.deviceId?.slice(-8)}</span>
                      )}
                    </td>
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
          )}
        </div>
      </div>
    </div>
  );
}
