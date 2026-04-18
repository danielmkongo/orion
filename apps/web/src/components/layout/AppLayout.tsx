import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useUIStore } from '@/store/ui.store';
import { useSocket } from '@/hooks/useSocket';

export function AppLayout() {
  const { sidebarCollapsed } = useUIStore();
  const queryClient = useQueryClient();
  const { on } = useSocket();

  const sidebarW = sidebarCollapsed ? 70 : 244;

  useEffect(() => {
    const unsubAlert = on<any>('alert.created', (event) => {
      const alert = event?.data ?? event;
      const isCritical = alert?.severity === 'critical' || alert?.severity === 'error';
      toast(alert?.title ?? 'New alert', {
        style: {
          borderLeft: `3px solid ${isCritical ? '#ef4444' : '#f59e0b'}`,
        },
      });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    });
    const unsubOff = on<unknown>('device.offline', () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    });
    const unsubOn = on<unknown>('device.online', () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    });
    return () => { unsubAlert(); unsubOff(); unsubOn(); };
  }, [on, queryClient]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Header />
      <main
        className="transition-[margin-left] duration-[220ms] ease-[cubic-bezier(0.4,0,0.2,1)] min-h-screen"
        style={{ marginLeft: sidebarW, paddingTop: 60 }}
      >
        <div className="p-6 max-w-[1600px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
