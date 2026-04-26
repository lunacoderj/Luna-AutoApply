// src/workers/resumeWorker.js
import { Worker } from 'bullmq';
import { redis } from '../lib/redis.js';
import { supabase } from '../lib/supabase.js';
import { decryptKey } from '../lib/crypto.js';
import { AIService, createAIService } from '../services/aiService.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('resume-worker');

async function extractTextFromBuffer(base64Buffer, mimeType) {
  // Simple text extraction for PDFs using pdfjs-dist
  if (!mimeType.includes('pdf')) {
    // For DOC/DOCX — return empty, user fills manually
    return '';
  }

  try {
    const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const buffer = Buffer.from(base64Buffer, 'base64');
    const typedArray = new Uint8Array(buffer);
    const doc = await getDocument({ data: typedArray }).promise;

    let text = '';
    for (let i = 1; i <= Math.min(doc.numPages, 10); i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    return text.trim();
  } catch (err) {
    logger.error('PDF extraction failed:', err.message);
    return '';
  }
}

export function startResumeWorker() {
  const worker = new Worker('resume', async (job) => {
    const { userId, fileBuffer, mimeType } = job.data;
    logger.info(`Parsing resume for user ${userId}`);

    // 1. Extract text
    const text = await extractTextFromBuffer(fileBuffer, mimeType || 'application/pdf');
    if (!text || text.length < 100) {
      logger.warn(`Resume text too short for user ${userId} — marking for manual entry`);
      await supabase.from('luna_profiles').update({ onboarding_status: 'resume_uploaded' }).eq('id', userId);
      return;
    }

    // 2. Get AI key
    const { data: keys } = await supabase.from('luna_api_keys').select('key_name,encrypted_value').eq('user_id', userId);
    const decryptedKeys = (keys || []).map(k => ({ ...k, decrypted: decryptKey(k.encrypted_value) }));
    const ai = createAIService(decryptedKeys);

    if (!ai) {
      logger.warn(`No AI key for user ${userId} — storing raw text`);
      await supabase.from('luna_education_details').upsert({
        user_id: userId, summary: text.substring(0, 1000), ai_parsed: false,
      }, { onConflict: 'user_id' });
      return;
    }

    // 3. Parse with AI
    const parsed = await ai.parseResume(text);

    // 4. Upsert education_details
    await supabase.from('luna_education_details').upsert({
      user_id:             userId,
      school:              parsed.school,
      intermediate:        parsed.intermediate,
      degree:              parsed.degree,
      branch:              parsed.field || parsed.branch,
      cgpa:                parsed.gpa || parsed.cgpa,
      skills:              Array.isArray(parsed.skills) ? parsed.skills : [],
      summary:             parsed.summary,
      experience_summary:  parsed.experience_summary,
      ai_parsed:           true,
      updated_at:          new Date().toISOString(),
    }, { onConflict: 'user_id' });

    // 5. Generate Master Cover Letter Template (One-time AI cost)
    const coverLetterTemplate = await ai.generateCoverLetterTemplate(parsed);

    // Store resume_text and template in preferences for match scoring and quick applying
    await supabase.from('luna_preferences').upsert({
      user_id: userId,
      resume_text: text.substring(0, 2000),
      cover_letter_template: coverLetterTemplate,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    // 6. Update profile status
    await supabase.from('luna_profiles').update({ onboarding_status: 'education_parsed' }).eq('id', userId);

    logger.info(`Resume parsed and stored for user ${userId}`);
  }, {
    connection: redis,
    concurrency: 2,
    lockDuration: 300000,
    stalledInterval: 120000,
  });

  worker.on('failed', (job, err) => logger.error(`Resume job ${job?.id} failed: ${err.message}`));
  logger.info('Resume worker started');
  return worker;
}
