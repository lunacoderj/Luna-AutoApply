// src/workers/scrapeWorker.js
import { Worker } from 'bullmq';
import { redis } from '../lib/redis.js';
import { supabase } from '../lib/supabase.js';
import { decryptKey } from '../lib/crypto.js';
import { runUserScrape } from '../services/scraperService.js';
import { sendScrapeReport } from '../services/emailService.js';
import { applyQueue } from '../queues/applyQueue.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('scrape-worker');

export function startScrapeWorker() {
  const worker = new Worker('scrape', async (job) => {
    const { userId, manual } = job.data;
    logger.info(`Processing scrape job for user ${userId} (manual=${manual})`);

    // 1. Load profile + preferences + Apify key
    const [profileRes, prefsRes, keysRes] = await Promise.all([
      supabase.from('luna_profiles').select('id,email,notification_email,is_enabled').eq('id', userId).single(),
      supabase.from('luna_preferences').select('*').eq('user_id', userId).single(),
      supabase.from('luna_api_keys').select('key_name,encrypted_value').eq('user_id', userId).eq('key_name', 'apify').single(),
    ]);

    if (profileRes.error) throw new Error(`Profile not found: ${userId}`);
    if (!manual && !profileRes.data.is_enabled) {
      logger.info(`User ${userId} automation disabled — skipping`);
      return;
    }
    if (keysRes.error || !keysRes.data) throw new Error('Apify key not found for user');

    const profile     = profileRes.data;
    const prefs       = prefsRes.data || { preference_sets: [], resume_text: '' };
    const apifyKey    = decryptKey(keysRes.data.encrypted_value);
    const emailTarget = profile.notification_email || profile.email;
    const sets        = (prefs.preference_sets || []).filter(s => manual || s.enabled);

    if (sets.length === 0) {
      logger.warn(`No enabled preference sets for user ${userId}`);
      return;
    }

    let allNewInternships = [];

    for (const set of sets) {
      try {
        logger.info(`Scraping set "${set.name}" for user ${userId}`);
        const results = await runUserScrape(apifyKey, {
          roles:      set.roles,
          locations:  set.locations,
          workTypes:  set.workTypes,
          lookback:   set.lookback,
          resumeText: prefs.resume_text,
        });

        if (!results.length) { logger.info(`No results for set "${set.name}"`); continue; }

        // 2. Store in internships table (upsert on user_id+url)
        const rows = results.slice(0, 10).map(r => ({
          user_id:           userId,
          preference_set_id: set.id,
          title:             r.title,
          company:           r.company,
          url:               r.url,
          description:       r.description,
          source:            r.source,
          domain:            r.domain,
          match_score:       r.matchScore,
          scraped_at:        new Date().toISOString(),
        }));

        const { data: stored, error: storeErr } = await supabase
          .from('luna_internships')
          .upsert(rows, { onConflict: 'user_id,url', ignoreDuplicates: false })
          .select('id,url,title,company,match_score');

        if (storeErr) { logger.error(`Store error: ${storeErr.message}`); continue; }

        allNewInternships = [...allNewInternships, ...(stored || [])];

        // 3. Update set lastScrapedAt
        const updatedSets = (prefs.preference_sets || []).map(s =>
          s.id === set.id ? { ...s, lastScrapedAt: new Date().toISOString(), totalScrapes: (s.totalScrapes || 0) + 1 } : s
        );
        await supabase.from('luna_preferences').update({ preference_sets: updatedSets }).eq('user_id', userId);

        logger.info(`Stored ${stored?.length || 0} internships for set "${set.name}"`);
      } catch (err) {
        logger.error(`Scrape error for set "${set.name}": ${err.message}`);
      }
    }

    if (allNewInternships.length === 0) return;

    // 4. Send email report
    const fullResults = allNewInternships.map(i => ({
      title: i.title, company: i.company, url: i.url, matchScore: i.match_score, description: '',
    }));

    const emailRes = await sendScrapeReport(emailTarget, fullResults, prefs);
    if (!emailRes?.error) {
      await supabase.from('luna_email_logs').insert({
        user_id: userId, type: 'scrape_report',
        subject: `${allNewInternships.length} internships found`,
        resend_id: emailRes?.id,
        result_count: allNewInternships.length,
      });
    } else {
      logger.error(`[Email] Scrape report failed for ${userId}: ${emailRes.error}`);
    }

    // 5. Enqueue apply jobs for each new internship
    for (const internship of allNewInternships) {
      await applyQueue.add('apply', {
        userId,
        internshipId: internship.id,
        jobUrl: internship.url,
      }, { priority: 5 });
    }

    logger.info(`Scrape complete for ${userId}: ${allNewInternships.length} new, ${allNewInternships.length} apply jobs queued`);
  }, {
    connection: redis,
    concurrency: 3,
    lockDuration: 300000, // 5 minutes (less frequent renewals)
    stalledInterval: 120000, // Check for stalled jobs every 2 mins (standard is 30s)
    maxStalledCount: 2,
  });

  worker.on('failed', (job, err) => logger.error(`Scrape job ${job?.id} failed: ${err.message}`));
  logger.info('Scrape worker started');
  return worker;
}
