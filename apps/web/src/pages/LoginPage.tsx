import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, ArrowRight, Loader2, Wifi, BarChart2, Shield, Cpu, Sun, Moon } from 'lucide-react';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/store/auth.store';
import { OrionMark } from '@/components/ui/OrionLogo';
import toast from 'react-hot-toast';

const FEATURES = [
  { icon: Wifi,      label: 'Any Protocol',    desc: 'MQTT · HTTP · WebSocket' },
  { icon: BarChart2, label: 'Live Analytics',   desc: 'Real-time dashboards'    },
  { icon: Shield,    label: 'Rules Engine',     desc: 'Automated responses'     },
  { icon: Cpu,       label: 'Device Control',   desc: 'OTA · Commands · Alerts' },
];

/* ── Orion constellation star field ─────────────────────────────────── */
function StarField() {
  // Background field stars — random but stable
  const bgStars = useMemo(() =>
    Array.from({ length: 72 }, (_, i) => ({
      id: i,
      cx: parseFloat((Math.random() * 100).toFixed(2)),
      cy: parseFloat((Math.random() * 100).toFixed(2)),
      r:  parseFloat((Math.random() * 0.45 + 0.12).toFixed(2)),
      opDur: parseFloat((Math.random() * 3 + 2).toFixed(1)),
      opDel: parseFloat((Math.random() * 7).toFixed(1)),
      dx:    parseFloat(((Math.random() - 0.5) * 1.8).toFixed(1)),
      dy:    parseFloat(((Math.random() - 0.5) * 1.8).toFixed(1)),
      mvDur: parseFloat((Math.random() * 10 + 7).toFixed(1)),
    })), []
  );

  // Named Orion stars — astronomically correct relative positions
  // Orientation: north up, east left (standard star chart)
  // Betelgeuse=upper-left, Bellatrix=upper-right,
  // Belt runs L→R (Alnitak→Alnilam→Mintaka),
  // Rigel=lower-right (bright blue), Saiph=lower-left,
  // Shield arc on right, Sword hangs below belt center
  const STARS = [
    { id: 'meissa',     cx: 48,  cy: 7,   r: 1.1, dur: 4.5, del: 0.8  },
    { id: 'betelgeuse', cx: 24,  cy: 27,  r: 2.8, dur: 3.2, del: 1.4, color: '#ffc580' },
    { id: 'bellatrix',  cx: 70,  cy: 23,  r: 1.8, dur: 4.0, del: 0.3  },
    { id: 'alnitak',    cx: 37,  cy: 54,  r: 1.7, dur: 4.2, del: 1.8  },
    { id: 'alnilam',    cx: 50,  cy: 53,  r: 1.8, dur: 3.5, del: 0.6  },
    { id: 'mintaka',    cx: 63,  cy: 52,  r: 1.4, dur: 3.8, del: 2.1  },
    { id: 'saiph',      cx: 25,  cy: 82,  r: 1.4, dur: 4.8, del: 0.2  },
    { id: 'rigel',      cx: 73,  cy: 80,  r: 2.8, dur: 3.0, del: 1.0, color: '#b8d4ff' },
    // Sword
    { id: 'eta',        cx: 51,  cy: 63,  r: 0.9, dur: 5.0, del: 2.5  },
    { id: 'iota',       cx: 52,  cy: 73,  r: 1.0, dur: 4.5, del: 3.0  },
    // Shield (π Ori arc, west/right side)
    { id: 'pi3',        cx: 86,  cy: 22,  r: 0.9, dur: 5.2, del: 1.3  },
    { id: 'pi4',        cx: 89,  cy: 33,  r: 0.9, dur: 4.8, del: 0.9  },
    { id: 'pi5',        cx: 89,  cy: 44,  r: 0.9, dur: 5.5, del: 2.2  },
    { id: 'pi6',        cx: 86,  cy: 53,  r: 0.8, dur: 4.0, del: 1.7  },
  ] as { id: string; cx: number; cy: number; r: number; dur: number; del: number; color?: string }[];

  // Constellation stick lines
  const LINES: [string, string][] = [
    ['meissa',    'betelgeuse'],  // head → left shoulder
    ['meissa',    'bellatrix'],   // head → right shoulder
    ['betelgeuse','alnitak'],     // left shoulder → left belt
    ['bellatrix', 'mintaka'],     // right shoulder → right belt
    ['alnitak',   'alnilam'],     // belt
    ['alnilam',   'mintaka'],     // belt
    ['alnitak',   'saiph'],       // left belt → left foot
    ['mintaka',   'rigel'],       // right belt → right foot (Rigel)
    ['alnilam',   'eta'],         // belt → sword top
    ['eta',       'iota'],        // sword
    ['bellatrix', 'pi3'],         // shoulder → shield top
    ['pi3',       'pi4'],         // shield arc
    ['pi4',       'pi5'],
    ['pi5',       'pi6'],
    ['pi6',       'mintaka'],     // shield bottom → right belt
  ];

  const pos = Object.fromEntries(STARS.map(s => [s.id, s]));

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      {/* Background field stars */}
      {bgStars.map(s => (
        <circle key={s.id} cx={s.cx} cy={s.cy} r={s.r} fill="white">
          <animate attributeName="opacity" values="0.04;0.42;0.04"
            dur={`${s.opDur}s`} begin={`${s.opDel}s`} repeatCount="indefinite" />
          <animateTransform attributeName="transform" type="translate"
            values={`0 0;${s.dx} ${s.dy};0 0`}
            dur={`${s.mvDur}s`} begin={`${s.opDel}s`} repeatCount="indefinite" />
        </circle>
      ))}

      {/* Orion Nebula (M42) — soft warm glow near sword */}
      <ellipse cx="52" cy="75" rx="5" ry="3.5" fill="rgba(255,140,60,0.0)">
        <animate attributeName="fill-opacity" values="0.04;0.13;0.04" dur="7s" repeatCount="indefinite" />
      </ellipse>

      {/* Constellation stick lines */}
      {LINES.map(([a, b], i) => {
        const p1 = pos[a], p2 = pos[b];
        if (!p1 || !p2) return null;
        return (
          <line key={i}
            x1={p1.cx} y1={p1.cy} x2={p2.cx} y2={p2.cy}
            stroke="rgba(255,255,255,0.25)" strokeWidth="0.3" strokeLinecap="round"
          />
        );
      })}

      {/* Named constellation stars */}
      {STARS.map(s => (
        <g key={s.id}>
          {/* Diffraction glow for bright stars (Rigel, Betelgeuse) */}
          {s.r >= 2 && (
            <circle cx={s.cx} cy={s.cy} r={s.r * 3.2} fill={s.color ?? 'white'} fillOpacity="0">
              <animate attributeName="fill-opacity"
                values="0.03;0.11;0.03" dur={`${s.dur * 1.6}s`} begin={`${s.del}s`} repeatCount="indefinite" />
            </circle>
          )}
          {/* Star disc */}
          <circle cx={s.cx} cy={s.cy} r={s.r} fill={s.color ?? 'white'}>
            <animate attributeName="opacity"
              values="0.55;1.0;0.55"
              dur={`${s.dur}s`} begin={`${s.del}s`} repeatCount="indefinite" />
          </circle>
        </g>
      ))}
    </svg>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [email, setEmail]       = useState('admin@vortan.io');
  const [password, setPassword] = useState('demo1234');
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);

  // Local theme toggle — persists via html class + localStorage
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggleTheme = () => {
    const next = !isDark;
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('orion-theme', next ? 'dark' : 'light');
    setIsDark(next);
  };

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

      {/* ── Left brand panel — always dark regardless of app theme ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        style={{
          display: 'none',
          width: '54%',
          background: '#0b0b0a',
          position: 'relative',
          overflow: 'hidden',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px 64px',
        }}
        className="login-left-panel"
      >
        {/* Animated star field */}
        <StarField />

        {/* Subtle dot grid */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.035,
          backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          pointerEvents: 'none',
        }} />

        {/* Orange gradient wash */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at bottom right, rgba(255,91,31,0.2) 0%, transparent 65%)',
        }} />

        {/* Watermark Orion mark */}
        <div style={{ position: 'absolute', right: -80, top: '50%', transform: 'translateY(-50%)', opacity: 0.04, pointerEvents: 'none' }}>
          <OrionMark size={480} className="text-white" />
        </div>

        {/* Logo */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, zIndex: 1 }}>
          <OrionMark size={28} className="text-primary" />
          <span style={{ color: 'white', fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em' }}>Orion</span>
        </div>

        {/* Headline block */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          style={{ position: 'relative', maxWidth: 480, zIndex: 1 }}
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
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.04)',
                }}
              >
                <div style={{ width: 28, height: 28, background: 'rgba(255,91,31,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <Icon size={13} style={{ color: '#FF5B1F' }} />
                </div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'white', marginBottom: 2 }}>{label}</p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)' }}>{desc}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <p style={{ position: 'relative', fontSize: 12, color: 'rgba(255,255,255,0.22)', zIndex: 1 }}>
          © {new Date().getFullYear()} Orion by Vortan
        </p>
      </motion.div>

      {/* ── Right form panel ── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', position: 'relative' }}>

        {/* Theme toggle — top-right corner */}
        <button
          onClick={toggleTheme}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            position: 'absolute', top: 20, right: 20,
            width: 34, height: 34, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))',
            cursor: 'pointer', color: 'hsl(var(--muted-fg))',
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'hsl(var(--fg))'; (e.currentTarget as HTMLElement).style.borderColor = 'hsl(var(--border-strong, var(--fg)))'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'hsl(var(--muted-fg))'; (e.currentTarget as HTMLElement).style.borderColor = 'hsl(var(--border))'; }}
        >
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
        </button>

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
          .login-left-panel  { display: flex !important; }
          .login-mobile-logo { display: none !important; }
        }
      `}</style>
    </div>
  );
}
