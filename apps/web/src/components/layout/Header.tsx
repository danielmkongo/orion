import { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Bell, Search, X, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { useAuthStore } from '@/store/auth.store';
import apiClient from '@/api/client';
import { formatDistanceToNow } from 'date-fns';
import { OrionMark } from '@/components/ui/OrionLogo';

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
  return time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function Header() {
  const { toggleSidebar } = useUIStore();
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
  const alertCount   = alertsData?.total ?? 0;

  return (
    <header
      className="fixed top-0 left-0 right-0 h-[58px] z-40 flex items-stretch"
      style={{ background: 'hsl(var(--bg))', borderBottom: '1px solid hsl(var(--border))' }}
    >
      {/* Brand area — same width as sidebar */}
      <div
        className="hidden md:flex items-center gap-3 px-5 flex-shrink-0"
        style={{ width: 248, borderRight: '1px solid hsl(var(--border))' }}
      >
        <OrionMark size={20} className="text-primary flex-shrink-0" />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, lineHeight: 1, letterSpacing: '-0.02em' }}>
          <em style={{ fontStyle: 'italic', color: 'hsl(var(--primary))' }}>Orion</em>
        </span>
        <span className="eyebrow" style={{ fontSize: 9, marginLeft: 2, opacity: 0.55 }}>by Vortan</span>
      </div>

      {/* Mobile: hamburger + brand */}
      <div className="md:hidden flex items-center gap-3 px-4 flex-shrink-0">
        <button
          onClick={toggleSidebar}
          className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label="Menu"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <OrionMark size={18} className="text-primary" />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, lineHeight: 1 }}>
          <em style={{ fontStyle: 'italic', color: 'hsl(var(--primary))' }}>Orion</em>
        </span>
      </div>

      {/* Page crumb */}
      <div className="flex items-center px-6 flex-1 min-w-0">
        <div>
          <p className="eyebrow" style={{ fontSize: 9 }}>Orion Platform</p>
          <p style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1, marginTop: 2 }}>{pageLabel}</p>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1 px-4 flex-shrink-0">
        {/* Clock (desktop only) */}
        <span className="hidden lg:block mono dim mr-2" style={{ fontSize: 11, letterSpacing: '0.14em', opacity: 0.6 }}>{clock} · GMT</span>

        {/* Search */}
        {showSearch ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              placeholder="Search devices, alerts…"
              className="input"
              style={{ height: 30, width: 200, fontSize: 12 }}
              onBlur={() => setShowSearch(false)}
            />
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowSearch(false)}>
              <X size={13} />
            </button>
          </div>
        ) : (
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowSearch(true)} title="Search">
            <Search size={14} />
          </button>
        )}

        {/* Alerts */}
        <div className="relative">
          <button
            className="btn btn-ghost btn-sm btn-icon relative"
            onClick={() => setShowAlerts(v => !v)}
            title="Alerts"
          >
            <Bell size={14} />
            {alertCount > 0 && (
              <span
                className="absolute top-1 right-1 flex items-center justify-center"
                style={{ width: 14, height: 14, background: 'hsl(var(--bad))', color: '#fff', fontSize: 8, fontFamily: 'var(--font-mono)', fontWeight: 700 }}
              >
                {alertCount > 9 ? '9+' : alertCount}
              </span>
            )}
          </button>

          {showAlerts && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowAlerts(false)} />
              <div
                className="absolute right-0 top-full mt-1 w-80 z-40"
                style={{ background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))', boxShadow: 'var(--shadow-2)' }}
              >
                <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                  <span className="eyebrow" style={{ fontSize: 10 }}>Active alerts</span>
                  {alertCount > 0 && (
                    <span className="tag tag-error">{alertCount}</span>
                  )}
                </div>
                <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {activeAlerts.length === 0 ? (
                    <p className="dim" style={{ fontSize: 12, textAlign: 'center', padding: '24px 16px' }}>All systems nominal</p>
                  ) : (
                    activeAlerts.map((a: any) => (
                      <Link
                        key={a.id ?? a._id}
                        to="/alerts"
                        onClick={() => setShowAlerts(false)}
                        className="flex items-start gap-3 px-4 py-3"
                        style={{ borderBottom: '1px solid hsl(var(--border) / 0.5)', transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'hsl(var(--surface-raised))')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span
                          className="flex-shrink-0 mt-1.5"
                          style={{ width: 6, height: 6, borderRadius: '50%', background: a.severity === 'critical' || a.severity === 'error' ? 'hsl(var(--bad))' : 'hsl(var(--warn))', display: 'inline-block' }}
                        />
                        <div className="flex-1 min-w-0">
                          <p style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title ?? a.message}</p>
                          <p className="mono dim" style={{ fontSize: 10, marginTop: 2 }}>
                            {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
                <div className="px-4 py-2" style={{ borderTop: '1px solid hsl(var(--border))' }}>
                  <Link
                    to="/alerts"
                    onClick={() => setShowAlerts(false)}
                    className="acc row"
                    style={{ fontSize: 11, fontWeight: 500, gap: 4 }}
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
          className="flex items-center justify-center ml-1"
          style={{ width: 30, height: 30, background: 'hsl(var(--primary) / 0.1)', border: '1px solid hsl(var(--primary) / 0.25)', cursor: 'default' }}
          title={user?.name}
        >
          <span className="acc" style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-display)', textTransform: 'uppercase', lineHeight: 1 }}>
            {user?.name?.charAt(0) ?? 'U'}
          </span>
        </div>
      </div>
    </header>
  );
}
