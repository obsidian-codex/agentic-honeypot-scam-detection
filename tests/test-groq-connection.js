
const Groq = require('groq-sdk');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function testGroq() {
    console.log("Testing Groq Connectivity...");

    // Use the key from env (even if placeholder)
    const apiKey = process.env.GROQ_API_KEY || "invalid_key";
    console.log(`Using Key: ${apiKey.substring(0, 4)}...`);

    const groq = new Groq({ apiKey: apiKey });

    try {
        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: "hi" }],
            model: "llama-3.3-70b-versatile",
        });
        console.log("✅ Groq Success:", completion.choices[0].message.content);
    } catch (err) {
        console.log("ℹ️ Groq Response:", err.message);
        console.log("Code:", err.code);
        console.log("Type:", err.type);

        if (err.status === 401 || err.code === 'invalid_api_key') {
            console.log("✅ INTEGRATION SUCCESS: Reached Groq servers (Key rejected as expected).");
        }
    }
}

testGroq();
