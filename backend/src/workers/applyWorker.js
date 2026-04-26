// src/workers/applyWorker.js
import { Worker } from 'bullmq';
import { redis } from '../lib/redis.js';
import { supabase } from '../lib/supabase.js';
import { decryptKey } from '../lib/crypto.js';
import { AIService, createAIService } from '../services/aiService.js';
import { AutomationService } from '../services/automationService.js';
import { sendApplyReport } from '../services/emailService.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('apply-worker');

// Collect completed apps per user for a batched email report
const pendingReports = new Map(); // userId → [apps]

function flushReport(userId, email) {
  const apps = pendingReports.get(userId) || [];
  if (apps.length === 0) return;
  pendingReports.delete(userId);
  sendApplyReport(email, apps).then(res => {
    if (!res?.error) {
      supabase.from('luna_email_logs').insert({
        user_id: userId, type: 'apply_report',
        subject: `Apply report — ${apps.length} applications`,
        resend_id: res?.id,
        result_count: apps.length,
      });
    }
  }).catch(err => logger.error('Apply report email failed:', err.message));
}

export function startApplyWorker() {
  const worker = new Worker('apply', async (job) => {
    const { userId, internshipId, jobUrl } = job.data;
    logger.info(`Apply job for user ${userId} → ${jobUrl}`);
    await new Promise(r => setTimeout(r, 5000)); // Breathing room for system

    // 1. Create application record
    const { data: appRow, error: appErr } = await supabase
      .from('luna_applications')
      .insert({ user_id: userId, internship_id: internshipId, job_url: jobUrl, status: 'processing' })
      .select('id')
      .single();

    if (appErr) throw new Error(`Failed to create application: ${appErr.message}`);
    const appId = appRow.id;

    try {
      // 2. Fetch user data
      const [profileRes, eduRes, keysRes] = await Promise.all([
        supabase.from('luna_profiles').select('email,notification_email,full_name').eq('id', userId).single(),
        supabase.from('luna_education_details').select('*').eq('user_id', userId).single(),
        supabase.from('luna_api_keys').select('key_name,encrypted_value').eq('user_id', userId),
      ]);

      const profile   = profileRes.data || {};
      const education = eduRes.data || {};
      const keys      = (keysRes.data || []).map(k => ({ ...k, decrypted: decryptKey(k.encrypted_value) }));

      const userData = {
        name:     profile.full_name,
        email:    profile.email,
        education,
        skills:   education.skills || [],
        degree:   `${education.degree || ''} in ${education.branch || ''}`,
        cgpa:     education.cgpa,
      };

      // 3. Setup AI service
      const ai = createAIService(keys);
      if (!ai) {
        await supabase.from('luna_applications').update({
          status: 'skipped', error_message: 'No AI key configured (OpenRouter or Gemini)',
        }).eq('id', appId);
        return;
      }

      const automation = new AutomationService(ai);

      // 4. Generate cover letter
      const [internRes, prefRes] = await Promise.all([
        supabase.from('luna_internships').select('title,company,description').eq('id', internshipId).single(),
        supabase.from('luna_preferences').select('cover_letter_template').eq('user_id', userId).single()
      ]);
      const internship = internRes.data || { title: '', company: '', description: '' };
      const template   = prefRes.data?.cover_letter_template;

      let coverLetter;
      if (template) {
        // Use Template + Merge (Free!)
        coverLetter = template
          .replace(/{{COMPANY_NAME}}/g, internship.company || 'the company')
          .replace(/{{JOB_TITLE}}/g, internship.title || 'the internship');
        logger.info(`Using master template for ${appId}`);
      } else {
        // Fallback to AI generation (Costs credits)
        coverLetter = await ai.generateCoverLetter(internship, education);
      }

      // 5. Run automation
      const result = await automation.apply(jobUrl, { ...userData, coverLetter });

      // 6. Update record
      await supabase.from('luna_applications').update({
        status:            result.success ? 'success' : 'failed',
        error_message:     result.error || null,
        cover_letter:      coverLetter,
        applypilot_output: result,
        applied_at:        result.success ? new Date().toISOString() : null,
      }).eq('id', appId);

      // 7. Queue for batch report
      const emailTarget = profile.notification_email || profile.email;
      if (!pendingReports.has(userId)) {
        pendingReports.set(userId, []);
        setTimeout(() => flushReport(userId, emailTarget), 2 * 60 * 1000); // Flush after 2 minutes for testing
      }
      pendingReports.get(userId).push({
        status: result.success ? 'success' : 'failed',
        internships: internship,
      });

      logger.info(`Apply ${result.success ? 'succeeded' : 'failed'} for ${appId}`);
    } catch (err) {
      // 7. Queue for batch report (even if it failed)
      const emailTarget = profile.notification_email || profile.email;
      if (!pendingReports.has(userId)) {
        pendingReports.set(userId, []);
        setTimeout(() => flushReport(userId, emailTarget), 2 * 60 * 1000); 
      }
      pendingReports.get(userId).push({
        status: 'failed',
        internships: { title: 'Unknown', company: 'Check Logs', ...err }, 
      });

      throw err;
    }
  }, {
    connection: redis,
    concurrency: 2, // Playwright is memory-heavy
    lockDuration: 180000, // 3 minutes for long-running Playwright jobs
    maxStalledCount: 3,
  });

  worker.on('failed', (job, err) => logger.error(`Apply job ${job?.id} failed: ${err.message}`));
  logger.info('Apply worker started');
  return worker;
}
