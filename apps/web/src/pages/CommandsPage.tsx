import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { motion } from 'framer-motion';
import apiClient from '@/api/client';
import { devicesApi } from '@/api/devices';
import { timeAgo } from '@/lib/utils';
import { Terminal, Send, X, Check, Clock, AlertCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_CONFIG: Record<string, { badge: string; icon: any }> = {
  pending:      { badge: 'badge-warning',  icon: Clock        },
  sent:         { badge: 'badge-info',     icon: Send         },
  acknowledged: { badge: 'badge-info',     icon: Check        },
  executed:     { badge: 'badge-online',   icon: Check        },
  failed:       { badge: 'badge-error',    icon: AlertCircle  },
  timeout:      { badge: 'badge-error',    icon: Clock        },
  cancelled:    { badge: 'badge-offline',  icon: X            },
};

export function CommandsPage() {
  const [deviceId, setDeviceId]   = useState('');
  const [cmdName, setCmdName]     = useState('');
  const [payload, setPayload]     = useState('{}');
  const [sending, setSending]     = useState(false);
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

  const cancelMutation = useMutation({
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
    finally  { setSending(false); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[22px] font-semibold text-foreground tracking-tight">Commands</h2>
        <p className="text-[14px] text-muted-foreground mt-0.5">Send and track remote device commands</p>
      </div>

      {/* Send form */}
      <div className="card p-5">
        <h3 className="text-[14px] font-semibold text-foreground mb-4 flex items-center gap-2">
          <Terminal size={15} className="text-primary" /> Send Command
        </h3>
        <form onSubmit={handleSend} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px]">
            <label className="block text-[12px] font-medium text-foreground mb-1.5">Target Device</label>
            <select value={deviceId} onChange={e => setDeviceId(e.target.value)} className="select" required>
              <option value="">Select device…</option>
              {devices.map((d: any) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </div>
          <div className="min-w-[180px]">
            <label className="block text-[12px] font-medium text-foreground mb-1.5">Command</label>
            <input value={cmdName} onChange={e => setCmdName(e.target.value)} className="input font-mono" placeholder="reboot, get_status…" required />
          </div>
          <div className="min-w-[240px] flex-1">
            <label className="block text-[12px] font-medium text-foreground mb-1.5">Payload (JSON)</label>
            <input value={payload} onChange={e => setPayload(e.target.value)} className="input font-mono text-[12px]" placeholder="{}" />
          </div>
          <button type="submit" disabled={sending} className="btn btn-primary self-end">
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {sending ? 'Sending…' : 'Send'}
          </button>
        </form>
      </div>

      {/* Command history */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-[13px] font-semibold text-foreground">Command History</span>
          <span className="text-[12px] text-muted-foreground">{commands.length} commands</span>
        </div>
        {isLoading ? (
          <div className="p-6 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-lg" />)}
          </div>
        ) : commands.length === 0 ? (
          <div className="p-12 text-center text-[13px] text-muted-foreground">No commands sent yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Device</th><th>Command</th><th>Status</th>
                  <th>Sent</th><th>Response</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {commands.map((cmd: any, i: number) => {
                  const sc = STATUS_CONFIG[cmd.status] ?? { badge: 'badge-offline', icon: Clock };
                  const Icon = sc.icon;
                  return (
                    <motion.tr key={cmd._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}>
                      <td><span className="text-[13px] text-foreground">{devices.find((d: any) => d._id === cmd.deviceId)?.name ?? cmd.deviceId?.slice(-8)}</span></td>
                      <td><code className="text-[12px] font-mono text-primary bg-primary/8 px-2 py-0.5 rounded">{cmd.name}</code></td>
                      <td><span className={`badge ${sc.badge} gap-1`}><Icon size={10} /> {cmd.status}</span></td>
                      <td className="text-[12px] text-muted-foreground">{timeAgo(cmd.createdAt)}</td>
                      <td className="text-[12px] text-muted-foreground font-mono max-w-[200px] truncate">
                        {cmd.errorMessage ?? (cmd.response ? JSON.stringify(cmd.response).slice(0, 60) : '—')}
                      </td>
                      <td>
                        {['pending', 'sent'].includes(cmd.status) && (
                          <button onClick={() => cancelMutation.mutate(cmd._id)} className="text-[12px] text-red-600 dark:text-red-400 hover:underline">Cancel</button>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
