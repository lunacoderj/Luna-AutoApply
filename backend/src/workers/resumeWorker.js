// src/workers/resumeWorker.js
import { Worker } from 'bullmq';
import * as PDFWorker from 'pdfjs-dist/legacy/build/pdf.mjs';
import { redis } from '../lib/redis.js';
import { supabase } from '../lib/supabase.js';
import { decryptKey } from '../lib/crypto.js';
import { AIService, createAIService } from '../services/aiService.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('resume-worker');
const { getDocument } = PDFWorker;

/**
 * Extract text from resume buffer
 * FIXED: Better error handling for PDFs
 */
async function extractTextFromBuffer(base64Buffer, mimeType) {
  if (!mimeType.includes('pdf')) {
    // For DOC/DOCX — return empty, user fills manually
    logger.warn('Non-PDF file uploaded, manual entry required');
    return '';
  }

  try {
    const buffer = Buffer.from(base64Buffer, 'base64');
    const typedArray = new Uint8Array(buffer);

    // FIXED: Proper PDF extraction
    const doc = await getDocument({ data: typedArray }).promise;
    let text = '';

    for (let i = 1; i <= Math.min(doc.numPages, 10); i++) {
      try {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str || '').join(' ') + '\n';
      } catch (pageError) {
        logger.warn(`Error extracting page ${i}`, pageError.message);
        continue; // Continue with next page
      }
    }

    return text.trim();
  } catch (err) {
    logger.error('PDF text extraction failed', {
      error: err.message,
      bufferLength: base64Buffer?.length,
    });
    return '';
  }
}

