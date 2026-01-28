const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

const EVIDENCE_FILE = path.join(__dirname, '../../data/evidence.json');

// evidence store - basically a way to keep all the caught scammer info forever
// in a json file so we dont lose it if the server restarts
class EvidenceStore {
    constructor() {
        this.cache = {
            sessions: {},
            masterIntel: {
                upiIds: [],
                phoneNumbers: [],
                bankAccounts: [],
                phishingLinks: [],
                suspiciousKeywords: []
            },
            totalScamsDetected: 0
        };
        this.init();
    }

    // load up everything from the disk when the app starts
    async init() {
        try {
            const data = await fs.readFile(EVIDENCE_FILE, 'utf8');
            this.cache = JSON.parse(data);
            logger.info('Evidence store initialized from disk');
        } catch (err) {
            if (err.code === 'ENOENT') {
                // first time running? just save the empty template
                logger.info('Evidence file not found, starting fresh');
                await this.save();
            } else {
                logger.error('Failed to init evidence store', { error: err.message });
            }
        }
    }

    // dump the session data into our persistent log
    async logSession(session) {
        if (!session || !session.sessionId) return;

        // update this specific session
        this.cache.sessions[session.sessionId] = {
            ...session,
            lastUpdated: new Date().toISOString()
        };

        // also add to our "master list" of bad guys
        if (session.extractedIntelligence) {
            this.updateMasterIntel(session.extractedIntelligence);
        }

        // keep track of total count
        const scamSessions = Object.values(this.cache.sessions).filter(s => s.scamDetected);
        this.cache.totalScamsDetected = scamSessions.length;

        await this.save();
    }

    // merge new intel into the master vault without duplicates 
    // u guys wouldnt want the same upi id twice lol
    updateMasterIntel(newIntel) {
        for (const [key, values] of Object.entries(newIntel)) {
            if (Array.isArray(values) && Array.isArray(this.cache.masterIntel[key])) {
                const combined = new Set([...this.cache.masterIntel[key], ...values]);
                this.cache.masterIntel[key] = Array.from(combined);
            }
        }
    }

    // actually write to the disk
    async save() {
        try {
            await fs.writeFile(EVIDENCE_FILE, JSON.stringify(this.cache, null, 2), 'utf8');
            logger.debug('Evidence saved to disk');
        } catch (err) {
            logger.error('Failed to save evidence', { error: err.message });
        }
    }

    getEvidence() {
        return this.cache;
    }
}

module.exports = new EvidenceStore();
