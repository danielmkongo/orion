import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { motion } from 'framer-motion';
import apiClient from '@/api/client';
import { devicesApi } from '@/api/devices';
import { cn, timeAgo } from '@/lib/utils';
import { Terminal, Send, X, Check, Clock, AlertCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_CONFIG: Record<string, { color: string; icon: any }> = {
  pending: { color: 'badge-warning', icon: Clock },
  sent: { color: 'badge-info', icon: Send },
  acknowledged: { color: 'badge-info', icon: Check },
  executed: { color: 'badge-online', icon: Check },
  failed: { color: 'badge-error', icon: AlertCircle },
  timeout: { color: 'badge-error', icon: Clock },
  cancelled: { color: 'badge-offline', icon: X },
};

export function CommandsPage() {
  const [deviceId, setDeviceId] = useState('');
  const [cmdName, setCmdName] = useState('');
  const [payload, setPayload] = useState('{}');
  const [sending, setSending] = useState(false);
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
    onSuccess: () => {
      toast.success('Command cancelled');
      queryClient.invalidateQueries({ queryKey: ['commands'] });
    },
  });

  const devices = devicesData?.devices ?? [];
  const commands = commandsData?.data ?? [];

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceId || !cmdName) return;
    setSending(true);
    try {
      let p = {};
      try { p = JSON.parse(payload); } catch {}
      await apiClient.post('/commands', { deviceId, name: cmdName, payload: p });
      toast.success('Command sent successfully');
      setCmdName(''); setPayload('{}');
      queryClient.invalidateQueries({ queryKey: ['commands'] });
    } catch {
      toast.error('Failed to send command');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Commands</h1>
        <p className="text-sm text-slate-500 mt-0.5">Send and track remote device commands</p>
      </div>

      {/* Send form */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <Terminal className="w-4 h-4 text-orion-400" /> Send Command
        </h3>
        <form onSubmit={handleSend} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px]">
            <label className="block text-xs text-slate-400 mb-1.5">Target Device</label>
            <select value={deviceId} onChange={e => setDeviceId(e.target.value)} className="input-field" required>
              <option value="">Select device...</option>
              {devices.map((d: any) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </div>
          <div className="min-w-[180px]">
            <label className="block text-xs text-slate-400 mb-1.5">Command</label>
            <input value={cmdName} onChange={e => setCmdName(e.target.value)} className="input-field font-mono" placeholder="reboot, get_status..." required />
          </div>
          <div className="min-w-[240px] flex-1">
            <label className="block text-xs text-slate-400 mb-1.5">Payload (JSON)</label>
            <input value={payload} onChange={e => setPayload(e.target.value)} className="input-field font-mono text-xs" placeholder="{}" />
          </div>
          <button type="submit" disabled={sending} className="btn-primary self-end">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Sending...' : 'Send'}
          </button>
        </form>
      </div>

      {/* Command history */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-surface-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Command History</h3>
          <span className="text-xs text-slate-500">{commands.length} commands</span>
        </div>
        {isLoading ? (
          <div className="p-6 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-lg" />)}
          </div>
        ) : commands.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No commands sent yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Command</th>
                  <th>Status</th>
                  <th>Sent</th>
                  <th>Response</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {commands.map((cmd: any, i: number) => {
                  const sc = STATUS_CONFIG[cmd.status] ?? { color: 'badge-offline', icon: Clock };
                  const Icon = sc.icon;
                  return (
                    <motion.tr key={cmd._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}>
                      <td>
                        <span className="text-sm text-slate-300">
                          {devices.find((d: any) => d._id === cmd.deviceId)?.name ?? cmd.deviceId?.slice(-8)}
                        </span>
                      </td>
                      <td>
                        <code className="text-sm font-mono text-orion-300 bg-orion-600/10 px-2 py-0.5 rounded">{cmd.name}</code>
                      </td>
                      <td>
                        <span className={cn('badge', sc.color, 'flex items-center gap-1 w-fit')}>
                          <Icon className="w-3 h-3" /> {cmd.status}
                        </span>
                      </td>
                      <td className="text-xs text-slate-500">{timeAgo(cmd.createdAt)}</td>
                      <td className="text-xs text-slate-500 font-mono max-w-[200px] truncate">
                        {cmd.errorMessage ?? (cmd.response ? JSON.stringify(cmd.response).slice(0, 60) : '—')}
                      </td>
                      <td>
                        {['pending', 'sent'].includes(cmd.status) && (
                          <button onClick={() => cancelMutation.mutate(cmd._id)} className="text-xs text-rose-400 hover:text-rose-300">
                            Cancel
                          </button>
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
