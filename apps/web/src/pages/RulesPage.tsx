import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import apiClient from '@/api/client';
import { devicesApi } from '@/api/devices';
import { timeAgo } from '@/lib/utils';
import {
  Zap, Plus, Trash2, Bell, Terminal, Globe,
  Mail, MessageSquare, X, Check, ChevronLeft, ChevronRight,
  Loader2, AlertCircle, Clock, Cpu, Activity,
} from 'lucide-react';
import toast from 'react-hot-toast';

/* ── Operator display ─────────────────────────────────── */
const OPERATORS = [
  { value: 'gt',       symbol: '>',          label: 'greater than'     },
  { value: 'gte',      symbol: '≥',          label: 'greater or equal' },
  { value: 'lt',       symbol: '<',          label: 'less than'        },
  { value: 'lte',      symbol: '≤',          label: 'less or equal'    },
  { value: 'eq',       symbol: '=',          label: 'equals'           },
  { value: 'neq',      symbol: '≠',          label: 'not equal to'     },
  { value: 'contains', symbol: '∋',          label: 'contains'         },
];

const TRIGGER_TYPES = [
  { value: 'telemetry',      Icon: Activity,       label: 'Telemetry',      desc: 'Fires when data matches a condition' },
  { value: 'device_status',  Icon: Cpu,            label: 'Device Status',  desc: 'Fires on device online / offline'    },
  { value: 'location',       Icon: AlertCircle,    label: 'Location',       desc: 'Fires on geo-fence events'           },
  { value: 'schedule',       Icon: Clock,          label: 'Schedule',       desc: 'Fires on a time interval'            },
];

const ACTION_TYPES = [
  { value: 'alert',        Icon: AlertCircle,   label: 'Alert',        desc: 'Create an in-platform alert'  },
  { value: 'email',        Icon: Mail,          label: 'Email',        desc: 'Send an email notification'   },
  { value: 'notification', Icon: Bell,          label: 'Notification', desc: 'Push notification'            },
  { value: 'sms',          Icon: MessageSquare, label: 'SMS',          desc: 'Send a text message'          },
  { value: 'command',      Icon: Terminal,      label: 'Command',      desc: 'Execute a device command'     },
  { value: 'webhook',      Icon: Globe,         label: 'Webhook',      desc: 'POST to an external URL'      },
];

const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical'] as const;
type Priority = typeof PRIORITY_OPTIONS[number];
const PRIORITY_BADGE: Record<Priority, string> = {
  low: 'badge-offline', medium: 'badge-info', high: 'badge-warning', critical: 'badge-error',
};

