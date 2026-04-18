import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import type { JwtPayload, RealtimeEvent } from '@orion/shared';

export class RealtimeService {
  private io: SocketIOServer | null = null;

  setIO(io: SocketIOServer): void {
    this.io = io;
    this.setupMiddleware();
    this.setupEvents();
  }

  private setupMiddleware(): void {
    if (!this.io) return;
    this.io.use((socket: Socket, next) => {
      const token = socket.handshake.auth?.token ?? socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('Authentication required'));

      try {
        const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
        (socket as any).user = payload;
        next();
      } catch {
        next(new Error('Invalid token'));
      }
    });
  }

  private setupEvents(): void {
    if (!this.io) return;
    this.io.on('connection', (socket: Socket) => {
      const user = (socket as any).user as JwtPayload;
      const orgRoom = `org:${user.orgId}`;

      socket.join(orgRoom);
      socket.emit('connected', { userId: user.sub, orgId: user.orgId });

      socket.on('subscribe:device', (deviceId: string) => {
        socket.join(`device:${deviceId}`);
      });

      socket.on('unsubscribe:device', (deviceId: string) => {
        socket.leave(`device:${deviceId}`);
      });

      socket.on('disconnect', () => {
        socket.leave(orgRoom);
      });
    });
  }

  emit<T>(event: RealtimeEvent<T>): void {
    if (!this.io) return;

    const orgRoom = `org:${event.orgId}`;
    this.io.to(orgRoom).emit(event.type, event);

    if (event.deviceId) {
      this.io.to(`device:${event.deviceId}`).emit(event.type, event);
    }
  }

  emitTelemetry(orgId: string, deviceId: string, fields: Record<string, unknown>, location?: object, timestamp?: string): void {
    this.emit({
      type: 'telemetry.update',
      orgId,
      deviceId,
      timestamp: timestamp ?? new Date().toISOString(),
      data: { deviceId, fields, location, timestamp },
    });
  }

  emitDeviceStatus(orgId: string, deviceId: string, status: 'online' | 'offline' | 'error'): void {
    this.emit({
      type: status === 'online' ? 'device.online' : 'device.offline',
      orgId,
      deviceId,
      timestamp: new Date().toISOString(),
      data: { deviceId, status },
    });
  }

  emitAlert(orgId: string, alertData: object): void {
    this.emit({
      type: 'alert.created',
      orgId,
      timestamp: new Date().toISOString(),
      data: alertData,
    });
  }

  emitLocationUpdate(orgId: string, deviceId: string, location: object, timestamp?: string): void {
    this.emit({
      type: 'location.update',
      orgId,
      deviceId,
      timestamp: timestamp ?? new Date().toISOString(),
      data: { deviceId, ...location, timestamp },
    });
  }
}

export const realtimeService = new RealtimeService();
