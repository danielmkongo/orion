import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, ArrowRight, Loader2, Wifi, BarChart2, Shield, Cpu } from 'lucide-react';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/store/auth.store';
import { OrionMark } from '@/components/ui/OrionLogo';
import toast from 'react-hot-toast';

const FEATURES = [
  { icon: Wifi,      label: 'Any Protocol',    desc: 'MQTT · HTTP · WebSocket' },
  { icon: BarChart2, label: 'Live Analytics',   desc: 'Real-time dashboards'    },
  { icon: Shield,    label: 'Rules Engine',     desc: 'Automated responses'     },
  { icon: Cpu,       label: 'Fleet Control',    desc: 'OTA · Commands · Alerts' },
];

export function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('admin@vortan.io');
  const [password, setPassword] = useState('demo1234');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await authApi.login(email, password);
      setAuth(result.user as any, result.accessToken, result.refreshToken);
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* ── Left brand panel ── */}
      <div className="hidden lg:flex flex-col lg:w-[52%] xl:w-[56%] relative overflow-hidden bg-foreground">
        {/* Subtle dot grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `radial-gradient(circle, white 1px, transparent 1px)`,
            backgroundSize: '28px 28px',
          }}
        />

        {/* Warm orange gradient wash */}
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-primary/20" />

        {/* Large "O" background watermark */}
        <div className="absolute right-[-80px] top-1/2 -translate-y-1/2 opacity-[0.06]">
          <OrionMark size={480} className="text-white" />
        </div>

        <div className="relative flex flex-col justify-between h-full p-14">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <OrionMark size={28} className="text-primary" />
            <span className="text-[17px] font-semibold text-white tracking-tight">Orion</span>
          </div>

          {/* Headline */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="max-w-[480px]"
          >
            <h1 className="text-[3.25rem] font-semibold text-white leading-[1.12] tracking-tight mb-5">
              Device intelligence,<br />
              <span className="text-primary">redefined.</span>
            </h1>
            <p className="text-[1.0625rem] text-white/55 leading-relaxed">
              Monitor, control, and analyze any connected device — from GPS trackers
              to industrial sensors — in one cohesive platform.
            </p>

            {/* Feature grid */}
            <div className="grid grid-cols-2 gap-3 mt-10">
              {FEATURES.map(({ icon: Icon, label, desc }) => (
                <div
                  key={label}
                  className="rounded-xl p-4 border border-white/10 bg-white/5 backdrop-blur-sm"
                >
                  <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center mb-3">
                    <Icon size={14} className="text-primary" />
                  </div>
                  <p className="text-[13px] font-semibold text-white">{label}</p>
                  <p className="text-[12px] text-white/45 mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <p className="text-[12px] text-white/30">© {new Date().getFullYear()} Orion by Vortan</p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-[400px]"
        >
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-10 lg:hidden">
            <OrionMark size={24} className="text-primary" />
            <span className="text-[16px] font-semibold text-foreground">Orion</span>
          </div>

          <h2 className="text-[1.625rem] font-semibold text-foreground tracking-tight">Welcome back</h2>
          <p className="text-[14px] text-muted-foreground mt-1 mb-8">Sign in to your workspace</p>

          {/* Demo hint */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 mb-7">
            <p className="text-[12px] font-semibold text-primary mb-0.5">Demo access</p>
            <p className="text-[12px] text-muted-foreground font-mono">admin@vortan.io / demo1234</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input"
                placeholder="you@company.com"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[13px] font-medium text-foreground">Password</label>
                <button type="button" className="text-[12px] text-primary hover:underline">Forgot password?</button>
              </div>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input pr-10"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary btn-lg w-full mt-1"
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> Signing in…</>
                : <>Sign in <ArrowRight size={16} /></>
              }
            </button>
          </form>

          <p className="text-center text-[13px] text-muted-foreground mt-6">
            No account?{' '}
            <Link to="/register" className="font-medium text-primary hover:underline">
              Create workspace
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
