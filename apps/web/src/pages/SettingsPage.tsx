import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { authApi, orgApi } from '@/api/auth';
import type { Organization } from '@orion/shared';
import { Check, Eye, EyeOff } from 'lucide-react';

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="switch" style={{ cursor: 'pointer' }}>
      <input type="checkbox" checked={enabled} onChange={e => onChange(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
      <span />
    </label>
  );
}

function SaveBanner({ saved }: { saved: boolean }) {
  if (!saved) return null;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 12px', background: 'hsl(var(--primary) / 0.1)',
      border: '1px solid hsl(var(--primary) / 0.3)',
      color: 'hsl(var(--primary))', fontSize: 12, marginLeft: 12,
    }}>
      <Check size={13} /> Saved
    </div>
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
  const { user, setUser } = useAuthStore();
  const {
    theme, setTheme,
    sidebarCollapsed, setSidebarCollapsed,
    relativeTimestamps, setRelativeTimestamps,
    animationsEnabled, setAnimationsEnabled,
    notifPrefs, setNotifPref,
  } = useUIStore();

  const [activeSection, setActiveSection] = useState('appearance');

  // ── Profile ──
  const [profileName, setProfileName] = useState(user?.name ?? '');
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);

  // ── Password ──
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwShowCurrent, setPwShowCurrent] = useState(false);
  const [pwShowNew, setPwShowNew] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  // ── Organization ──
  const [org, setOrg] = useState<Organization | null>(null);
  const [orgName, setOrgName] = useState('');
  const [orgSaved, setOrgSaved] = useState(false);
  const [orgError, setOrgError] = useState('');
  const [orgLoading, setOrgLoading] = useState(false);

  // ── Retention ──
  const RETENTION_DEFAULTS = { telemetry: '90 days', audit: '1 year', location: '30 days' };
  const [retention, setRetention] = useState(RETENTION_DEFAULTS);
  const [retentionSaved, setRetentionSaved] = useState(false);

  useEffect(() => {
    if (activeSection === 'organization' && !org) {
      orgApi.get().then(o => {
        setOrg(o);
        setOrgName(o.name);
        const ret = (o as any).settings?.retention;
        if (ret) setRetention({ ...RETENTION_DEFAULTS, ...ret });
      }).catch(() => {});
    }
  }, [activeSection]);

  async function saveProfile() {
    if (!profileName.trim()) return;
    setProfileLoading(true);
    setProfileError('');
    try {
      const updated = await authApi.updateMe(profileName.trim());
      setUser(updated);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (e: any) {
      setProfileError(e?.response?.data?.error ?? 'Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  }

  async function savePassword() {
    if (!pwCurrent || !pwNew || !pwConfirm) { setPwError('All fields required'); return; }
    if (pwNew !== pwConfirm) { setPwError('New passwords do not match'); return; }
    if (pwNew.length < 8) { setPwError('Password must be at least 8 characters'); return; }
    setPwLoading(true);
    setPwError('');
    try {
      await authApi.changePassword(pwCurrent, pwNew);
      setPwSuccess(true);
      setPwCurrent(''); setPwNew(''); setPwConfirm('');
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (e: any) {
      setPwError(e?.response?.data?.error ?? 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  }

  async function saveOrg() {
    if (!orgName.trim()) return;
    setOrgLoading(true);
    setOrgError('');
    try {
      const updated = await orgApi.update({ name: orgName.trim() });
      setOrg(updated);
      setOrgSaved(true);
      setTimeout(() => setOrgSaved(false), 3000);
    } catch (e: any) {
      setOrgError(e?.response?.data?.error ?? 'Failed to update organization');
    } finally {
      setOrgLoading(false);
    }
  }

  async function saveRetention() {
    try {
      await orgApi.update({ settings: { retention } });
      setRetentionSaved(true);
      setTimeout(() => setRetentionSaved(false), 3000);
    } catch {}
  }

  const canEditOrg = user?.role === 'admin' || user?.role === 'super_admin';

  return (
    <div className="page">
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
                marginLeft: -2, cursor: 'pointer', transition: 'all 0.12s', textAlign: 'left',
              }}
            >
              <span className="mono faint" style={{ fontSize: 10, width: 16 }}>{String(i + 1).padStart(2, '0')}</span>
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div>

          {/* ── Appearance ── */}
          {activeSection === 'appearance' && (
            <div className="section" style={{ paddingTop: 0, borderTop: 'none' }}>
              <div className="ssh" style={{ fontSize: 20 }}>Appearance</div>

              <div className="eyebrow" style={{ marginBottom: 12 }}>Theme</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 200px)', gap: 12, marginBottom: 28 }}>
                {([
                  { value: 'light', label: 'Light', bg: '#F6F5F1' },
                  { value: 'dark',  label: 'Dark',  bg: '#050505' },
                ] as const).map(({ value, label, bg }) => (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
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

              <div className="eyebrow" style={{ marginBottom: 12 }}>Display</div>
              {[
                {
                  key: 'compact' as const,
                  label: 'Compact sidebar',
                  desc: 'Show only icons in the sidebar',
                  value: sidebarCollapsed,
                  onChange: (v: boolean) => setSidebarCollapsed(v),
                },
                {
                  key: 'relative' as const,
                  label: 'Relative timestamps',
                  desc: '"5 minutes ago" instead of a date',
                  value: relativeTimestamps,
                  onChange: (v: boolean) => setRelativeTimestamps(v),
                },
                {
                  key: 'animated' as const,
                  label: 'Animated transitions',
                  desc: 'Enable smooth page and widget animations',
                  value: animationsEnabled,
                  onChange: (v: boolean) => setAnimationsEnabled(v),
                },
              ].map(({ key, label, desc, value, onChange }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid hsl(var(--border) / 0.5)' }}>
                  <div>
                    <p style={{ fontSize: 13 }}>{label}</p>
                    <p className="dim" style={{ fontSize: 12, marginTop: 2 }}>{desc}</p>
                  </div>
                  <Toggle enabled={value} onChange={onChange} />
                </div>
              ))}
            </div>
          )}

          {/* ── Notifications ── */}
          {activeSection === 'notifications' && (
            <div className="section" style={{ paddingTop: 0, borderTop: 'none' }}>
              <div className="ssh" style={{ fontSize: 20 }}>Notifications</div>
              <p className="dim" style={{ fontSize: 13, marginBottom: 20 }}>
                Choose which events trigger in-app notifications. These preferences are saved locally.
              </p>
              <div className="eyebrow" style={{ marginBottom: 12 }}>Alert channels</div>
              {([
                { key: 'critical' as const, label: 'Critical alerts',   desc: 'System-level critical notifications'  },
                { key: 'offline'  as const, label: 'Device offline',    desc: 'Notify when devices go offline'       },
                { key: 'rules'    as const, label: 'Rule triggers',     desc: 'Notify when automation rules fire'    },
                { key: 'ota'      as const, label: 'OTA updates',       desc: 'Notify on firmware update status'     },
                { key: 'commands' as const, label: 'Command failures',  desc: 'Notify on failed command execution'   },
              ]).map(({ key, label, desc }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid hsl(var(--border) / 0.5)' }}>
                  <div>
                    <p style={{ fontSize: 13 }}>{label}</p>
                    <p className="dim" style={{ fontSize: 12, marginTop: 2 }}>{desc}</p>
                  </div>
                  <Toggle enabled={notifPrefs[key]} onChange={v => setNotifPref(key, v)} />
                </div>
              ))}
            </div>
          )}

          {/* ── Security ── */}
          {activeSection === 'security' && (
            <div className="section" style={{ paddingTop: 0, borderTop: 'none' }}>
              <div className="ssh" style={{ fontSize: 20 }}>Security</div>

              {/* Profile name */}
              <div className="eyebrow" style={{ marginBottom: 12 }}>Profile</div>
              <div style={{ maxWidth: 380, marginBottom: 32 }}>
                <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Display name</label>
                <input
                  className="input"
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                  style={{ marginBottom: 12 }}
                />
                {profileError && <p style={{ color: 'hsl(var(--destructive))', fontSize: 12, marginBottom: 8 }}>{profileError}</p>}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <button className="btn btn-primary" onClick={saveProfile} disabled={profileLoading || !profileName.trim()}>
                    {profileLoading ? 'Saving…' : 'Update name'}
                  </button>
                  <SaveBanner saved={profileSaved} />
                </div>
              </div>

              {/* Change password */}
              <div className="eyebrow" style={{ marginBottom: 12 }}>Change password</div>
              <div style={{ maxWidth: 380 }}>
                {[
                  { label: 'Current password', value: pwCurrent, setter: setPwCurrent, show: pwShowCurrent, toggle: () => setPwShowCurrent(s => !s) },
                  { label: 'New password',      value: pwNew,     setter: setPwNew,     show: pwShowNew,    toggle: () => setPwShowNew(s => !s)     },
                  { label: 'Confirm new',       value: pwConfirm, setter: setPwConfirm, show: pwShowNew,    toggle: () => {}                        },
                ].map(({ label, value, setter, show, toggle }) => (
                  <div key={label} style={{ marginBottom: 12 }}>
                    <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>{label}</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        className="input"
                        type={show ? 'text' : 'password'}
                        value={value}
                        onChange={e => setter(e.target.value)}
                        style={{ paddingRight: 36 }}
                      />
                      <button onClick={toggle} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 0, cursor: 'pointer', color: 'hsl(var(--muted-fg))' }}>
                        {show ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                ))}
                {pwError && <p style={{ color: 'hsl(var(--destructive))', fontSize: 12, marginBottom: 8 }}>{pwError}</p>}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <button className="btn btn-primary" onClick={savePassword} disabled={pwLoading}>
                    {pwLoading ? 'Updating…' : 'Change password'}
                  </button>
                  {pwSuccess && <SaveBanner saved />}
                </div>
              </div>

              {/* Coming soon */}
              <div style={{ marginTop: 32 }}>
                <div className="eyebrow" style={{ marginBottom: 12 }}>Advanced security</div>
                {['Two-Factor Authentication', 'Active Sessions'].map(label => (
                  <div key={label} className="panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', marginBottom: 8 }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 500 }}>{label}</p>
                      <p className="dim" style={{ fontSize: 12, marginTop: 2 }}>Coming soon</p>
                    </div>
                    <span className="tag" style={{ fontSize: 10 }}>Soon</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Organization ── */}
          {activeSection === 'organization' && (
            <div className="section" style={{ paddingTop: 0, borderTop: 'none' }}>
              <div className="ssh" style={{ fontSize: 20 }}>Organization</div>

              {!canEditOrg && (
                <div style={{ padding: '10px 14px', background: 'hsl(var(--surface-raised))', border: '1px solid hsl(var(--border))', fontSize: 12, color: 'hsl(var(--muted-fg))', marginBottom: 20 }}>
                  You need admin access to edit organization settings.
                </div>
              )}

              <div style={{ maxWidth: 440 }}>
                <div style={{ marginBottom: 16 }}>
                  <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Organization name</label>
                  <input
                    className="input"
                    value={orgName}
                    onChange={e => setOrgName(e.target.value)}
                    disabled={!canEditOrg}
                  />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Slug</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input className="input" value={org?.slug ?? ''} readOnly style={{ flex: 1, opacity: 0.6 }} />
                    <span className="dim" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>.orion.vortan.io</span>
                  </div>
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Plan</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="tag tag-accent" style={{ textTransform: 'capitalize' }}>{org?.plan ?? 'free'}</span>
                    <span className="dim" style={{ fontSize: 12 }}>
                      {org?.plan === 'enterprise' ? 'Unlimited · Custom retention · Dedicated support'
                        : org?.plan === 'pro' ? 'Unlimited devices · 90-day retention · Priority support'
                        : 'Up to 5 devices · 30-day retention'}
                    </span>
                  </div>
                </div>
                {orgError && <p style={{ color: 'hsl(var(--destructive))', fontSize: 12, marginBottom: 8 }}>{orgError}</p>}
                {canEditOrg && (
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <button className="btn btn-primary" onClick={saveOrg} disabled={orgLoading || !orgName.trim()}>
                      {orgLoading ? 'Saving…' : 'Save changes'}
                    </button>
                    <SaveBanner saved={orgSaved} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Data & Retention ── */}
          {activeSection === 'data' && (
            <div className="section" style={{ paddingTop: 0, borderTop: 'none' }}>
              <div className="ssh" style={{ fontSize: 20 }}>Data & Retention</div>
              <p className="dim" style={{ fontSize: 13, marginBottom: 20 }}>
                Configure how long data is kept before automatic purging. Changes take effect at the next scheduled cleanup.
              </p>

              {!canEditOrg && (
                <div style={{ padding: '10px 14px', background: 'hsl(var(--surface-raised))', border: '1px solid hsl(var(--border))', fontSize: 12, color: 'hsl(var(--muted-fg))', marginBottom: 20 }}>
                  You need admin access to modify retention settings.
                </div>
              )}

              <div className="eyebrow" style={{ marginBottom: 12 }}>Retention periods</div>
              {([
                { key: 'telemetry' as const, label: 'Telemetry data',  options: ['7 days', '30 days', '90 days', '180 days', '1 year', 'Forever'] },
                { key: 'audit'     as const, label: 'Audit logs',      options: ['30 days', '90 days', '1 year', '2 years', 'Forever']            },
                { key: 'location'  as const, label: 'Location history', options: ['7 days', '30 days', '90 days', '1 year']                        },
              ]).map(({ key, label, options }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid hsl(var(--border) / 0.5)' }}>
                  <p style={{ fontSize: 13 }}>{label}</p>
                  <select
                    className="select"
                    value={retention[key]}
                    onChange={e => setRetention(r => ({ ...r, [key]: e.target.value }))}
                    disabled={!canEditOrg}
                    style={{ width: 'auto', height: 32, fontSize: 12, minWidth: 110 }}
                  >
                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}

              {canEditOrg && (
                <div style={{ display: 'flex', alignItems: 'center', marginTop: 20 }}>
                  <button className="btn btn-primary" onClick={saveRetention}>Save retention settings</button>
                  <SaveBanner saved={retentionSaved} />
                </div>
              )}

              <div style={{ marginTop: 32 }}>
                <div className="eyebrow" style={{ marginBottom: 12 }}>Export & Delete</div>
                <div className="panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', marginBottom: 8 }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500 }}>Export all data</p>
                    <p className="dim" style={{ fontSize: 12, marginTop: 2 }}>Download all telemetry and device data as CSV</p>
                  </div>
                  <span className="tag" style={{ fontSize: 10 }}>Soon</span>
                </div>
                <div className="panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: 'hsl(var(--destructive))' }}>Delete organization</p>
                    <p className="dim" style={{ fontSize: 12, marginTop: 2 }}>Permanently remove all data — this cannot be undone</p>
                  </div>
                  <span className="tag" style={{ fontSize: 10 }}>Soon</span>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
