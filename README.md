# 🍯 Agentic Honeypot - AI Scam Detection System

> Built for GUVI Hackathon | Detects scams, engages fraudsters, extracts intel

## What This Does

This is an **AI-powered honeypot** that catches online scammers. When someone sends a fraudulent message (like "you won lottery!" or "verify your UPI now"), the system:

1. **Detects** the scam using pattern matching + Google Gemini AI
2. **Engages** the scammer with believable human-like responses  
3. **Extracts** actionable intelligence (UPI IDs, phone numbers, bank accounts, phishing links)
4. **Reports** everything to the GUVI evaluation endpoint

The AI pretends to be a naive victim to keep scammers talking and reveal more info.

---

## Quick Start

### Prerequisites

- **Node.js v18+** - [Download here](https://nodejs.org/)
- **Gemini API Key** (free) - [Get it here](https://aistudio.google.com/app/apikey)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure your API key
#    Edit .env file and add your GEMINI_API_KEY

# 3. Start the server
npm run dev
```

Server runs at `http://localhost:3000`

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     INCOMING SCAM MESSAGE                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: SCAM DETECTION                                         │
│  ├── Pattern matching (fast, checks for UPI/URLs/keywords)      │
│  └── Gemini AI analysis (smart, catches subtle scams)           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: INTELLIGENCE EXTRACTION                                │
│  ├── UPI IDs (regex: name@upi)                                  │
│  ├── Phone numbers (Indian format: +91/91/0 + 10 digits)        │
│  ├── Bank account numbers (9-18 digits)                         │
│  └── Phishing URLs (bit.ly, suspicious domains, etc.)           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: AI AGENT RESPONSE                                      │
│  ├── Selects persona (Naive User / Elderly / Buyer)             │
│  ├── Generates human-like response via Gemini                   │
│  ├── Adds typos & text speak to look real                       │
│  └── Returns response with realistic typing delay               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: CALLBACK TO GUVI                                       │
│  └── Sends extracted intel when enough data collected           │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Reference

### Main Endpoint

**POST** `/api/honeypot`

Headers:
```
x-api-key: YOUR_SECRET_API_KEY
Content-Type: application/json
```

Request Body:
```json
{
  "sessionId": "session-123",
  "message": {
    "sender": "scammer",
    "text": "Congrats! You won Rs.50000 lottery. Send Rs.500 to claim. UPI: winner@paytm",
    "timestamp": "2024-01-28T10:00:00Z"
  },
  "conversationHistory": []
}
```

Response:
```json
{
  "status": "success",
  "scamDetected": true,
  "agentResponse": "omg really?? i never won anything b4!! wat do i do??",
  "engagementMetrics": {
    "engagementDurationSeconds": 5,
    "totalMessagesExchanged": 2
  },
  "extractedIntelligence": {
    "upiIds": ["winner@paytm"],
    "phoneNumbers": [],
    "bankAccounts": [],
    "phishingLinks": []
  },
  "agentNotes": "Scam type: lottery. Used Naive User persona. Got 1 UPI ID(s)."
}
```

### Other Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/honeypot/health` | GET | Health check |
| `/api/honeypot/session/:id` | GET | Get session details |
| `/api/honeypot/evidence` | GET | Get all collected evidence |
| `/health` | GET | Basic server health |

---

## Project Structure

```
fraud-ai-honeypot/
├── src/
│   ├── index.js                 # Express server setup
│   ├── config/
│   │   └── prompts.js           # AI personas & prompt templates
│   ├── middleware/
│   │   └── auth.js              # API key authentication
│   ├── routes/
│   │   └── honeypot.js          # Main API routes
│   ├── services/
│   │   ├── aiAgent.js           # Response generation (Gemini)
│   │   ├── scamDetector.js      # Scam detection logic
│   │   ├── intelligenceExtractor.js  # Regex intel extraction
│   │   ├── sessionManager.js    # Conversation state
│   │   ├── guviCallback.js      # GUVI API reporting
│   │   └── evidenceStore.js     # Persistent storage
│   └── utils/
│       └── logger.js            # Logging utility
├── frontend/
│   └── index.html               # Web dashboard for testing
├── data/
│   └── evidence.json            # Stored evidence
├── .env                         # Your API keys (don't commit!)
└── package.json
```

---

## Configuration

Edit `.env` file:

```env
# Your secret API key for authenticating requests
API_SECRET_KEY=your-secret-key-here

# Google Gemini API key (get free from Google AI Studio)  
GEMINI_API_KEY=your-gemini-key-here

# Server port
PORT=3000

# GUVI callback URL (for hackathon submission)
GUVI_CALLBACK_URL=https://hackathon.guvi.in/api/updateHoneyPotFinalResult
```

---

## Testing

### Using cURL

```bash
curl -X POST http://localhost:3000/api/honeypot \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_SECRET_API_KEY" \
  -d '{
    "sessionId": "test-001",
    "message": {
      "sender": "scammer",
      "text": "Your account is blocked! Send OTP to 9876543210 or visit http://bank-verify.xyz",
      "timestamp": "2024-01-28T10:00:00Z"
    },
    "conversationHistory": []
  }'
```

### Using Web Dashboard

Open `frontend/index.html` in browser - it connects to the local API and lets you test conversations interactively.

---

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **AI**: Google Gemini 2.0 Flash
- **HTTP Client**: Axios
- **Storage**: JSON file (for hackathon, would use DB in prod)

---

## Features

-  Dual detection (pattern + AI)
-  Multi-turn conversation handling
-  Human-like responses with typos/abbreviations
-  Multiple personas (Naive, Elderly, Buyer)
-  Auto-stops when enough intel extracted
-  GUVI callback integration
-  Evidence persistence
-  Pretty web dashboard

---

## License

MIT - do whatever you want with it!
