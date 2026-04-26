// src/services/aiService.js
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import axios from 'axios';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('ai-service');

export class AIService {
  constructor(apiKey, provider = 'gemini', fallbackKeys = {}) {
    this.apiKey = apiKey;
    this.provider = provider;
    this.fallbackKeys = fallbackKeys; // { gemini: 'key', openrouter: 'key' }

    if (provider === 'gemini') {
      if (!apiKey) {
        throw new Error(
          'GOOGLE_API_KEY not set. Set environment variable: ' +
          'export GOOGLE_API_KEY=your_key_here'
        );
      }
      this.client = new GoogleGenerativeAI(apiKey);
      this.modelName = 'gemini-1.5-flash';
      logger.info(`[Gemini] Initialized with model: ${this.modelName}`);
    } else if (provider === 'openrouter') {
      this.modelName = 'google/gemini-2.0-flash-001';
      logger.info(`[OpenRouter] Initialized with model: ${this.modelName}`);
      // Pre-initialize Gemini client for fallback if key is available
      if (fallbackKeys.gemini) {
        this._geminiClient = new GoogleGenerativeAI(fallbackKeys.gemini);
        logger.info('[OpenRouter] Gemini fallback available');
      }
    }
  }

  /**
   * Generate content using Gemini SDK directly
   */
  async _generateWithGemini(prompt, client) {
    const model = client.getGenerativeModel({
      model: 'gemini-1.5-flash',
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
      ],
    });

