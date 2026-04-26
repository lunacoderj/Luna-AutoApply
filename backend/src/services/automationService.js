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
      ({ chromium } = await import('playwright'));
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
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

      let step = 0;
      const maxSteps = 12;

      while (step < maxSteps) {
        step++;
        logger.info(`Automation step ${step}`);

        const pageState = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input,select,textarea')).map(el => ({
            id: el.id, name: el.name, placeholder: el.placeholder,
            type: el.type, label: el.labels?.[0]?.innerText || '', value: el.value,
          }));
          const buttons = Array.from(document.querySelectorAll('button')).map(el => ({
            text: el.innerText.trim(), type: el.type,
          }));
          return { inputs, buttons, text: document.body.innerText.substring(0, 4000) };
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
          return { success: true, steps: step };
        }
        if (decision.action === 'failed' || decision.action === 'wait') {
          logger.warn(`AI action: ${decision.action} — ${decision.reasoning}`);
          break;
        }

        if (decision.action === 'fill' && decision.fields) {
          for (const [selector, value] of Object.entries(decision.fields)) {
            try { await page.fill(selector, String(value)); } catch (e) {
              logger.warn(`Fill failed for ${selector}: ${e.message}`);
            }
          }
          if (decision.submitSelector) {
            try {
              await page.click(decision.submitSelector);
              await page.waitForTimeout(2500);
            } catch (e) {
              logger.warn(`Click failed for ${decision.submitSelector}: ${e.message}`);
            }
          }
        } else if (decision.action === 'click' && decision.selector) {
          try {
            await page.click(decision.selector);
            await page.waitForTimeout(2000);
          } catch (e) {
            logger.warn(`Click failed for ${decision.selector}: ${e.message}`);
          }
        }
      }

      return { success: false, error: 'Max steps reached without confirmation', steps: step };
    } catch (err) {
      logger.error(`Automation error: ${err.message}`);
      return { success: false, error: err.message, steps: 0 };
    } finally {
      await browser.close();
    }
  }
}
