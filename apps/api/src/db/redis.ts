import { Redis } from 'ioredis';
import { config } from '../config/index.js';

let redisInstance: Redis | null = null;

export function getRedis(): Redis | null {
  if (!config.redisUrl) return null;
  if (!redisInstance) {
    redisInstance = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    redisInstance.on('error', (err: Error) => console.error('[redis] error:', err.message));
    redisInstance.on('connect', () => console.log('[redis] connected'));
  }
  return redisInstance;
}

export async function connectRedis(): Promise<void> {
  const r = getRedis();
  if (!r) {
    console.log('[redis] skipped — REDIS_URL not configured');
    return;
  }
  await r.connect().catch(() => {
    console.warn('[redis] could not connect — caching disabled');
  });
}
