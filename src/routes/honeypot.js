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

    try {
        const { sessionId, message, conversationHistory = [], metadata = {} } = req.body;

        // basic validation
        if (!sessionId) {
            return res.status(400).json({ status: 'error', error: 'Missing sessionId' });
        }
        if (!message || !message.text) {
            return res.status(400).json({ status: 'error', error: 'Missing message.text' });
        }

        logger.info('Processing message', {
            sessionId,
            sender: message.sender,
            textLength: message.text.length
        });

        // get or create session
        const session = sessionManager.getOrCreateSession(sessionId);

        // sync history if incoming has more context
        if (conversationHistory.length > session.conversationHistory.length) {
            session.conversationHistory = conversationHistory;
        }

        // extract any intel from this message
        const newIntel = intelligenceExtractor.extract(message.text);
        sessionManager.addIntelligence(sessionId, newIntel);

        // check if it's a scam
        const detection = await scamDetector.analyze(message.text, session.conversationHistory);

        // update session if scam detected
        if (detection.isScam && !session.scamDetected) {
            sessionManager.setScamDetected(sessionId, true, detection.scamType, null);
        }

        const updatedSession = sessionManager.getSession(sessionId);

        // setup our response variables
        let agentResponse = null;
        let agentNotes = '';

        const sessionSnapshot = sessionManager.getSession(sessionId);
        const shouldStop = sessionSnapshot.isComplete || sessionSnapshot.callbackSent || sessionManager.shouldComplete(sessionId);

        // generate response if scam detected AND we haven't reached the stopping point
        if ((detection.isScam || sessionSnapshot.scamDetected) && !shouldStop) {
            agentResponse = await aiAgent.generateResponse(sessionSnapshot, message, metadata);
            sessionManager.addMessage(sessionId, message, agentResponse);
            agentNotes = aiAgent.generateAgentNotes(sessionManager.getSession(sessionId));
        } else if (shouldStop) {
            // make sure it's actually marked as complete in the manager
            if (!sessionSnapshot.isComplete) {
                logger.info('Autonomous stopping triggered: goal reached.', { sessionId });
                sessionManager.markComplete(sessionId);
            }
            sessionManager.addMessage(sessionId, message);
            agentNotes = 'Intelligence target reached. Session complete.';
        } else {
            sessionManager.addMessage(sessionId, message);
            agentNotes = 'No scam detected. Message looks legitimate.';
        }

        const finalSession = sessionManager.getSession(sessionId);

        // send callback to GUVI if we have enough
        if (detection.isScam && sessionManager.shouldComplete(sessionId)) {
            guviCallback.sendFinalResult(sessionId, finalSession)
                .then(result => {
                    if (result.success) logger.info('GUVI callback done', { sessionId });
                })
                .catch(err => logger.error('GUVI callback error', { error: err.message }));

            sessionManager.markComplete(sessionId);
        }

        // log to persistent storage so we dont lose this data
        await evidenceStore.logSession(finalSession);

        // simulate typing delay to look human
        if (agentResponse) {
            const delay = aiAgent.calculateTypingDelay(agentResponse, finalSession.persona);
            logger.info(`Simulating typing delay`, { sessionId, ms: delay });
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        const responseTime = Date.now() - startTime;

        // build response
        const response = {
            status: 'success',
            scamDetected: finalSession.scamDetected,
            agentResponse: agentResponse,
            engagementMetrics: {
                engagementDurationSeconds: sessionManager.getEngagementDuration(sessionId),
                totalMessagesExchanged: finalSession.messageCount
            },
            extractedIntelligence: {
                bankAccounts: finalSession.extractedIntelligence.bankAccounts,
                upiIds: finalSession.extractedIntelligence.upiIds,
                phishingLinks: finalSession.extractedIntelligence.phishingLinks,
                phoneNumbers: finalSession.extractedIntelligence.phoneNumbers,
                suspiciousKeywords: finalSession.extractedIntelligence.suspiciousKeywords
            },
            agentNotes: agentNotes,
            _meta: {
                responseTimeMs: responseTime,
                detectionMethod: detection.method,
                confidence: detection.confidence,
                scamType: detection.scamType
            }
        };

        logger.info('Response sent', { sessionId, scamDetected: response.scamDetected, ms: responseTime });
        return res.json(response);

    } catch (error) {
        logger.error('Error', { error: error.message, stack: error.stack });
        return res.status(500).json({ status: 'error', error: 'Internal error', message: error.message });
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
