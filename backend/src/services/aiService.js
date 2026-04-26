// src/services/aiService.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('ai-service');

export class AIService {
  constructor(apiKey, provider = 'gemini') {
    this.apiKey   = apiKey;
    this.provider = provider;
  }

  async _generate(prompt) {
    logger.info(`[AI Request] Provider: ${this.provider}, Model: ${this.provider === 'gemini' ? 'gemini-1.5-flash' : 'google/gemini-2.0-flash-001'}`);
    
    if (this.provider === 'gemini') {
      try {
        const genAI = new GoogleGenerativeAI(this.apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        
        logger.info(`[Gemini] Sending prompt (${prompt.substring(0, 50)}...)`);
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        logger.info(`[Gemini] Received response (${text.substring(0, 50)}...)`);
        return text;
      } catch (err) {
        logger.error(`[Gemini Error] Status: ${err.status}, Message: ${err.message}`);
        throw err;
      }
    }

    if (this.provider === 'openrouter') {
      const r = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'google/gemini-2.0-flash-001',
          messages: [{ role: 'user', content: prompt }],
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://applypilot.app',
            'X-Title': 'ApplyPilot',
          },
        }
      );
      return r.data.choices[0].message.content;
    }

    throw new Error(`Unsupported AI provider: ${this.provider}`);
  }

  // ── Resume Parsing ─────────────────────────────────────────────
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
      const json = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(json);
    } catch (err) {
      logger.error('Resume parse failed:', err.message);
      throw new Error('Failed to parse resume — please fill the form manually');
    }
  }

  // ── Cover Letter Generation ────────────────────────────────────
  async generateCoverLetter(internship, resumeData) {
    const prompt = `
Write a concise, compelling cover letter for the following internship position.
Keep it under 200 words. Return ONLY the cover letter text — no subject line, no placeholders.

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
      return await this._generate(prompt);
    } catch (err) {
      logger.error('Cover letter generation failed:', err.message);
      return null;
    }
  }

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
      return await this._generate(prompt);
    } catch (err) {
      logger.error('Cover letter template generation failed:', err.message);
      return null;
    }
  }

  // ── Form Filling Decision (Playwright) ────────────────────────
  async extractFormFields(pageState, userData) {
    const prompt = `
You are an autonomous bot applying for internships.
Given the current page state and user data, decide the next action.

User Data: ${JSON.stringify(userData)}
Page State: ${pageState}

Return ONLY valid JSON — no markdown:
{
  "action": "fill" | "click" | "wait" | "done" | "failed",
  "fields": { "css_selector": "value" },
  "submitSelector": "css_selector",
  "selector": "css_selector",
  "reasoning": "brief explanation"
}
    `.trim();

    try {
      const raw = await this._generate(prompt);
      const json = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(json);
    } catch (err) {
      logger.warn('AI decision failed:', err.message);
      return { action: 'failed', reasoning: 'AI could not decide' };
    }
  }
}

// Factory — resolves key from DB keys array
export function createAIService(keys = []) {
  const gm = keys.find(k => k.key_name === 'gemini');
  const or = keys.find(k => k.key_name === 'openrouter');

  if (gm?.decrypted)    return new AIService(gm.decrypted, 'gemini');
  if (or?.decrypted)    return new AIService(or.decrypted, 'openrouter');

  return null; // No AI available
}
