import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useSocket } from '@/hooks/useSocket';

export function AppLayout() {
  const queryClient = useQueryClient();
  const { on } = useSocket();

  useEffect(() => {
    const unsubAlert = on<any>('alert.created', (event) => {
      const alert = event?.data ?? event;
      const isCritical = alert?.severity === 'critical' || alert?.severity === 'error';
      toast(alert?.title ?? 'New alert', {
        style: { borderLeft: `3px solid ${isCritical ? '#ef4444' : '#f59e0b'}` },
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
      {/* Desktop: margin-left=248px. Mobile: no margin (sidebar overlays) */}
      <main className="pt-[58px] md:ml-[248px] min-h-[calc(100vh-58px)]">
        <Outlet />
      </main>
    </div>
  );
}
