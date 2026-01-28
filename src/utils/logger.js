/*
 * Simple logger utility
 * Just wraps console.log with timestamps and levels
 * nothing fancy but does the job
 */

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

// get level from env, default to INFO
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] || LOG_LEVELS.INFO;

function getTimestamp() {
    return new Date().toISOString();
}

function log(level, message, data = null) {
    // skip if below current level
    if (LOG_LEVELS[level] < currentLevel) return;

    const logEntry = {
        timestamp: getTimestamp(),
        level,
        message,
        ...(data && { data })
    };

    const output = JSON.stringify(logEntry);

    // use appropriate console method
    switch (level) {
        case 'ERROR':
            console.error(output);
            break;
        case 'WARN':
            console.warn(output);
            break;
        default:
            console.log(output);
    }
}

// export helper methods
module.exports = {
    debug: (message, data) => log('DEBUG', message, data),
    info: (message, data) => log('INFO', message, data),
    warn: (message, data) => log('WARN', message, data),
    error: (message, data) => log('ERROR', message, data)
};
