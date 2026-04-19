import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Activity, Bell, Map, Cpu, Sliders,
  Download, Zap, BarChart3, Users, Settings, ChevronLeft,
  LogOut,
} from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { useAuthStore } from '@/store/auth.store';
import { OrionMark } from '@/components/ui/OrionLogo';

const NAV = [
  {
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    ],
  },
  {
    label: 'Monitor',
    items: [
      { href: '/telemetry', icon: Activity,  label: 'Telemetry' },
      { href: '/alerts',    icon: Bell,      label: 'Alerts' },
      { href: '/map',       icon: Map,       label: 'Map' },
    ],
  },
  {
    label: 'Fleet',
    items: [
      { href: '/devices',   icon: Cpu,       label: 'Devices' },
      { href: '/control',   icon: Sliders,   label: 'Control' },
      { href: '/ota',       icon: Download,  label: 'Firmware' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { href: '/rules',     icon: Zap,       label: 'Rules' },
      { href: '/reports',   icon: BarChart3, label: 'Reports' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/users',     icon: Users,     label: 'Users' },
      { href: '/settings',  icon: Settings,  label: 'Settings' },
    ],
  },
];

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { user, logout } = useAuthStore();
  const location = useLocation();

  const W = sidebarCollapsed ? 70 : 244;

  return (
    <motion.aside
      animate={{ width: W }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      className="fixed left-0 top-0 h-full flex flex-col border-r border-border bg-surface z-30 overflow-hidden"
      style={{ width: W }}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 h-[60px] border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <OrionMark size={26} className="text-primary flex-shrink-0" />
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                className="font-semibold text-[15px] tracking-tight text-foreground whitespace-nowrap"
              >
                Orion
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <button
          onClick={toggleSidebar}
          className="btn-ghost btn btn-sm !px-0 w-7 h-7 flex-shrink-0 rounded-lg"
          aria-label="Toggle sidebar"
        >
          <motion.div
            animate={{ rotate: sidebarCollapsed ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronLeft size={15} />
          </motion.div>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2.5 no-scrollbar">
        {NAV.map((group, gi) => (
          <div key={gi} className="mb-1">
            {group.label && !sidebarCollapsed && (
              <div className="px-2 pt-3 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 whitespace-nowrap">
                  {group.label}
                </span>
              </div>
            )}
            {group.label && sidebarCollapsed && (
              <div className="h-px bg-border mx-2 my-2" />
            )}

            {group.items.map(({ href, icon: Icon, label }) => {
              const active = location.pathname === href || (href !== '/dashboard' && location.pathname.startsWith(href));
              return (
                <NavLink
                  key={href}
                  to={href}
                  title={sidebarCollapsed ? label : undefined}
                  className={`nav-item mb-0.5 ${active ? 'nav-item-active' : ''} ${sidebarCollapsed ? 'justify-center !px-0' : ''}`}
                >
                  <Icon
                    size={17}
                    className={`flex-shrink-0 ${active ? 'text-primary' : ''}`}
                    strokeWidth={active ? 2.2 : 1.8}
                  />
                  <AnimatePresence>
                    {!sidebarCollapsed && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.1 }}
                        className="truncate"
                      >
                        {label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="flex-shrink-0 border-t border-border p-2.5">
        <div className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg ${sidebarCollapsed ? 'justify-center' : ''}`}>
          <div className="w-7 h-7 rounded-full bg-primary/12 flex items-center justify-center flex-shrink-0 border border-primary/20">
            <span className="text-[11px] font-semibold text-primary uppercase">
              {user?.name?.charAt(0) ?? 'U'}
            </span>
          </div>
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 min-w-0"
              >
                <p className="text-[13px] font-medium text-foreground truncate leading-tight">
                  {user?.name ?? 'User'}
                </p>
                <p className="text-[11px] text-muted-foreground truncate leading-tight">
                  {user?.email ?? ''}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          {!sidebarCollapsed && (
            <button
              onClick={logout}
              className="btn-ghost btn btn-sm !px-0 w-7 h-7 rounded-lg flex-shrink-0 ml-auto"
              title="Log out"
            >
              <LogOut size={14} />
            </button>
          )}
        </div>
        {sidebarCollapsed && (
          <button
            onClick={logout}
            className="nav-item justify-center !px-0 w-full mt-1"
            title="Log out"
          >
            <LogOut size={14} />
          </button>
        )}
      </div>
    </motion.aside>
  );
}
