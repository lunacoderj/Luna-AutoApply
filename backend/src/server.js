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
const PORT   = parseInt(process.env.PORT || '5000');

// ── Security ───────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.set('trust proxy', 1);

// ── CORS Configuration (FIXED) ──────────────────────────────────────
/**
 * Get allowed origins from environment variables
 * FIXED: Now includes production URLs
 */
function getAllowedOrigins() {
  const origins = [
    // Development
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',

    // Production - FIXED: Added these
    'https://luna.jaggu.me',
    'https://www.luna.jaggu.me',
    
    // From environment
    process.env.FRONTEND_URL || 'https://luna.jaggu.me',
    
    // Additional origins from comma-separated env var
    ...(process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || []),
  ].filter(Boolean);

  // Remove duplicates
  return [...new Set(origins)];
}

// FIXED: Proper CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = getAllowedOrigins();

    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) {
      return callback(null, true);
    }

    // Normalize origin (remove trailing slash)
    const normalizedOrigin = origin.replace(/\/$/, '');
    
    // Check if origin is allowed
    const isAllowed = allowedOrigins.some(allowed => {
      const normalizedAllowed = allowed.replace(/\/$/, '');
      return normalizedOrigin === normalizedAllowed;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      const error = new Error('CORS: Origin not allowed');
      error.status = 403;
      error.origin = origin;

      logger.warn('[cors] Blocked origin', {
        origin,
        allowedCount: allowedOrigins.length,
        path: '/cors-check',
      });

      callback(error);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'X-Requested-With',
  ],
  exposedHeaders: ['Content-Length', 'X-Total-Count'],
  maxAge: 3600, // Cache preflight for 1 hour
  optionsSuccessStatus: 200, // For legacy browsers
};

// Apply CORS middleware - FIXED
app.use(cors(corsOptions));

// Handle preflight explicitly
app.options('*', cors(corsOptions));

// ── Request logging ────────────────────────────────────────────────
app.use(morgan(isProd ? 'combined' : 'dev', {
  stream: { write: m => logger.info(m.trim()) },
}));

// ── Body parsing ───────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));

// ── Health check ───────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const checks = { 
    server: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  };

  try {
    const { supabase } = await import('./lib/supabase.js');
    const { error } = await supabase.from('luna_profiles').select('id').limit(1);
    checks.supabase = error ? `error: ${error.message}` : 'ok';
  } catch (e) { 
    checks.supabase = `error: ${e.message}`; 
  }

  try {
    const { scrapeQueue } = await import('./queues/scrapeQueue.js');
    const counts = await scrapeQueue.getJobCounts();
    checks.redis = 'ok';
    checks.queue = {
      waiting: counts.waiting,
      active: counts.active,
      completed: counts.completed,
      failed: counts.failed,
    };
  } catch (e) { 
    checks.redis = `error: ${e.message}`; 
  }

  const allOk = checks.supabase === 'ok' && checks.redis === 'ok';
  res.status(allOk ? 200 : 503).json(checks);
});

// ── Log CORS configuration on startup ────────────────────────────
function logStartupConfig() {
  const origins = getAllowedOrigins();
  logger.info('[cors] Allowed origins:', origins);
  logger.info('[server] Configuration:', {
    environment: isProd ? 'production' : 'development',
    port: PORT,
    corsEnabled: true,
    allowedOriginCount: origins.length,
  });
}

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

// ── CORS Error Handler (FIXED) ──────────────────────────────────
app.use((err, req, res, next) => {
  if (err.message && err.message.includes('CORS')) {
    logger.error('[cors-error]', {
      origin: req.get('origin'),
      method: req.method,
      path: req.path,
      url: req.url,
      error: err.message,
      status: err.status || 403,
    });

    return res.status(err.status || 403).json({
      error: 'CORS Error',
      message: 'Origin not allowed',
      origin: req.get('origin'),
      // Only show allowed origins in development
      ...(isProd ? {} : { 
        note: 'Add your origin to ALLOWED_ORIGINS environment variable'
      }),
    });
  }

  next(err);
});

// ── Error handler ──────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ──────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  logStartupConfig();
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
