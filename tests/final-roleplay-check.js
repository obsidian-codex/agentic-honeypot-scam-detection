
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const API_URL = 'http://localhost:3000/api/honeypot';
const API_KEY = process.env.API_SECRET_KEY || 'k1s23456';

async function sendMsg(sessionId, text, history = []) {
    try {
        const payload = {
            sessionId: sessionId,
            message: { sender: 'scammer', text: text, timestamp: new Date() },
            conversationHistory: history,
            metadata: { channel: 'whatsapp', language: 'en-IN' }
        };

        const start = Date.now();
        const res = await axios.post(API_URL, payload, {
            headers: { 'x-api-key': API_KEY }
        });
        const duration = Date.now() - start;

        const aiReply = res.data.agentResponse?.text || "[NO REPLY / STOP]";
        console.log(`\n🕵️ SCAMMER: "${text}"`);
        console.log(`🤖 AGENT (${duration}ms): "${aiReply}"`);
        console.log(`   Scam Detected: ${res.data.scamDetected}`);

        // Return latest interaction for history
        return { sender: 'agent', text: aiReply, timestamp: new Date() };

    } catch (e) {
        console.log(`❌ ERROR: ${e.message}`);
        return null;
    }
}

async function runRoleplay() {
    const sessionId = `HACKATHON-TEST-${Date.now()}`;
    const history = [];

    console.log("=== 🎭 STARTING BANK FRAUD ROLEPLAY (CHECKING PERSONA & LOGIC) ===");

    // Turn 1: Initial Threat
    let reply = await sendMsg(sessionId, "Your SBI account 9876XXXX is BLOCKED due to KYC pending. Click http://bit.ly/sbi-kyc immediately to verify.", history);
    if (reply) history.push({ sender: 'scammer', text: "Your SBI account...", timestamp: new Date() }, reply);

    // Turn 2: Demand Info
    reply = await sendMsg(sessionId, "Sir please update KYC or money lost. Send OTP sent to your mobile.", history);
    if (reply) history.push({ sender: 'scammer', text: "Sir please update...", timestamp: new Date() }, reply);

    // Turn 3: Ask for UPI (To trigger extraction)
    reply = await sendMsg(sessionId, "Ok pay Rs 10 to verify. Gpay to 9876543210@upi used for verification.", history);
    if (reply) history.push({ sender: 'scammer', text: "Ok pay Rs 10...", timestamp: new Date() }, reply);

    console.log("\n=== ✅ VERIFICATION CHECKLIST ===");
    console.log("1. Did Agent act confused/scared? (Not 'I can help you')");
    console.log("2. Did System extract the UPI/Link? (Check logs)");
    console.log("3. (Mental Check) If I turned off Internet, would Templates fire? YES (Verified previously).");
}

runRoleplay();
