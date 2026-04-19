import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocketPlugin from '@fastify/websocket';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config/index.js';
import { connectMongoDB } from './db/mongoose.js';
import { connectRedis } from './db/redis.js';
import { realtimeService } from './services/realtime.service.js';
import { mqttService } from './services/mqtt.service.js';
import { registerDeviceWs } from './services/device-ws.service.js';
import { startTcpServer } from './services/tcp.service.js';
import { startUdpServer } from './services/udp.service.js';
import { authRoutes } from './routes/auth.routes.js';
import { deviceRoutes } from './routes/device.routes.js';
import { telemetryRoutes } from './routes/telemetry.routes.js';
import { commandRoutes } from './routes/command.routes.js';
import { alertRoutes } from './routes/alert.routes.js';
import { dashboardRoutes } from './routes/dashboard.routes.js';
import { rulesRoutes } from './routes/rules.routes.js';
import { usersRoutes } from './routes/users.routes.js';
import { otaRoutes } from './routes/ota.routes.js';
import { orgRoutes } from './routes/org.routes.js';

const app = Fastify({
  logger: {
    transport: config.env === 'development' ? { target: 'pino-pretty' } : undefined,
    level: config.env === 'development' ? 'debug' : 'info',
  },
  trustProxy: true,
});

async function bootstrap() {
  // CORS
  await app.register(cors, {
    origin: [config.cors.origin, config.frontendUrl],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // WebSocket plugin (needed for device WS route)
  await app.register(websocketPlugin);

  // Device-facing WebSocket at /ws?apiKey=…
  await registerDeviceWs(app);

  // REST routes under /api/v1
  const prefix = '/api/v1';
  await app.register(async api => {
    await api.register(authRoutes);
    await api.register(deviceRoutes);
    await api.register(telemetryRoutes);
    await api.register(commandRoutes);
    await api.register(alertRoutes);
    await api.register(dashboardRoutes);
    await api.register(rulesRoutes);
    await api.register(usersRoutes);
    await api.register(otaRoutes);
    await api.register(orgRoutes);
  }, { prefix });

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    service: 'orion-api',
  }));

  // Connect databases
  await connectMongoDB();
  if (config.redisUrl) await connectRedis();

  // Attach Socket.IO for dashboard real-time updates
  const io = new SocketIOServer(app.server, {
    cors: {
      origin: [config.cors.origin, config.frontendUrl],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    path: '/socket.io',
  });
  realtimeService.setIO(io);

  await app.listen({ port: config.port, host: config.host });
  console.log(`\n🚀 Orion API running at http://${config.host}:${config.port}`);
  console.log(`📡 Socket.IO (dashboard) at ws://${config.host}:${config.port}/socket.io`);
  console.log(`🔗 Device WebSocket at ws://${config.host}:${config.port}/ws`);

  // MQTT bridge
  mqttService.start();

  // TCP & UDP servers
  startTcpServer();
  startUdpServer();

  // CoAP server (requires 'coap' package: pnpm add coap --filter @orion/api)
  try {
    const { startCoapServer } = await import('./services/coap.service.js');
    startCoapServer();
  } catch {
    console.warn('⚠️  CoAP disabled — run: pnpm add coap --filter @orion/api');
  }

  console.log(`🌍 Environment: ${config.env}\n`);
}

bootstrap().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
