import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { motion } from 'framer-motion';
import apiClient from '@/api/client';
import { cn, timeAgo, severityColor } from '@/lib/utils';
import { Bell, Check, CheckCheck, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

const SEVERITY_ICONS: Record<string, any> = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  critical: AlertCircle,
};

export function AlertsPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', { statusFilter, severityFilter }],
    queryFn: () => apiClient.get('/alerts', {
      params: {
        status: statusFilter !== 'all' ? statusFilter : undefined,
        severity: severityFilter !== 'all' ? severityFilter : undefined,
        limit: 100,
      }
    }).then(r => r.data),
    refetchInterval: 15_000,
  });

  const ackMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/alerts/${id}/acknowledge`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/alerts/${id}/resolve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const alerts = data?.data ?? [];
  const total = data?.total ?? 0;
  const activeCount = alerts.filter((a: any) => a.status === 'active').length;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Alerts</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {activeCount > 0 ? <span className="text-rose-400 font-medium">{activeCount} active</span> : 'All clear'} · {total} total
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1 bg-surface-3 rounded-lg p-1">
          {['all', 'active', 'acknowledged', 'resolved'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn('px-3 py-1.5 text-xs rounded-md transition-colors',
                statusFilter === s ? 'bg-orion-600 text-white' : 'text-slate-400 hover:text-slate-200'
              )}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-surface-3 rounded-lg p-1">
          {['all', 'info', 'warning', 'error', 'critical'].map(s => (
            <button key={s} onClick={() => setSeverityFilter(s)}
              className={cn('px-3 py-1.5 text-xs rounded-md transition-colors',
                severityFilter === s ? 'bg-orion-600 text-white' : 'text-slate-400 hover:text-slate-200'
              )}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      ) : alerts.length === 0 ? (
        <div className="card p-16 text-center">
          <Bell className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No alerts found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert: any, i: number) => {
            const Icon = SEVERITY_ICONS[alert.severity] ?? Bell;
            return (
              <motion.div
                key={alert._id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={cn(
                  'card p-4 flex items-start gap-4 hover:border-surface-border-strong transition-colors',
                  alert.status === 'active' && alert.severity === 'critical' ? 'border-rose-500/30 bg-rose-500/5' : '',
                  alert.status === 'resolved' ? 'opacity-60' : ''
                )}
              >
                <div className={cn('p-2 rounded-xl shrink-0 mt-0.5',
                  alert.severity === 'critical' ? 'bg-rose-500/20 text-rose-400' :
                  alert.severity === 'error' ? 'bg-rose-500/15 text-rose-400' :
                  alert.severity === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-sky-500/15 text-sky-400'
                )}>
                  <Icon className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-slate-200">{alert.title}</p>
                    <span className={cn('badge text-[10px]',
                      alert.severity === 'critical' ? 'badge-critical' :
                      alert.severity === 'error' ? 'badge-error' :
                      alert.severity === 'warning' ? 'badge-warning' : 'badge-info'
                    )}>{alert.severity}</span>
                    <span className={cn('badge text-[10px]',
                      alert.status === 'active' ? 'badge-error' :
                      alert.status === 'acknowledged' ? 'badge-warning' : 'badge-online'
                    )}>{alert.status}</span>
                  </div>
                  <p className="text-sm text-slate-400">{alert.message}</p>
                  <p className="text-xs text-slate-600 mt-1">{timeAgo(alert.createdAt)}</p>
                </div>

                {alert.status === 'active' && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => ackMutation.mutate(alert._id)}
                      className="btn-ghost text-xs px-2 py-1.5"
                      title="Acknowledge"
                    >
                      <Check className="w-3.5 h-3.5" /> Ack
                    </button>
                    <button
                      onClick={() => resolveMutation.mutate(alert._id)}
                      className="btn-secondary text-xs px-2 py-1.5"
                      title="Resolve"
                    >
                      <CheckCheck className="w-3.5 h-3.5" /> Resolve
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
