import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bell, Sun, Moon, Search, LogOut, User, Settings, ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { authApi } from '@/api/auth';
import { cn, timeAgo } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/api/client';

export function Header() {
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useUIStore();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);

  const { data: alertData } = useQuery({
    queryKey: ['alerts', 'active'],
    queryFn: () => apiClient.get('/alerts', { params: { status: 'active', limit: 5 } }).then(r => r.data),
    refetchInterval: 30_000,
  });

  const activeAlertCount = alertData?.total ?? 0;

  async function handleLogout() {
    try { await authApi.logout(); } catch {}
    logout();
    navigate('/login');
  }

  return (
    <header className="h-16 flex items-center justify-between px-6 bg-surface-1 border-b border-surface-border shrink-0">
      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Search devices, dashboards, alerts..."
          className="w-full pl-9 pr-4 py-2 bg-surface-2 border border-surface-border rounded-lg text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-orion-500 focus:ring-1 focus:ring-orion-500/30 transition-colors"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 border border-surface-border rounded px-1 py-0.5">⌘K</kbd>
      </div>

      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-surface-3 transition-colors"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Alerts bell */}
        <div className="relative">
          <button
            onClick={() => setShowAlerts(!showAlerts)}
            className="relative p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-surface-3 transition-colors"
          >
            <Bell className="w-4 h-4" />
            {activeAlertCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center"
              >
                {activeAlertCount > 9 ? '9+' : activeAlertCount}
              </motion.span>
            )}
          </button>

          {showAlerts && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="absolute right-0 top-12 w-80 bg-surface-2 border border-surface-border rounded-xl shadow-elevated z-50"
              onMouseLeave={() => setShowAlerts(false)}
            >
              <div className="p-4 border-b border-surface-border flex items-center justify-between">
                <span className="font-semibold text-sm text-slate-200">Active Alerts</span>
                {activeAlertCount > 0 && (
                  <span className="badge-error text-xs">{activeAlertCount} active</span>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto">
                {alertData?.data?.length ? alertData.data.map((alert: any) => (
                  <div
                    key={alert._id}
                    className="p-3 border-b border-surface-border/50 hover:bg-surface-3/50 cursor-pointer"
                    onClick={() => { navigate('/alerts'); setShowAlerts(false); }}
                  >
                    <div className="flex items-start gap-2">
                      <span className={cn('mt-0.5 w-2 h-2 rounded-full shrink-0',
                        alert.severity === 'critical' ? 'bg-rose-400' :
                        alert.severity === 'error' ? 'bg-rose-400' :
                        alert.severity === 'warning' ? 'bg-amber-400' : 'bg-sky-400'
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">{alert.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{alert.message}</p>
                        <p className="text-[11px] text-slate-600 mt-1">{timeAgo(alert.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="p-6 text-center text-slate-500 text-sm">No active alerts</div>
                )}
              </div>
              <div className="p-2 border-t border-surface-border">
                <button
                  onClick={() => { navigate('/alerts'); setShowAlerts(false); }}
                  className="w-full text-center text-xs text-orion-400 hover:text-orion-300 py-1.5"
                >
                  View all alerts →
                </button>
              </div>
            </motion.div>
          )}
        </div>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-lg hover:bg-surface-3 transition-colors"
          >
            <div className="w-7 h-7 rounded-full orion-gradient flex items-center justify-center text-xs font-bold text-white">
              {user?.name?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-slate-200 leading-none">{user?.name}</p>
              <p className="text-[11px] text-slate-500 mt-0.5 capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
          </button>

          {showUserMenu && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="absolute right-0 top-12 w-48 bg-surface-2 border border-surface-border rounded-xl shadow-elevated z-50 overflow-hidden"
              onMouseLeave={() => setShowUserMenu(false)}
            >
              <div className="p-3 border-b border-surface-border">
                <p className="text-sm font-medium text-slate-200">{user?.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{user?.email}</p>
              </div>
              <div className="p-1">
                <button
                  onClick={() => { navigate('/settings'); setShowUserMenu(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-300 hover:text-slate-100 hover:bg-surface-3 rounded-lg transition-colors"
                >
                  <Settings className="w-4 h-4" /> Settings
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </header>
  );
}
