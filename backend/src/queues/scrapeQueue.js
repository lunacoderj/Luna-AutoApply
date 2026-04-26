// src/queues/scrapeQueue.js
import { Queue } from 'bullmq';
import { redis } from '../lib/redis.js';

export const scrapeQueue = new Queue('scrape', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
  },
});
