// src/services/automationService.js
// Playwright-based form submission — AI-guided generic approach
import { createLogger } from '../lib/logger.js';

const logger = createLogger('automation');

export class AutomationService {
  constructor(aiService) {
    this.ai = aiService;
  }

  async apply(url, userData) {
    logger.info(`Starting automation for: ${url}`);

    let chromium;
    try {
      const playwrightExtra = await import('playwright-extra');
      chromium = playwrightExtra.chromium;
      const stealth = (await import('puppeteer-extra-plugin-stealth')).default;
      chromium.use(stealth());
    } catch (e) {
      logger.error('Playwright not installed — run: npx playwright install chromium');
      return { success: false, error: 'Playwright not available', steps: 0 };
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      let step = 0;
      const maxSteps = 12;

      while (step < maxSteps) {
        step++;
        logger.info(`Automation step ${step}`);

        const pageState = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input,select,textarea')).map(el => ({
            id: el.id, name: el.name, placeholder: el.placeholder,
            type: el.type, label: el.labels?.[0]?.innerText || el.getAttribute('aria-label') || '', value: el.value,
          }));
          const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"]')).map(el => ({
            text: el.innerText?.trim() || el.value?.trim(), type: el.type || 'button', id: el.id, className: el.className, ariaLabel: el.getAttribute('aria-label')
          })).filter(b => b.text || b.id || b.ariaLabel);
          const links = Array.from(document.querySelectorAll('a:not([role="button"])')).map(el => ({
            text: el.innerText?.trim(), href: el.href, id: el.id, className: el.className, ariaLabel: el.getAttribute('aria-label')
          })).filter(a => (a.text || a.id || a.ariaLabel) && a.href && !a.href.startsWith('javascript:'));
          return { inputs, buttons, links, text: document.body.innerText.substring(0, 4000) };
        });

        // Check for success
        const bodyLower = pageState.text.toLowerCase();
        if (
          bodyLower.includes('thank you') ||
          bodyLower.includes('application submitted') ||
          bodyLower.includes('successfully applied') ||
          bodyLower.includes('we received your application')
        ) {
          logger.info('Success: Application submitted');
          return { success: true, steps: step };
        }

        // Check for CAPTCHA / login walls — bail early
        if (
          bodyLower.includes('complete the captcha') ||
          bodyLower.includes('sign in to apply') ||
          bodyLower.includes('create an account to apply')
        ) {
          logger.warn('Blocked: CAPTCHA or login wall detected');
          return { success: false, error: 'Login or CAPTCHA required', steps: step };
        }

        const decision = await this.ai.extractFormFields(JSON.stringify(pageState), userData);

        if (decision.action === 'done') {
          // If the AI thinks it's done, verify with page content again just in case.
          const finalBodyLower = pageState.text.toLowerCase();
          const isReallyDone = (
            finalBodyLower.includes('thank you') ||
            finalBodyLower.includes('application submitted') ||
            finalBodyLower.includes('successfully applied') ||
            finalBodyLower.includes('we received your application') ||
            page.url().toLowerCase().includes('success')
          );
          
          if (isReallyDone) {
            return { success: true, steps: step };
          } else {
            logger.warn('AI said done, but no success text found. Checking again or waiting...');
            // Maybe we just need to wait a second for the success page to load
            await page.waitForTimeout(3000);
            
            // Check one more time
            const recheckText = await page.evaluate(() => document.body.innerText.substring(0, 4000).toLowerCase());
            if (
              recheckText.includes('thank you') ||
              recheckText.includes('application submitted') ||
              recheckText.includes('successfully applied') ||
              recheckText.includes('we received your application') ||
              page.url().toLowerCase().includes('success')
            ) {
               return { success: true, steps: step };
            }
            
            // If still not success, consider it failed or incomplete
            logger.warn('No success criteria met after waiting. Marking as failed.');
            return { success: false, error: 'AI reported done but success page not detected', steps: step };
          }
        }
        if (decision.action === 'failed' || decision.action === 'wait') {
          logger.warn(`AI action: ${decision.action} — ${decision.reasoning}`);
          if (decision.action === 'failed') {
            await page.screenshot({ path: `screenshots/failed_decision_${Date.now()}.png` }).catch(() => {});
          }
          break;
        }

        if (decision.action === 'fill' && decision.fields) {
          for (const [selector, value] of Object.entries(decision.fields)) {
            try { await page.fill(selector, String(value)); } catch (e) {
              logger.warn(`Fill failed for ${selector}: ${e.message}`);
              await page.screenshot({ path: `screenshots/failed_fill_${Date.now()}.png` }).catch(() => {});
            }
          }
          if (decision.submitSelector) {
            try {
              await page.click(decision.submitSelector);
              await page.waitForTimeout(2500);
            } catch (e) {
              logger.warn(`Click failed for ${decision.submitSelector}: ${e.message}`);
              await page.screenshot({ path: `screenshots/failed_submit_${Date.now()}.png` }).catch(() => {});
            }
          }
        } else if (decision.action === 'click' && decision.selector) {
          try {
            await page.click(decision.selector);
            await page.waitForTimeout(2000);
          } catch (e) {
            logger.warn(`Click failed for ${decision.selector}: ${e.message}`);
            await page.screenshot({ path: `screenshots/failed_click_${Date.now()}.png` }).catch(() => {});
          }
        }
      }

      await page.screenshot({ path: `screenshots/failed_max_steps_${Date.now()}.png` }).catch(() => {});
      return { success: false, error: 'Max steps reached without confirmation', steps: step };
    } catch (err) {
      logger.error(`Automation error: ${err.message}`);
      return { success: false, error: err.message, steps: 0 };
    } finally {
      await browser.close();
    }
  }
}
