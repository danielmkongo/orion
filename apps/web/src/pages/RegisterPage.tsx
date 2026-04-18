import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Satellite, ArrowRight, Loader2 } from 'lucide-react';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/store/auth.store';
import { authApi as authApiInstance } from '@/api/auth';
import toast from 'react-hot-toast';

export function RegisterPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [form, setForm] = useState({ email: '', password: '', name: '', orgName: '' });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.register(form.email, form.password, form.name, form.orgName);
      // Log in immediately
      const result = await authApi.login(form.email, form.password);
      setAuth(result.user as any, result.accessToken, result.refreshToken);
      navigate('/dashboard');
      toast.success('Workspace created successfully!');
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center p-8">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-9 h-9 rounded-xl orion-gradient flex items-center justify-center">
            <Satellite className="w-4 h-4 text-white" />
          </div>
          <span className="text-xl font-bold text-gradient">Orion</span>
        </div>

        <h2 className="text-2xl font-bold text-white mb-2">Create your workspace</h2>
        <p className="text-slate-400 text-sm mb-8">Get started with Orion in under a minute</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Organization name</label>
            <input type="text" value={form.orgName} onChange={update('orgName')} className="input-field" placeholder="Acme Engineering" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Your name</label>
            <input type="text" value={form.name} onChange={update('name')} className="input-field" placeholder="Jane Smith" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Work email</label>
            <input type="email" value={form.email} onChange={update('email')} className="input-field" placeholder="jane@company.com" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
            <input type="password" value={form.password} onChange={update('password')} className="input-field" placeholder="At least 8 characters" required minLength={8} />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating workspace...</> : <>Create workspace <ArrowRight className="w-4 h-4" /></>}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-orion-400 hover:text-orion-300 font-medium">Sign in</Link>
        </p>
      </motion.div>
    </div>
  );
}
