/*
 * Scam detector - figures out if someone is trying to pull a fast one.
 * We use simple patterns (fast) and Gemini (the smart brain).
 * 
 * Pattern matching catches the obvious "you won 1 million" stuff, 
 * while the AI handles the trickier conversational scams.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');
const { SCAM_DETECTION_PROMPT } = require('../config/prompts');
const intelligenceExtractor = require('./intelligenceExtractor');

// gemini setup - we only start it when we actually need it
let genAI = null;
let model = null;

function initializeAI() {
    if (!genAI && process.env.GEMINI_API_KEY) {
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        logger.info('Gemini AI initialized');
    }
}

// quick pattern-based check - no AI needed
function patternBasedDetection(text) {
    const { score, breakdown, intelligence } = intelligenceExtractor.getScamScore(text);

    // figure out what type of scam based on what we found
    let scamType = 'none';
    if (intelligence.phishingLinks.length > 0) {
        scamType = 'phishing';
    } else if (intelligence.upiIds.length > 0) {
        scamType = 'upi_fraud';
    } else if (intelligence.suspiciousKeywords.some(k =>
        ['lottery', 'won', 'winner', 'prize', 'jackpot'].includes(k.toLowerCase())
    )) {
        scamType = 'lottery';
    } else if (intelligence.suspiciousKeywords.some(k =>
        ['kyc', 'blocked', 'suspended', 'verify', 'account'].includes(k.toLowerCase())
    )) {
        scamType = 'bank_fraud';
    } else if (score > 30) {
        scamType = 'other';
    }

    const confidence = Math.min(score / 100, 1);
    return {
        isScam: confidence > 0.1 || intelligence.suspiciousKeywords.length >= 2,
        confidence,
        scamType,
        indicators: intelligence.suspiciousKeywords,
        reasoning: `Pattern matching found: ${Object.keys(breakdown).join(', ')}`,
        method: 'pattern'
    };
}

// AI-powered detection - smarter but slower
async function aiBasedDetection(text, conversationHistory = []) {
    initializeAI();

    if (!model) {
        logger.warn('AI not available, using pattern detection only');
        return null;
    }

    try {
        // build context from history
        const historyContext = conversationHistory.length > 0
            ? `Previous messages:\n${conversationHistory.map(m => `${m.sender}: ${m.text}`).join('\n')}\n\n`
            : '';

        const prompt = `${SCAM_DETECTION_PROMPT}

${historyContext}
Current message to analyze:
"${text}"

Respond with JSON only:`;

        const result = await model.generateContent(prompt);
        const response = result.response.text();

        // parse json - handle markdown code blocks
        let jsonStr = response;
        if (response.includes('```json')) {
            jsonStr = response.split('```json')[1].split('```')[0];
        } else if (response.includes('```')) {
            jsonStr = response.split('```')[1].split('```')[0];
        }

        const parsed = JSON.parse(jsonStr.trim());

        return {
            isScam: parsed.isScam,
            confidence: parsed.confidence || 0.5,
            scamType: parsed.scamType || 'other',
            indicators: parsed.indicators || [],
            reasoning: parsed.reasoning || 'AI analysis',
            method: 'ai'
        };

    } catch (error) {
        logger.error('AI detection failed', { error: error.message });
        return null;
    }
}

// main function - combines both methods
async function analyze(text, conversationHistory = []) {
    // quick pattern check first
    const patternResult = patternBasedDetection(text);

    // if the patterns are super sure, we dont even need the AI
    if (patternResult.confidence >= 0.7) {
        logger.info('Scam detected via pattern', {
            confidence: patternResult.confidence,
            type: patternResult.scamType
        });
        return patternResult;
    }

    // try AI for uncertain cases
    const aiResult = await aiBasedDetection(text, conversationHistory);

    if (aiResult) {
        // combine scores - AI gets more weight
        const combinedConfidence = (patternResult.confidence * 0.3) + (aiResult.confidence * 0.7);

        const result = {
            isScam: combinedConfidence > 0.1 || aiResult.isScam || patternResult.isScam,
            confidence: combinedConfidence,
            scamType: aiResult.isScam ? aiResult.scamType : patternResult.scamType,
            indicators: [...new Set([...patternResult.indicators, ...aiResult.indicators])],
            reasoning: aiResult.reasoning,
            method: 'combined'
        };

        logger.info('Scam analysis done', {
            isScam: result.isScam,
            confidence: result.confidence,
            type: result.scamType
        });

        return result;
    }

    // fallback to pattern only
    return patternResult;
}

// quick check if message is definitely safe
function isDefinitelySafe(text) {
    const result = patternBasedDetection(text);
    return result.confidence < 0.1;
}

module.exports = {
    analyze,
    patternBasedDetection,
    aiBasedDetection,
    isDefinitelySafe
};
