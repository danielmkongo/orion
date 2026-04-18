import 'dotenv/config';

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '7001', 10),
  host: process.env.HOST ?? '0.0.0.0',

  mongoUri: process.env.MONGODB_URI ?? 'mongodb+srv://orion-vortan:I4f1F41qZUXsnwHz@data.xiftiun.mongodb.net/orion?appName=database&retryWrites=true&w=majority',
  redisUrl: process.env.REDIS_URL ?? '',

  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  },

  cors: {
    origin: process.env.CORS_ORIGIN ?? 'http://0.0.0.0:6002',
  },

  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  firmwareDir: process.env.FIRMWARE_DIR ?? './firmware',

  mqttBrokerUrl: process.env.MQTT_BROKER_URL,
  ingestionSecret: process.env.INGESTION_SECRET ?? 'orion-ingestion-secret',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://0.0.0.0:6002',
} as const;
