// src/workers/applyWorker.js
import { Worker } from 'bullmq';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
chromium.use(stealth());
import { redis } from '../lib/redis.js';
import { supabase } from '../lib/supabase.js';
import { decryptKey } from '../lib/crypto.js';
import { AIService, createAIService } from '../services/aiService.js';
import { AutomationService } from '../services/automationService.js';
import { sendApplyReport } from '../services/emailService.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('apply-worker');

// Collect completed apps per user for batched email report
const pendingReports = new Map(); // userId → [apps]

function flushReport(userId, email) {
  const apps = pendingReports.get(userId) || [];
  if (apps.length === 0) return;
  pendingReports.delete(userId);
  
  sendApplyReport(email, apps)
    .then(res => {
      if (!res?.error) {
        supabase.from('luna_email_logs').insert({
          user_id: userId,
          type: 'apply_report',
          subject: `Apply report — ${apps.length} applications`,
          resend_id: res?.id,
          result_count: apps.length,
        });
      }
    })
    .catch(err => logger.error('Apply report email failed:', err.message));
}

/**
 * Browser Manager for Playwright
 * FIXED: Proper initialization with error handling
 */
class BrowserManager {
  constructor() {
    this.browser = null;
    this.isInitialized = false;
    this.initAttempts = 0;
    this.maxAttempts = 3;
  }

  /**
   * Initialize browser with proper error handling
   * FIXED: Added --no-sandbox for Docker/Render
   */
  async initialize() {
    if (this.isInitialized && this.browser) {
      return;
    }

    if (this.initAttempts >= this.maxAttempts) {
      throw new Error(
        `Failed to initialize Playwright after ${this.maxAttempts} attempts. ` +
        'Ensure chromium is installed: npx playwright install chromium --with-deps'
      );
    }

    try {
      this.initAttempts++;
      logger.info('[browser-manager] Initializing Playwright', {
        attempt: this.initAttempts,
      });

      // FIXED: Added --no-sandbox and other flags for Render/Docker
      this.browser = await chromium.launch({
        headless: true,
        timeout: 30000,
        args: [
          '--no-sandbox', // FIXED: Critical for Render/Docker
          '--disable-setuid-sandbox', // FIXED: Security
          '--disable-dev-shm-usage', // FIXED: Memory issues
          '--disable-gpu', // FIXED: GPU not available in container
          '--single-process=false', // FIXED: Process isolation
        ],
      });

      this.isInitialized = true;
      logger.info('✅ [browser-manager] Playwright initialized successfully');
      return;

    } catch (error) {
      logger.error('[browser-manager] Initialization failed', {
        attempt: this.initAttempts,
        error: error.message,
        stack: error.stack?.split('\n')[0],
        suggestion:
          'Run: npx playwright install chromium --with-deps\n' +
          'If on Render, ensure postinstall script runs',
      });

      this.browser = null;
      this.isInitialized = false;

      throw new Error(
        `Playwright init failed (attempt ${this.initAttempts}/${this.maxAttempts}): ` +
        error.message
      );
    }
  }

  /**
   * Safely close browser
   */
  async shutdown() {
    if (this.browser) {
      try {
        await this.browser.close();
        this.isInitialized = false;
        logger.info('[browser-manager] Browser closed');
      } catch (error) {
        logger.warn('[browser-manager] Close error:', error.message);
      }
    }
  }

  /**
   * Get browser instance
   */
  getBrowser() {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }
    return this.browser;
  }
}

