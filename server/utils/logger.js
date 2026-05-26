const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LOG_LEVELS.info;

function formatEntry(level, context, message, data) {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level.toUpperCase()}]`;
  if (data !== undefined) {
    return `${base} ${context ? context + ': ' : ''}${message} ${typeof data === 'object' ? JSON.stringify(data) : String(data)}`;
  }
  return `${base} ${context ? context + ': ' : ''}${message}`;
}

function createLogger(context) {
  return {
    error: (msg, data) => { if (currentLevel >= LOG_LEVELS.error) console.error(formatEntry('error', context, msg, data)); },
    warn: (msg, data) => { if (currentLevel >= LOG_LEVELS.warn) console.warn(formatEntry('warn', context, msg, data)); },
    info: (msg, data) => { if (currentLevel >= LOG_LEVELS.info) console.info(formatEntry('info', context, msg, data)); },
    debug: (msg, data) => { if (currentLevel >= LOG_LEVELS.debug) console.debug(formatEntry('debug', context, msg, data)); }
  };
}

module.exports = { createLogger, auditLog: require('./auditLog').auditLog };