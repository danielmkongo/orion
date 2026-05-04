import { NavLink, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Activity, Bell, Map, Cpu, Sliders,
  Download, Zap, BarChart3, Users, Settings, LogOut, Sun, Moon, Layout,
} from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { useAuthStore } from '@/store/auth.store';

const NAV: Array<{
  num: string; href: string; label: string; icon: LucideIcon; group?: string;
}> = [
  { num: '01', href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { num: '02', href: '/telemetry', label: 'Telemetry',  icon: Activity,  group: 'MONITOR'      },
  { num: '03', href: '/alerts',    label: 'Alerts',     icon: Bell                              },
  { num: '04', href: '/map',       label: 'Map',        icon: Map                               },
  { num: '05', href: '/devices',   label: 'Devices',    icon: Cpu,       group: 'DEVICES'      },
  { num: '06', href: '/control',   label: 'Control',    icon: Sliders                           },
  { num: '07', href: '/ota',       label: 'Firmware',   icon: Download                          },
  { num: '08', href: '/rules',     label: 'Rules',      icon: Zap,       group: 'INTELLIGENCE' },
  { num: '09', href: '/reports',   label: 'Reports',    icon: BarChart3                         },
  { num: '10', href: '/pages',     label: 'Pages',      icon: Layout,    group: 'PUBLISH'      },
  { num: '11', href: '/users',     label: 'Users',      icon: Users,     group: 'ADMIN'        },
  { num: '12', href: '/settings',  label: 'Settings',   icon: Settings                          },
];

export function Sidebar() {
  const { sidebarCollapsed, theme, toggleTheme } = useUIStore();
  const { user, logout } = useAuthStore();
  const location = useLocation();

  return (
    <>
      {/* Mobile overlay */}
      {!sidebarCollapsed && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => useUIStore.getState().setSidebarCollapsed(true)}
        />
      )}

      <aside
        className={[
          'fixed left-0 z-30 flex flex-col',
          'border-r border-[hsl(var(--border))] bg-[hsl(var(--bg))]',
          'transition-transform duration-200',
          'w-[248px]',
          // starts below full-width header
          'top-[58px] h-[calc(100vh-58px)]',
          // mobile: slide in/out; desktop: always visible
          sidebarCollapsed ? '-translate-x-full md:translate-x-0' : 'translate-x-0',
        ].join(' ')}
      >
        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 no-scrollbar space-y-px">
          {NAV.map(({ num, href, label, icon: Icon, group }, i) => {
            const active =
              location.pathname === href ||
              (href !== '/dashboard' && location.pathname.startsWith(href));
            return (
              <div key={href}>
                {group && (
                  <div className="pt-4 pb-1 px-2">
                    <span className="eyebrow text-[9px]">{group}</span>
                  </div>
                )}
                <NavLink
                  to={href}
                  onClick={() => { if (window.innerWidth < 768) useUIStore.getState().setSidebarCollapsed(true); }}
                  className={[
                    'flex items-center gap-3 px-3 py-2 w-full transition-colors duration-100',
                    'border-l-2',
                    active
                      ? 'border-primary bg-primary/[0.07] text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--muted))]',
                  ].join(' ')}
                >
                  <span
                    className="font-mono text-[10px] w-5 flex-shrink-0 text-right opacity-40"
                    aria-hidden="true"
                  >
                    {num}
                  </span>
                  <Icon size={14} strokeWidth={active ? 2.2 : 1.8} className="flex-shrink-0" />
                  <span className="text-[13px] font-medium leading-none">{label}</span>
                </NavLink>
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-[hsl(var(--border))] p-3 space-y-2">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 flex items-center justify-center flex-shrink-0 bg-primary/10 border border-primary/20">
                <span className="text-[11px] font-semibold text-primary uppercase leading-none">
                  {user?.name?.charAt(0) ?? 'U'}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-foreground truncate leading-tight">
                  {user?.name ?? 'User'}
                </p>
                <p className="text-[10px] text-muted-foreground truncate leading-tight font-mono">
                  {user?.email ?? ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={toggleTheme}
                className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                title={theme === 'light' ? 'Dark mode' : 'Light mode'}
              >
                {theme === 'light' ? <Moon size={13} /> : <Sun size={13} />}
              </button>
              <button
                onClick={logout}
                className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                title="Log out"
              >
                <LogOut size={13} />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
