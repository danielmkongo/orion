import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        // Orion brand palette
        orion: {
          50: '#f0f4ff',
          100: '#e0e9ff',
          200: '#c7d7fe',
          300: '#a5bbfc',
          400: '#8196f8',
          500: '#6272f2',
          600: '#4f56e6',
          700: '#4145cb',
          800: '#3538a4',
          900: '#303481',
          950: '#1e1f4b',
        },
        accent: {
          cyan: '#06b6d4',
          teal: '#14b8a6',
          violet: '#8b5cf6',
          amber: '#f59e0b',
          rose: '#f43f5e',
          emerald: '#10b981',
        },
        // Dark theme surfaces
        surface: {
          0: '#0a0b14',
          1: '#0f1021',
          2: '#141528',
          3: '#1a1b31',
          4: '#1f2040',
          border: '#2a2b45',
          'border-strong': '#3a3b5c',
        },
        // Light theme surfaces
        light: {
          0: '#ffffff',
          1: '#f8f9fc',
          2: '#f0f2f8',
          3: '#e8ebf5',
          4: '#dde1ef',
          border: '#d1d5e8',
          'border-strong': '#b8bdda',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 3s linear infinite',
        shimmer: 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { transform: 'translateY(8px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        slideDown: { from: { transform: 'translateY(-8px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        scaleIn: { from: { transform: 'scale(0.95)', opacity: '0' }, to: { transform: 'scale(1)', opacity: '1' } },
        shimmer: { from: { backgroundPosition: '-200% 0' }, to: { backgroundPosition: '200% 0' } },
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        glow: '0 0 20px rgba(98, 114, 242, 0.3)',
        'glow-sm': '0 0 10px rgba(98, 114, 242, 0.2)',
        card: '0 1px 3px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08)',
        'card-dark': '0 1px 3px rgba(0,0,0,0.4), 0 4px 20px rgba(0,0,0,0.3)',
        'elevated': '0 8px 32px rgba(0,0,0,0.16)',
      },
    },
  },
  plugins: [],
};

export default config;
