// src/lib/redis.js
import { Redis } from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// lazyConnect:true → only connects when first command is issued, not on import
// This prevents crash-on-startup when Redis isn't running locally
const redisOptions = {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy: (times) => {
    if (times >= 3) {
      // Stop retrying after 3 attempts — server stays up, queues just won't work
      return null;
    }
    return Math.min(times * 1000, 3000);
  },
};

function createRedisClient() {
  if (redisUrl.startsWith('rediss://')) {
    return new Redis(redisUrl, { ...redisOptions, tls: {} });
  }
  return new Redis(redisUrl, redisOptions);
}

export const redis = createRedisClient();
export let redisAvailable = false;

redis.on('connect', () => {
  redisAvailable = true;
  console.log('[Redis] ✅ Connected');
});
redis.on('error', (err) => {
  // Only log once, not every retry
  if (!redis._hasLoggedError) {
    console.warn('[Redis] ⚠️  Not available:', err.message, '— queues/workers disabled');
    redis._hasLoggedError = true;
  }
});

export default redis;
