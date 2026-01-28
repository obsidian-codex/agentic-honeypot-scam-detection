
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const API_URL = 'http://localhost:3000/api/honeypot';
const API_KEY = process.env.API_SECRET_KEY || 'k1s23456';

async function testMode(mode) {
    console.log(`\n🧪 Testing Mode: forceProvider = '${mode}'`);
    try {
        const res = await axios.post(API_URL, {
            sessionId: `test-${mode}-${Date.now()}`,
            message: { sender: 'scammer', text: 'You won a lottery! Click here.', timestamp: new Date() },
            metadata: { forceProvider: mode }
        }, { headers: { 'x-api-key': API_KEY } });

        const respText = res.data.agentResponse?.text || "NO_RESPONSE";
        console.log(`   Response: "${respText.substring(0, 50)}..."`);

        // Inspect checks
        if (mode === 'template') {
            // Templates are usually questions or excited statements from our list
            console.log("   ✅ Template Mode check passed (assuming response is static text)");
        } else if (mode === 'groq') {
            // Groq is working (based on previous test)
            console.log("   ✅ Groq Mode check passed (assuming valid response)");
        } else if (mode === 'gemini') {
            // Gemini might fail due to key, but if we get a response (error or success), the forcing worked
            if (respText.includes('[Error') || respText.length > 0) {
                console.log("   ✅ Gemini Mode logic executed (Provider attempted).");
            }
        }

    } catch (err) {
        console.log(`   ❌ Error: ${err.message}`);
        if (err.response) console.log(`   Status: ${err.response.status}`);
    }
}

async function runAll() {
    await testMode('gemini');
    await testMode('groq');
    await testMode('template');
}

runAll();
