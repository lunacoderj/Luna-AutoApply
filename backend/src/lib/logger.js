// src/lib/logger.js
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

export function createLogger(namespace) {
  const prefix = `[${namespace}]`;
  return {
    debug: (...args) => currentLevel <= LEVELS.debug && console.debug(new Date().toISOString(), prefix, ...args),
    info:  (...args) => currentLevel <= LEVELS.info  && console.log(new Date().toISOString(), prefix, ...args),
    warn:  (...args) => currentLevel <= LEVELS.warn  && console.warn(new Date().toISOString(), prefix, ...args),
    error: (...args) => currentLevel <= LEVELS.error && console.error(new Date().toISOString(), prefix, ...args),
  };
}
