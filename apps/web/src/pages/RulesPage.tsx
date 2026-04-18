import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { motion } from 'framer-motion';
import apiClient from '@/api/client';
import { cn, timeAgo } from '@/lib/utils';
import { Zap, Plus, Trash2, AlertCircle, Bell, Terminal, Globe } from 'lucide-react';
import toast from 'react-hot-toast';

const ACTION_ICONS: Record<string, any> = {
  alert: Bell, notification: Bell, command: Terminal, webhook: Globe, email: Globe,
};

export function RulesPage() {
  const [showModal, setShowModal] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['rules'],
    queryFn: () => apiClient.get('/rules').then(r => r.data),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/rules/${id}/toggle`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rules'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/rules/${id}`),
    onSuccess: () => {
      toast.success('Rule deleted');
      queryClient.invalidateQueries({ queryKey: ['rules'] });
    },
  });

  const rules = data?.data ?? [];

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Rules Engine</h1>
          <p className="text-sm text-slate-500 mt-0.5">Automate actions based on device conditions</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> New Rule
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-28 rounded-xl" />)}
        </div>
      ) : rules.length === 0 ? (
        <div className="card p-16 text-center">
          <Zap className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No rules configured</p>
          <p className="text-sm text-slate-600 mt-1">Create a rule to automate responses to device events</p>
          <button onClick={() => setShowModal(true)} className="btn-primary mt-4 inline-flex">
            <Plus className="w-4 h-4" /> Create First Rule
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule: any, i: number) => (
            <motion.div
              key={rule._id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={cn('card p-5 hover:border-surface-border-strong transition-all', !rule.isEnabled && 'opacity-60')}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className={cn('p-2 rounded-xl shrink-0',
                    rule.isEnabled ? 'bg-orion-600/20 text-orion-400' : 'bg-surface-3 text-slate-500'
                  )}>
                    <Zap className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-slate-200">{rule.name}</h3>
                      <span className={cn('badge text-[10px]',
                        rule.priority === 'critical' ? 'badge-critical' :
                        rule.priority === 'high' ? 'badge-error' :
                        rule.priority === 'medium' ? 'badge-warning' : 'badge-info'
                      )}>{rule.priority}</span>
                      {!rule.isEnabled && <span className="badge badge-offline text-[10px]">disabled</span>}
                    </div>
                    {rule.description && <p className="text-sm text-slate-400 mb-3">{rule.description}</p>}

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Conditions */}
                      {rule.conditions.map((cond: any, ci: number) => (
                        <span key={ci} className="bg-surface-3 border border-surface-border rounded-lg px-2.5 py-1 text-xs text-slate-300 font-mono">
                          {cond.field} {cond.operator} {String(cond.value)}
                        </span>
                      ))}
                      <span className="text-xs text-slate-600">→</span>
                      {/* Actions */}
                      {rule.actions.map((action: any, ai: number) => {
                        const Icon = ACTION_ICONS[action.type] ?? Bell;
                        return (
                          <span key={ai} className="flex items-center gap-1 bg-orion-600/15 border border-orion-500/20 rounded-lg px-2.5 py-1 text-xs text-orion-300">
                            <Icon className="w-3 h-3" /> {action.type}
                          </span>
                        );
                      })}
                    </div>

                    <p className="text-xs text-slate-600 mt-2">
                      {rule.fireCount > 0 ? `Fired ${rule.fireCount}×` : 'Never fired'}
                      {rule.lastFiredAt ? ` · Last: ${timeAgo(rule.lastFiredAt)}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => toggleMutation.mutate(rule._id)}
                    className={cn('relative w-9 h-5 rounded-full transition-colors duration-200',
                      rule.isEnabled ? 'bg-orion-600' : 'bg-surface-3'
                    )}
                    title={rule.isEnabled ? 'Disable' : 'Enable'}
                  >
                    <span className={cn(
                      'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200',
                      rule.isEnabled ? 'translate-x-4' : 'translate-x-0.5'
                    )} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Delete this rule?')) deleteMutation.mutate(rule._id);
                    }}
                    className="p-1.5 text-slate-600 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {showModal && <CreateRuleModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

function CreateRuleModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '', description: '', triggerType: 'telemetry', priority: 'medium',
    conditionField: '', conditionOperator: 'gt', conditionValue: '',
    conditionLogic: 'and', actionType: 'alert', actionSeverity: 'warning',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiClient.post('/rules', {
        name: form.name,
        description: form.description,
        triggerType: form.triggerType,
        priority: form.priority,
        conditions: [{ field: form.conditionField, operator: form.conditionOperator, value: parseFloat(form.conditionValue) || form.conditionValue }],
        conditionLogic: form.conditionLogic,
        actions: [{ type: form.actionType, config: { severity: form.actionSeverity, title: form.name } }],
        isEnabled: true,
      });
      toast.success('Rule created');
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      onClose();
    } catch {
      toast.error('Failed to create rule');
    } finally {
      setLoading(false);
    }
  };

  const upd = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [f]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg bg-surface-2 border border-surface-border rounded-2xl shadow-elevated overflow-hidden"
      >
        <div className="p-5 border-b border-surface-border flex items-center justify-between">
          <h2 className="font-semibold text-slate-200">Create Rule</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Rule Name *</label>
            <input value={form.name} onChange={upd('name')} className="input-field" placeholder="e.g. High Temperature Alert" required />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Description</label>
            <input value={form.description} onChange={upd('description')} className="input-field" placeholder="Optional description" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Trigger Type</label>
              <select value={form.triggerType} onChange={upd('triggerType')} className="input-field">
                {['telemetry', 'device_status', 'location', 'schedule'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Priority</label>
              <select value={form.priority} onChange={upd('priority')} className="input-field">
                {['low', 'medium', 'high', 'critical'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="bg-surface-3 border border-surface-border rounded-xl p-4 space-y-3">
            <p className="text-xs font-medium text-slate-400">Condition</p>
            <div className="grid grid-cols-3 gap-2">
              <input value={form.conditionField} onChange={upd('conditionField')} className="input-field text-xs" placeholder="field" />
              <select value={form.conditionOperator} onChange={upd('conditionOperator')} className="input-field text-xs">
                {['gt', 'gte', 'lt', 'lte', 'eq', 'neq'].map(op => <option key={op} value={op}>{op}</option>)}
              </select>
              <input value={form.conditionValue} onChange={upd('conditionValue')} className="input-field text-xs" placeholder="value" />
            </div>
          </div>
          <div className="bg-surface-3 border border-surface-border rounded-xl p-4 space-y-3">
            <p className="text-xs font-medium text-slate-400">Action</p>
            <div className="grid grid-cols-2 gap-2">
              <select value={form.actionType} onChange={upd('actionType')} className="input-field text-xs">
                {['alert', 'notification', 'command', 'webhook', 'email'].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={form.actionSeverity} onChange={upd('actionSeverity')} className="input-field text-xs">
                {['info', 'warning', 'error', 'critical'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Creating...' : 'Create Rule'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
