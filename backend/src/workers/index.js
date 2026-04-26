// src/workers/index.js
// Starts all workers and the 12-hour scheduler
import { startScrapeWorker } from './scrapeWorker.js';
import { startApplyWorker }  from './applyWorker.js';
import { startResumeWorker } from './resumeWorker.js';
import { scrapeQueue }       from '../queues/scrapeQueue.js';
import { supabase }          from '../lib/supabase.js';
import { createLogger }      from '../lib/logger.js';

const logger = createLogger('workers');

export async function startWorkers() {
  startScrapeWorker();
  startApplyWorker();
  startResumeWorker();
  logger.info('All workers started');
}
