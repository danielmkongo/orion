import { useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { motion } from 'framer-motion';
import { Sun, Moon, Bell, Shield, Database, Globe, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SettingsPage() {
  const { user } = useAuthStore();
  const { theme, setTheme } = useUIStore();
  const [activeSection, setActiveSection] = useState('appearance');

  const sections = [
    { id: 'appearance', icon: Sun, label: 'Appearance' },
    { id: 'notifications', icon: Bell, label: 'Notifications' },
    { id: 'security', icon: Shield, label: 'Security' },
    { id: 'organization', icon: Globe, label: 'Organization' },
    { id: 'data', icon: Database, label: 'Data & Retention' },
  ];

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your workspace preferences</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-52 shrink-0">
          <div className="card p-2 space-y-0.5">
            {sections.map(section => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={cn('w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors',
                    activeSection === section.id
                      ? 'bg-orion-600/20 text-orion-300'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-surface-3'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {section.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-4">
          {activeSection === 'appearance' && (
            <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-slate-200 mb-4">Theme</h3>
                <div className="grid grid-cols-2 gap-3">
                  {(['dark', 'light'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={cn(
                        'relative rounded-xl border-2 p-4 transition-all',
                        theme === t ? 'border-orion-500 bg-orion-600/10' : 'border-surface-border hover:border-surface-border-strong'
                      )}
                    >
                      <div className={cn('w-full h-16 rounded-lg mb-3 flex items-end p-2',
                        t === 'dark' ? 'bg-[#0a0b14]' : 'bg-white border border-gray-200'
                      )}>
                        <div className="flex gap-1">
                          {[3, 5, 4].map((h, i) => (
                            <div key={i} className={cn('w-3 rounded-sm', t === 'dark' ? 'bg-orion-600' : 'bg-orion-500')}
                              style={{ height: `${h * 6}px` }} />
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-200 capitalize">{t} Mode</span>
                        {theme === t && (
                          <span className="w-2 h-2 rounded-full bg-orion-500" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="card p-5">
                <h3 className="text-sm font-semibold text-slate-200 mb-4">Display</h3>
                {[
                  { label: 'Compact sidebar', desc: 'Show only icons in the sidebar' },
                  { label: 'Show timestamps as relative', desc: 'e.g. "5 minutes ago" instead of a date' },
                  { label: 'Animated transitions', desc: 'Enable smooth page and widget animations' },
                ].map(({ label, desc }) => (
                  <div key={label} className="flex items-center justify-between py-3 border-b border-surface-border/50 last:border-b-0">
                    <div>
                      <p className="text-sm text-slate-200">{label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                    </div>
                    <button className="relative w-9 h-5 rounded-full bg-orion-600 shrink-0">
                      <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-white rounded-full shadow" />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeSection === 'notifications' && (
            <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}>
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-slate-200 mb-4">Alert Notifications</h3>
                {[
                  { label: 'Critical alerts', desc: 'System-level critical notifications', enabled: true },
                  { label: 'Device offline alerts', desc: 'Notify when devices go offline', enabled: true },
                  { label: 'Rule triggers', desc: 'Notify when automation rules fire', enabled: false },
                  { label: 'OTA update completion', desc: 'Notify on firmware update status', enabled: true },
                  { label: 'Command failures', desc: 'Notify on failed command execution', enabled: false },
                ].map(({ label, desc, enabled }) => (
                  <div key={label} className="flex items-center justify-between py-3 border-b border-surface-border/50 last:border-b-0">
                    <div>
                      <p className="text-sm text-slate-200">{label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                    </div>
                    <button className={cn('relative w-9 h-5 rounded-full shrink-0 transition-colors',
                      enabled ? 'bg-orion-600' : 'bg-surface-3'
                    )}>
                      <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                        enabled ? 'translate-x-4' : 'translate-x-0.5'
                      )} />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeSection === 'security' && (
            <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-slate-200 mb-4">Account Security</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-surface-3 rounded-xl">
                    <div>
                      <p className="text-sm text-slate-200">Change Password</p>
                      <p className="text-xs text-slate-500 mt-0.5">Update your account password</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-surface-3 rounded-xl">
                    <div>
                      <p className="text-sm text-slate-200">Two-Factor Authentication</p>
                      <p className="text-xs text-slate-500 mt-0.5">Add an extra layer of security</p>
                    </div>
                    <span className="badge badge-warning text-[10px]">Not set up</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-surface-3 rounded-xl">
                    <div>
                      <p className="text-sm text-slate-200">Active Sessions</p>
                      <p className="text-xs text-slate-500 mt-0.5">Manage where you're logged in</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === 'organization' && (
            <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}>
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-slate-200 mb-4">Organization Details</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Organization Name</label>
                    <input className="input-field" defaultValue="Vortan Demo" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Subdomain</label>
                    <div className="flex items-center gap-2">
                      <input className="input-field flex-1" defaultValue="vortan-demo" />
                      <span className="text-sm text-slate-500">.orion.vortan.io</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Plan</label>
                    <div className="flex items-center gap-2">
                      <span className="badge badge-primary">Pro</span>
                      <span className="text-xs text-slate-500">Unlimited devices · 90-day retention · Priority support</span>
                    </div>
                  </div>
                  <button className="btn-primary">Save Changes</button>
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === 'data' && (
            <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}>
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-slate-200 mb-4">Data Retention</h3>
                <div className="space-y-4">
                  {[
                    { label: 'Telemetry data', current: '90 days', options: ['30 days', '90 days', '180 days', '1 year', 'Forever'] },
                    { label: 'Audit logs', current: '1 year', options: ['90 days', '1 year', '2 years', 'Forever'] },
                    { label: 'Location history', current: '30 days', options: ['7 days', '30 days', '90 days', '1 year'] },
                  ].map(({ label, current, options }) => (
                    <div key={label} className="flex items-center justify-between py-3 border-b border-surface-border/50 last:border-b-0">
                      <p className="text-sm text-slate-200">{label}</p>
                      <select className="bg-surface-3 border border-surface-border rounded-lg px-3 py-1.5 text-xs text-slate-300" defaultValue={current}>
                        {options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
