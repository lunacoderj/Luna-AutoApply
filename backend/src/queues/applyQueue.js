// src/queues/applyQueue.js
import { Queue } from 'bullmq';
import { redis } from '../lib/redis.js';

export const applyQueue = new Queue('apply', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
    attempts: 1, // No retry — we don't want to spam forms
    concurrency: 3,
  },
});
