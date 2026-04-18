import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Semantic tokens ──────────────────────────────
        background: 'hsl(var(--bg))',
        foreground: 'hsl(var(--fg))',
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          raised: 'hsl(var(--surface-raised))',
          // Legacy compat aliases
          0: 'hsl(var(--bg))',
          1: 'hsl(var(--muted))',
          2: 'hsl(var(--surface))',
          3: 'hsl(var(--surface-raised))',
          4: 'hsl(var(--surface-raised))',
          border: 'hsl(var(--border))',
          'border-strong': 'hsl(var(--border-strong))',
        },
        border: 'hsl(var(--border))',
        'border-strong': 'hsl(var(--border-strong))',
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-fg))',
          fg: 'hsl(var(--muted-fg))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-fg))',
          fg: 'hsl(var(--primary-fg))',
          hover: 'hsl(var(--primary-hover))',
          subtle: 'hsl(var(--primary-subtle))',
        },
        // ── Orion brand (orange — replaces old blue-violet) ──
        orion: {
          50:  'hsl(var(--primary-subtle))',
          100: 'hsl(21 100% 90%)',
          200: 'hsl(21 95% 80%)',
          300: 'hsl(21 92% 68%)',
          400: 'hsl(21 91% 60%)',
          500: 'hsl(var(--primary))',
          600: 'hsl(var(--primary))',
          700: 'hsl(var(--primary-hover))',
          800: 'hsl(21 85% 30%)',
          900: 'hsl(21 80% 20%)',
          950: 'hsl(21 75% 12%)',
        },
        // ── Status / semantic ─────────────────────────────
        success:  '#22c55e',
        warning:  '#f59e0b',
        danger:   '#ef4444',
        info:     '#3b82f6',
        // ── Accent colours (kept for chart palette) ───────
        accent: {
          cyan:    '#06b6d4',
          teal:    '#14b8a6',
          violet:  '#8b5cf6',
          amber:   '#f59e0b',
          rose:    '#f43f5e',
          emerald: '#10b981',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-in':   'fadeIn 0.2s ease-out',
        'slide-up':  'slideUp 0.25s ease-out',
        'scale-in':  'scaleIn 0.15s ease-out',
        shimmer:     'shimmer 2s linear infinite',
        'spin-slow': 'spin 3s linear infinite',
        'pulse-slow':'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' },                                       to: { opacity: '1' } },
        slideUp: { from: { transform: 'translateY(6px)', opacity: '0' },         to: { transform: 'translateY(0)',    opacity: '1' } },
        scaleIn: { from: { transform: 'scale(0.96)',     opacity: '0' },         to: { transform: 'scale(1)',         opacity: '1' } },
        shimmer: { from: { backgroundPosition: '-200% 0' },                      to: { backgroundPosition: '200% 0' } },
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        'card':      '0 1px 3px rgb(0 0 0/0.06), 0 4px 12px rgb(0 0 0/0.04)',
        'card-hover':'0 4px 16px rgb(0 0 0/0.10), 0 1px 4px rgb(0 0 0/0.06)',
        'card-dark': '0 1px 3px rgb(0 0 0/0.4),  0 4px 20px rgb(0 0 0/0.3)',
        'glow':      '0 0 20px hsl(var(--primary)/0.3)',
        'glow-sm':   '0 0 10px hsl(var(--primary)/0.2)',
      },
    },
  },
  plugins: [],
};

export default config;
