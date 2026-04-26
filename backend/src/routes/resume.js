// src/routes/resume.js
import { Router } from 'express';
import multer from 'multer';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import { resumeQueue } from '../queues/resumeQueue.js';

const router = Router();
const logger = createLogger('resume');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const async$ = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// POST /api/resume/upload — upload PDF, trigger AI parse
router.post('/upload', upload.single('resume'), async$( async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const file = req.file;
  const ext = file.originalname.split('.').pop().toLowerCase();
  if (!['pdf', 'doc', 'docx'].includes(ext)) {
    return res.status(400).json({ error: 'Only PDF, DOC, DOCX files are supported' });
  }

  const fileName = `resumes/${req.userId}/${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from('applypilot')
    .upload(fileName, file.buffer, { contentType: file.mimetype, upsert: true });

  if (uploadErr) {
    logger.error(`Storage upload failed: ${uploadErr.message}`);
    throw uploadErr;
  }

  const { data: { publicUrl } } = supabase.storage.from('applypilot').getPublicUrl(fileName);

  await supabase.from('luna_profiles').update({
    resume_url: publicUrl,
    onboarding_status: 'resume_uploaded',
  }).eq('id', req.userId);

  // Enqueue AI parse job
  await resumeQueue.add('parse', {
    userId: req.userId,
    resumeUrl: publicUrl,
    fileBuffer: file.buffer.toString('base64'),
    mimeType: file.mimetype,
  });

  logger.info(`Resume uploaded and enqueued for parse — user ${req.userId}`);
  res.json({ ok: true, message: 'Resume uploaded — AI parsing started', url: publicUrl });
}));

// GET /api/resume/status — parsing progress
router.get('/status', async$( async (req, res) => {
  const { data, error } = await supabase
    .from('luna_profiles')
    .select('onboarding_status, resume_url')
    .eq('id', req.userId)
    .single();

  if (error) throw error;
  res.json(data);
}));

export default router;
