// src/server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createLogger } from './lib/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requireAuth } from './middleware/auth.js';
import { apiLimiter } from './middleware/rateLimiter.js';

// Routes
import userRouter         from './routes/user.js';
import keysRouter         from './routes/keys.js';
import preferencesRouter  from './routes/preferences.js';
import educationRouter    from './routes/education.js';
import resumeRouter       from './routes/resume.js';
import internshipsRouter  from './routes/internships.js';
import applicationsRouter from './routes/applications.js';
import emailLogsRouter    from './routes/emailLogs.js';

const app    = express();
const logger = createLogger('server');
const isProd = process.env.NODE_ENV === 'production';
const PORT   = parseInt(process.env.PORT || '3000');

// ── Security ───────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.set('trust proxy', 1);

// ── 1. GLOBAL CORS (MUST BE FIRST) ──────────────────────────────
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
}));

// Handle OPTIONS preflight explicitly
app.options('*', cors());

// ── Request logging ────────────────────────────────────────────────
app.use(morgan(isProd ? 'combined' : 'dev', {
  stream: { write: m => logger.info(m.trim()) },
}));

// ── Body parsing ───────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));

// ── Health check ───────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const checks = { server: 'ok', timestamp: new Date().toISOString() };

  try {
    const { supabase } = await import('./lib/supabase.js');
    const { error }    = await supabase.from('luna_profiles').select('id').limit(1);
    checks.supabase    = error ? `error: ${error.message}` : 'ok';
  } catch (e) { checks.supabase = `error: ${e.message}`; }

  try {
    const { scrapeQueue } = await import('./queues/scrapeQueue.js');
    const counts  = await scrapeQueue.getJobCounts();
    checks.redis  = 'ok';
    checks.queue  = counts;
  } catch (e) { checks.redis = `error: ${e.message}`; }

  const allOk = checks.supabase === 'ok' && checks.redis === 'ok';
  res.status(allOk ? 200 : 503).json(checks);
});

// ── Protected API routes ───────────────────────────────────────────
app.use('/api', apiLimiter, requireAuth);
app.use('/api/user',         userRouter);
app.use('/api/keys',         keysRouter);
app.use('/api/preferences',  preferencesRouter);
app.use('/api/education',    educationRouter);
app.use('/api/resume',       resumeRouter);
app.use('/api/internships',  internshipsRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/email-logs',   emailLogsRouter);

// ── Error handler ──────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ──────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  logger.info(`🚀 ApplyPilot API running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);

  // Start workers
  try {
    const { startWorkers } = await import('./workers/index.js');
    await startWorkers();
  } catch (err) {
    logger.warn(`Workers not started: ${err.message}`);
  }
});

export default app;
