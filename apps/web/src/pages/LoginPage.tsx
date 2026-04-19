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
  const [email, setEmail]       = useState('admin@vortan.io');
  const [password, setPassword] = useState('demo1234');
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);

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
    <div style={{ minHeight: '100vh', display: 'flex', background: 'hsl(var(--bg))' }}>

      {/* ── Left brand panel ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        style={{
          display: 'none',
          width: '54%',
          background: 'hsl(var(--fg))',
          position: 'relative',
          overflow: 'hidden',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px 64px',
        }}
        className="login-left-panel"
      >
        {/* Dot grid */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.04,
          backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }} />
        {/* Orange gradient wash */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at bottom right, rgba(255,91,31,0.18) 0%, transparent 65%)',
        }} />
        {/* Watermark O */}
        <div style={{ position: 'absolute', right: -80, top: '50%', transform: 'translateY(-50%)', opacity: 0.05 }}>
          <OrionMark size={480} className="text-white" />
        </div>

        {/* Logo */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
          <OrionMark size={28} className="text-primary" />
          <span style={{ color: 'white', fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em' }}>Orion</span>
        </div>

        {/* Headline block */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          style={{ position: 'relative', maxWidth: 480 }}
        >
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 52,
            lineHeight: 1.08,
            letterSpacing: '-0.03em',
            color: 'white',
            marginBottom: 20,
            fontWeight: 400,
          }}>
            Device intelligence,<br />
            <em style={{ color: '#FF5B1F', fontStyle: 'italic' }}>redefined.</em>
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, maxWidth: '44ch' }}>
            Monitor, control, and analyze any connected device — from GPS trackers to industrial sensors — in one cohesive platform.
          </p>

          {/* Feature grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 40 }}>
            {FEATURES.map(({ icon: Icon, label, desc }) => (
              <div
                key={label}
                style={{
                  padding: '16px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)',
                }}
              >
                <div style={{ width: 28, height: 28, background: 'rgba(255,91,31,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <Icon size={13} style={{ color: '#FF5B1F' }} />
                </div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'white', marginBottom: 2 }}>{label}</p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{desc}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <p style={{ position: 'relative', fontSize: 12, color: 'rgba(255,255,255,0.28)' }}>
          © {new Date().getFullYear()} Orion by Vortan
        </p>
      </motion.div>

      {/* ── Right form panel ── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          style={{ width: '100%', maxWidth: 400 }}
        >
          {/* Mobile logo */}
          <div className="login-mobile-logo" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
            <OrionMark size={24} className="text-primary" />
            <span style={{ fontSize: 16, fontWeight: 600, color: 'hsl(var(--fg))' }}>Orion</span>
          </div>

          <div style={{ marginBottom: 32 }}>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 36,
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              fontWeight: 400,
              color: 'hsl(var(--fg))',
              marginBottom: 6,
            }}>
              Welcome <em style={{ color: '#FF5B1F', fontStyle: 'italic' }}>back.</em>
            </h2>
            <p style={{ fontSize: 14, color: 'hsl(var(--muted-fg))' }}>Sign in to your workspace</p>
          </div>

          {/* Demo credentials */}
          <div className="panel" style={{ padding: '12px 16px', marginBottom: 28, borderTop: '2px solid hsl(var(--primary))' }}>
            <div className="eyebrow" style={{ fontSize: 9, marginBottom: 4, color: 'hsl(var(--primary))' }}>Demo access</div>
            <p className="mono faint" style={{ fontSize: 12 }}>admin@vortan.io / demo1234</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="eyebrow" style={{ fontSize: 9, display: 'block', marginBottom: 6 }}>Email</label>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label className="eyebrow" style={{ fontSize: 9 }}>Password</label>
                <button type="button" style={{ fontSize: 11, color: 'hsl(var(--primary))', background: 'none', border: 0, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                  Forgot password?
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input"
                  style={{ paddingRight: 38 }}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 0, cursor: 'pointer', color: 'hsl(var(--muted-fg))' }}
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: 4, gap: 8 }}
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> Signing in…</>
                : <>Sign in <ArrowRight size={16} /></>
              }
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: 13, color: 'hsl(var(--muted-fg))', marginTop: 24 }}>
            No account?{' '}
            <Link to="/register" style={{ color: 'hsl(var(--primary))', fontWeight: 500, textDecoration: 'none' }}>
              Create workspace
            </Link>
          </p>
        </motion.div>
      </div>

      <style>{`
        @media (min-width: 1024px) {
          .login-left-panel { display: flex !important; }
          .login-mobile-logo { display: none !important; }
        }
      `}</style>
    </div>
  );
}
