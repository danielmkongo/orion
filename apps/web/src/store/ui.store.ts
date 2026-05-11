import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NotifPrefs {
  critical: boolean;
  offline: boolean;
  rules: boolean;
  ota: boolean;
  commands: boolean;
}

interface UIState {
  sidebarCollapsed: boolean;
  theme: 'dark' | 'light';
  relativeTimestamps: boolean;
  animationsEnabled: boolean;
  timezone: string; // IANA timezone name, '' = browser auto
  notifPrefs: NotifPrefs;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
  setTheme: (t: 'dark' | 'light') => void;
  toggleTheme: () => void;
  setRelativeTimestamps: (v: boolean) => void;
  setAnimationsEnabled: (v: boolean) => void;
  setTimezone: (v: string) => void;
  setNotifPref: (key: keyof NotifPrefs, v: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      theme: 'light',
      relativeTimestamps: true,
      animationsEnabled: true,
      timezone: '',
      notifPrefs: {
        critical: true,
        offline: true,
        rules: false,
        ota: true,
        commands: false,
      },

      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      setTheme: (theme) => {
        set({ theme });
        document.documentElement.classList.toggle('dark', theme === 'dark');
      },
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        get().setTheme(next);
      },

      setRelativeTimestamps: (v) => set({ relativeTimestamps: v }),
      setAnimationsEnabled: (v) => set({ animationsEnabled: v }),
      setTimezone: (v) => set({ timezone: v }),
      setNotifPref: (key, v) => set(s => ({ notifPrefs: { ...s.notifPrefs, [key]: v } })),
    }),
    {
      name: 'orion-ui',
      onRehydrateStorage: () => (state) => {
        if (state) {
          document.documentElement.classList.toggle('dark', state.theme === 'dark');
        }
      },
    }
  )
);
