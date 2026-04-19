import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import apiClient from '@/api/client';
import { timeAgo } from '@/lib/utils';
import { Check, CheckCheck, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

const STATUSES   = ['all', 'active', 'acknowledged', 'resolved'];
const SEVERITIES = ['all', 'info', 'warning', 'error', 'critical'];

function severityDot(severity: string) {
  if (severity === 'critical' || severity === 'error') return 'dot-error';
  if (severity === 'warning') return 'dot-warn';
  return 'dot-info';
}

function severityTag(severity: string) {
  if (severity === 'critical' || severity === 'error') return 'tag-error';
  if (severity === 'warning') return 'tag-warn';
  return 'tag-info';
}

function statusTag(status: string) {
  if (status === 'active') return 'tag-error';
  if (status === 'acknowledged') return 'tag-warn';
  return 'tag-online';
}

export function AlertsPage() {
  const [statusFilter,   setStatusFilter]   = useState('all');
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

  const ackMut = useMutation({
    mutationFn: (id: string) => apiClient.post(`/alerts/${id}/acknowledge`),
    onSuccess: () => { toast.success('Acknowledged'); queryClient.invalidateQueries({ queryKey: ['alerts'] }); },
  });
  const resMut = useMutation({
    mutationFn: (id: string) => apiClient.post(`/alerts/${id}/resolve`),
    onSuccess: () => { toast.success('Resolved'); queryClient.invalidateQueries({ queryKey: ['alerts'] }); },
  });

  const alerts      = data?.data ?? data?.alerts ?? [];
  const total       = data?.total ?? 0;
  const activeCount = alerts.filter((a: any) => a.status === 'active').length;

  return (
    <div className="page">
      {/* ── Page header ── */}
      <div className="ph">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <span className="eyebrow">Operate · System alerts</span>
            {activeCount > 0 && <span className="dot dot-error pulse" />}
          </div>
          <h1><em>Alerts</em>.</h1>
          <p className="lede">
            {activeCount > 0
              ? <>{activeCount} active alert{activeCount !== 1 ? 's' : ''} require attention. {total} total.</>
              : <>All systems nominal. {total} alert{total !== 1 ? 's' : ''} in log.</>
            }
          </p>
        </div>
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div className="seg">
          {STATUSES.map(s => (
            <button key={s} className={statusFilter === s ? 'on' : ''} onClick={() => setStatusFilter(s)} style={{ textTransform: 'capitalize' }}>
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
        <div className="seg">
          {SEVERITIES.map(s => (
            <button key={s} className={severityFilter === s ? 'on' : ''} onClick={() => setSeverityFilter(s)} style={{ textTransform: 'capitalize' }}>
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Alerts list ── */}
      <div className="panel table-responsive">
        {isLoading ? (
          <div style={{ padding: 32, textAlign: 'center' }} className="mono faint">Loading…</div>
        ) : alerts.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 16px', textAlign: 'center' }}>
            <CheckCircle2 size={28} style={{ color: 'hsl(var(--good))', marginBottom: 12 }} />
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, lineHeight: 1, marginBottom: 8 }}>
              {statusFilter !== 'all' || severityFilter !== 'all'
                ? <>No <em style={{ color: 'hsl(var(--primary))' }}>matching</em> alerts</>
                : <>All <em style={{ color: 'hsl(var(--good))' }}>clear</em></>
              }
            </div>
            <p className="dim" style={{ fontSize: 13 }}>
              {statusFilter !== 'all' || severityFilter !== 'all' ? 'Try adjusting your filters' : 'System is running normally'}
            </p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>№</th>
                <th>Alert</th>
                <th className="hide-sm">Severity</th>
                <th>Status</th>
                <th className="hide-sm">Device</th>
                <th>When</th>
                <th style={{ width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {(alerts as any[]).map((a, i) => (
                <tr key={a._id ?? a.id} style={{ opacity: a.status === 'resolved' ? 0.55 : 1 }}>
                  <td className="row-n">{String(i + 1).padStart(2, '0')}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`dot ${severityDot(a.severity)}`} style={{ flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{a.title}</div>
                        {a.message && <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>{a.message}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="hide-sm">
                    <span className={`tag ${severityTag(a.severity)}`}>{a.severity}</span>
                  </td>
                  <td>
                    <span className={`tag ${statusTag(a.status)}`}>{a.status}</span>
                  </td>
                  <td className="hide-sm mono faint" style={{ fontSize: 11 }}>
                    {a.deviceId ? String(a.deviceId).slice(-8) : '—'}
                  </td>
                  <td className="mono faint" style={{ fontSize: 11.5 }}>{timeAgo(a.createdAt)}</td>
                  <td>
                    {a.status === 'active' && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => ackMut.mutate(a._id)}
                          className="btn btn-sm btn-outline"
                          style={{ gap: 4 }}
                          title="Acknowledge"
                        >
                          <Check size={11} /> Ack
                        </button>
                        <button
                          onClick={() => resMut.mutate(a._id)}
                          className="btn btn-sm btn-primary"
                          style={{ gap: 4 }}
                          title="Resolve"
                        >
                          <CheckCheck size={11} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
