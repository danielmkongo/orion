import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { motion } from 'framer-motion';
import apiClient from '@/api/client';
import { cn, formatDate, timeAgo } from '@/lib/utils';
import { Users, Plus, UserX, Shield, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'badge-critical',
  admin: 'badge-error',
  operator: 'badge-warning',
  researcher: 'badge-primary',
  technician: 'badge-info',
  viewer: 'badge-offline',
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
    <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Users & Roles</h1>
          <p className="text-sm text-slate-500 mt-0.5">{users.length} team members</p>
        </div>
        <button onClick={() => setShowInvite(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Invite User
        </button>
      </div>

      {/* Role legend */}
      <div className="card p-4">
        <p className="text-xs font-medium text-slate-400 mb-3">Role Permissions</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { role: 'admin', desc: 'Full access' },
            { role: 'operator', desc: 'Devices + commands' },
            { role: 'researcher', desc: 'Data + dashboards' },
            { role: 'technician', desc: 'Devices + OTA' },
            { role: 'viewer', desc: 'Read only' },
          ].map(({ role, desc }) => (
            <div key={role} className="bg-surface-3 rounded-xl p-3">
              <span className={cn('badge text-[10px] mb-1.5', ROLE_COLORS[role] ?? 'badge-offline')}>{role}</span>
              <p className="text-xs text-slate-500">{desc}</p>
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
                      <div className="w-8 h-8 rounded-full orion-gradient flex items-center justify-center text-xs font-bold text-white shrink-0">
                        {user.name?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-200">{user.name}</p>
                        <p className="text-xs text-slate-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={cn('badge text-[10px]', ROLE_COLORS[user.role] ?? 'badge-offline')}>
                      {user.role?.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <span className={cn('badge text-[10px]', user.isActive ? 'badge-online' : 'badge-offline')}>
                      {user.isActive ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="text-xs text-slate-500">
                    {user.lastLoginAt ? timeAgo(user.lastLoginAt) : 'Never'}
                  </td>
                  <td className="text-xs text-slate-500">
                    {formatDate(user.createdAt, 'MMM d, yyyy')}
                  </td>
                  <td>
                    <button
                      onClick={() => {
                        if (confirm(`Deactivate ${user.name}?`)) deactivateMutation.mutate(user._id);
                      }}
                      className="p-1.5 text-slate-600 hover:text-rose-400 rounded hover:bg-rose-500/10 transition-colors"
                      title="Deactivate"
                    >
                      <UserX className="w-3.5 h-3.5" />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-surface-2 border border-surface-border rounded-2xl shadow-elevated overflow-hidden"
      >
        <div className="p-5 border-b border-surface-border flex items-center justify-between">
          <h2 className="font-semibold text-slate-200">Invite Team Member</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200">✕</button>
        </div>

        {result ? (
          <div className="p-5 space-y-4">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
              <p className="text-sm font-medium text-emerald-400 mb-2">User invited successfully!</p>
              <p className="text-xs text-slate-400">Share these credentials with the new user:</p>
              <div className="mt-2 space-y-1 font-mono text-xs">
                <p className="text-slate-300">Email: {result.email}</p>
                <p className="text-slate-300">Temp password: <span className="bg-surface-3 px-1.5 py-0.5 rounded">{result.tempPassword}</span></p>
              </div>
            </div>
            <button onClick={onClose} className="btn-primary w-full">Done</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Full Name</label>
              <input value={form.name} onChange={upd('name')} className="input-field" placeholder="Jane Smith" required />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Email</label>
              <input type="email" value={form.email} onChange={upd('email')} className="input-field" placeholder="jane@company.com" required />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Role</label>
              <select value={form.role} onChange={upd('role')} className="input-field">
                {['admin', 'operator', 'researcher', 'technician', 'viewer'].map(r => (
                  <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" disabled={loading} className="btn-primary flex-1">
                {loading ? 'Inviting...' : 'Send Invite'}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}