export function startResumeWorker() {
  const worker = new Worker('resume', async (job) => {
    const { userId, resumeUrl, fileBuffer, mimeType } = job.data;

    logger.info('[resume-worker] Processing resume', {
      jobId: job.id,
      userId,
      hasBuffer: !!fileBuffer,
      hasUrl: !!resumeUrl,
    });

    try {
      // 1. Extract text from file
      let text = '';

      if (fileBuffer) {
        try {
          text = await extractTextFromBuffer(fileBuffer, mimeType || 'application/pdf');
        } catch (extractErr) {
          logger.error('Text extraction failed', extractErr.message);
          text = '';
        }
      }

      // Check if we got meaningful content
      if (!text || text.length < 100) {
        logger.warn('Resume text too short, marking for manual entry', {
          textLength: text?.length || 0,
        });

        await supabase
          .from('luna_profiles')
          .update({ onboarding_status: 'resume_uploaded' })
          .eq('id', userId);

        return {
          success: false,
          reason: 'Insufficient content extracted',
          manualEntryRequired: true,
        };
      }

      logger.info('Resume text extracted', {
        length: text.length,
        lines: text.split('\n').length,
      });

      // 2. Get AI service
      const keysRes = await supabase
        .from('luna_api_keys')
        .select('key_name,encrypted_value')
        .eq('user_id', userId);

      const keys = (keysRes.data || []).map(k => ({
        ...k,
        decrypted: decryptKey(k.encrypted_value),
      }));

      const ai = createAIService(keys);

      if (!ai) {
        logger.warn('No AI key found, storing raw text', { userId });

        // Store raw text
        await supabase
          .from('luna_education_details')
          .upsert(
            {
              user_id: userId,
              summary: text.substring(0, 1000),
              ai_parsed: false,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          );

        return {
          success: false,
          reason: 'No AI key configured',
          manualEntryRequired: true,
        };
      }

      // 3. Parse resume with AI
      logger.info('Parsing resume with AI', { userId });
      let parsed;

      try {
        parsed = await ai.parseResume(text);

        // Check if parsing returned error
        if (parsed.parseError) {
          logger.warn('AI parsing returned error response', {
            parseError: parsed.parseError,
          });

          // Still save it for user review
          await supabase
            .from('luna_education_details')
            .upsert(
              {
                user_id: userId,
                summary: text.substring(0, 1000),
                ai_parsed: false,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'user_id' }
            );

          return {
            success: false,
            reason: `Parsing error: ${parsed.parseError}`,
            manualEntryRequired: true,
          };
        }
      } catch (parseErr) {
        logger.error('Resume parsing failed', {
          error: parseErr.message,
        });

        // Fallback: store raw text
        await supabase
          .from('luna_education_details')
          .upsert(
            {
              user_id: userId,
              summary: text.substring(0, 1000),
              ai_parsed: false,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          );

        return {
          success: false,
          reason: `Parsing error: ${parseErr.message}`,
          manualEntryRequired: true,
        };
      }

      logger.info('Resume parsed successfully', {
        fields: Object.keys(parsed).filter(k => parsed[k]),
      });

      // 4. Save parsed education details
      try {
        const educationData = {
          user_id: userId,
          school: parsed.school || null,
          intermediate: parsed.intermediate || null,
          degree: parsed.degree || null,
          branch: parsed.branch || null,
          cgpa: parsed.cgpa || null,
          expected_graduation: parsed.expected_graduation || null,
          skills: Array.isArray(parsed.skills) ? parsed.skills : [],
          languages_known: Array.isArray(parsed.languages_known) ? parsed.languages_known : [],
          projects: Array.isArray(parsed.projects) ? parsed.projects : [],
          experience: Array.isArray(parsed.experience) ? parsed.experience : [],
          hobbies: Array.isArray(parsed.hobbies) ? parsed.hobbies : [],
          communication_skills: parsed.communication_skills || null,
          summary: parsed.summary || null,
          experience_summary: parsed.experience_summary || null,
          ai_parsed: true,
          updated_at: new Date().toISOString(),
        };

        await supabase
          .from('luna_education_details')
          .upsert(educationData, { onConflict: 'user_id' });

        logger.info('Education details saved', { userId });
      } catch (saveErr) {
        logger.error('Failed to save education details', {
          error: saveErr.message,
        });
        throw new Error(`Failed to save parsed data: ${saveErr.message}`);
      }

      // 5. Generate master cover letter template (one-time cost)
      let coverLetterTemplate = null;

      try {
        logger.info('Generating cover letter template', { userId });
        coverLetterTemplate = await ai.generateCoverLetterTemplate(parsed);

        if (!coverLetterTemplate) {
          logger.warn('Template generation returned null');
        } else {
          logger.info('Template generated successfully', {
            length: coverLetterTemplate.length,
          });
        }
      } catch (templateErr) {
        logger.warn('Template generation failed', {
          error: templateErr.message,
        });
        // Continue without template - user can apply without custom letters
      }

      // 6. Store preferences with template
      try {
        const prefData = {
          user_id: userId,
          resume_text: text.substring(0, 2000),
          cover_letter_template: coverLetterTemplate,
          updated_at: new Date().toISOString(),
        };

        await supabase
          .from('luna_preferences')
          .upsert(prefData, { onConflict: 'user_id' });

        logger.info('Preferences updated with template', { userId });
      } catch (prefErr) {
        logger.error('Failed to save preferences', {
          error: prefErr.message,
        });
        // Non-critical - continue
      }

      // 7. Update profile status
      try {
        await supabase
          .from('luna_profiles')
          .update({ onboarding_status: 'education_parsed' })
          .eq('id', userId);

        logger.info('Profile status updated', {
          status: 'education_parsed',
          userId,
        });
      } catch (profileErr) {
        logger.error('Failed to update profile status', {
          error: profileErr.message,
        });
      }

      return {
        success: true,
        parsed: {
          degree: parsed.degree,
          branch: parsed.branch,
          skills: parsed.skills?.length || 0,
          experience: parsed.experience?.length || 0,
        },
        template: !!coverLetterTemplate,
      };

    } catch (err) {
      logger.error('Resume worker job failed', {
        jobId: job.id,
        error: err.message,
        stack: err.stack?.split('\n')[0],
      });

      throw new Error(`Resume processing failed: ${err.message}`);
    }

  }, {
    connection: redis,
    concurrency: 2,
    lockDuration: 300000, // 5 minutes
    stalledInterval: 120000, // 2 minutes
    maxStalledCount: 2,
  });

  worker.on('failed', (job, err) => {
    logger.error(`Resume job ${job?.id} failed`, {
      error: err.message,
    });
  });

  logger.info('✅ Resume worker started');
  return worker;
}
