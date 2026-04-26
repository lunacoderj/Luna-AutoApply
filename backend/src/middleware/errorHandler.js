// src/middleware/errorHandler.js
import { createLogger } from '../lib/logger.js';

const logger = createLogger('error-handler');

export function errorHandler(err, req, res, next) {
  logger.error(err.message, err.stack?.split('\n')[1]?.trim());

  const status = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Internal server error'
    : err.message || 'Something went wrong';

  res.status(status).json({ error: message });
}
