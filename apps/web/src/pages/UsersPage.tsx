import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import apiClient from '@/api/client';
import { formatDate, timeAgo } from '@/lib/utils';
import { Plus, UserX, Pencil, X, Eye, EyeOff, Shield, ShieldCheck, Sliders, FlaskConical, Wrench } from 'lucide-react';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import toast from 'react-hot-toast';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin:       'Admin',
  operator:    'Operator',
  researcher:  'Researcher',
  technician:  'Technician',
  viewer:      'Viewer',
};

const ROLE_ICON: Record<string, React.ElementType> = {
  super_admin: ShieldCheck,
  admin:       Shield,
  operator:    Sliders,
  researcher:  FlaskConical,
  technician:  Wrench,
  viewer:      Eye,
};

function roleTag(role: string) {
  if (role === 'super_admin' || role === 'admin') return 'tag-error';
  if (role === 'operator') return 'tag-warn';
  if (role === 'researcher' || role === 'technician') return 'tag-info';
  return 'tag-offline';
}

type FormMode = 'invite' | 'add' | null;

export function UsersPage() {
  const [formMode, setFormMode]       = useState<FormMode>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole]   = useState('viewer');

  const [addName, setAddName]         = useState('');
  const [addEmail, setAddEmail]       = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addRole, setAddRole]         = useState('viewer');
  const [showPwd, setShowPwd]         = useState(false);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);

  const [editTarget, setEditTarget]     = useState<any | null>(null);
  const [editName, setEditName]         = useState('');
  const [editRole, setEditRole]         = useState('');
  const [editActive, setEditActive]     = useState(true);

  const [deactivateTarget, setDeactivateTarget] = useState<any | null>(null);

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.get('/users').then(r => r.data),
  });

  const deactivateMut = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/users/${id}`),
    onSuccess: () => { toast.success('User deactivated'); queryClient.invalidateQueries({ queryKey: ['users'] }); },
    onError: () => toast.error('Failed to deactivate user'),
  });

  const addMut = useMutation({
    mutationFn: (body: object) => apiClient.post('/users', body).then(r => r.data),
    onSuccess: (res) => {
      toast.success('User created');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setCreatedPassword(res.tempPassword ?? addPassword);
      setAddName(''); setAddEmail(''); setAddPassword(''); setAddRole('viewer');
      setFormMode(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed to create user'),
  });

  const editMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => apiClient.patch(`/users/${id}`, body),
    onSuccess: () => { toast.success('User updated'); queryClient.invalidateQueries({ queryKey: ['users'] }); setEditTarget(null); },
    onError: () => toast.error('Failed to update user'),
  });

  const users = data?.data ?? [];

  function openEdit(u: any) {
    setEditTarget(u);
    setEditName(u.name ?? '');
    setEditRole(u.role ?? 'viewer');
    setEditActive(u.isActive !== false);
  }

  return (
    <div className="page">
      {/* ── Page header ── */}
      <div className="ph">
        <div>
          <div style={{ marginBottom: 6 }}>
            <span className="eyebrow">Admin · Team management</span>
          </div>
          <h1>The <em>Team</em>.</h1>
          <p className="lede">
            {isLoading ? 'Loading…' : `${users.length} member${users.length !== 1 ? 's' : ''}`} across your Orion workspace. Manage roles and access.
          </p>
        </div>
        <div style={{ gridColumn: 3, display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 20 }}>
          <button className="btn btn-sm" style={{ gap: 6 }} onClick={() => setFormMode(formMode === 'invite' ? null : 'invite')}>
            <Plus size={13} /> Invite by email
          </button>
          <button className="btn btn-primary btn-sm" style={{ gap: 6 }} onClick={() => setFormMode(formMode === 'add' ? null : 'add')}>
            <Plus size={13} /> Add user
          </button>
        </div>
      </div>

      {/* ── Invite form ── */}
      {formMode === 'invite' && (
        <div className="panel" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className="eyebrow">Invite team member</span>
            <button onClick={() => setFormMode(null)} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'hsl(var(--muted-fg))' }}><X size={14} /></button>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 260px' }}>
              <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Email address</label>
              <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="input" placeholder="colleague@company.com" />
            </div>
            <div style={{ minWidth: 160 }}>
              <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Role</label>
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} className="select">
                {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => { toast.success(`Invite sent to ${inviteEmail}`); setFormMode(null); setInviteEmail(''); }}
              disabled={!inviteEmail}
            >
              Send invite
            </button>
          </div>
        </div>
      )}

      {/* ── Add user form ── */}
      {formMode === 'add' && (
        <div className="panel" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className="eyebrow">Add user directly</span>
            <button onClick={() => setFormMode(null)} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'hsl(var(--muted-fg))' }}><X size={14} /></button>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 180px' }}>
              <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Full name</label>
              <input value={addName} onChange={e => setAddName(e.target.value)} className="input" placeholder="Jane Doe" />
            </div>
            <div style={{ flex: '1 1 220px' }}>
              <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Email address</label>
              <input type="email" value={addEmail} onChange={e => setAddEmail(e.target.value)} className="input" placeholder="jane@company.com" />
            </div>
            <div style={{ flex: '1 1 180px', position: 'relative' }}>
              <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={addPassword}
                  onChange={e => setAddPassword(e.target.value)}
                  className="input mono"
                  placeholder="Min 8 characters"
                  style={{ paddingRight: 34 }}
                />
                <button type="button" onClick={() => setShowPwd(v => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 0, cursor: 'pointer', color: 'hsl(var(--muted-fg))' }}>
                  {showPwd ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>
            <div style={{ minWidth: 150 }}>
              <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Role</label>
              <select value={addRole} onChange={e => setAddRole(e.target.value)} className="select">
                {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <button
              className="btn btn-primary"
              disabled={!addName || !addEmail || !addPassword || addMut.isPending}
              onClick={() => addMut.mutate({ name: addName, email: addEmail, password: addPassword, role: addRole })}
            >
              Create user
            </button>
          </div>
        </div>
      )}

      {/* ── Created password modal ── */}
      <AnimatePresence>
        {createdPassword && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000 }}
            onClick={() => setCreatedPassword(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              onClick={e => e.stopPropagation()}
              className="panel"
              style={{ padding: 32, minWidth: 360, maxWidth: 440, borderTop: '3px solid hsl(var(--good))' }}
            >
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, marginBottom: 8 }}>User created</div>
              <p className="dim" style={{ fontSize: 13, marginBottom: 16 }}>Share this temporary password with the new user. It will only be shown once.</p>
              <div className="panel" style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 15, letterSpacing: '0.05em', background: 'hsl(var(--surface-raised))', borderTop: '2px solid hsl(var(--primary))' }}>
                {createdPassword}
              </div>
              <button className="btn btn-primary" style={{ marginTop: 20, width: '100%' }} onClick={() => setCreatedPassword(null)}>Done</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Edit user modal ── */}
      <AnimatePresence>
        {editTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000 }}
            onClick={() => setEditTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              onClick={e => e.stopPropagation()}
              className="panel"
              style={{ padding: 32, minWidth: 380, maxWidth: 460, borderTop: '3px solid hsl(var(--primary))' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>Edit <em>{editTarget.name}</em></div>
                <button onClick={() => setEditTarget(null)} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'hsl(var(--muted-fg))' }}><X size={16} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Full name</label>
                  <input value={editName} onChange={e => setEditName(e.target.value)} className="input" />
                </div>
                <div>
                  <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Role</label>
                  <select value={editRole} onChange={e => setEditRole(e.target.value)} className="select" style={{ width: '100%' }}>
                    {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <label className="eyebrow" style={{ fontSize: 9 }}>Active</label>
                  <button
                    onClick={() => setEditActive(v => !v)}
                    style={{
                      width: 40, height: 22, position: 'relative',
                      background: editActive ? 'hsl(var(--good))' : 'hsl(var(--border))',
                      border: 0, cursor: 'pointer', transition: 'background 0.2s',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 3, left: editActive ? 20 : 3,
                      width: 16, height: 16,
                      background: 'white',
                      transition: 'left 0.2s',
                    }} />
                  </button>
                  <span style={{ fontSize: 12, color: 'hsl(var(--muted-fg))' }}>{editActive ? 'Active' : 'Inactive'}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 24, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setEditTarget(null)}>Cancel</button>
                <button
                  className="btn btn-primary"
                  disabled={editMut.isPending}
                  onClick={() => editMut.mutate({ id: editTarget._id ?? editTarget.id, body: { name: editName, role: editRole, isActive: editActive } })}
                >
                  Save changes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Deactivate confirm ── */}
      <AnimatePresence>
        {deactivateTarget && (
          <ConfirmModal
            title="Deactivate user"
            message={`Deactivate "${deactivateTarget.name}"? They will lose access to Orion.`}
            confirmLabel="Deactivate"
            danger
            onConfirm={() => { deactivateMut.mutate(deactivateTarget._id ?? deactivateTarget.id); setDeactivateTarget(null); }}
            onCancel={() => setDeactivateTarget(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Users table ── */}
      <div className="panel table-responsive">
        {isLoading ? (
          <div style={{ padding: 32, textAlign: 'center' }} className="mono faint">Loading…</div>
        ) : users.length === 0 ? (
          <div style={{ padding: '64px 16px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, marginBottom: 8 }}>
              No <em style={{ color: 'hsl(var(--primary))' }}>members</em> yet
            </div>
            <p className="dim" style={{ fontSize: 13 }}>Add or invite your first team member to get started.</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>№</th>
                <th>Member</th>
                <th>Role</th>
                <th className="hide-sm">Status</th>
                <th className="hide-sm">Last active</th>
                <th className="hide-sm">Joined</th>
                <th style={{ width: 72 }} />
              </tr>
            </thead>
            <tbody>
              {(users as any[]).map((u, i) => (
                <tr key={u._id ?? u.id}>
                  <td className="row-n">{String(i + 1).padStart(2, '0')}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 30, height: 30, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'hsl(var(--primary) / 0.1)', border: '1px solid hsl(var(--primary) / 0.25)',
                        fontFamily: 'var(--font-display)', fontSize: 14, color: 'hsl(var(--primary))',
                      }}>
                        {u.name?.charAt(0)?.toUpperCase() ?? 'U'}
                      </div>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{u.name}</div>
                        <div className="mono faint" style={{ fontSize: 10.5 }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`tag ${roleTag(u.role)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {(() => { const Icon = ROLE_ICON[u.role] ?? Shield; return <Icon size={11} />; })()}
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="hide-sm">
                    <span className={`tag tag-${u.isActive !== false ? 'online' : 'offline'}`}>
                      <span className={`dot dot-${u.isActive !== false ? 'online' : 'offline'}`} />
                      {u.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="hide-sm mono faint" style={{ fontSize: 11.5 }}>
                    {u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'Never'}
                  </td>
                  <td className="hide-sm mono faint" style={{ fontSize: 11.5 }}>
                    {u.createdAt ? formatDate(u.createdAt) : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={() => openEdit(u)}
                        className="btn btn-ghost btn-sm btn-icon"
                        style={{ color: 'hsl(var(--muted-fg))' }}
                        title="Edit user"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => setDeactivateTarget(u)}
                        className="btn btn-ghost btn-sm btn-icon"
                        style={{ color: 'hsl(var(--muted-fg))' }}
                        title="Deactivate"
                      >
                        <UserX size={13} />
                      </button>
                    </div>
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
