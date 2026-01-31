/*
 * Main server file - this is where everything starts
 * I'm using Express.js because it's simple and gets the job done
 * 
 * TODO: maybe add rate limiting later if we get too many requests
 */

// gotta load env vars first before anything else runs
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const logger = require('./utils/logger');
const authMiddleware = require('./middleware/auth');
const honeypotRoutes = require('./routes/honeypot');

const app = express();
const PORT = process.env.PORT || 3000;

// -- Middleware setup --
// order matters here! cors and OPTIONS bypass need to come first

app.use(cors()); // allow requests from anywhere for now
app.use(express.json({ limit: '10mb' })); // parse json, 10mb should be enough

// IMPORTANT: OPTIONS preflight bypass - must come before auth middleware
// This prevents browser CORS preflight requests from getting blocked by auth
app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// quick logging for debugging - helps to see what's coming in
app.use((req, res, next) => {
    logger.debug('Incoming request', {
        method: req.method,
        path: req.path,
        ip: req.ip
    });
    next();
});

// -- Routes --

// basic info when someone hits the root
app.get('/', (req, res) => {
    res.json({
        name: 'Agentic Honeypot API',
        version: '1.0.0',
        description: 'AI-powered scam detection and engagement system',
        endpoints: {
            honeypot: 'POST /api/honeypot',
            health: 'GET /api/honeypot/health',
            session: 'GET /api/honeypot/session/:sessionId'
        },
        documentation: 'Include x-api-key header for authentication'
    });
});

// health check - useful for monitoring and deployment checks
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// main honeypot routes - these need auth
app.use('/api/honeypot', authMiddleware, honeypotRoutes);

// -- Error handling --

// 404 - route not found
app.use((req, res) => {
    res.status(404).json({
        status: 'error',
        error: 'Not Found',
        message: `Route ${req.method} ${req.path} not found`
    });
});

// catch-all error handler
app.use((err, req, res, next) => {
    logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack
    });

    // don't leak error details in production
    res.status(500).json({
        status: 'error',
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// -- Start the server --

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║     🍯 AGENTIC HONEYPOT API SERVER                           ║
║                                                               ║
║     Server running on: http://localhost:${PORT}                  ║
║     Environment: ${process.env.NODE_ENV || 'development'}                              ║
║                                                               ║
║     Endpoints:                                                ║
║       POST /api/honeypot      - Process scam messages         ║
║       GET  /api/honeypot/health - Health check                ║
║       GET  /health            - Basic health check            ║
║                                                               ║
║     Press Ctrl+C to stop                                      ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    logger.info('Server started', { port: PORT, env: process.env.NODE_ENV });

    // warn if api key not set up
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your-gemini-api-key-here') {
        console.log('⚠️  WARNING: GEMINI_API_KEY not configured. AI features will use fallback responses.');
        console.log('   Get your API key from: https://aistudio.google.com/app/apikey');
    }

    if (process.env.API_SECRET_KEY === 'YOUR_SECRET_API_KEY') {
        console.log('⚠️  WARNING: Using default API_SECRET_KEY. Change this in production!');
    }
});

// graceful shutdown - cleanup on exit
process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully');
    process.exit(0);
});

module.exports = app;
