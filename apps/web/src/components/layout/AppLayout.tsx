import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useSocket } from '@/hooks/useSocket';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

export function AppLayout() {
  const { on } = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubAlert = on('alert.created', (event: any) => {
      const alert = event.data;
      const color = alert.severity === 'critical' || alert.severity === 'error' ? '#f43f5e' : '#f59e0b';
      toast(alert.title, {
        icon: alert.severity === 'critical' ? '🔴' : alert.severity === 'error' ? '🔴' : '⚠️',
        style: { borderLeft: `3px solid ${color}` },
      });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    });

    const unsubDevice = on('device.offline', (event: any) => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    });
    const unsubOnline = on('device.online', () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    });

    return () => {
      unsubAlert();
      unsubDevice();
      unsubOnline();
    };
  }, [on, queryClient]);

  return (
    <div className="flex h-screen overflow-hidden bg-surface-0">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
