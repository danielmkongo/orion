import { useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { Sun, Moon } from 'lucide-react';

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="switch" style={{ cursor: 'pointer' }}>
      <input type="checkbox" checked={enabled} onChange={e => onChange(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
      <span />
    </label>
  );
}

const SECTIONS = [
  { id: 'appearance',    label: 'Appearance'       },
  { id: 'notifications', label: 'Notifications'    },
  { id: 'security',      label: 'Security'         },
  { id: 'organization',  label: 'Organization'     },
  { id: 'data',          label: 'Data & Retention' },
];

export function SettingsPage() {
  const { user } = useAuthStore();
  const { theme, setTheme, sidebarCollapsed, setSidebarCollapsed } = useUIStore();
  const [activeSection, setActiveSection] = useState('appearance');
  const [notifState, setNotifState] = useState({ critical: true, offline: true, rules: false, ota: true, commands: false });
  const [displayState, setDisplayState] = useState({ compact: sidebarCollapsed, relative: true, animated: true });

  return (
    <div className="page">
      {/* ── Page header ── */}
      <div className="ph">
        <div>
          <div style={{ marginBottom: 6 }}>
            <span className="eyebrow">Admin · Workspace preferences</span>
          </div>
          <h1><em>Settings</em>.</h1>
          <p className="lede">Manage your workspace appearance, notifications, security, and data preferences.</p>
        </div>
        <div className="meta hide-sm" style={{ gridColumn: 3 }}>
          <div>Signed in as</div>
          <div><b>{user?.name}</b></div>
          <div>{user?.email}</div>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 32 }}>
        {/* Nav */}
        <div>
          {SECTIONS.map(({ id, label }, i) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '9px 10px',
                fontSize: 13.5, fontWeight: activeSection === id ? 500 : 400,
                color: activeSection === id ? 'hsl(var(--fg))' : 'hsl(var(--muted-fg))',
                background: 'transparent', border: 0,
                borderLeft: `2px solid ${activeSection === id ? 'hsl(var(--primary))' : 'transparent'}`,
                marginLeft: -2, cursor: 'pointer',
                transition: 'all 0.12s',
                textAlign: 'left',
              }}
            >
              <span className="mono faint" style={{ fontSize: 10, width: 16 }}>{String(i + 1).padStart(2, '0')}</span>
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div>
          {activeSection === 'appearance' && (
            <>
              {/* Theme */}
              <div className="section" style={{ paddingTop: 0, borderTop: 'none' }}>
                <div className="ssh" style={{ fontSize: 20 }}>Theme</div>
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
                    {[
                      { value: 'light', label: 'Light', bg: '#F6F5F1' },
                      { value: 'dark',  label: 'Dark',  bg: '#050505' },
                    ].map(({ value, label, bg }) => (
                      <button
                        key={value}
                        onClick={() => setTheme(value as 'light' | 'dark')}
                        className="panel"
                        style={{
                          padding: 16, textAlign: 'left', cursor: 'pointer',
                          border: theme === value ? '2px solid hsl(var(--primary))' : '1px solid hsl(var(--border))',
                          background: 'hsl(var(--surface))',
                        }}
                      >
                        <div style={{ width: '100%', height: 56, background: bg, marginBottom: 10, border: '1px solid hsl(var(--border))' }} />
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
                          {theme === value && <span style={{ width: 8, height: 8, background: 'hsl(var(--primary))', borderRadius: '50%' }} />}
                        </div>
                      </button>
                    ))}
                  </div>
                  {/* Display toggles */}
                  <div className="eyebrow" style={{ marginBottom: 12 }}>Display</div>
                  {[
                    { key: 'compact',  label: 'Compact sidebar',            desc: 'Show only icons in the sidebar'          },
                    { key: 'relative', label: 'Relative timestamps',        desc: '"5 minutes ago" instead of a date'       },
                    { key: 'animated', label: 'Animated transitions',       desc: 'Enable smooth page and widget animations' },
                  ].map(({ key, label, desc }) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid hsl(var(--border) / 0.5)' }}>
                      <div>
                        <p style={{ fontSize: 13 }}>{label}</p>
                        <p className="dim" style={{ fontSize: 12, marginTop: 2 }}>{desc}</p>
                      </div>
                      <Toggle
                        enabled={displayState[key as keyof typeof displayState]}
                        onChange={v => {
                          setDisplayState(s => ({ ...s, [key]: v }));
                          if (key === 'compact') setSidebarCollapsed(v);
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeSection === 'notifications' && (
            <div className="section" style={{ paddingTop: 0, borderTop: 'none' }}>
              <div className="ssh" style={{ fontSize: 20 }}>Notifications</div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 12 }}>Alert channels</div>
                {[
                  { key: 'critical', label: 'Critical alerts',       desc: 'System-level critical notifications'  },
                  { key: 'offline',  label: 'Device offline',        desc: 'Notify when devices go offline'       },
                  { key: 'rules',    label: 'Rule triggers',         desc: 'Notify when automation rules fire'    },
                  { key: 'ota',      label: 'OTA updates',           desc: 'Notify on firmware update status'     },
                  { key: 'commands', label: 'Command failures',      desc: 'Notify on failed command execution'   },
                ].map(({ key, label, desc }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid hsl(var(--border) / 0.5)' }}>
                    <div>
                      <p style={{ fontSize: 13 }}>{label}</p>
                      <p className="dim" style={{ fontSize: 12, marginTop: 2 }}>{desc}</p>
                    </div>
                    <Toggle
                      enabled={notifState[key as keyof typeof notifState]}
                      onChange={v => setNotifState(s => ({ ...s, [key]: v }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'security' && (
            <div className="section" style={{ paddingTop: 0, borderTop: 'none' }}>
              <div className="ssh" style={{ fontSize: 20 }}>Security</div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 12 }}>Account security</div>
                {[
                  { label: 'Change Password',           desc: 'Update your account password'    },
                  { label: 'Two-Factor Authentication', desc: 'Add an extra layer of security'  },
                  { label: 'Active Sessions',           desc: "Manage where you're logged in"   },
                ].map(({ label, desc }) => (
                  <button key={label} className="panel" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', marginBottom: 8, cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s' }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 500 }}>{label}</p>
                      <p className="dim" style={{ fontSize: 12, marginTop: 2 }}>{desc}</p>
                    </div>
                    <span className="mono faint" style={{ fontSize: 11 }}>→</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'organization' && (
            <div className="section" style={{ paddingTop: 0, borderTop: 'none' }}>
              <div className="ssh" style={{ fontSize: 20 }}>Organization</div>
              <div style={{ maxWidth: 440 }}>
                <div style={{ marginBottom: 16 }}>
                  <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Organization name</label>
                  <input className="input" defaultValue="Vortan Demo" />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Subdomain</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input className="input" defaultValue="vortan-demo" style={{ flex: 1 }} />
                    <span className="dim" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>.orion.vortan.io</span>
                  </div>
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Plan</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="tag tag-accent">Pro</span>
                    <span className="dim" style={{ fontSize: 12 }}>Unlimited devices · 90-day retention · Priority support</span>
                  </div>
                </div>
                <button className="btn btn-primary">Save changes</button>
              </div>
            </div>
          )}

          {activeSection === 'data' && (
            <div className="section" style={{ paddingTop: 0, borderTop: 'none' }}>
              <div className="ssh" style={{ fontSize: 20 }}>Data & Retention</div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 12 }}>Retention periods</div>
                {[
                  { label: 'Telemetry data',   current: '90 days', options: ['30 days', '90 days', '180 days', '1 year', 'Forever'] },
                  { label: 'Audit logs',        current: '1 year',  options: ['90 days', '1 year', '2 years', 'Forever'] },
                  { label: 'Location history',  current: '30 days', options: ['7 days', '30 days', '90 days', '1 year'] },
                ].map(({ label, current, options }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid hsl(var(--border) / 0.5)' }}>
                    <p style={{ fontSize: 13 }}>{label}</p>
                    <select className="select" defaultValue={current} style={{ width: 'auto', height: 32, fontSize: 12, minWidth: 110 }}>
                      {options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
