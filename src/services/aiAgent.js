/*
 * AI Agent - the brain that generates believable responses
 * Uses Gemini to create human-like replies to scammers
 * 
 * The goal is to keep scammers engaged and extract more info
 * without them realizing theyre talking to a bot
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const logger = require('../utils/logger');
const { getAgentResponsePrompt, selectPersona, PERSONAS } = require('../config/prompts');
const sessionManager = require('./sessionManager');

let genAI = null;
let model = null;
let groq = null;

function initializeAI() {
    if (!genAI && process.env.GEMINI_API_KEY) {
        try {
            genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
            logger.info('Gemini AI Agent ready');
        } catch (e) {
            logger.error('Failed to init Gemini', { error: e.message });
        }
    }

    if (!groq && process.env.GROQ_API_KEY) {
        try {
            groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
            logger.info('Groq AI Fallback ready');
        } catch (e) {
            logger.error('Failed to init Groq', { error: e.message });
        }
    }
}

// backup responses when AI isnt working - made to look like real texts
// backup responses when AI isnt working - made to look like real texts
const FALLBACK_RESPONSES = {
    // 1. BANK ACCOUNT BLOCK / KYC / OTP (Merged category for banking issues)
    bank_fraud: [
        // Blocked Account
        "Wait what? blocked? I just used it yesterday 😟 what happened?",
        "Oh god… how do I stop it from getting blocked?",
        "Can you tell me what I need to do exactly?",
        "is this for real?? i rely on that account for everything",
        "shud i go to the branch? or can u help me here",

        // KYC
        "KYC? I thought it was already done last year",
        "Can you explain how to update it? I’m not very good with this",
        "Do I need to go to bank or is this online?",
        "is it mandatory? i dont want my account frozen",

        // OTP / Verification
        "OTP? I just got some message… where do I enter it?",
        "Is this normal? I’ve never done verification like this before",
        "Do I need to send it here or somewhere else?",
        "ok i see a code.. shud i share it with u?"
    ],

    // 2. UPI / PAYMENT REQUEST
    upi_fraud: [
        "Why payment? I thought verification was free?",
        "which app shud i use? GPay or PhonePe?",
        "Can you send UPI again properly? it failed last time",
        "im confused.. do i pay u or u pay me?",
        "ok wait let me check balance first..",
        "whats the steps? guide me pls"
    ],

    // 3. LINKS / PHISHING
    phishing: [
        "What is this link for? looks kinda weird",
        "It’s asking for details… is this safe?",
        "Should I open it now? im using mobile data",
        "it says warning.. are u sure its correct link?",
        "ok clicking it.. wait its loading slow",
        "do i need to login there?"
    ],

    // 4. LOTTERY / PRIZE (Keep existing)
    lottery: [
        "OMG really?? ive never won anythng before! How do i claim it",
        "This is amazng!! wat do i need to do?",
        "Wow is this real?? tell me more pls!",
        "i cant believe it!! whats the next step",
        "omg omg this is so exciting!! how do i get my prize"
    ],

    // 5. OTHER / GENERIC
    other: [
        "im a bit busy right now but tell me more",
        "i dont understand.. can u explain simply",
        "who is this exactly?",
        "is this urgent? shud i call u?",
        "ok.. what next?"
    ]
};

// pick a random fallback
function getFallbackResponse(scamType) {
    const responses = FALLBACK_RESPONSES[scamType] || FALLBACK_RESPONSES.other;
    return responses[Math.floor(Math.random() * responses.length)];
}

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

// ============================================================================
// MAIN HANDLER: ORCHESTRATES LLM CALLS
// Strategy: Try Gemini -> Catch Error -> Try Groq -> Catch Error -> Template
// ============================================================================
async function generateResponse(session, message, metadata = {}) {
    initializeAI();

    // 1. SELECT PERSONA
    const persona = session.persona
        ? PERSONAS[Object.keys(PERSONAS).find(k => PERSONAS[k].name === session.persona)]
        : selectPersona(session.scamType || 'other');

    if (!session.persona) {
        sessionManager.setScamDetected(session.sessionId, session.scamDetected, session.scamType, persona.name);
    }

    const systemPrompt = buildSystemPrompt(persona, session.scamType);
    let rawResponse = null;
    let providerUsed = 'none';

    // 2. TRY PRIMARY (GEMINI)
    if (model) {
        try {
            rawResponse = await callGeminiProvider(model, session.conversationHistory, message.text, systemPrompt);
            providerUsed = 'gemini';
        } catch (err) {
            logger.warn('Gemini failed, switching to fallback', { error: err.message });
        }
    }

    // 3. TRY SECONDARY (GROQ) IF GEMINI FAILED
    if (!rawResponse && groq) {
        try {
            rawResponse = await callGroqProvider(groq, session.conversationHistory, message.text, systemPrompt);
            providerUsed = 'groq';
        } catch (err) {
            logger.warn('Groq failed, switching to template', { error: err.message });
        }
    }

    // 4. FALLBACK TO TEMPLATE IF ALL AI FAILED
    if (!rawResponse) {
        logger.error('All AI providers failed. Using static fallback.');
        const fallback = getFallbackResponse(session.scamType || 'other');
        // add delay to fallback too so it feels real
        return fallback;
    }

    // 5. POST-PROCESSING (Clean & Humanize)
    let finalResponse = cleanAIOutput(rawResponse);

    // Check for character break
    if (hasBrokenCharacter(finalResponse)) {
        logger.warn(`AI (${providerUsed}) broke character. Using template.`);
        return getFallbackResponse(session.scamType || 'other');
    }

    // Add typos/lowercase
    finalResponse = humanizeResponse(finalResponse);

    logger.info('Response generated', { provider: providerUsed, length: finalResponse.length });
    return finalResponse;
}

// ----------------------------------------------------------------------------
// PROVIDER IMPLEMENTATIONS
// ----------------------------------------------------------------------------

async function callGeminiProvider(modelInstance, history, userMsg, systemMsg) {
    const chatHistory = buildGeminiHistory(history);

    const chat = modelInstance.startChat({
        history: chatHistory,
        generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 150, // Keep short for SMS
        },
        systemInstruction: systemMsg
    });

    const result = await chat.sendMessage(userMsg);
    return result.response.text();
}

async function callGroqProvider(groqInstance, history, userMsg, systemMsg) {
    const messages = buildGroqHistory(history, userMsg, systemMsg);

    const completion = await groqInstance.chat.completions.create({
        messages: messages,
        model: "llama-3.3-70b-versatile", // Fast & Good
        temperature: 0.9,
        max_tokens: 150,
        top_p: 1,
        stop: null,
        stream: false
    });

    return completion.choices[0]?.message?.content || "";
}

// ----------------------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------------------

function cleanAIOutput(text) {
    if (!text) return "";
    let clean = text.trim();
    // Remove quotes
    if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
        clean = clean.slice(1, -1);
    }
    // Remove prefixes like "Agent:" or "Reply:"
    clean = clean.replace(/^(Agent|Bot|Response|Reply):/i, "").trim();
    return clean;
}

function hasBrokenCharacter(text) {
    const badPhrases = [
        'as an ai', 'i am an ai', 'language model', 'i\'m a bot',
        'i cannot', 'i\'m not able', 'this is a scam', 'honeypot'
    ];
    return badPhrases.some(p => text.toLowerCase().includes(p));
}

// builds the system prompt ...
function buildSystemPrompt(persona, scamType) {
    return `You are roleplaying as "${persona.name}". ${persona.description}

CRITICAL RULES - FOLLOW EXACTLY:
1. You are a REAL PERSON chatting on WhatsApp/SMS. Act like it.
2. Keep responses SHORT (1-2 sentences max). Nobody writes paragraphs in chat.
3. Use casual language. Abbreviate words like "u" "ur" "pls" "thx" "wat" sometimes.
4. Show genuine interest/confusion/excitement depending on what they say.
5. NEVER mention AI, bots, scams, honeypot, or detection. You know NOTHING about those.
6. NEVER start with "Hi" or greetings in follow-up messages.
7. NEVER repeat what you already said. Read the chat history.
8. If they ask for money, act confused but curious (e.g., "where do i send?").
9. Match their language style.
10. You can make small typos.

Your personality traits: ${persona.traits.join(', ')}

Goal: Keep them talking so they reveal details (UPI, phone, links).`;
}

// Gemini Format: role='user'|'model'
function buildGeminiHistory(history) {
    if (!history || history.length === 0) return [];
    const geminiHistory = [];
    for (const msg of history) {
        // Skip system/internal messages if any
        if (!msg.text) continue;
        const role = msg.sender === 'agent' ? 'model' : 'user';
        geminiHistory.push({ role, parts: [{ text: msg.text }] });
    }
    return geminiHistory;
}

// Groq/OpenAI Format: role='user'|'assistant'|'system'
function buildGroqHistory(history, currentMsg, systemMsg) {
    const messages = [
        { role: "system", content: systemMsg }
    ];

    if (history && history.length > 0) {
        for (const msg of history) {
            const role = msg.sender === 'agent' ? 'assistant' : 'user';
            messages.push({ role, content: msg.text });
        }
    }

    messages.push({ role: "user", content: currentMsg });
    return messages;
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
