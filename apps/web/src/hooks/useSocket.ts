import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/auth.store';
import type { RealtimeEventType } from '@orion/shared';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? '';

let socket: Socket | null = null;
let socketToken: string | null = null; // track which token the socket was built with

function createSocket(token: string): Socket {
  const s = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    path: '/socket.io',
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionAttempts: 5,
  });
  s.on('connect',       () => console.log('[socket] connected:', s.id));
  s.on('disconnect',    () => console.log('[socket] disconnected'));
  s.on('connect_error', err => console.error('[socket] error:', err.message));
  return s;
}

export function getSocket(): Socket | null {
  return socket;
}

export function useSocket() {
  const { accessToken, isAuthenticated } = useAuthStore();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      // Unauthenticated — disconnect any existing socket
      if (socket) {
        socket.disconnect();
        socket = null;
        socketToken = null;
      }
      return;
    }

    // Socket exists and was built with the same token — nothing to do
    if (socket && socketToken === accessToken) {
      socketRef.current = socket;
      return;
    }

    // Token changed (e.g. after refresh) or no socket yet — replace
    if (socket) {
      socket.disconnect();
      socket = null;
    }

    socket = createSocket(accessToken);
    socketToken = accessToken;
    socketRef.current = socket;
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