export function startApplyWorker() {
  const worker = new Worker('apply', async (job) => {
    const { userId, internshipId, jobUrl } = job.data;
    logger.info(`Apply job for user ${userId} → ${jobUrl}`);

    // FIXED: Added breathing room
    await new Promise(r => setTimeout(r, 5000));

    let appId;
    let page;
    let profile = { full_name: '', email: '', notification_email: '' };

    try {
      // 1. Create application record
      const { data: appRow, error: appErr } = await supabase
        .from('luna_applications')
        .insert({
          user_id: userId,
          internship_id: internshipId,
          job_url: jobUrl,
          status: 'processing',
        })
        .select('id')
        .single();

      if (appErr) throw new Error(`Failed to create application: ${appErr.message}`);
      appId = appRow.id;
      logger.info(`Application record created: ${appId}`);

      // 2. Fetch user data early for reporting
      const profileRes = await supabase
        .from('luna_profiles')
        .select('email,notification_email,full_name')
        .eq('id', userId)
        .single();

      if (profileRes.data) {
        profile = profileRes.data;
      }

      // 3. Fetch education and API keys
      const [eduRes, keysRes] = await Promise.all([
        supabase.from('luna_education_details').select('*').eq('user_id', userId).single(),
        supabase.from('luna_api_keys').select('key_name,encrypted_value').eq('user_id', userId),
      ]);

      const education = eduRes.data || {};
      const keys = (keysRes.data || []).map(k => ({
        ...k,
        decrypted: decryptKey(k.encrypted_value),
      }));

      const userData = {
        name: profile.full_name || '',
        email: profile.email || '',
        education,
        skills: education.skills || [],
        degree: `${education.degree || ''} in ${education.branch || ''}`,
        cgpa: education.cgpa,
      };

      // 4. Setup AI service
      const ai = createAIService(keys);
      if (!ai) {
        logger.warn('No AI key configured - marking as skipped');
        await supabase.from('luna_applications').update({
          status: 'skipped',
          error_message: 'No AI key configured (Gemini or OpenRouter)',
        }).eq('id', appId);
        return;
      }

      const automation = new AutomationService(ai);

      // 5. Get internship and template
      const [internRes, prefRes] = await Promise.all([
        supabase
          .from('luna_internships')
          .select('title,company,description')
          .eq('id', internshipId)
          .single(),
        supabase
          .from('luna_preferences')
          .select('cover_letter_template')
          .eq('user_id', userId)
          .single(),
      ]);

      const internship = internRes.data || { title: '', company: '', description: '' };
      const template = prefRes.data?.cover_letter_template;

      // 6. Generate or use template cover letter
      let coverLetter;
      if (template) {
        coverLetter = template
          .replace(/{{COMPANY_NAME}}/g, internship.company || 'the company')
          .replace(/{{JOB_TITLE}}/g, internship.title || 'the internship');
        logger.info(`Using master template for ${appId}`);
      } else {
        try {
          coverLetter = await ai.generateCoverLetter(internship, education);
          if (!coverLetter) {
            throw new Error('AI returned empty cover letter');
          }
        } catch (error) {
          logger.warn('Cover letter generation failed, using default', {
            error: error.message,
          });
          coverLetter =
            `I am interested in this ${internship.title || 'internship'} opportunity at ` +
            `${internship.company || 'your company'}. ` +
            `I believe my skills and experience make me a strong candidate.`;
        }
      }

      // 7. Launch a fresh browser for this job
      let browser;
      try {
        logger.info('[browser-manager] Launching Playwright browser for this job');
        browser = await chromium.launch({
          headless: true,
          timeout: 30000,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
          ],
        });
        logger.info('✅ [browser-manager] Playwright launched successfully');
      } catch (error) {
        logger.error('Browser launch failed', { error: error.message });
        await supabase.from('luna_applications').update({
          status: 'failed',
          error_message: `Browser unavailable: ${error.message}`,
        }).eq('id', appId);
        throw error;
      }

      // 8. Create page and run automation
      try {
        page = await browser.newPage({
          timeout: 30000,
          viewport: { width: 1280, height: 720 },
        });

        logger.info('Navigating to job URL', { url: jobUrl });
        
        try {
          await page.goto(jobUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
        } catch (error) {
          logger.warn('Page navigation timeout, continuing anyway', {
            error: error.message,
          });
        }

        // 9. Run automation
        const result = await automation.apply(jobUrl, { ...userData, coverLetter });

        // 10. Update application record
        await supabase
          .from('luna_applications')
          .update({
            status: result.success ? 'success' : 'failed',
            error_message: result.error || null,
            cover_letter: coverLetter,
            applypilot_output: result,
            applied_at: result.success ? new Date().toISOString() : null,
          })
          .eq('id', appId);

        // 11. Queue for batch report
        const emailTarget = profile.notification_email || profile.email;
        if (emailTarget) {
          if (!pendingReports.has(userId)) {
            pendingReports.set(userId, []);
            setTimeout(() => flushReport(userId, emailTarget), 2 * 60 * 1000);
          }
          pendingReports.get(userId).push({
            status: result.success ? 'success' : 'failed',
            internships: internship,
          });
        }

        logger.info(`Apply ${result.success ? '✅ succeeded' : '❌ failed'} for ${appId}`);

      } finally {
        // Always close page
        if (page) {
          try {
            await page.close();
          } catch (error) {
            logger.debug('Page close error:', error.message);
          }
        }
        // Always close the per-job browser
        if (browser) {
          try {
            await browser.close();
          } catch (error) {
            logger.debug('Browser close error:', error.message);
          }
        }
      }

    } catch (err) {
      logger.error(`Error in apply worker for job ${job.id}`, {
        error: err.message,
        stack: err.stack?.split('\n')[0],
      });

      // Update application as failed
      if (appId) {
        try {
          await supabase
            .from('luna_applications')
            .update({
              status: 'failed',
              error_message: err.message,
            })
            .eq('id', appId);
        } catch (updateErr) {
          logger.error('Failed to update application error', updateErr.message);
        }
      }

      // Queue for batch report (even though it failed)
      const emailTarget = profile?.notification_email || profile?.email;
      if (emailTarget) {
        if (!pendingReports.has(userId)) {
          pendingReports.set(userId, []);
          setTimeout(() => flushReport(userId, emailTarget), 2 * 60 * 1000);
        }
        pendingReports.get(userId).push({
          status: 'failed',
          internships: { title: 'Unknown', company: 'Check Logs' },
        });
      }

      throw err;
    }

  }, {
    connection: redis,
    concurrency: 2, // Playwright is memory-heavy
    lockDuration: 300000, // 5 minutes
    stalledInterval: 120000, // 2 minutes
    maxStalledCount: 2,
  });

  worker.on('failed', (job, err) => {
    logger.error(`Apply job ${job?.id} failed`, {
      error: err.message,
      stack: err.stack?.split('\n')[0],
    });
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down worker...');
    await worker.close();
    process.exit(0);
  });

  logger.info('✅ Apply worker started');
  return worker;
}
