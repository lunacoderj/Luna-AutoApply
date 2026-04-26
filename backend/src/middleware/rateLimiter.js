// src/middleware/rateLimiter.js
import { rateLimit } from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

export const scrapeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.userId || req.ip,
  message: { error: 'Scrape limit reached (10/hr). Please wait.' },
});
