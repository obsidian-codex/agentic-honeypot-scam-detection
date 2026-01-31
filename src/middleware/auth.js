/*
 * Auth middleware - checks if the request has a valid API key
 * Pretty straightforward - just compare headers
 */

const logger = require('../utils/logger');

function authMiddleware(req, res, next) {
    // Check both lowercase and uppercase header variations for compatibility
    const providedKey = req.headers['x-api-key'] || req.headers['X-API-KEY'];
    const expectedKey = process.env.API_SECRET_KEY;

    // no key provided
    if (!providedKey) {
        logger.warn('Auth failed: no API key', { ip: req.ip, path: req.path });
        return res.status(401).json({
            status: 'error',
            error: 'Missing API key',
            message: 'Please provide x-api-key header'
        });
    }

    // wrong key
    if (providedKey !== expectedKey) {
        logger.warn('Auth failed: invalid key', { ip: req.ip, path: req.path });
        return res.status(401).json({
            status: 'error',
            error: 'Invalid API key',
            message: 'The provided API key is not valid'
        });
    }

    // all good, let them through
    logger.debug('Auth passed', { ip: req.ip });
    next();
}

module.exports = authMiddleware;
