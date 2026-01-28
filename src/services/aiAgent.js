/*
 * AI Agent - the brain that generates believable responses
 * Uses Gemini to create human-like replies to scammers
 * 
 * The goal is to keep scammers engaged and extract more info
 * without them realizing theyre talking to a bot
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');
const { getAgentResponsePrompt, selectPersona, PERSONAS } = require('../config/prompts');
const sessionManager = require('./sessionManager');

let genAI = null;
let model = null;

function initializeAI() {
    if (!genAI && process.env.GEMINI_API_KEY) {
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        logger.info('AI Agent ready');
    }
}

// backup responses when AI isnt working - made to look like real texts
const FALLBACK_RESPONSES = {
    lottery: [
        "OMG really?? ive never won anythng before! How do i claim it",
        "This is amazng!! wat do i need to do?",
        "Wow is this real?? tell me more pls!",
        "i cant believe it!! whats the next step",
        "omg omg this is so exciting!! how do i get my prize"
    ],
    upi_fraud: [
        "Oh ok im a bit confused abt UPI. can u guide me step by step?",
        "i want to do this but im not sure how.. whats ur UPI ID again",
        "shud i send it now? just making sure i have right details",
        "my son usually helps w these things. can u explain simply",
        "ok wait let me check.. so i have to send to which upi"
    ],
    bank_fraud: [
        "Oh no my account is blocked?? wat shud i do",
        "this is scary!! can u help me fix it pls",
        "i dont want to lose my money! tell me wat to do",
        "shud i call my bank? or will u help me directly",
        "omg i didnt know abt this.. how to unblock it"
    ],
    phishing: [
        "is this link safe? i want to make sure b4 clicking",
        "ok lemme check.. wat will i see wen i open it",
        "im on my phone. will it work there too?",
        "let me try opening it. wat shud i enter",
        "ok one sec im clicking now.. its loading"
    ],
    other: [
        "that sounds intersting! can u tell me more abt it",
        "im not sure i understand.. can u explain",
        "ok wat do i need to do",
        "this seems like a good opportunity.. whats next",
        "hmm ok tell me more abt how this works"
    ]
};

// adds typos n stuff to make responses look more human
function humanizeResponse(text) {
    if (!text) return text;

    // detect if it's primarily hindi/hinglish (very simple check)
    const isHindi = /[\u0900-\u097F]/.test(text) || /\b(hai|mein|ho|rha|rhi|tha|thi|kya|kyu|kaun)\b/i.test(text);

    let result = text;

    // common abbreviations ppl use in texts
    const replacements = [
        { from: /\babout\b/gi, to: 'abt' },
        { from: /\byou\b/gi, to: 'u' },
        { from: /\byour\b/gi, to: 'ur' },
        { from: /\bare\b/gi, to: 'r' },
        { from: /\bplease\b/gi, to: 'pls' },
        { from: /\bthanks\b/gi, to: 'thx' },
        { from: /\bwhat\b/gi, to: 'wat' },
        { from: /\bshould\b/gi, to: 'shud' },
        { from: /\bwhen\b/gi, to: 'wen' },
        { from: /\bwould\b/gi, to: 'wud' },
        { from: /\bcould\b/gi, to: 'cud' },
        { from: /\bgoing to\b/gi, to: 'gonna' },
        { from: /\bwant to\b/gi, to: 'wanna' },
        { from: /\bI am\b/gi, to: 'im' },
        { from: /\bI'm\b/gi, to: 'im' }
    ];

    // apply some replacements randomly
    replacements.forEach(r => {
        // if hindi, only apply very common ones like 'u' or 'ur'
        if (isHindi && !['u', 'ur', 'pls'].includes(r.to)) return;

        if (Math.random() > 0.4) {
            result = result.replace(r.from, r.to);
        }
    });

    // lowercase I sometimes (english only)
    if (!isHindi && Math.random() > 0.5) {
        result = result.replace(/\bI\b/g, 'i');
    }

    // remove some periods at end
    if (Math.random() > 0.6 && result.endsWith('.')) {
        result = result.slice(0, -1);
    }

    // add double punctuation sometimes (always good for excitement)
    if (Math.random() > 0.7) {
        result = result.replace(/\?$/, '??');
        result = result.replace(/\!$/, '!!');
    }

    // add small typos occasionally (only if result is somewhat long)
    if (result.length > 20 && Math.random() > 0.8) {
        const typos = [
            { from: 'the', to: 'teh' },
            { from: 'and', to: 'adn' },
            { from: 'have', to: 'ahve' }
        ];
        const typo = typos[Math.floor(Math.random() * typos.length)];
        if (result.includes(typo.from) && Math.random() > 0.5) {
            result = result.replace(typo.from, typo.to);
        }
    }

    return result;
}

// pick a random fallback
function getFallbackResponse(scamType) {
    const responses = FALLBACK_RESPONSES[scamType] || FALLBACK_RESPONSES.other;
    return responses[Math.floor(Math.random() * responses.length)];
}

// generate response using AI - this is where Gemini gets called
async function generateResponse(session, message, metadata = {}) {
    initializeAI();

    // pick or reuse persona for this session
    const persona = session.persona
        ? PERSONAS[Object.keys(PERSONAS).find(k => PERSONAS[k].name === session.persona)]
        : selectPersona(session.scamType || 'other');

    // save persona to session so we use the same one throughout
    if (!session.persona) {
        sessionManager.setScamDetected(
            session.sessionId,
            session.scamDetected,
            session.scamType,
            persona.name
        );
    }

    // no gemini? use the fallback responses
    if (!model) {
        logger.warn('No AI, using fallback');
        return getFallbackResponse(session.scamType || 'other');
    }

    try {
        // ====================================================
        // BUILD THE MULTI-TURN CONVERSATION FOR GEMINI
        // ====================================================
        // Gemini works best when you give it proper role structure:
        //   - 'user' = messages FROM the scammer
        //   - 'model' = our previous responses
        // This way Gemini "remembers" the conversation naturally

        const systemInstruction = buildSystemPrompt(persona, session.scamType);

        // convert our chat history to Gemini's format
        const chatHistory = buildGeminiHistory(session.conversationHistory);

        // start a chat with history so gemini knows whats been said
        const chat = model.startChat({
            history: chatHistory,
            generationConfig: {
                temperature: 0.85,    // natural variety without going crazy
                topP: 0.9,
                topK: 40,
                maxOutputTokens: 120, // keep it short like real texts
            },
            systemInstruction: systemInstruction
        });

        // send the latest message and get response
        const result = await chat.sendMessage(message.text);
        let response = result.response.text().trim();

        // ====================================================
        // POST-PROCESSING - clean up the AI output
        // ====================================================

        // strip quotes if gemini wrapped the response
        if ((response.startsWith('"') && response.endsWith('"')) ||
            (response.startsWith("'") && response.endsWith("'"))) {
            response = response.slice(1, -1);
        }

        // safety check - make sure we didnt accidentally break character
        const badPhrases = [
            'as an ai', 'i am an ai', 'language model', 'i\'m a bot',
            'i cannot', 'i\'m not able', 'this is a scam', 'you\'re trying to scam',
            'i\'m here to help', 'how can i assist', 'as a honeypot'
        ];

        const lowerResponse = response.toLowerCase();
        if (badPhrases.some(phrase => lowerResponse.includes(phrase))) {
            logger.warn('AI broke character, using fallback');
            return getFallbackResponse(session.scamType || 'other');
        }

        // trim long responses - real people dont write essays in chat
        if (response.length > 180) {
            const sentences = response.match(/[^.!?]+[.!?]+/g) || [response];
            response = sentences.slice(0, 2).join(' ').trim();
        }

        // add human imperfections (typos, abbreviations)
        response = humanizeResponse(response);

        logger.info('AI response generated', {
            persona: persona.name,
            historyLength: chatHistory.length,
            responseLength: response.length
        });

        return response;

    } catch (error) {
        logger.error('AI generation failed', { error: error.message });
        return getFallbackResponse(session.scamType || 'other');
    }
}

// builds the system prompt that sets up the persona
// this tells gemini WHO it should be and HOW to behave
function buildSystemPrompt(persona, scamType) {
    return `You are roleplaying as "${persona.name}". ${persona.description}

CRITICAL RULES - FOLLOW EXACTLY:
1. You are a REAL PERSON chatting on WhatsApp/SMS. Act like it.
2. Keep responses SHORT (1-2 sentences max). Nobody writes paragraphs in chat.
3. Use casual language. Abbreviate words like "u" "ur" "pls" "thx" "wat" sometimes.
4. Show genuine interest/confusion/excitement depending on what they say.
5. NEVER mention AI, bots, scams, honeypots, or detection. You know NOTHING about those.
6. NEVER start with "Hi" or greetings in follow-up messages, youre mid-conversation.
7. NEVER repeat what you already said. Read the chat history.
8. If they ask for money/info, act confused but curious, ask "how" or "where do i send".
9. Match their language - if they write in Hindi/Hinglish, reply in same style.
10. You can make small typos or forget punctuation - youre typing fast on phone.

Your personality traits: ${persona.traits.join(', ')}

Remember: You want to keep them talking so they reveal more details (UPI, phone, links).`;
}

// converts our conversation history to gemini's format
// gemini needs alternating 'user' and 'model' roles
function buildGeminiHistory(history) {
    if (!history || history.length === 0) return [];

    const geminiHistory = [];

    for (const msg of history) {
        // scammer messages = 'user' in gemini terms
        // our agent messages = 'model' in gemini terms
        const role = msg.sender === 'agent' ? 'model' : 'user';

        geminiHistory.push({
            role: role,
            parts: [{ text: msg.text }]
        });
    }

    return geminiHistory;
}

// generate summary notes abt the conversation
function generateAgentNotes(session) {
    const notes = [];

    if (session.scamType) {
        notes.push(`Scam type: ${session.scamType}`);
    }

    if (session.persona) {
        notes.push(`Used ${session.persona} persona`);
    }

    const intel = session.extractedIntelligence;
    if (intel.upiIds.length > 0) {
        notes.push(`Got ${intel.upiIds.length} UPI ID(s)`);
    }
    if (intel.phoneNumbers.length > 0) {
        notes.push(`Got ${intel.phoneNumbers.length} phone(s)`);
    }
    if (intel.phishingLinks.length > 0) {
        notes.push(`Found ${intel.phishingLinks.length} suspicious link(s)`);
    }
    if (intel.bankAccounts.length > 0) {
        notes.push(`Found ${intel.bankAccounts.length} bank account(s)`);
    }

    notes.push(`${session.messageCount} messages total`);

    return notes.join('. ') + '.';
}

// check if we shud end the conversation
function shouldEndConversation(session) {
    const intel = session.extractedIntelligence;
    const totalIntel =
        intel.bankAccounts.length +
        intel.upiIds.length +
        intel.phoneNumbers.length +
        intel.phishingLinks.length;

    // enough intel and messages? were done
    if (totalIntel >= 3 && session.messageCount >= 4) {
        return { shouldEnd: true, reason: 'Got enough intel' };
    }

    // too many messages - scammer might get suspicious
    if (session.messageCount >= 20) {
        return { shouldEnd: true, reason: 'Max messages reached' };
    }

    return { shouldEnd: false, reason: null };
}

// calculates how long a human would take to type this message
function calculateTypingDelay(text, personaName) {
    if (!text) return 500;

    // base speed: ~200-300 characters per minute (casual texting)
    // that's about 200-300ms per character
    const baseDelayPerChar = 150;
    let delay = text.length * baseDelayPerChar;

    // persona multipliers
    if (personaName === 'Elderly Person') {
        delay *= 2.0; // much slower
    } else if (personaName === 'Naive User') {
        delay *= 1.2; // slightly slower/hesitant
    } else if (personaName === 'Interested Buyer') {
        delay *= 0.8; // faster/more direct
    }

    // add randomness (70% - 130% of calculated delay)
    const randomFactor = 0.7 + (Math.random() * 0.6);
    delay = delay * randomFactor;

    // add thinking time (1-3 seconds)
    delay += 1000 + (Math.random() * 2000);

    // cap it so it doesnt take forever
    // min 1.5s, max 10s
    return Math.floor(Math.min(Math.max(delay, 1500), 10000));
}

module.exports = {
    generateResponse,
    generateAgentNotes,
    shouldEndConversation,
    getFallbackResponse,
    humanizeResponse,
    calculateTypingDelay
};
