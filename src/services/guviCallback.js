/*
 * GUVI callback - sends results to the hackathon evaluation endpoint
 * This is required for scoring, don't skip this!
 * 
 * Has retry logic in case the first request fails
 */

const axios = require('axios');
const logger = require('../utils/logger');
const sessionManager = require('./sessionManager');

const GUVI_CALLBACK_URL = process.env.GUVI_CALLBACK_URL ||
    'https://hackathon.guvi.in/api/updateHoneyPotFinalResult';

// send final results to GUVI
async function sendFinalResult(sessionId, session) {
    // don't send twice
    if (session.callbackSent) {
        logger.info('Callback already sent', { sessionId });
        return { success: true, alreadySent: true };
    }

    // build the payload according to spec
    const payload = {
        sessionId: sessionId,
        scamDetected: session.scamDetected,
        totalMessagesExchanged: session.messageCount,
        extractedIntelligence: {
            bankAccounts: session.extractedIntelligence.bankAccounts,
            upiIds: session.extractedIntelligence.upiIds,
            phishingLinks: session.extractedIntelligence.phishingLinks,
            phoneNumbers: session.extractedIntelligence.phoneNumbers,
            suspiciousKeywords: session.extractedIntelligence.suspiciousKeywords
        },
        agentNotes: generateSummary(session)
    };

    logger.info('Sending to GUVI', {
        sessionId,
        scamDetected: payload.scamDetected,
        messageCount: payload.totalMessagesExchanged
    });

    // try up to 3 times with backoff
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await axios.post(GUVI_CALLBACK_URL, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            });

            logger.info('GUVI callback success', { sessionId, attempt });
            sessionManager.markCallbackSent(sessionId);

            return {
                success: true,
                status: response.status,
                data: response.data
            };

        } catch (error) {
            lastError = error;
            logger.warn('Callback failed', { sessionId, attempt, error: error.message });

            // wait before retry (2s, 4s)
            if (attempt < 3) {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
        }
    }

    logger.error('Callback failed after 3 tries', { sessionId });
    return { success: false, error: lastError?.message };
}

// generate a summary for the notes
function generateSummary(session) {
    const parts = [];

    if (session.scamType) {
        parts.push(`Detected ${session.scamType}`);
    }
    if (session.persona) {
        parts.push(`Used ${session.persona} persona`);
    }

    const intel = session.extractedIntelligence;
    if (intel.upiIds.length > 0) {
        parts.push(`UPI: ${intel.upiIds.join(', ')}`);
    }
    if (intel.phoneNumbers.length > 0) {
        parts.push(`Phones: ${intel.phoneNumbers.join(', ')}`);
    }
    if (intel.phishingLinks.length > 0) {
        parts.push(`${intel.phishingLinks.length} suspicious URL(s)`);
    }

    const duration = sessionManager.getEngagementDuration(session.sessionId);
    parts.push(`Duration: ${duration}s, Messages: ${session.messageCount}`);

    return parts.join('. ') + '.';
}

// check if ready to send callback
function isReadyForCallback(session) {
    if (!session.scamDetected) return false;
    if (session.messageCount < 2) return false;

    const intel = session.extractedIntelligence;
    const hasIntel =
        intel.bankAccounts.length > 0 ||
        intel.upiIds.length > 0 ||
        intel.phoneNumbers.length > 0 ||
        intel.phishingLinks.length > 0;

    return hasIntel || session.messageCount >= 6;
}

module.exports = {
    sendFinalResult,
    isReadyForCallback,
    generateSummary,
    GUVI_CALLBACK_URL
};
