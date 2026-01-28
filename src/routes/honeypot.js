/*
 * Main honeypot routes - this is where the API magic happens
 * Handles incoming scam messages, detects fraud, generates responses
 * 
 * POST /api/honeypot - main endpoint
 * GET /api/honeypot/health - health check
 * GET /api/honeypot/session/:id - debug session info
 */

const express = require('express');
const router = express.Router();

const logger = require('../utils/logger');
const scamDetector = require('../services/scamDetector');
const sessionManager = require('../services/sessionManager');
const intelligenceExtractor = require('../services/intelligenceExtractor');
const aiAgent = require('../services/aiAgent');
const guviCallback = require('../services/guviCallback');
const evidenceStore = require('../services/evidenceStore');

// main endpoint - processes incoming messages
router.post('/', async (req, res) => {
    const startTime = Date.now();

    // Default response structure to ensure we never return empty
    let response = {
        status: 'success',
        scamDetected: false,
        engagementMetrics: {
            engagementDurationSeconds: 0,
            totalMessagesExchanged: 0
        },
        extractedIntelligence: {
            bankAccounts: [],
            upiIds: [],
            phishingLinks: [],
            phoneNumbers: [],
            suspiciousKeywords: []
        },
        agentNotes: 'Initializing analysis...',
        agentResponse: null
    };

    try {
        const { sessionId, message, conversationHistory = [], metadata = {} } = req.body;

        // basic validation
        if (!sessionId) {
            return res.status(400).json({ status: 'error', error: 'Missing sessionId' });
        }
        if (!message || !message.text) {
            return res.status(400).json({ status: 'error', error: 'Missing message.text' });
        }

        // log incoming
        logger.info('Processing message', { sessionId, length: message.text.length });

        // get or create session
        const session = sessionManager.getOrCreateSession(sessionId);

        // sync history if needed
        if (conversationHistory.length > session.conversationHistory.length) {
            session.conversationHistory = conversationHistory;
        }

        // 1. EXTRACT INTELLIGENCE (Always run this first)
        const newIntel = intelligenceExtractor.extract(message.text);
        sessionManager.addIntelligence(sessionId, newIntel);

        // 2. DETECT SCAM
        let detection = { isScam: false, method: 'pattern', confidence: 0, scamType: 'unknown' };
        try {
            detection = await scamDetector.analyze(message.text, session.conversationHistory);
        } catch (err) {
            logger.error('Scam detection error', { error: err.message });
            // Fallback to extraction-based detection
            const score = intelligenceExtractor.getScamScore(message.text);
            if (score.score > 50) {
                detection = { isScam: true, method: 'fallback', confidence: 0.5, scamType: 'suspicious' };
            }
        }

        // Update session with detection results
        if (detection.isScam && !session.scamDetected) {
            sessionManager.setScamDetected(sessionId, true, detection.scamType, null);
        }

        // 3. AGENT ENGAGEMENT
        const sessionSnapshot = sessionManager.getSession(sessionId);
        const shouldStop = sessionSnapshot.isComplete || sessionSnapshot.callbackSent || sessionManager.shouldComplete(sessionId);

        // Decide: generate response or stop?
        if ((detection.isScam || sessionSnapshot.scamDetected) && !shouldStop) {

            // Generate AI response
            try {
                const aiResponse = await aiAgent.generateResponse(sessionSnapshot, message, metadata);
                response.agentResponse = aiResponse;
                sessionManager.addMessage(sessionId, message, aiResponse);
                response.agentNotes = aiAgent.generateAgentNotes(sessionManager.getSession(sessionId));
            } catch (err) {
                logger.error('Agent generation error', { error: err.message });
                sessionManager.addMessage(sessionId, message);
                response.agentNotes = 'Agent generation failed, logged message only.';
            }

        } else if (shouldStop) {
            // Stop condition met
            if (!sessionSnapshot.isComplete) {
                sessionManager.markComplete(sessionId);
            }
            sessionManager.addMessage(sessionId, message);
            response.agentNotes = 'Intelligence target reached or conversation complete. Agent disengaged.';

            // Trigger callback if it's the Moment of Completion
            if (detection.isScam) {
                guviCallback.sendFinalResult(sessionId, sessionManager.getSession(sessionId))
                    .catch(e => logger.error('Callback error', { error: e.message }));
            }
        } else {
            // No scam detected
            sessionManager.addMessage(sessionId, message);
            response.agentNotes = 'No scam detected. Monitoring only.';
        }

        // 4. PREPARE FINAL RESPONSE
        // Simulate safe typing delay (realistic human speed)
        if (response.agentResponse) {
            // Use the full calculated delay (1.5s - 10s) based on message length
            const safeDelay = aiAgent.calculateTypingDelay(response.agentResponse);
            await new Promise(r => setTimeout(r, safeDelay));
        }

        // Get final session state
        const finalSession = sessionManager.getSession(sessionId);

        // Populate the safe response object with real data
        response.scamDetected = !!finalSession.scamDetected; // force boolean
        response.engagementMetrics = {
            engagementDurationSeconds: sessionManager.getEngagementDuration(sessionId) || 0,
            totalMessagesExchanged: finalSession.messageCount || 0
        };
        response.extractedIntelligence = {
            bankAccounts: finalSession.extractedIntelligence.bankAccounts || [],
            upiIds: finalSession.extractedIntelligence.upiIds || [],
            phishingLinks: finalSession.extractedIntelligence.phishingLinks || [],
            phoneNumbers: finalSession.extractedIntelligence.phoneNumbers || [],
            suspiciousKeywords: finalSession.extractedIntelligence.suspiciousKeywords || []
        };

        // Send succesful response
        logger.info('Request processed', { sessionId, status: 'success' });
        return res.json(response);

    } catch (error) {
        logger.error('Critical API Error', { error: error.message, stack: error.stack });

        // Even in error, return the partial response structure if possible, or a strict error JSON
        return res.status(500).json({
            status: 'error',
            error: 'Internal processing error',
            message: error.message,
            // Return empty structure so clients dont crash
            engagementMetrics: response.engagementMetrics,
            extractedIntelligence: response.extractedIntelligence
        });
    }
});

// health check
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// debug endpoint - get session details
router.get('/session/:sessionId', (req, res) => {
    const session = sessionManager.getSession(req.params.sessionId);

    if (!session) {
        return res.status(404).json({ status: 'error', error: 'Session not found' });
    }

    res.json({
        status: 'success',
        session: {
            sessionId: session.sessionId,
            scamDetected: session.scamDetected,
            scamType: session.scamType,
            messageCount: session.messageCount,
            engagementDuration: sessionManager.getEngagementDuration(req.params.sessionId),
            extractedIntelligence: session.extractedIntelligence,
            isComplete: session.isComplete,
            callbackSent: session.callbackSent
        }
    });
});

// GET /api/honeypot/evidence - fetch the whole vault for the dashboard
router.get('/evidence', (req, res) => {
    const evidence = evidenceStore.getEvidence();
    res.json({
        status: 'success',
        data: evidence
    });
});

module.exports = router;
