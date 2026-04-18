import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowLeft, Loader2, Check } from 'lucide-react';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/store/auth.store';
import { OrionMark } from '@/components/ui/OrionLogo';
import toast from 'react-hot-toast';

const NICHES = [
  { value: 'environmental', label: 'Environmental', desc: 'Air, water, soil monitoring' },
  { value: 'industrial',    label: 'Industrial IoT', desc: 'Machines, production lines' },
  { value: 'agriculture',   label: 'Agriculture',    desc: 'Smart farming & irrigation' },
  { value: 'fleet',         label: 'Fleet & Logistics', desc: 'Vehicle tracking & routing' },
  { value: 'smart_building',label: 'Smart Building', desc: 'HVAC, lighting, occupancy' },
  { value: 'energy',        label: 'Energy',         desc: 'Power & utility metering' },
  { value: 'research',      label: 'Research',       desc: 'Academic & scientific IoT' },
  { value: 'general',       label: 'General / Other',desc: 'Custom use case' },
];

type Step = 1 | 2;

export function RegisterPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    orgName: '',
    niche: '',
  });

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  function handleNext(e: React.FormEvent) {
    e.preventDefault();
    setStep(2);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.register(form.email, form.password, form.name, form.orgName);
      const result = await authApi.login(form.email, form.password);
      setAuth(result.user as any, result.accessToken, result.refreshToken);
      toast.success('Workspace created!');
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-[440px]">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center gap-2.5 mb-6">
            <OrionMark size={26} className="text-primary" />
            <span className="text-[17px] font-semibold text-foreground tracking-tight">Orion</span>
          </div>

          <h1 className="text-[1.625rem] font-semibold text-foreground tracking-tight">
            {step === 1 ? 'Create your workspace' : 'What do you work with?'}
          </h1>
          <p className="text-[14px] text-muted-foreground mt-1">
            {step === 1
              ? 'Get started with Orion in under a minute'
              : 'Help us tailor the experience for you'}
          </p>
        </motion.div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-7 px-2">
          {([1, 2] as Step[]).map(s => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0 transition-colors ${
                step > s
                  ? 'bg-primary text-white'
                  : step === s
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground'
              }`}>
                {step > s ? <Check size={12} /> : s}
              </div>
              <span className={`text-[12px] font-medium ${step >= s ? 'text-foreground' : 'text-muted-foreground'}`}>
                {s === 1 ? 'Account' : 'Focus'}
              </span>
              {s < 2 && <div className={`flex-1 h-px ${step > s ? 'bg-primary' : 'bg-border'} transition-colors`} />}
            </div>
          ))}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <motion.form
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            onSubmit={handleNext}
            className="card p-6 space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1.5">Your name</label>
                <input type="text" value={form.name} onChange={update('name')} className="input" placeholder="Jane Smith" required />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1.5">Organization</label>
                <input type="text" value={form.orgName} onChange={update('orgName')} className="input" placeholder="Acme Corp" required />
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1.5">Work email</label>
              <input type="email" value={form.email} onChange={update('email')} className="input" placeholder="jane@company.com" required autoComplete="email" />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1.5">Password</label>
              <input type="password" value={form.password} onChange={update('password')} className="input" placeholder="At least 8 characters" required minLength={8} autoComplete="new-password" />
            </div>

            <button type="submit" className="btn btn-primary w-full mt-2">
              Continue <ArrowRight size={15} />
            </button>
          </motion.form>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <motion.form
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            onSubmit={handleSubmit}
          >
            <div className="grid grid-cols-2 gap-2.5 mb-5">
              {NICHES.map(({ value, label, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, niche: value }))}
                  className={`relative text-left p-3.5 rounded-xl border transition-all ${
                    form.niche === value
                      ? 'border-primary bg-primary/5 shadow-glow-sm'
                      : 'border-border bg-surface hover:border-border-strong'
                  }`}
                >
                  {form.niche === value && (
                    <div className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                      <Check size={9} className="text-white" strokeWidth={3} />
                    </div>
                  )}
                  <p className="text-[13px] font-semibold text-foreground">{label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
                </button>
              ))}
            </div>

            <p className="text-[12px] text-muted-foreground text-center mb-4">
              You can change your focus area any time in settings.
            </p>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn btn-secondary flex-shrink-0"
              >
                <ArrowLeft size={15} />
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary flex-1"
              >
                {loading
                  ? <><Loader2 size={15} className="animate-spin" /> Creating…</>
                  : <>Create workspace <ArrowRight size={15} /></>
                }
              </button>
            </div>
          </motion.form>
        )}

        <p className="text-center text-[13px] text-muted-foreground mt-5">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
