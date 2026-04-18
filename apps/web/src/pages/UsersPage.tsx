import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { motion } from 'framer-motion';
import apiClient from '@/api/client';
import { formatDate, timeAgo } from '@/lib/utils';
import { Users, Plus, UserX } from 'lucide-react';
import toast from 'react-hot-toast';

const ROLE_BADGE: Record<string, string> = {
  super_admin: 'badge-error',
  admin:       'badge-error',
  operator:    'badge-warning',
  researcher:  'badge-info',
  technician:  'badge-info',
  viewer:      'badge-offline',
};

export function UsersPage() {
  const [showInvite, setShowInvite] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.get('/users').then(r => r.data),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/users/${id}`),
    onSuccess: () => {
      toast.success('User deactivated');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const users = data?.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-semibold text-foreground tracking-tight">Users & Roles</h2>
          <p className="text-[14px] text-muted-foreground mt-0.5">{users.length} team members</p>
        </div>
        <button onClick={() => setShowInvite(true)} className="btn btn-primary">
          <Plus size={14} /> Invite User
        </button>
      </div>

      {/* Role legend */}
      <div className="card p-4">
        <p className="text-[12px] font-medium text-muted-foreground mb-3">Role Permissions</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {[
            { role: 'admin',      desc: 'Full access' },
            { role: 'operator',   desc: 'Devices + commands' },
            { role: 'researcher', desc: 'Data + dashboards' },
            { role: 'technician', desc: 'Devices + OTA' },
            { role: 'viewer',     desc: 'Read only' },
          ].map(({ role, desc }) => (
            <div key={role} className="bg-muted rounded-xl p-3">
              <span className={`badge ${ROLE_BADGE[role] ?? 'badge-offline'} mb-1.5`}>{role}</span>
              <p className="text-[11px] text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Users list */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6}><div className="skeleton h-12 m-3 rounded-lg" /></td></tr>
              ) : users.map((user: any, i: number) => (
                <motion.tr key={user._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-[12px] font-bold text-white shrink-0">
                        {user.name?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-foreground">{user.name}</p>
                        <p className="text-[11px] text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${ROLE_BADGE[user.role] ?? 'badge-offline'}`}>
                      {user.role?.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${user.isActive ? 'badge-online' : 'badge-offline'}`}>
                      {user.isActive ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="text-[12px] text-muted-foreground">
                    {user.lastLoginAt ? timeAgo(user.lastLoginAt) : 'Never'}
                  </td>
                  <td className="text-[12px] text-muted-foreground">
                    {formatDate(user.createdAt, 'MMM d, yyyy')}
                  </td>
                  <td>
                    <button
                      onClick={() => { if (confirm(`Deactivate ${user.name}?`)) deactivateMutation.mutate(user._id); }}
                      className="p-1.5 text-muted-foreground hover:text-red-500 rounded-lg hover:bg-red-500/10 transition-colors"
                      title="Deactivate"
                    >
                      <UserX size={14} />
                    </button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
    </div>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ email: '', name: '', role: 'viewer' });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiClient.post('/users/invite', form);
      setResult(res.data);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Failed to invite user');
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
        className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-foreground">Invite Team Member</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">✕</button>
        </div>

        {result ? (
          <div className="p-5 space-y-4">
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
              <p className="text-[13px] font-medium text-green-600 dark:text-green-400 mb-2">User invited successfully!</p>
              <p className="text-[12px] text-muted-foreground">Share these credentials with the new user:</p>
              <div className="mt-2 space-y-1 font-mono text-[12px]">
                <p className="text-foreground">Email: {result.email}</p>
                <p className="text-foreground">Temp password: <span className="bg-muted px-1.5 py-0.5 rounded">{result.tempPassword}</span></p>
              </div>
            </div>
            <button onClick={onClose} className="btn btn-primary w-full">Done</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-foreground mb-1.5">Full Name</label>
              <input value={form.name} onChange={upd('name')} className="input" placeholder="Jane Smith" required />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-foreground mb-1.5">Email</label>
              <input type="email" value={form.email} onChange={upd('email')} className="input" placeholder="jane@company.com" required />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-foreground mb-1.5">Role</label>
              <select value={form.role} onChange={upd('role')} className="select">
                {['admin', 'operator', 'researcher', 'technician', 'viewer'].map(r => (
                  <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
              <button type="submit" disabled={loading} className="btn btn-primary flex-1">
                {loading ? 'Inviting…' : 'Send Invite'}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}
