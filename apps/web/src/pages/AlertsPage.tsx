import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { motion } from 'framer-motion';
import apiClient from '@/api/client';
import { timeAgo } from '@/lib/utils';
import { Bell, Check, CheckCheck, AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react';

const SEVERITY_ICONS: Record<string, any> = {
  info:     Info,
  warning:  AlertTriangle,
  error:    AlertCircle,
  critical: AlertCircle,
};

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-600 dark:text-red-400',
  error:    'bg-red-500/10 text-red-600 dark:text-red-400',
  warning:  'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  info:     'bg-blue-500/10 text-blue-600 dark:text-blue-400',
};

export function AlertsPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', { statusFilter, severityFilter }],
    queryFn: () => apiClient.get('/alerts', {
      params: {
        status:   statusFilter   !== 'all' ? statusFilter   : undefined,
        severity: severityFilter !== 'all' ? severityFilter : undefined,
        limit: 100,
      },
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

  const alerts = data?.data ?? data?.alerts ?? [];
  const total  = data?.total ?? 0;
  const activeCount = alerts.filter((a: any) => a.status === 'active').length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-semibold text-foreground tracking-tight">Alerts</h2>
          <p className="text-[14px] text-muted-foreground mt-0.5">
            {activeCount > 0
              ? <span className="text-red-600 dark:text-red-400 font-medium">{activeCount} active</span>
              : <span className="text-green-600 dark:text-green-400">All clear</span>
            }
            {' '}· {total} total
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-muted rounded-xl p-1">
          {['all', 'active', 'acknowledged', 'resolved'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all capitalize ${
                statusFilter === s
                  ? 'bg-surface text-foreground shadow-sm border border-border'
                  : 'text-muted-foreground hover:text-foreground'
              }`}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-muted rounded-xl p-1">
          {['all', 'info', 'warning', 'error', 'critical'].map(s => (
            <button key={s} onClick={() => setSeverityFilter(s)}
              className={`px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all capitalize ${
                severityFilter === s
                  ? 'bg-surface text-foreground shadow-sm border border-border'
                  : 'text-muted-foreground hover:text-foreground'
              }`}>
              {s}
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
          <CheckCircle2 size={32} className="text-green-500 mx-auto mb-3" />
          <p className="text-[15px] font-semibold text-foreground">No alerts</p>
          <p className="text-[13px] text-muted-foreground mt-1">System is running normally</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert: any, i: number) => {
            const Icon = SEVERITY_ICONS[alert.severity] ?? Bell;
            return (
              <motion.div
                key={alert._id ?? alert.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`card p-4 flex items-start gap-4 transition-colors ${
                  alert.status === 'active' && alert.severity === 'critical' ? 'border-red-300 dark:border-red-800/60' : ''
                } ${alert.status === 'resolved' ? 'opacity-60' : ''}`}
              >
                <div className={`p-2 rounded-xl flex-shrink-0 mt-0.5 ${SEVERITY_STYLE[alert.severity] ?? SEVERITY_STYLE.info}`}>
                  <Icon size={16} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="text-[14px] font-semibold text-foreground">{alert.title}</p>
                    <span className={`badge ${alert.severity === 'critical' || alert.severity === 'error' ? 'badge-error' : alert.severity === 'warning' ? 'badge-warning' : 'badge-info'}`}>
                      {alert.severity}
                    </span>
                    <span className={`badge ${alert.status === 'active' ? 'badge-error' : alert.status === 'acknowledged' ? 'badge-warning' : 'badge-online'}`}>
                      {alert.status}
                    </span>
                  </div>
                  <p className="text-[13px] text-muted-foreground">{alert.message}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-1">{timeAgo(alert.createdAt)}</p>
                </div>

                {alert.status === 'active' && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => ackMutation.mutate(alert._id)} className="btn btn-secondary btn-sm gap-1">
                      <Check size={12} /> Ack
                    </button>
                    <button onClick={() => resolveMutation.mutate(alert._id)} className="btn btn-primary btn-sm gap-1">
                      <CheckCheck size={12} /> Resolve
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
