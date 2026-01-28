
const aiAgent = require('../src/services/aiAgent');
const logger = require('../src/utils/logger');

// Mock logger to avoid clutter
logger.info = console.log;
logger.warn = console.warn;
logger.error = console.error;

async function testFallback() {
    console.log('--- STARTING FALLBACK TEST ---');

    // 1. Simulate environment where AI fails (invalid keys)
    process.env.GEMINI_API_KEY = 'invalid_key';
    process.env.GROQ_API_KEY = 'invalid_key';

    const mockSession = {
        sessionId: 'test-fallback-01',
        scamType: 'lottery',
        conversationHistory: [],
        scamDetected: true
    };

    const mockMessage = { text: "Hello I won lottery" };

    console.log('Testing generateResponse with INVALID keys...');
    const response = await aiAgent.generateResponse(mockSession, mockMessage);

    console.log('Response received:', response);

    if (response && response.length > 0) {
        console.log('PASS: Received a fallback response even when AI failed.');
    } else {
        console.error('FAIL: Received empty response.');
    }
}

testFallback();