    const response = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 2048,
      },
    });

    if (!response || !response.response) {
      throw new Error('No response received from AI model');
    }

    const text = response.response.text();

    if (!text || text.trim().length === 0) {
      throw new Error('Empty response from AI model');
    }

    return text;
  }

  /**
   * Generate content using OpenRouter API
   */
  async _generateWithOpenRouter(prompt) {
    const r = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'google/gemini-2.0-flash-001',
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://luna.jaggu.me',
          'X-Title': 'Luna ApplyPilot',
        },
      }
    );
    return r.data.choices[0].message.content;
  }

  /**
   * Check if an error is a billing/payment error (402)
   */
  _isBillingError(err) {
    const message = (err.message || '').toLowerCase();
    const status = err.response?.status || err.status || err.statusCode || 0;
    return status === 402 || message.includes('402') || message.includes('payment required');
  }

  /**
   * Generate content with retry logic and automatic provider fallback
   * If OpenRouter returns 402, automatically falls back to Gemini
   */
  async _generate(prompt, maxRetries = 3) {
    if (!prompt || prompt.trim().length === 0) {
      throw new Error('Prompt cannot be empty');
    }

    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`[AI Request] Attempt ${attempt}/${maxRetries}, Provider: ${this.provider}, Model: ${this.modelName}`);

        if (this.provider === 'gemini') {
          const text = await this._generateWithGemini(prompt, this.client);
          logger.info(`[Gemini] Response received (${text.substring(0, 50)}...)`);
          return text;
        }

        if (this.provider === 'openrouter') {
          const text = await this._generateWithOpenRouter(prompt);
          logger.info(`[OpenRouter] Response received (${text.substring(0, 50)}...)`);
          return text;
        }

        throw new Error(`Unsupported AI provider: ${this.provider}`);

      } catch (err) {
        lastError = err;
        const errorMessage = err.message || JSON.stringify(err);
        const errorStatus = err.response?.status || err.status || err.statusCode || 'unknown';

        logger.warn(`[AI Error] Attempt ${attempt} failed: Status: ${errorStatus}, Message: ${errorMessage}`);

        // === AUTOMATIC FALLBACK: OpenRouter 402 → Gemini ===
        if (this.provider === 'openrouter' && this._isBillingError(err) && this._geminiClient) {
          logger.warn('[AI Fallback] OpenRouter returned 402 (Payment Required) — switching to Gemini');
          try {
            const text = await this._generateWithGemini(prompt, this._geminiClient);
            logger.info(`[Gemini Fallback] ✅ Response received (${text.substring(0, 50)}...)`);
            // Permanently switch to Gemini for the rest of this service instance's life
            this.provider = 'gemini';
            this.client = this._geminiClient;
            this.modelName = 'gemini-1.5-flash';
            this.apiKey = this.fallbackKeys.gemini;
            logger.info('[AI Fallback] ✅ Permanently switched to Gemini for this session');
            return text;
          } catch (fallbackErr) {
            logger.error(`[Gemini Fallback] Also failed: ${fallbackErr.message}`);
            lastError = fallbackErr;
            // Continue to retry logic
          }
        }

        // 402 without fallback — don't retry, it's a billing issue
        if (this._isBillingError(err) && !this._geminiClient) {
          throw new Error(
            'OpenRouter returned 402 (Payment Required). Your account has no credits. ' +
            'Either: 1) Add credits at https://openrouter.ai/credits  2) Add a Gemini API key as fallback'
          );
        }

        // Check if error is retryable
        const isRetryable = this._isRetryableError(err);

        if (isRetryable && attempt < maxRetries) {
          // Exponential backoff
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          logger.info(`[AI Retry] Waiting ${delayMs}ms before retry ${attempt + 1}...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        } else if (!isRetryable) {
          // Non-retryable error - throw immediately with helpful message
          throw this._formatError(err);
        }
      }
    }

    // All retries exhausted
    throw this._formatError(lastError);
  }

  /**
   * Check if error is retryable
   */
  _isRetryableError(err) {
    const message = (err.message || '').toLowerCase();
    const status = (err.response?.status || err.status || err.statusCode || '').toString();

    // 402 is NOT retryable — it's a billing error
    if (status === '402' || message.includes('402')) {
      return false;
    }

    // Retryable errors
    const retryablePatterns = [
      '429', // Rate limited
      '503', // Service unavailable
      'timeout',
      'DEADLINE_EXCEEDED',
      'RESOURCE_EXHAUSTED',
      'temporarily',
      'UNAVAILABLE',
    ];

    return retryablePatterns.some(
      pattern => message.includes(pattern.toLowerCase()) || status.includes(pattern)
    );
  }

  /**
   * Format error with helpful debugging info
   */
  _formatError(err) {
    const message = err.message || JSON.stringify(err);
    const status = err.response?.status || err.status || err.statusCode || 'unknown';

    logger.error(`[AI Error Details] Status: ${status}, Message: ${message}, Stack: ${err.stack?.split('\n')[1]?.trim()}`);

    // Specific error messages for debugging
    if (message.includes('404') || message.includes('not found')) {
      return new Error(
        `Model '${this.modelName}' not found or not available. ` +
        `Ensure: 1) Correct model name 2) API enabled 3) Check https://ai.google.dev/models`
      );
    }

    if (message.includes('401') || message.includes('UNAUTHENTICATED')) {
      return new Error(
        'Invalid or missing GOOGLE_API_KEY. ' +
        'Get it from: https://makersuite.google.com/app/apikey'
      );
    }

    if (message.includes('402') || message.includes('payment')) {
      return new Error(
        'OpenRouter credits exhausted (402). Add credits at https://openrouter.ai/credits ' +
        'or add a Gemini API key as fallback.'
      );
    }

    if (message.includes('403') || message.includes('PERMISSION_DENIED')) {
      return new Error(
        'No permission to use this model. ' +
        'Enable Generative Language API in Google Cloud Console.'
      );
    }

    if (message.includes('429')) {
      return new Error(
        'Rate limited by Google AI. Please try again in a few moments.'
      );
    }

    return new Error(`AI Generation failed: ${message}`);
  }

  /**
   * Parse resume from text
   * FIXED: Better error handling and JSON extraction
   */
  async parseResume(text) {
    const prompt = `
You are an expert resume parser. Extract the following fields from the resume text below and return ONLY valid JSON — no markdown, no explanation.

Required JSON format:
{
  "school": "High school name",
  "intermediate": "12th / Pre-degree institution or board",
  "degree": "Degree name (e.g. B.Tech, BCA)",
  "branch": "Specialization (e.g. Computer Science)",
  "cgpa": "CGPA or percentage as string",
  "expected_graduation": "Year",
  "skills": ["Skill1", "Skill2"],
  "languages_known": ["Python", "JavaScript"],
  "projects": [{"name": "", "description": "", "tech": "", "url": ""}],
  "experience": [{"company": "", "role": "", "duration": "", "description": ""}],
  "hobbies": ["Hobby1"],
  "communication_skills": "Self-assessment paragraph",
  "summary": "2-3 sentence professional summary",
  "experience_summary": "One paragraph summarising work experience"
}

Resume Text:
${text}
    `.trim();

    try {
      const raw = await this._generate(prompt);
      // FIXED: Better JSON extraction (handles markdown)
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.error('No JSON found in resume parsing response');
        throw new Error('Response does not contain valid JSON');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      logger.info('Resume parsed successfully');
      return parsed;

    } catch (err) {
      logger.error('Resume parse failed:', err.message);
      // Return structure with error instead of throwing
      return {
        school: null,
        intermediate: null,
        degree: null,
        branch: null,
        cgpa: null,
        expected_graduation: null,
        skills: [],
        languages_known: [],
        projects: [],
        experience: [],
        hobbies: [],
        communication_skills: null,
        summary: null,
        experience_summary: null,
        parseError: err.message,
      };
    }
  }

  /**
   * Generate cover letter
   * FIXED: Better error handling and model usage
   */
  async generateCoverLetter(internship, resumeData) {
    const prompt = `
Write a concise, compelling cover letter for the following internship position.
Keep it under 200 words. Return ONLY the cover letter text — no subject line, no placeholders, no markdown.

Internship:
- Title: ${internship.title}
- Company: ${internship.company}
- Description: ${(internship.description || '').substring(0, 500)}

Applicant Profile:
- Degree: ${resumeData.degree} in ${resumeData.branch} (CGPA: ${resumeData.cgpa})
- Skills: ${(resumeData.skills || []).join(', ')}
- Experience: ${resumeData.experience_summary || 'No formal experience'}
- Projects: ${(resumeData.projects || []).map(p => p.name).join(', ')}
    `.trim();

    try {
      const letter = await this._generate(prompt);
      logger.info('Cover letter generated successfully');
      return letter;
    } catch (err) {
      logger.error('Cover letter generation failed:', err.message);
      // Return null instead of throwing - apply worker will handle
      return null;
    }
  }

  /**
   * Generate cover letter template
   * FIXED: Better error handling
   */
  async generateCoverLetterTemplate(resumeData) {
    const prompt = `
Write a high-quality, generic cover letter template for a student applying for internships.
Use placeholders exactly like this: {{COMPANY_NAME}} and {{JOB_TITLE}}.
Keep it professional, concise, and focused on the applicant's strengths.
Return ONLY the cover letter text — no subject line, no placeholders other than the two mentioned.

Applicant Profile:
- Degree: ${resumeData.degree} in ${resumeData.branch} (CGPA: ${resumeData.cgpa})
- Skills: ${(resumeData.skills || []).join(', ')}
- Experience: ${resumeData.experience_summary || 'No formal experience'}
    `.trim();

    try {
      const template = await this._generate(prompt);
      logger.info('Cover letter template generated successfully');
      return template;
    } catch (err) {
      logger.error('Cover letter template generation failed:', err.message);
      return null;
    }
  }

  /**
   * Extract form fields using AI
   * FIXED: Better error handling and validation
   */
  async extractFormFields(pageState, userData) {
    const prompt = `
You are an autonomous bot applying for internships.
Given the current page state and user data, decide the next action.

CRITICAL INSTRUCTIONS:
1. Prioritize actions like "Submit", "Apply", "Next", "Continue".
2. AVOID clicking generic navigation links like "Find jobs", "Return home", "Sign in" unless absolutely necessary to proceed with the application.
3. For selectors, prefer robust Playwright CSS selectors, especially using IDs, precise class names, or text-based locators (e.g., 'button:has-text("Submit")', 'a:has-text("Apply")'). 

User Data: ${JSON.stringify(userData)}
Page State: ${pageState}

Return ONLY valid JSON — no markdown:
{
  "action": "fill" | "click" | "wait" | "done" | "failed",
  "fields": { "playwright_selector": "value" },
  "submitSelector": "playwright_selector",
  "selector": "playwright_selector",
  "reasoning": "brief explanation"
}
    `.trim();

    try {
      const raw = await this._generate(prompt);
      // FIXED: Better JSON extraction
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON in response');
      }

      const decision = JSON.parse(jsonMatch[0]);
      logger.info('Form decision made:', decision.action);
      return decision;

    } catch (err) {
      logger.warn('AI form decision failed:', err.message);
      // Return safe default instead of throwing
      return { action: 'failed', reasoning: 'AI could not decide - ' + err.message };
    }
  }
}

/**
 * Factory — resolves key from DB keys array
 * Passes both keys so provider can auto-fallback (OpenRouter 402 → Gemini)
 */
export function createAIService(keys = []) {
  const gm = keys.find(k => k.key_name === 'gemini');
  const or = keys.find(k => k.key_name === 'openrouter');

  // Build fallback keys map
  const fallbackKeys = {
    gemini: gm?.decrypted || null,
    openrouter: or?.decrypted || null,
  };

  // Prioritize providers: OpenRouter > Gemini (with Gemini as fallback)
  if (or?.decrypted) {
    logger.info('Using OpenRouter provider' + (gm?.decrypted ? ' (Gemini fallback ready)' : ' (no fallback)'));
    return new AIService(or.decrypted, 'openrouter', fallbackKeys);
  }

  if (gm?.decrypted) {
    logger.info('Using Gemini provider (primary)');
    return new AIService(gm.decrypted, 'gemini', fallbackKeys);
  }

  logger.warn('No AI provider configured - AI features will be unavailable');
  return null;
}
