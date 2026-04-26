// src/queues/resumeQueue.js
import { Queue } from 'bullmq';
import { redis } from '../lib/redis.js';

export const resumeQueue = new Queue('resume', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 20 },
    attempts: 2,
  },
});