/* ── Rule card ────────────────────────────────────────── */
function RuleCard({ rule, onToggle, onDelete }: {
  rule: any;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const actionIcon = ACTION_TYPES.find(a => a.value === rule.actions?.[0]?.type)?.Icon ?? Bell;
  const ActionIcon = actionIcon;

  return (
    <div
      className="panel"
      style={{
        padding: '16px 20px',
        borderBottom: '1px solid hsl(var(--border))',
        opacity: rule.isEnabled ? 1 : 0.55,
        transition: 'opacity 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{rule.name}</span>
            <span className={`tag ${PRIORITY_BADGE[rule.priority as Priority] ?? 'tag-offline'}`} style={{ textTransform: 'capitalize' }}>{rule.priority}</span>
            {!rule.isEnabled && <span className="tag tag-offline">disabled</span>}
          </div>
          {rule.description && (
            <p className="dim" style={{ fontSize: 12, marginBottom: 8 }}>{rule.description}</p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            {rule.conditions?.map((cond: any, ci: number) => {
              const op = OPERATORS.find(o => o.value === cond.operator);
              return (
                <span key={ci} className="mono" style={{ fontSize: 11, padding: '3px 8px', border: '1px solid hsl(var(--border))', background: 'hsl(var(--surface-raised))' }}>
                  {cond.field} <span className="acc">{op?.symbol ?? cond.operator}</span> {String(cond.value)}
                </span>
              );
            })}
            {rule.conditions?.length > 0 && <span className="mono faint" style={{ fontSize: 11 }}>→</span>}
            {rule.actions?.map((action: any, ai: number) => (
              <span key={ai} className="tag tag-accent" style={{ gap: 4 }}>
                <ActionIcon size={9} /> {action.type}
              </span>
            ))}
          </div>
          <p className="mono faint" style={{ fontSize: 10.5, marginTop: 8 }}>
            {rule.fireCount > 0 ? `Fired ${rule.fireCount}×` : 'Never fired'}
            {rule.lastFiredAt ? ` · Last: ${timeAgo(rule.lastFiredAt)}` : ''}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <label className="switch" title={rule.isEnabled ? 'Disable' : 'Enable'}>
            <input type="checkbox" checked={rule.isEnabled} onChange={() => onToggle(rule._id)} />
            <span />
          </label>
          <button
            onClick={() => { if (confirm('Delete this rule?')) onDelete(rule._id); }}
            className="btn btn-ghost btn-sm btn-icon"
            style={{ color: 'hsl(var(--muted-fg))' }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Step indicator ───────────────────────────────────── */
function Steps({ current }: { current: number }) {
  const STEPS = ['Trigger', 'Condition', 'Action', 'Review'];
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((label, i) => {
        const n = i + 1;
        return (
          <div key={n} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold transition-all ${
                current > n ? 'bg-primary text-white'
                : current === n ? 'bg-primary text-white ring-4 ring-primary/15'
                : 'bg-muted text-muted-foreground border border-border'
              }`}>
                {current > n ? <Check size={12} strokeWidth={3} /> : n}
              </div>
              <span className={`text-[11px] whitespace-nowrap font-medium ${current >= n ? 'text-foreground' : 'text-muted-foreground'}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-2 mb-4 transition-colors ${current > n ? 'bg-primary' : 'bg-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Rule modal ───────────────────────────────────────── */
function CreateRuleModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);

  // Step 1 — Trigger
  const [triggerType, setTriggerType] = useState('telemetry');
  const [deviceScope, setDeviceScope] = useState('all');
  const [scopeDeviceId, setScopeDevice] = useState('');

  // Step 2 — Conditions
  const [conditions, setConditions] = useState([
    { field: '', operator: 'gt', value: '', logic: 'and' as 'and' | 'or' },
  ]);

  // Step 3 — Action
  const [actionType, setActionType] = useState('alert');
  const [actionConfig, setActionConfig] = useState<Record<string, string>>({
    severity: 'warning', title: '', message: '',
    email: '', subject: '', body: '',
    phone: '', smsMessage: '',
    commandDeviceId: '', commandName: '', commandPayload: '{}',
    webhookUrl: '', webhookMethod: 'POST', webhookBody: '',
  });

  // Step 4 — Settings
  const [ruleName, setRuleName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');

  const [loading, setLoading] = useState(false);

  const { data: devicesData } = useQuery({
    queryKey: ['devices', 'rules-page'],
    queryFn: () => devicesApi.list({ limit: 100 }),
  });
  const devices = devicesData?.devices ?? [];

  const updCond = (i: number, patch: Partial<typeof conditions[0]>) =>
    setConditions(prev => prev.map((c, idx) => idx === i ? { ...c, ...patch } : c));

  const addCond = () => setConditions(prev => [...prev, { field: '', operator: 'gt', value: '', logic: 'and' }]);
  const removeCond = (i: number) => setConditions(prev => prev.filter((_, idx) => idx !== i));

  const updAction = (k: string, v: string) => setActionConfig(prev => ({ ...prev, [k]: v }));

  const buildPayload = () => ({
    name: ruleName,
    description,
    triggerType,
    priority,
    conditions: conditions.filter(c => c.field.trim()).map(c => ({
      field: c.field, operator: c.operator,
      value: parseFloat(c.value) || c.value,
    })),
    conditionLogic: conditions.some(c => c.logic === 'or') ? 'or' : 'and',
    actions: [buildAction()],
    isEnabled: true,
  });

  const buildAction = () => {
    switch (actionType) {
      case 'alert':  return { type: 'alert',  config: { severity: actionConfig.severity, title: actionConfig.title, message: actionConfig.message } };
      case 'email':  return { type: 'email',  config: { to: actionConfig.email, subject: actionConfig.subject, body: actionConfig.body } };
      case 'sms':    return { type: 'sms',    config: { to: actionConfig.phone, message: actionConfig.smsMessage } };
      case 'command':return { type: 'command',config: { deviceId: actionConfig.commandDeviceId, name: actionConfig.commandName, payload: actionConfig.commandPayload } };
      case 'webhook':return { type: 'webhook',config: { url: actionConfig.webhookUrl, method: actionConfig.webhookMethod, body: actionConfig.webhookBody } };
      default:       return { type: actionType, config: { severity: actionConfig.severity, title: actionConfig.title } };
    }
  };

  const handleSubmit = async () => {
    if (!ruleName.trim()) { toast.error('Enter a rule name'); return; }
    if (conditions.every(c => !c.field.trim())) { toast.error('Add at least one condition'); return; }
    setLoading(true);
    try {
      await apiClient.post('/rules', buildPayload());
      toast.success('Rule created');
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      onClose();
    } catch { toast.error('Failed to create rule'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="relative bg-background rounded-2xl border border-border shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0 bg-surface/60">
          <div>
            <h2 className="text-[16px] font-semibold text-foreground">Create Automation Rule</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {step === 1 ? 'Choose what triggers this rule' :
               step === 2 ? 'Define the conditions that must be met' :
               step === 3 ? 'Configure the action to take' :
               'Name your rule and review'}
            </p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm !px-0 w-8 h-8">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <Steps current={step} />

          {/* ── Step 1: Trigger ── */}
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <p className="text-[13px] font-medium text-foreground">What should trigger this rule?</p>
              <div className="grid grid-cols-2 gap-3">
                {TRIGGER_TYPES.map(({ value, Icon, label, desc }) => (
                  <button
                    key={value} type="button" onClick={() => setTriggerType(value)}
                    className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                      triggerType === value
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:border-border-strong bg-surface'
                    }`}
                  >
                    <div className={`p-2 rounded-lg flex-shrink-0 ${triggerType === value ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      <Icon size={15} />
                    </div>
                    <div>
                      <p className={`text-[13px] font-semibold ${triggerType === value ? 'text-primary' : 'text-foreground'}`}>{label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-[13px] font-medium text-foreground mb-2">Device Scope</label>
                <div className="flex gap-2 mb-3">
                  {[{v:'all',l:'All Devices'},{v:'specific',l:'Specific Device'}].map(({v,l}) => (
                    <button
                      key={v} type="button" onClick={() => setDeviceScope(v)}
                      className={`flex-1 py-2 rounded-xl border text-[12px] font-medium transition-all ${
                        deviceScope === v
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                {deviceScope === 'specific' && (
                  <select value={scopeDeviceId} onChange={e => setScopeDevice(e.target.value)} className="select">
                    <option value="">Select device…</option>
                    {devices.map((d: any) => <option key={d._id} value={d._id}>{d.name}</option>)}
                  </select>
                )}
              </div>
            </motion.div>
          )}

          {/* ── Step 2: Conditions ── */}
          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <p className="text-[13px] font-medium text-foreground">When these conditions are met:</p>

              <div className="space-y-3">
                {conditions.map((cond, i) => (
                  <div key={i} className="space-y-2">
                    {i > 0 && (
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={() => updCond(i, { logic: cond.logic === 'and' ? 'or' : 'and' })}
                          className="px-4 py-1 rounded-full border border-border bg-muted text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-border-strong transition-colors"
                        >
                          {cond.logic}
                        </button>
                      </div>
                    )}
                    <div className="card p-3 flex items-center gap-2">
                      <div className="flex-1">
                        <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Field</label>
                        <input
                          className="input text-[13px] font-mono"
                          placeholder="e.g. temperature"
                          value={cond.field}
                          onChange={e => updCond(i, { field: e.target.value })}
                        />
                      </div>
                      <div className="flex-shrink-0">
                        <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Operator</label>
                        <select
                          value={cond.operator}
                          onChange={e => updCond(i, { operator: e.target.value })}
                          className="select !w-24 text-center text-[16px] font-semibold"
                        >
                          {OPERATORS.map(op => (
                            <option key={op.value} value={op.value} title={op.label}>
                              {op.symbol}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Value</label>
                        <input
                          className="input text-[13px]"
                          placeholder="e.g. 80"
                          value={cond.value}
                          onChange={e => updCond(i, { value: e.target.value })}
                        />
                      </div>
                      {conditions.length > 1 && (
                        <button
                          onClick={() => removeCond(i)}
                          className="self-end mb-0.5 p-1.5 text-muted-foreground hover:text-red-500 rounded-lg hover:bg-red-500/10 transition-colors flex-shrink-0"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button" onClick={addCond}
                className="btn btn-secondary btn-sm gap-1.5 w-full"
              >
                <Plus size={13} /> Add Condition
              </button>

              <div className="bg-muted/40 rounded-xl p-3">
                <p className="text-[11px] text-muted-foreground">
                  <strong className="text-foreground">Tip:</strong> Click the AND / OR button between conditions to toggle the logic operator.
                </p>
              </div>
            </motion.div>
          )}

          {/* ── Step 3: Action ── */}
          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <p className="text-[13px] font-medium text-foreground">Then perform this action:</p>

              {/* Action type grid */}
              <div className="grid grid-cols-3 gap-2">
                {ACTION_TYPES.map(({ value, Icon, label, desc }) => (
                  <button
                    key={value} type="button" onClick={() => setActionType(value)}
                    className={`flex flex-col items-start gap-2 p-3 rounded-xl border text-left transition-all ${
                      actionType === value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-border-strong bg-surface'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg ${actionType === value ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      <Icon size={14} />
                    </div>
                    <div>
                      <p className={`text-[12px] font-semibold ${actionType === value ? 'text-primary' : 'text-foreground'}`}>{label}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Dynamic action config */}
              <div className="card p-4 space-y-3">
                {(actionType === 'alert' || actionType === 'notification') && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[12px] font-medium text-foreground mb-1.5">Severity</label>
                        <select value={actionConfig.severity} onChange={e => updAction('severity', e.target.value)} className="select">
                          {['info', 'warning', 'error', 'critical'].map(s => (
                            <option key={s} value={s} className="capitalize">{s}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-foreground mb-1.5">Title</label>
                        <input value={actionConfig.title} onChange={e => updAction('title', e.target.value)} className="input" placeholder="Alert title" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-foreground mb-1.5">Message</label>
                      <textarea value={actionConfig.message} onChange={e => updAction('message', e.target.value)} className="textarea" rows={2} placeholder="Describe the alert condition…" />
                    </div>
                  </>
                )}

                {actionType === 'email' && (
                  <>
                    <div>
                      <label className="block text-[12px] font-medium text-foreground mb-1.5">
                        <Mail size={12} className="inline mr-1" />To (email address)
                      </label>
                      <input type="email" value={actionConfig.email} onChange={e => updAction('email', e.target.value)} className="input" placeholder="alerts@company.com" />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-foreground mb-1.5">Subject</label>
                      <input value={actionConfig.subject} onChange={e => updAction('subject', e.target.value)} className="input" placeholder="[Orion Alert] {{rule.name}} triggered" />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-foreground mb-1.5">Body</label>
                      <textarea value={actionConfig.body} onChange={e => updAction('body', e.target.value)} className="textarea" rows={3} placeholder="Device {{device.name}} triggered rule at {{timestamp}}..." />
                    </div>
                    <p className="text-[11px] text-muted-foreground">Use {'{{device.name}}'}, {'{{rule.name}}'}, {'{{value}}'}, {'{{timestamp}}'} as template variables.</p>
                  </>
                )}

                {actionType === 'sms' && (
                  <>
                    <div>
                      <label className="block text-[12px] font-medium text-foreground mb-1.5">
                        <MessageSquare size={12} className="inline mr-1" />Phone Number
                      </label>
                      <input type="tel" value={actionConfig.phone} onChange={e => updAction('phone', e.target.value)} className="input" placeholder="+1 555 000 0000" />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-foreground mb-1.5">Message</label>
                      <textarea value={actionConfig.smsMessage} onChange={e => updAction('smsMessage', e.target.value)} className="textarea" rows={3} placeholder="Alert: {{rule.name}} — {{device.name}} at {{value}}" />
                    </div>
                    <p className="text-[11px] text-muted-foreground">Max 160 characters. Use template variables.</p>
                  </>
                )}

                {actionType === 'command' && (
                  <>
                    <div>
                      <label className="block text-[12px] font-medium text-foreground mb-1.5">Target Device</label>
                      <select value={actionConfig.commandDeviceId} onChange={e => updAction('commandDeviceId', e.target.value)} className="select">
                        <option value="">Select device…</option>
                        {devices.map((d: any) => <option key={d._id} value={d._id}>{d.name}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[12px] font-medium text-foreground mb-1.5">Command Name</label>
                        <input value={actionConfig.commandName} onChange={e => updAction('commandName', e.target.value)} className="input font-mono" placeholder="reboot, set_mode…" />
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-foreground mb-1.5">Payload (JSON)</label>
                        <input value={actionConfig.commandPayload} onChange={e => updAction('commandPayload', e.target.value)} className="input font-mono text-[12px]" placeholder="{}" />
                      </div>
                    </div>
                  </>
                )}

                {actionType === 'webhook' && (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2">
                        <label className="block text-[12px] font-medium text-foreground mb-1.5">
                          <Globe size={12} className="inline mr-1" />Webhook URL
                        </label>
                        <input type="url" value={actionConfig.webhookUrl} onChange={e => updAction('webhookUrl', e.target.value)} className="input" placeholder="https://hooks.slack.com/…" />
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-foreground mb-1.5">Method</label>
                        <select value={actionConfig.webhookMethod} onChange={e => updAction('webhookMethod', e.target.value)} className="select">
                          {['POST', 'PUT', 'PATCH'].map(m => <option key={m}>{m}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-foreground mb-1.5">Body Template (JSON)</label>
                      <textarea value={actionConfig.webhookBody} onChange={e => updAction('webhookBody', e.target.value)} className="textarea font-mono text-[12px]" rows={4}
                        placeholder={'{"text": "Alert: {{rule.name}} fired for {{device.name}}", "value": "{{value}}"}'} />
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}

          {/* ── Step 4: Review ── */}
          {step === 4 && (
            <motion.div key="s4" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[13px] font-medium text-foreground mb-1.5">
                    Rule Name <span className="text-red-500">*</span>
                  </label>
                  <input value={ruleName} onChange={e => setRuleName(e.target.value)} className="input" placeholder="e.g. High Temperature Alert" required />
                </div>
                <div className="col-span-2">
                  <label className="block text-[13px] font-medium text-foreground mb-1.5">Description</label>
                  <input value={description} onChange={e => setDescription(e.target.value)} className="input" placeholder="Optional description" />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-foreground mb-1.5">Priority</label>
                  <div className="flex gap-2">
                    {PRIORITY_OPTIONS.map(p => (
                      <button
                        key={p} type="button" onClick={() => setPriority(p)}
                        className={`flex-1 py-1.5 rounded-lg border text-[12px] font-medium capitalize transition-all ${
                          priority === p
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="card p-4 space-y-3 bg-muted/30">
                <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Summary</p>
                <div className="grid grid-cols-2 gap-3 text-[13px]">
                  <div>
                    <p className="text-muted-foreground text-[11px]">Trigger</p>
                    <p className="text-foreground font-medium capitalize">{triggerType.replace('_',' ')}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[11px]">Scope</p>
                    <p className="text-foreground font-medium">{deviceScope === 'all' ? 'All devices' : 'Specific device'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[11px]">Conditions</p>
                    <p className="text-foreground font-medium">{conditions.filter(c => c.field).length} condition(s)</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[11px]">Action</p>
                    <p className="text-foreground font-medium capitalize">{actionType}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border flex-shrink-0 bg-surface/60">
          <div>
            {step > 1 && (
              <button onClick={() => setStep(s => s - 1)} className="btn btn-secondary">
                <ChevronLeft size={15} /> Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn btn-ghost text-muted-foreground">Cancel</button>
            {step < 4 ? (
              <button onClick={() => setStep(s => s + 1)} className="btn btn-primary">
                Continue <ChevronRight size={15} />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={loading} className="btn btn-primary">
                {loading
                  ? <><Loader2 size={14} className="animate-spin" /> Creating…</>
                  : <><Check size={14} /> Create Rule</>
                }
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────── */
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
    <div className="page">
      {/* ── Page header ── */}
      <div className="ph">
        <div>
          <div style={{ marginBottom: 6 }}>
            <span className="eyebrow">Intelligence · Automation rules</span>
          </div>
          <h1>Rules <em>Engine</em>.</h1>
          <p className="lede">
            {rules.length > 0 ? `${rules.length} rule${rules.length !== 1 ? 's' : ''} configured.` : 'No rules yet.'} Automate alerts, emails, commands, and webhooks when device conditions are met.
          </p>
        </div>
        <div style={{ gridColumn: 3, display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 20 }}>
          <button onClick={() => setShowModal(true)} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
            <Plus size={13} /> New rule
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 100 }} />)}
        </div>
      ) : rules.length === 0 ? (
        <div className="panel" style={{ padding: '64px 16px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, lineHeight: 1, marginBottom: 8 }}>
            No <em style={{ color: 'hsl(var(--primary))' }}>rules</em> configured
          </div>
          <p className="dim" style={{ fontSize: 13, marginBottom: 20, maxWidth: '40ch', margin: '0 auto 20px' }}>
            Create automation rules to trigger alerts, emails, commands, or webhooks when device conditions are met.
          </p>
          <button onClick={() => setShowModal(true)} className="btn btn-primary" style={{ gap: 6 }}>
            <Plus size={13} /> Create first rule
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {rules.map((rule: any, i: number) => (
            <RuleCard
              key={rule._id}
              rule={rule}
              onToggle={id => toggleMutation.mutate(id)}
              onDelete={id => deleteMutation.mutate(id)}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showModal && <CreateRuleModal onClose={() => setShowModal(false)} />}
      </AnimatePresence>
    </div>
  );
}
