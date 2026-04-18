import { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Bell, Sun, Moon, Search, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { useAuthStore } from '@/store/auth.store';
import apiClient from '@/api/client';
import { formatDistanceToNow } from 'date-fns';

const ROUTE_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/telemetry': 'Telemetry',
  '/alerts':    'Alerts',
  '/map':       'Map',
  '/devices':   'Devices',
  '/commands':  'Commands',
  '/ota':       'OTA Updates',
  '/rules':     'Rules',
  '/reports':   'Reports',
  '/users':     'Users',
  '/settings':  'Settings',
};

export function Header() {
  const { theme, toggleTheme, sidebarCollapsed } = useUIStore();
  const { user } = useAuthStore();
  const location = useLocation();
  const [showAlerts, setShowAlerts] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const sidebarW = sidebarCollapsed ? 70 : 244;

  // Determine page label
  let pageLabel = 'Dashboard';
  for (const [path, label] of Object.entries(ROUTE_LABELS)) {
    if (location.pathname === path || (path !== '/' && location.pathname.startsWith(path))) {
      pageLabel = label;
      break;
    }
  }

  const { data: alertsData } = useQuery({
    queryKey: ['alerts', 'active'],
    queryFn: () => apiClient.get<{ alerts: any[]; total: number }>('/alerts', { params: { status: 'active', limit: 8 } }).then(r => r.data),
    refetchInterval: 30_000,
  });

  const activeAlerts = alertsData?.alerts ?? [];
  const alertCount = alertsData?.total ?? 0;

  return (
    <header
      className="fixed top-0 right-0 h-[60px] flex items-center justify-between px-5 border-b border-border bg-surface/95 backdrop-blur-sm z-20 transition-[left] duration-[220ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{ left: sidebarW }}
    >
      {/* Page title */}
      <h1 className="text-[15px] font-semibold text-foreground tracking-tight">{pageLabel}</h1>

      {/* Right actions */}
      <div className="flex items-center gap-0.5">
        {/* Search */}
        {showSearch ? (
          <div className="flex items-center gap-2 mr-1 animate-scale-in">
            <input
              autoFocus
              placeholder="Search devices, alerts…"
              className="input !h-8 !w-52 text-[13px]"
              onBlur={() => setShowSearch(false)}
            />
            <button className="btn-ghost btn btn-sm !px-0 w-8 h-8" onClick={() => setShowSearch(false)}>
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            className="btn-ghost btn !px-0 w-8 h-8"
            onClick={() => setShowSearch(true)}
            title="Search (⌘K)"
          >
            <Search size={15} />
          </button>
        )}

        {/* Theme toggle */}
        <button
          className="btn-ghost btn !px-0 w-8 h-8"
          onClick={toggleTheme}
          title={theme === 'light' ? 'Dark mode' : 'Light mode'}
        >
          {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
        </button>

        {/* Alerts bell */}
        <div className="relative">
          <button
            className="btn-ghost btn !px-0 w-8 h-8 relative"
            onClick={() => setShowAlerts(v => !v)}
          >
            <Bell size={15} />
            {alertCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-primary text-[9px] font-bold text-white flex items-center justify-center leading-none">
                {alertCount > 9 ? '9+' : alertCount}
              </span>
            )}
          </button>

          {showAlerts && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowAlerts(false)} />
              <div className="absolute right-0 top-full mt-2 w-80 card shadow-card-hover z-40 animate-scale-in overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <span className="text-[13px] font-semibold text-foreground">Alerts</span>
                  {alertCount > 0 && (
                    <span className="badge badge-error">{alertCount} active</span>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {activeAlerts.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground text-center py-8">All clear — no active alerts</p>
                  ) : (
                    activeAlerts.map((a: any) => (
                      <Link
                        key={a.id ?? a._id}
                        to="/alerts"
                        onClick={() => setShowAlerts(false)}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-muted transition-colors border-b border-border/50 last:border-0"
                      >
                        <span className={`status-dot mt-1.5 flex-shrink-0 ${
                          a.severity === 'critical' || a.severity === 'error' ? 'status-dot-error' : 'status-dot-idle'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-foreground truncate">{a.title ?? a.message}</p>
                          {a.message && a.title && (
                            <p className="text-[11px] text-muted-foreground truncate">{a.message}</p>
                          )}
                          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                            {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
                <div className="px-4 py-2.5 border-t border-border bg-muted/40">
                  <Link
                    to="/alerts"
                    onClick={() => setShowAlerts(false)}
                    className="text-[12px] font-medium text-primary hover:underline"
                  >
                    View all alerts →
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>

        {/* User avatar */}
        <div
          className="w-7 h-7 rounded-full bg-primary/12 border border-primary/25 flex items-center justify-center ml-1.5 cursor-default"
          title={user?.name}
        >
          <span className="text-[11px] font-semibold text-primary uppercase leading-none">
            {user?.name?.charAt(0) ?? 'U'}
          </span>
        </div>
      </div>
    </header>
  );
}
