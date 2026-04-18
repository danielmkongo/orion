import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/auth.store';
import type { RealtimeEventType } from '@orion/shared';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? '';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function useSocket() {
  const { accessToken, isAuthenticated } = useAuthStore();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    if (!socket || !socket.connected) {
      socket = io(SOCKET_URL, {
        auth: { token: accessToken },
        transports: ['websocket', 'polling'],
        path: '/socket.io',
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
      });

      socket.on('connect', () => console.log('[socket] connected:', socket?.id));
      socket.on('disconnect', () => console.log('[socket] disconnected'));
      socket.on('connect_error', err => console.error('[socket] error:', err.message));
    }

    socketRef.current = socket;

    return () => {
      // Don't disconnect on component unmount — keep the single global socket
    };
  }, [isAuthenticated, accessToken]);

  const on = useCallback(<T>(event: RealtimeEventType | string, handler: (data: T) => void) => {
    socket?.on(event, handler);
    return () => { socket?.off(event, handler); };
  }, []);

  const off = useCallback((event: string, handler?: (...args: any[]) => void) => {
    if (handler) socket?.off(event, handler);
    else socket?.removeAllListeners(event);
  }, []);

  const subscribeDevice = useCallback((deviceId: string) => {
    socket?.emit('subscribe:device', deviceId);
    return () => socket?.emit('unsubscribe:device', deviceId);
  }, []);

  return { socket: socketRef.current, on, off, subscribeDevice };
}
