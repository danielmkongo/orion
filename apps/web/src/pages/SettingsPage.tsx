import { useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon, Bell, Shield, Database, Globe, ChevronRight, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={cn(
        'relative w-9 h-5 rounded-full transition-colors flex-shrink-0',
        enabled ? 'bg-primary' : 'bg-border-strong'
      )}
    >
      <span className={cn(
        'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200',
        enabled ? 'translate-x-4' : 'translate-x-0.5'
      )} />
    </button>
  );
}

export function SettingsPage() {
  const { user } = useAuthStore();
  const { theme, setTheme } = useUIStore();
  const [activeSection, setActiveSection] = useState('appearance');
  const [notifState, setNotifState] = useState({
    critical: true, offline: true, rules: false, ota: true, commands: false,
  });
  const [displayState, setDisplayState] = useState({
    compact: false, relative: true, animated: true,
  });

  const sections = [
    { id: 'appearance',    icon: Sun,      label: 'Appearance'       },
    { id: 'notifications', icon: Bell,     label: 'Notifications'    },
    { id: 'security',      icon: Shield,   label: 'Security'         },
    { id: 'organization',  icon: Globe,    label: 'Organization'     },
    { id: 'data',          icon: Database, label: 'Data & Retention' },
  ];

  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-foreground tracking-tight">Settings</h1>
        <p className="text-[14px] text-muted-foreground mt-0.5">Manage your workspace preferences</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-52 shrink-0">
          <div className="card p-2 space-y-0.5">
            {sections.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors',
                  activeSection === id
                    ? 'bg-primary/8 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-4">
          <AnimatePresence mode="wait">
            {activeSection === 'appearance' && (
              <motion.div key="appearance" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="card p-5">
                  <h3 className="text-[13px] font-semibold text-foreground mb-4">Theme</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { value: 'light', label: 'Light', icon: Sun   },
                      { value: 'dark',  label: 'Dark',  icon: Moon  },
                      { value: 'system',label: 'System',icon: Monitor},
                    ] as const).map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        onClick={() => setTheme(value === 'system' ? 'light' : value)}
                        className={cn(
                          'relative rounded-xl border-2 p-4 text-left transition-all',
                          (theme === value || (value === 'system' && !['light','dark'].includes(theme)))
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-border-strong'
                        )}
                      >
                        <div className={cn(
                          'w-full h-14 rounded-lg mb-3 flex items-end p-2',
                          value === 'dark'  ? 'bg-[#151210]' :
                          value === 'light' ? 'bg-white border border-border' :
                          'bg-gradient-to-br from-white to-[#151210]'
                        )}>
                          <div className="flex gap-1">
                            {[3, 5, 4].map((h, i) => (
                              <div
                                key={i}
                                className="w-3 rounded-sm bg-primary"
                                style={{ height: `${h * 5}px` }}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[13px] font-medium text-foreground">{label}</span>
                          {theme === value && <span className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="card p-5">
                  <h3 className="text-[13px] font-semibold text-foreground mb-4">Display</h3>
                  {([
                    { key: 'compact',  label: 'Compact sidebar',             desc: 'Show only icons in the sidebar' },
                    { key: 'relative', label: 'Show timestamps as relative',  desc: '"5 minutes ago" instead of a date' },
                    { key: 'animated', label: 'Animated transitions',          desc: 'Enable smooth page and widget animations' },
                  ] as const).map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
                      <div>
                        <p className="text-[13px] text-foreground">{label}</p>
                        <p className="text-[12px] text-muted-foreground mt-0.5">{desc}</p>
                      </div>
                      <Toggle
                        enabled={displayState[key]}
                        onChange={v => setDisplayState(s => ({ ...s, [key]: v }))}
                      />
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeSection === 'notifications' && (
              <motion.div key="notifications" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                <div className="card p-5">
                  <h3 className="text-[13px] font-semibold text-foreground mb-4">Alert Notifications</h3>
                  {([
                    { key: 'critical', label: 'Critical alerts',         desc: 'System-level critical notifications'     },
                    { key: 'offline',  label: 'Device offline alerts',   desc: 'Notify when devices go offline'          },
                    { key: 'rules',    label: 'Rule triggers',           desc: 'Notify when automation rules fire'       },
                    { key: 'ota',      label: 'OTA update completion',   desc: 'Notify on firmware update status'        },
                    { key: 'commands', label: 'Command failures',        desc: 'Notify on failed command execution'      },
                  ] as const).map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
                      <div>
                        <p className="text-[13px] text-foreground">{label}</p>
                        <p className="text-[12px] text-muted-foreground mt-0.5">{desc}</p>
                      </div>
                      <Toggle
                        enabled={notifState[key]}
                        onChange={v => setNotifState(s => ({ ...s, [key]: v }))}
                      />
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeSection === 'security' && (
              <motion.div key="security" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="card p-5">
                  <h3 className="text-[13px] font-semibold text-foreground mb-4">Account Security</h3>
                  <div className="space-y-2">
                    {[
                      { label: 'Change Password',           desc: 'Update your account password',        right: <ChevronRight size={16} className="text-muted-foreground" /> },
                      { label: 'Two-Factor Authentication', desc: 'Add an extra layer of security',      right: <span className="badge badge-warning text-[11px]">Not set up</span> },
                      { label: 'Active Sessions',           desc: 'Manage where you\'re logged in',      right: <ChevronRight size={16} className="text-muted-foreground" /> },
                    ].map(({ label, desc, right }) => (
                      <button key={label} className="w-full flex items-center justify-between p-3.5 bg-muted hover:bg-surface-raised rounded-xl transition-colors text-left">
                        <div>
                          <p className="text-[13px] font-medium text-foreground">{label}</p>
                          <p className="text-[12px] text-muted-foreground mt-0.5">{desc}</p>
                        </div>
                        {right}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {activeSection === 'organization' && (
              <motion.div key="organization" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                <div className="card p-5">
                  <h3 className="text-[13px] font-semibold text-foreground mb-5">Organization Details</h3>
                  <div className="space-y-4 max-w-md">
                    <div>
                      <label className="block text-[12px] font-medium text-muted-foreground mb-1.5">Organization Name</label>
                      <input className="input" defaultValue="Vortan Demo" />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-muted-foreground mb-1.5">Subdomain</label>
                      <div className="flex items-center gap-2">
                        <input className="input flex-1" defaultValue="vortan-demo" />
                        <span className="text-[13px] text-muted-foreground whitespace-nowrap">.orion.vortan.io</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-muted-foreground mb-1.5">Plan</label>
                      <div className="flex items-center gap-2">
                        <span className="badge badge-primary">Pro</span>
                        <span className="text-[12px] text-muted-foreground">Unlimited devices · 90-day retention · Priority support</span>
                      </div>
                    </div>
                    <button className="btn btn-primary">Save Changes</button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeSection === 'data' && (
              <motion.div key="data" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                <div className="card p-5">
                  <h3 className="text-[13px] font-semibold text-foreground mb-4">Data Retention</h3>
                  <div className="space-y-1">
                    {[
                      { label: 'Telemetry data',   current: '90 days', options: ['30 days', '90 days', '180 days', '1 year', 'Forever'] },
                      { label: 'Audit logs',        current: '1 year',  options: ['90 days', '1 year', '2 years', 'Forever'] },
                      { label: 'Location history',  current: '30 days', options: ['7 days', '30 days', '90 days', '1 year'] },
                    ].map(({ label, current, options }) => (
                      <div key={label} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
                        <p className="text-[13px] text-foreground">{label}</p>
                        <select className="select !w-auto !h-8 !text-[12px] min-w-[110px]" defaultValue={current}>
                          {options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
