// src/routes/preferences.js
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { scrapeQueue } from '../queues/scrapeQueue.js';

const router = Router();
const logger = createLogger('preferences');
const async$ = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// GET /api/preferences
router.get('/', async$( async (req, res) => {
  const { data, error } = await supabase
    .from('luna_preferences')
    .select('*')
    .eq('user_id', req.userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  res.json(data || { preference_sets: [], resume_text: '' });
}));

// POST /api/preferences — upsert full preference config
router.post('/', async$( async (req, res) => {
  const { preference_sets, resume_text } = req.body;

  if (!Array.isArray(preference_sets)) {
    return res.status(400).json({ error: 'preference_sets must be an array' });
  }

  // Sanitize each set
  const sanitized = preference_sets.map((set, i) => ({
    id: set.id || `set_${Date.now()}_${i}`,
    name: set.name || `Set ${i + 1}`,
    roles: Array.isArray(set.roles) ? set.roles : [],
    locations: Array.isArray(set.locations) ? set.locations : [],
    workTypes: Array.isArray(set.workTypes) ? set.workTypes : ['Full-time'],
    lookback: set.lookback || '24h',
    interval: set.interval || 12,
    enabled: set.enabled !== false,
    lastScrapedAt: set.lastScrapedAt || null,
    totalScrapes: set.totalScrapes || 0,
  }));

  const { data, error } = await supabase
    .from('luna_preferences')
    .upsert({
      user_id: req.userId,
      preference_sets: sanitized,
      resume_text: resume_text || '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) throw error;

  // Bump onboarding
  await supabase.from('luna_profiles').update({ onboarding_status: 'complete' }).eq('id', req.userId);

  // BullMQ: Set up a Repeatable Job based on their interval
  const firstEnabled = sanitized.find(s => s.enabled);
  if (firstEnabled) {
    const intervalMs = (parseInt(firstEnabled.interval) || 12) * 60 * 60 * 1000;
    
    // Remove old repeatable jobs for this user if they exist
    const repeatableJobs = await scrapeQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.id === `scrape-${req.userId}`) {
        await scrapeQueue.removeRepeatableByKey(job.key);
      }
    }

    await scrapeQueue.add(
      'scrape-scheduled',
      { userId: req.userId, manual: false },
      { 
        repeat: { 
          every: intervalMs, 
          jobId: `scrape-${req.userId}` 
        } 
      }
    );
    logger.info(`Scheduled repeatable job for user ${req.userId} every ${intervalMs}ms`);
  }

  logger.info(`Preferences saved for user ${req.userId} — ${sanitized.length} sets`);
  res.json(data);
}));

export default router;
