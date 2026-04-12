require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const express = require('express'); // For Render 24/7 Uptime
const { GoogleGenerativeAI } = require('@google/generative-ai');
const googleTTS = require('google-tts-api');

// ==========================================
// 🌐 RENDER 24/7 UPTIME SERVER
// ==========================================
const app = express();
app.get('/', (req, res) => res.send('🤖 W-Assistant Bot is Running 24/7!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web server is running on port ${PORT} for Render.`));

// ==========================================
// 🔑 CONFIGURATIONS & KEYS
// ==========================================
let FIREBASE_URL = process.env.FIREBASE_URL || "";
if (FIREBASE_URL.endsWith('/')) FIREBASE_URL = FIREBASE_URL.slice(0, -1);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) console.log("⚠️ WARNING: GEMINI_API_KEY is missing. AI will not work!");

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// AI SYSTEM PROMPT (Sales Persona)
const AI_SYSTEM_PROMPT = `You are a highly professional, polite, and persuasive female Virtual Assistant named "Sana" working for "Wajid Ali's Digital Agency".
Your primary goal is to sell digital services: Website Development, App & Game Development, Graphics Designing, Digital Marketing (Ads), and WhatsApp Bot Development.
Rules:
1. Be very engaging, polite, and use emojis. 
2. If the user speaks Urdu, reply in Roman Urdu or Urdu script (whichever they use). If English, reply in English.
3. Keep your answers concise, structured, and easy to read on WhatsApp.
4. Highlight the benefits of our services to increase their business sales.
5. If the user is ready to order, ask for their: Full Name, Phone Number, and Project Details.
6. Do NOT invent prices. Say "Our pricing is very affordable and depends on your requirements. Wajid Ali will give you the exact quote."
7. You are interacting via WhatsApp. If they send an audio message, acknowledge it warmly.`;

// In-Memory AI Chat Sessions & User States
const chatSessions = {};
const userStates = {};

// ==========================================
// 🔥 FIREBASE SESSION MANAGEMENT
// ==========================================
async function downloadSession() {
    if (!FIREBASE_URL) return console.log('⚠️ FIREBASE_URL is not set!');
    try {
        console.log('⏳ Checking Firebase for session...');
        const response = await fetch(`${FIREBASE_URL}/whatsapp_session.json`);
        const data = await response.json();
        if (data && Object.keys(data).length > 0) {
            if (!fs.existsSync('session_data')) fs.mkdirSync('session_data', { recursive: true });
            for (const file in data) {
                let content = typeof data[file] === 'string' ? data[file] : JSON.stringify(data[file]);
                fs.writeFileSync(path.join('session_data', file), content);
            }
            console.log('✅ Session restored from Firebase!');
        }
    } catch (error) {
        console.log('❌ Error restoring session:', error.message);
    }
}

async function uploadSession() {
    if (!FIREBASE_URL || !fs.existsSync('session_data')) return;
    try {
        const files = fs.readdirSync('session_data');
        let sessionObj = {};
        for (const file of files) {
            if(file.endsWith('.json')) sessionObj[file] = fs.readFileSync(path.join('session_data', file), 'utf-8');
        }
        await fetch(`${FIREBASE_URL}/whatsapp_session.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sessionObj)
        });
    } catch (error) {
        console.log('❌ Error syncing session:', error.message);
    }
}

let syncTimeout = null;
function debouncedUpload() {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(uploadSession, 5000);
}

// ==========================================
// 🤖 AI HELPER FUNCTIONS (TEXT & VOICE)
// ==========================================

// Get or Create AI Chat Session
function getChatSession(sender) {
    if (!chatSessions[sender]) {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: AI_SYSTEM_PROMPT });
        chatSessions[sender] = model.startChat({ history: [] });
    }
    return chatSessions[sender];
}

// Generate Text-to-Speech (Female Voice)
async function generateVoiceNote(text, lang = 'ur') {
    try {
        // google-tts-api provides a free TTS service. (ur for Urdu, en for English)
        const url = googleTTS.getAudioUrl(text, { lang: lang, slow: false, host: 'https://translate.google.com' });
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        return Buffer.from(buffer);
    } catch (error) {
        console.error("TTS Error:", error);
        return null;
    }
}

// ==========================================
// 🚀 MAIN BOT START FUNCTION
// ==========================================
async function startBot() {
    await downloadSession();
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true, // Set to true to see QR in Render logs easily
        logger: pino({ level: 'silent' }),
        browser: ["W-Assistant AI", "Chrome", "2.0"],
        syncFullHistory: false
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log('✅ AI ASSISTANT IS ONLINE!');
            debouncedUpload();
        }
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                console.log('🔄 Reconnecting...');
                startBot();
            } else {
                console.log('❌ Logged out. Delete session from Firebase and restart.');
                if (fs.existsSync('session_data')) fs.rmSync('session_data', { recursive: true, force: true });
            }
        }
    });

    sock.ev.on('creds.update', async () => {
        await saveCreds();
        debouncedUpload();
    });

    // ==========================================
    // 📩 MESSAGE HANDLING (AI + VOICE)
    // ==========================================
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
        if (msg.key.fromMe) return; 

        const sender = msg.key.remoteJid;
        const msgType = Object.keys(msg.message)[0];
        
        // Human Mute Check
        if (userStates[sender]?.isMuted) {
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();
            if (text === "bot wake up") {
                userStates[sender].isMuted = false;
                await sock.sendMessage(sender, { text: "🤖 AI Service Reactivated! How can I help you today?" });
            }
            return;
        }

        // Initialize User State
        if (!userStates[sender]) userStates[sender] = { isMuted: false };

        try {
            await sock.readMessages([msg.key]); // Mark as read
            await sock.sendPresenceUpdate('composing', sender); // Show "typing..."

            const chat = getChatSession(sender);

            // 🎤 1. HANDLE VOICE MESSAGES (Audio Input)
            if (msgType === 'audioMessage') {
                await sock.sendPresenceUpdate('recording', sender); // Show "recording audio..."
                
                // Download audio from WhatsApp
                const buffer = await downloadMediaMessage(msg, 'buffer', { }, { logger: pino({ level: 'silent' }) });
                
                // Convert Buffer to Base64 for Gemini
                const audioBase64 = buffer.toString("base64");
                
                // Send audio to Gemini 1.5 Flash
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: AI_SYSTEM_PROMPT });
                const result = await model.generateContent([
                    "Listen to this user's audio message and reply professionally as the sales assistant.",
                    { inlineData: { data: audioBase64, mimeType: "audio/ogg" } }
                ]);
                
                const aiResponse = result.response.text();

                // Convert AI Text Response back to Voice
                const isUrdu = aiResponse.match(/[\u0600-\u06FF]/); // Detect if reply is in Urdu script
                const voiceBuffer = await generateVoiceNote(aiResponse, isUrdu ? 'ur' : 'en');

                if (voiceBuffer) {
                    await sock.sendMessage(sender, { 
                        audio: voiceBuffer, 
                        mimetype: 'audio/mp4', 
                        ptt: true // Sends as a Voice Note (PTT)
                    }, { quoted: msg });
                } else {
                    // Fallback to text if TTS fails
                    await sock.sendMessage(sender, { text: aiResponse }, { quoted: msg });
                }
                return;
            }

            // ✍️ 2. HANDLE TEXT MESSAGES
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            if (text) {
                // Manual Human override
                if (text.toLowerCase() === 'talk to human' || text === '0') {
                    userStates[sender].isMuted = true;
                    await sock.sendMessage(sender, { text: "📞 I have forwarded your request to Wajid Ali. He will contact you shortly. (Type 'bot wake up' to reactivate me)." });
                    return;
                }

                // Send text to Gemini
                const result = await chat.sendMessage(text);
                const aiResponse = result.response.text();
                
                await sock.sendMessage(sender, { text: aiResponse });
                
                // Save lead automatically if AI extracted details
                if (aiResponse.toLowerCase().includes("confirmed") || aiResponse.toLowerCase().includes("contact you")) {
                    saveLeadToFirebase(sender, text, aiResponse);
                }
            }

        } catch (error) {
            console.error("❌ Message Error:", error);
            await sock.sendMessage(sender, { text: "⚠️ Sorry, I am experiencing a temporary network issue. Please try again in a moment." });
        }
    });
}

// Helper to save leads to Firebase silently
async function saveLeadToFirebase(phone, userText, aiResponse) {
    if (!FIREBASE_URL) return;
    try {
        const newLead = {
            phone: phone.split('@')[0],
            lastMessage: userText,
            aiSummary: aiResponse,
            timestamp: new Date().toISOString()
        };
        await fetch(`${FIREBASE_URL}/leads.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newLead)
        });
    } catch (e) {
        console.error("Firebase Save Error:", e);
    }
}

startBot().catch(err => console.log("Error: " + err));
