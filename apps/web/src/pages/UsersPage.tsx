import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import apiClient from '@/api/client';
import { formatDate, timeAgo } from '@/lib/utils';
import { Plus, UserX } from 'lucide-react';
import toast from 'react-hot-toast';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin:       'Admin',
  operator:    'Operator',
  researcher:  'Researcher',
  technician:  'Technician',
  viewer:      'Viewer',
};

function roleTag(role: string) {
  if (role === 'super_admin' || role === 'admin') return 'tag-error';
  if (role === 'operator') return 'tag-warn';
  if (role === 'researcher' || role === 'technician') return 'tag-info';
  return 'tag-offline';
}

export function UsersPage() {
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.get('/users').then(r => r.data),
  });

  const deactivateMut = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/users/${id}`),
    onSuccess: () => { toast.success('User deactivated'); queryClient.invalidateQueries({ queryKey: ['users'] }); },
  });

  const users = data?.data ?? [];

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
          <button className="btn btn-primary btn-sm" style={{ gap: 6 }} onClick={() => setShowInvite(v => !v)}>
            <Plus size={13} /> Invite member
          </button>
        </div>
      </div>

      {/* ── Invite form ── */}
      {showInvite && (
        <div className="panel" style={{ padding: 20, marginBottom: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Invite team member</div>
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
              onClick={() => { toast.success(`Invite sent to ${inviteEmail}`); setShowInvite(false); setInviteEmail(''); }}
              disabled={!inviteEmail}
            >
              Send invite
            </button>
            <button className="btn btn-ghost" onClick={() => setShowInvite(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Users table ── */}
      <div className="panel table-responsive">
        {isLoading ? (
          <div style={{ padding: 32, textAlign: 'center' }} className="mono faint">Loading…</div>
        ) : users.length === 0 ? (
          <div style={{ padding: '64px 16px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, marginBottom: 8 }}>
              No <em style={{ color: 'hsl(var(--primary))' }}>members</em> yet
            </div>
            <p className="dim" style={{ fontSize: 13 }}>Invite your first team member to get started.</p>
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
                <th style={{ width: 40 }} />
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
                    <span className={`tag ${roleTag(u.role)}`}>{ROLE_LABELS[u.role] ?? u.role}</span>
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
                    <button
                      onClick={() => { if (confirm(`Deactivate ${u.name}?`)) deactivateMut.mutate(u._id); }}
                      className="btn btn-ghost btn-sm btn-icon"
                      style={{ color: 'hsl(var(--muted-fg))' }}
                      title="Deactivate"
                    >
                      <UserX size={13} />
                    </button>
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
