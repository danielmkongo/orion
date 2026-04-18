import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { motion } from 'framer-motion';
import apiClient from '@/api/client';
import { timeAgo } from '@/lib/utils';
import { Zap, Plus, Trash2, Bell, Terminal, Globe } from 'lucide-react';
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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-semibold text-foreground tracking-tight">Rules Engine</h2>
          <p className="text-[14px] text-muted-foreground mt-0.5">Automate actions based on device conditions</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn btn-primary">
          <Plus size={14} /> New Rule
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-28 rounded-xl" />)}
        </div>
      ) : rules.length === 0 ? (
        <div className="card p-16 text-center">
          <Zap size={32} className="text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-[15px] font-semibold text-foreground">No rules configured</p>
          <p className="text-[13px] text-muted-foreground mt-1">Create a rule to automate responses to device events</p>
          <button onClick={() => setShowModal(true)} className="btn btn-primary mt-4">
            <Plus size={14} /> Create First Rule
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
              className={`card p-5 hover:border-border-strong transition-all ${!rule.isEnabled ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className={`p-2 rounded-xl shrink-0 ${rule.isEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    <Zap size={16} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-[14px] font-semibold text-foreground">{rule.name}</h3>
                      <span className={`badge ${
                        rule.priority === 'critical' ? 'badge-error' :
                        rule.priority === 'high' ? 'badge-error' :
                        rule.priority === 'medium' ? 'badge-warning' : 'badge-info'
                      }`}>{rule.priority}</span>
                      {!rule.isEnabled && <span className="badge badge-offline">disabled</span>}
                    </div>
                    {rule.description && <p className="text-[13px] text-muted-foreground mb-3">{rule.description}</p>}

                    <div className="flex flex-wrap items-center gap-2">
                      {rule.conditions.map((cond: any, ci: number) => (
                        <span key={ci} className="bg-muted border border-border rounded-lg px-2.5 py-1 text-[12px] text-foreground font-mono">
                          {cond.field} {cond.operator} {String(cond.value)}
                        </span>
                      ))}
                      <span className="text-[12px] text-muted-foreground">→</span>
                      {rule.actions.map((action: any, ai: number) => {
                        const Icon = ACTION_ICONS[action.type] ?? Bell;
                        return (
                          <span key={ai} className="flex items-center gap-1 bg-primary/8 border border-primary/15 rounded-lg px-2.5 py-1 text-[12px] text-primary">
                            <Icon size={11} /> {action.type}
                          </span>
                        );
                      })}
                    </div>

                    <p className="text-[11px] text-muted-foreground mt-2">
                      {rule.fireCount > 0 ? `Fired ${rule.fireCount}×` : 'Never fired'}
                      {rule.lastFiredAt ? ` · Last: ${timeAgo(rule.lastFiredAt)}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => toggleMutation.mutate(rule._id)}
                    className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${rule.isEnabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                    title={rule.isEnabled ? 'Disable' : 'Enable'}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${rule.isEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                  <button
                    onClick={() => { if (confirm('Delete this rule?')) deleteMutation.mutate(rule._id); }}
                    className="p-1.5 text-muted-foreground hover:text-red-500 rounded-lg hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 size={14} />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg bg-surface border border-border rounded-2xl shadow-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-foreground">Create Rule</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-foreground mb-1.5">Rule Name *</label>
            <input value={form.name} onChange={upd('name')} className="input" placeholder="e.g. High Temperature Alert" required />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-foreground mb-1.5">Description</label>
            <input value={form.description} onChange={upd('description')} className="input" placeholder="Optional description" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-foreground mb-1.5">Trigger Type</label>
              <select value={form.triggerType} onChange={upd('triggerType')} className="select">
                {['telemetry', 'device_status', 'location', 'schedule'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-foreground mb-1.5">Priority</label>
              <select value={form.priority} onChange={upd('priority')} className="select">
                {['low', 'medium', 'high', 'critical'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="bg-muted border border-border rounded-xl p-4 space-y-3">
            <p className="text-[12px] font-medium text-foreground">Condition</p>
            <div className="grid grid-cols-3 gap-2">
              <input value={form.conditionField} onChange={upd('conditionField')} className="input text-[12px]" placeholder="field" />
              <select value={form.conditionOperator} onChange={upd('conditionOperator')} className="select text-[12px]">
                {['gt', 'gte', 'lt', 'lte', 'eq', 'neq'].map(op => <option key={op} value={op}>{op}</option>)}
              </select>
              <input value={form.conditionValue} onChange={upd('conditionValue')} className="input text-[12px]" placeholder="value" />
            </div>
          </div>
          <div className="bg-muted border border-border rounded-xl p-4 space-y-3">
            <p className="text-[12px] font-medium text-foreground">Action</p>
            <div className="grid grid-cols-2 gap-2">
              <select value={form.actionType} onChange={upd('actionType')} className="select text-[12px]">
                {['alert', 'notification', 'command', 'webhook', 'email'].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={form.actionSeverity} onChange={upd('actionSeverity')} className="select text-[12px]">
                {['info', 'warning', 'error', 'critical'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-primary flex-1">
              {loading ? 'Creating…' : 'Create Rule'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
