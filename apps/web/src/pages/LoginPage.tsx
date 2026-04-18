import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Satellite, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/store/auth.store';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

export function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('admin@vortan.io');
  const [password, setPassword] = useState('demo1234');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await authApi.login(email, password);
      setAuth(result.user as any, result.accessToken, result.refreshToken);
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-0 flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-surface-1 via-surface-2 to-[#0d0e1f]" />

        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(98,114,242,1) 1px, transparent 1px), linear-gradient(90deg, rgba(98,114,242,1) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        />

        {/* Glow orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orion-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-accent-violet/10 rounded-full blur-3xl" />

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl orion-gradient flex items-center justify-center shadow-glow">
              <Satellite className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-xl font-bold text-gradient">Orion</span>
              <span className="block text-[11px] text-slate-500 uppercase tracking-widest">by Vortan</span>
            </div>
          </div>

          {/* Center content */}
          <div className="max-w-lg">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <h1 className="text-5xl font-bold text-white leading-tight mb-6">
                Device intelligence,<br />
                <span className="text-gradient">redefined.</span>
              </h1>
              <p className="text-lg text-slate-400 leading-relaxed mb-10">
                Monitor, control, and analyze any connected device — from GPS trackers to industrial sensors — in one intelligent platform.
              </p>
            </motion.div>

            {/* Feature points */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="grid grid-cols-2 gap-4"
            >
              {[
                { label: 'Live Map Tracking', desc: 'Real-time GPS & geofencing' },
                { label: 'Multi-Protocol', desc: 'MQTT, HTTP, WebSocket, CoAP' },
                { label: 'Rules Engine', desc: 'Intelligent automation' },
                { label: 'OTA Updates', desc: 'Safe staged firmware rollouts' },
              ].map(feature => (
                <div key={feature.label} className="bg-surface-2/50 border border-surface-border/50 rounded-xl p-4">
                  <p className="text-sm font-semibold text-slate-200 mb-1">{feature.label}</p>
                  <p className="text-xs text-slate-500">{feature.desc}</p>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Footer */}
          <p className="text-xs text-slate-600">
            © 2024 Vortan Technologies. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-full max-w-md"
        >
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-9 h-9 rounded-xl orion-gradient flex items-center justify-center">
              <Satellite className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-bold text-gradient">Orion</span>
          </div>

          <h2 className="text-2xl font-bold text-white mb-2">Welcome back</h2>
          <p className="text-slate-400 text-sm mb-8">Sign in to your Orion workspace</p>

          {/* Demo credentials hint */}
          <div className="bg-orion-600/10 border border-orion-500/20 rounded-xl p-4 mb-6 text-sm">
            <p className="text-orion-300 font-medium mb-1">Demo credentials</p>
            <p className="text-orion-400/70">admin@vortan.io / demo1234</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input-field"
                placeholder="you@company.com"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-slate-300">Password</label>
                <button type="button" className="text-xs text-orion-400 hover:text-orion-300">Forgot password?</button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input-field pr-10"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={cn('btn-primary w-full mt-2', loading && 'opacity-70')}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</>
              ) : (
                <>Sign in <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="text-orion-400 hover:text-orion-300 font-medium">
              Create one
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
