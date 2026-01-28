/*
 * Intelligence extractor - pulls out the "good stuff" from scam texts.
 * We use regex to hunt for UPI IDs, phone numbers, bank accounts, URLs, etc.
 * 
 * These regex patterns took a lot of late-night trial and error to nail down!
 */

const logger = require('../utils/logger');

// Regex patterns - custom tuned for common Indian scam formats
const PATTERNS = {
    // Looks for things like "payment@upi" or "rahul@okicici"
    UPI: /[a-zA-Z0-9._-]+@[a-zA-Z]{2,}/g,

    // Indian numbers: might start with +91, 91, or 0, usually 10 digits
    PHONE: /(?:\+91|91|0)?[6-9]\d{9}/g,

    // Bank accounts vary, but 9-18 digits is the sweet spot
    BANK_ACCOUNT: /\b\d{9,18}\b/g,

    // Any link starting with http or https
    URL: /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi,

    // Sketchy shorteners that scammers love to use to hide their real links
    SUSPICIOUS_URL: /(?:bit\.ly|tinyurl|goo\.gl|t\.co|is\.gd|v\.gd|short\.link|rebrand\.ly)\/[a-zA-Z0-9]+/gi
};

// keywords that scammers often use
const SUSPICIOUS_KEYWORDS = {
    urgency: ['urgent', 'immediately', 'now', 'hurry', 'limited time', 'expires', 'act now', 'quick'],
    money: ['pay', 'payment', 'transfer', 'send money', 'rupees', 'rs', '₹', 'cash', 'amount'],
    prizes: ['won', 'winner', 'lottery', 'prize', 'reward', 'cashback', 'bonus', 'lucky', 'jackpot'],
    security: ['otp', 'pin', 'password', 'verify', 'blocked', 'suspended', 'kyc', 'update', 'security'],
    offers: ['free', 'discount', 'offer', 'deal', 'scheme', 'investment', 'returns', 'profit', 'guaranteed'],
    banking: ['account', 'bank', 'credit', 'debit', 'card', 'upi', 'paytm', 'phonepe', 'gpay']
};

// main function - extracts all intel from a message
function extract(text) {
    if (!text || typeof text !== 'string') {
        return {
            bankAccounts: [],
            upiIds: [],
            phishingLinks: [],
            phoneNumbers: [],
            suspiciousKeywords: []
        };
    }

    const result = {
        bankAccounts: extractBankAccounts(text),
        upiIds: extractUpiIds(text),
        phishingLinks: extractPhishingLinks(text),
        phoneNumbers: extractPhoneNumbers(text),
        suspiciousKeywords: extractSuspiciousKeywords(text)
    };

    logger.debug('Extracted intel', {
        upiIds: result.upiIds.length,
        phones: result.phoneNumbers.length,
        links: result.phishingLinks.length
    });

    return result;
}

// find UPI IDs but filter out email addresses
function extractUpiIds(text) {
    const matches = text.match(PATTERNS.UPI) || [];

    // these are email domains, not UPI
    const emailDomains = ['gmail', 'yahoo', 'hotmail', 'outlook', 'email', 'mail'];

    return matches.filter(match => {
        const domain = match.split('@')[1]?.toLowerCase();
        return !emailDomains.some(ed => domain?.includes(ed));
    });
}

// extract phone numbers and normalize them
function extractPhoneNumbers(text) {
    const matches = text.match(PATTERNS.PHONE) || [];

    // strip prefixes and keep just 10 digits
    return matches.map(phone => {
        return phone.replace(/^\+91|^91|^0/, '');
    }).filter(phone => phone.length === 10);
}

// find bank account numbers
function extractBankAccounts(text) {
    const matches = text.match(PATTERNS.BANK_ACCOUNT) || [];

    // filter out stuff that looks like phone numbers or dates
    return matches.filter(acc => {
        if (acc.length === 10 && /^[6-9]/.test(acc)) return false; // phone number
        if (acc.length === 8 && /^[0-3]\d[0-1]\d\d{4}$/.test(acc)) return false; // date
        return true;
    });
}

// find URLs that look suspicious
function extractPhishingLinks(text) {
    const allUrls = text.match(PATTERNS.URL) || [];
    const suspiciousShortUrls = text.match(PATTERNS.SUSPICIOUS_URL) || [];

    const suspiciousSet = new Set(suspiciousShortUrls);

    // check if other urls have sketchy patterns
    allUrls.forEach(url => {
        const isSuspicious =
            /https?:\/\/\d+\.\d+\.\d+\.\d+/.test(url) || // IP address
            /bank|verify|update|secure|login|account|confirm/i.test(url) || // sketchy keywords
            /\.(xyz|tk|ml|ga|cf|gq|top|buzz)$/i.test(url) || // sketchy TLDs
            url.includes('@'); // credential injection

        if (isSuspicious) {
            suspiciousSet.add(url);
        }
    });

    return Array.from(suspiciousSet);
}

// find suspicious keywords
function extractSuspiciousKeywords(text) {
    const lowerText = text.toLowerCase();
    const found = new Set();

    for (const [category, keywords] of Object.entries(SUSPICIOUS_KEYWORDS)) {
        for (const keyword of keywords) {
            if (lowerText.includes(keyword.toLowerCase())) {
                found.add(keyword);
            }
        }
    }

    return Array.from(found);
}

// calculate a scam score based on what we found
function getScamScore(text) {
    const intel = extract(text);

    let score = 0;
    const breakdown = {};

    // assign points for different findings
    if (intel.upiIds.length > 0) {
        score += 30;
        breakdown.upiIds = 30;
    }
    if (intel.phoneNumbers.length > 0) {
        score += 15;
        breakdown.phoneNumbers = 15;
    }
    if (intel.phishingLinks.length > 0) {
        score += 40;
        breakdown.phishingLinks = 40;
    }
    if (intel.suspiciousKeywords.length > 0) {
        score += Math.min(intel.suspiciousKeywords.length * 5, 30);
        breakdown.keywords = Math.min(intel.suspiciousKeywords.length * 5, 30);
    }

    return {
        score: Math.min(score, 100),
        breakdown,
        intelligence: intel
    };
}

module.exports = {
    extract,
    extractUpiIds,
    extractPhoneNumbers,
    extractBankAccounts,
    extractPhishingLinks,
    extractSuspiciousKeywords,
    getScamScore,
    PATTERNS,
    SUSPICIOUS_KEYWORDS
};
