import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store/ui.store';
import {
  LayoutDashboard, Cpu, Map, Activity, Bell, Terminal,
  Zap, Shield, Upload, Users, Settings, BarChart3,
  ChevronLeft, ChevronRight, Satellite,
} from 'lucide-react';

const NAV_GROUPS = [
  {
    label: 'Monitoring',
    items: [
      { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { path: '/map', icon: Map, label: 'Map & Tracking' },
      { path: '/telemetry', icon: Activity, label: 'Telemetry' },
      { path: '/alerts', icon: Bell, label: 'Alerts' },
    ],
  },
  {
    label: 'Fleet',
    items: [
      { path: '/devices', icon: Cpu, label: 'Devices' },
      { path: '/commands', icon: Terminal, label: 'Commands' },
      { path: '/ota', icon: Upload, label: 'OTA Updates' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { path: '/rules', icon: Zap, label: 'Rules Engine' },
      { path: '/reports', icon: BarChart3, label: 'Reports' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { path: '/users', icon: Users, label: 'Users & Roles' },
      { path: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
];

export function Sidebar() {
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarCollapsed ? 64 : 240 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className="relative flex flex-col bg-surface-1 border-r border-surface-border overflow-hidden shrink-0 h-screen"
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-surface-border shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-lg orion-gradient flex items-center justify-center shrink-0 shadow-glow-sm">
            <Satellite className="w-4 h-4 text-white" />
          </div>
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
              >
                <span className="text-base font-bold text-gradient">Orion</span>
                <span className="block text-[10px] text-slate-500 leading-none tracking-widest uppercase">by Vortan</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto no-scrollbar py-4 px-2 space-y-6">
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            <AnimatePresence>
              {!sidebarCollapsed && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 px-3 mb-1.5"
                >
                  {group.label}
                </motion.p>
              )}
            </AnimatePresence>
            <ul className="space-y-0.5">
              {group.items.map(item => {
                const active = location.pathname.startsWith(item.path);
                const Icon = item.icon;
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      title={sidebarCollapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                        active
                          ? 'bg-orion-600/20 text-orion-300 border border-orion-500/20'
                          : 'text-slate-400 hover:text-slate-100 hover:bg-surface-3'
                      )}
                    >
                      <Icon className={cn('shrink-0 w-4 h-4', active ? 'text-orion-400' : '')} />
                      <AnimatePresence>
                        {!sidebarCollapsed && (
                          <motion.span
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -8 }}
                            transition={{ duration: 0.15 }}
                            className="truncate"
                          >
                            {item.label}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="p-2 border-t border-surface-border">
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-surface-3 transition-colors"
        >
          {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </motion.aside>
  );
}
