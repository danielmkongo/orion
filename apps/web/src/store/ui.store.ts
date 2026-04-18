import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  sidebarCollapsed: boolean;
  theme: 'dark' | 'light';
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
  setTheme: (t: 'dark' | 'light') => void;
  toggleTheme: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      theme: 'dark',

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
