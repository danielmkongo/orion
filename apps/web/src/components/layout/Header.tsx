import { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Bell, Search, X, Menu, ArrowRight } from 'lucide-react';
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
  '/control':   'Control',
  '/ota':       'Firmware',
  '/rules':     'Rules',
  '/reports':   'Reports',
  '/users':     'Users',
  '/settings':  'Settings',
};

function useClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
}

export function Header() {
  const { toggleSidebar, sidebarCollapsed } = useUIStore();
  const { user } = useAuthStore();
  const location = useLocation();
  const [showAlerts, setShowAlerts] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const clock = useClock();

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
    <header className="fixed top-0 right-0 left-0 md:left-[248px] h-[58px] z-20 flex items-center justify-between px-5 border-b border-[hsl(var(--border))] backdrop-blur-sm" style={{ background: 'color-mix(in oklab, hsl(var(--bg)) 92%, transparent)' }}>
      {/* Left */}
      <div className="flex items-center gap-3">
        {/* Mobile hamburger */}
        <button
          className="md:hidden w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          onClick={toggleSidebar}
          aria-label="Menu"
        >
          <Menu size={18} />
        </button>

        {/* Page label */}
        <div>
          <p className="eyebrow text-[10px]">Orion Platform</p>
          <p className="text-[13px] font-semibold text-foreground tracking-tight leading-none mt-0.5">{pageLabel}</p>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1.5">
        {/* Clock (desktop only) */}
        <span className="hidden lg:block font-mono text-[11px] text-muted-foreground mr-2 opacity-60">
          {clock}
        </span>

        {/* Search */}
        {showSearch ? (
          <div className="flex items-center gap-2 animate-fade-in">
            <input
              autoFocus
              placeholder="Search devices, alerts…"
              className="input !h-8 !w-48 text-[12px]"
              onBlur={() => setShowSearch(false)}
            />
            <button
              className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground"
              onClick={() => setShowSearch(false)}
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <button
            className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowSearch(true)}
            title="Search"
          >
            <Search size={15} />
          </button>
        )}

        {/* Alerts */}
        <div className="relative">
          <button
            className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors relative"
            onClick={() => setShowAlerts(v => !v)}
          >
            <Bell size={15} />
            {alertCount > 0 && (
              <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-primary text-white text-[8px] font-bold flex items-center justify-center leading-none">
                {alertCount > 9 ? '9+' : alertCount}
              </span>
            )}
          </button>

          {showAlerts && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowAlerts(false)} />
              <div className="absolute right-0 top-full mt-2 w-80 bg-[hsl(var(--surface))] border border-[hsl(var(--rule))] shadow-xl z-40 animate-fade-in">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--rule))]">
                  <span className="text-[12px] font-semibold text-foreground tracking-wide uppercase">Alerts</span>
                  {alertCount > 0 && (
                    <span className="font-mono text-[10px] text-primary border border-primary/30 px-2 py-0.5">
                      {alertCount} active
                    </span>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {activeAlerts.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground text-center py-8">All systems nominal</p>
                  ) : (
                    activeAlerts.map((a: any) => (
                      <Link
                        key={a.id ?? a._id}
                        to="/alerts"
                        onClick={() => setShowAlerts(false)}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-[hsl(var(--muted))] transition-colors border-b border-[hsl(var(--rule)/0.5)] last:border-0"
                      >
                        <span className={`mt-1.5 flex-shrink-0 w-1.5 h-1.5 ${
                          a.severity === 'critical' || a.severity === 'error'
                            ? 'bg-red-500'
                            : 'bg-amber-500'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-foreground truncate">{a.title ?? a.message}</p>
                          <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                            {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
                <div className="px-4 py-2.5 border-t border-[hsl(var(--rule))]">
                  <Link
                    to="/alerts"
                    onClick={() => setShowAlerts(false)}
                    className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    View all <ArrowRight size={10} />
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Avatar */}
        <div
          className="w-7 h-7 bg-primary/10 border border-primary/25 flex items-center justify-center ml-1 cursor-default"
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
