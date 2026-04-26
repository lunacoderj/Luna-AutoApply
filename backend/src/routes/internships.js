// src/routes/internships.js
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { scrapeQueue } from '../queues/scrapeQueue.js';
import { scrapeLimiter } from '../middleware/rateLimiter.js';

const router = Router();
const logger = createLogger('internships');
const async$ = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// GET /api/internships — paginated list
router.get('/', async$( async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const page  = Math.max(parseInt(req.query.page)  || 1, 1);
  const days  = parseInt(req.query.days) || 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const from = (page - 1) * limit;

  const { data, error, count } = await supabase
    .from('luna_internships')
    .select('*', { count: 'exact' })
    .eq('user_id', req.userId)
    .gte('scraped_at', since)
    .order('scraped_at', { ascending: false })
    .range(from, from + limit - 1);

  if (error) throw error;

  res.json({ data: data || [], total: count || 0, page, limit });
}));

// GET /api/internships/stats — chart data
router.get('/stats', async$( async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('luna_internships')
    .select('scraped_at')
    .eq('user_id', req.userId)
    .gte('scraped_at', since)
    .order('scraped_at', { ascending: true });

  if (error) throw error;

  // Group by date
  const byDate = {};
  (data || []).forEach(row => {
    const date = row.scraped_at.split('T')[0];
    byDate[date] = (byDate[date] || 0) + 1;
  });

  const chart = Object.entries(byDate).map(([date, count]) => ({ date, count }));
  res.json(chart);
}));

// POST /api/internships/scrape-now — manual trigger
router.post('/scrape-now', scrapeLimiter, async$( async (req, res) => {
  await scrapeQueue.add('scrape-manual', {
    userId: req.userId,
    manual: true,
  }, { priority: 1 });

  logger.info(`Manual scrape queued for user ${req.userId}`);
  res.json({ ok: true, message: 'Scrape queued — results will appear shortly' });
}));

export default router;
