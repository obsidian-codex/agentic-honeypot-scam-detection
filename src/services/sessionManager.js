/*
 * Session manager - keeps track of conversations
 * Using a simple Map for now, in production we'd use Redis or something
 * 
 * Each session stores: chat history, extracted intel, metrics etc
 */

const logger = require('../utils/logger');

// in-memory storage - quick and simple
const sessions = new Map();

// creates a fresh session object
function createSession(sessionId) {
    return {
        sessionId,
        scamDetected: false,
        scamType: null,
        persona: null,
        conversationHistory: [],
        extractedIntelligence: {
            bankAccounts: [],
            upiIds: [],
            phishingLinks: [],
            phoneNumbers: [],
            suspiciousKeywords: []
        },
        startTime: Date.now(),
        messageCount: 0,
        isComplete: false,
        callbackSent: false
    };
}

// get session or create if doesn't exist
function getOrCreateSession(sessionId) {
    if (!sessions.has(sessionId)) {
        const newSession = createSession(sessionId);
        sessions.set(sessionId, newSession);
        logger.info('New session created', { sessionId });
        return newSession;
    }
    return sessions.get(sessionId);
}

// add a message to the conversation history
function addMessage(sessionId, message, agentResponse = null) {
    const session = sessions.get(sessionId);
    if (!session) {
        logger.error('Session not found', { sessionId });
        return;
    }

    // add incoming message
    session.conversationHistory.push({
        sender: message.sender,
        text: message.text,
        timestamp: message.timestamp || new Date().toISOString()
    });
    session.messageCount++;

    // add our response too if we have one
    if (agentResponse) {
        session.conversationHistory.push({
            sender: 'agent',
            text: agentResponse,
            timestamp: new Date().toISOString()
        });
        session.messageCount++;
    }

    sessions.set(sessionId, session);
}

// update scam detection status
function setScamDetected(sessionId, isScam, scamType, persona) {
    const session = sessions.get(sessionId);
    if (!session) return;

    session.scamDetected = isScam;
    session.scamType = scamType;
    session.persona = persona;
    sessions.set(sessionId, session);
}

// merge new intel into existing - avoids duplicates
function addIntelligence(sessionId, newIntelligence) {
    const session = sessions.get(sessionId);
    if (!session) return;

    for (const [key, values] of Object.entries(newIntelligence)) {
        if (Array.isArray(values) && Array.isArray(session.extractedIntelligence[key])) {
            const existing = new Set(session.extractedIntelligence[key]);
            values.forEach(v => existing.add(v));
            session.extractedIntelligence[key] = Array.from(existing);
        }
    }

    sessions.set(sessionId, session);
}

// how long has this conversation been going?
function getEngagementDuration(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return 0;
    return Math.floor((Date.now() - session.startTime) / 1000);
}

// get a copy of the session (prevents accidental mutations)
function getSession(sessionId) {
    const session = sessions.get(sessionId);
    return session ? { ...session } : null;
}

function markComplete(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return;
    session.isComplete = true;
    sessions.set(sessionId, session);
}

function markCallbackSent(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return;
    session.callbackSent = true;
    sessions.set(sessionId, session);
}

// decide if we have enough info to wrap up - stopping immediately on FIRST intel
function shouldComplete(sessionId) {
    const session = sessions.get(sessionId);
    if (!session || session.isComplete || session.callbackSent) return false;

    const intel = session.extractedIntelligence;

    // strict rule: the moment ANY intel is extracted, we are done
    const hasAnyIntel =
        intel.bankAccounts.length > 0 ||
        intel.upiIds.length > 0 ||
        intel.phishingLinks.length > 0 ||
        intel.phoneNumbers.length > 0;

    return hasAnyIntel;
}

module.exports = {
    getOrCreateSession,
    addMessage,
    setScamDetected,
    addIntelligence,
    getEngagementDuration,
    getSession,
    markComplete,
    markCallbackSent,
    shouldComplete
};
