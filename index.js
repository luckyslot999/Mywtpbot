require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios'); // نیا پیکج ElevenLabs کے لیے

// ==========================================
// 🌐 RENDER 24/7 UPTIME SERVER
// ==========================================
const app = express();
app.get('/', (req, res) => res.send('🤖 Wajid Ali Digital Agency AI is Running 24/7!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

// ==========================================
// 🔑 CONFIGURATIONS (Firebase, Gemini, ElevenLabs)
// ==========================================
let FIREBASE_URL = process.env.FIREBASE_URL || "";
if (FIREBASE_URL.endsWith('/')) FIREBASE_URL = FIREBASE_URL.slice(0, -1);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
// Default Voice ID if not provided in .env
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; 

const AI_PROMPT = `You are a highly conversational sales bot assistant for Wajid Ali's Digital Agency.
We offer: Website Dev, App Dev, Graphics, Ads, and WhatsApp Bots.
Rule 1: Answer naturally and politely. DO NOT mention you are an AI. Say you are Wajid's Bot Assistant.
Rule 2: Never give prices. Say Wajid Ali will quote the exact price.
Rule 3: Keep your response SHORT (under 180 characters).
Rule 4: Reply in the language the user speaks (English or Urdu).`;

const userStates = {}; 
const chatSessions = {};

// ==========================================
// 🔥 FIREBASE SESSION MANAGEMENT
// ==========================================
async function downloadSession() {
    if (!FIREBASE_URL) return;
    try {
        const response = await fetch(`${FIREBASE_URL}/whatsapp_session.json`);
        const data = await response.json();
        if (data && Object.keys(data).length > 0) {
            if (!fs.existsSync('session_data')) fs.mkdirSync('session_data', { recursive: true });
            for (const file in data) {
                let content = typeof data[file] === 'string' ? data[file] : JSON.stringify(data[file]);
                fs.writeFileSync(path.join('session_data', file), content);
            }
        }
    } catch (error) {}
}

async function uploadSession() {
    if (!FIREBASE_URL || !fs.existsSync('session_data')) return;
    try {
        const files = fs.readdirSync('session_data');
        let sessionObj = {};
        for (const file of files) {
            if(file.endsWith('.json')) sessionObj[file] = fs.readFileSync(path.join('session_data', file), 'utf-8');
        }
        await fetch(`${FIREBASE_URL}/whatsapp_session.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sessionObj) });
    } catch (error) {}
}

let syncTimeout = null;
function debouncedUpload() {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => { await uploadSession(); }, 5000);
}

// ==========================================
// 🌐 DICTIONARY (Text & Voice Scripts)
// ==========================================
const langText = {
    en: {
        welcomeMenu: `🌟 *Welcome to Wajid Ali's Digital Agency!* 🌟\n\nI am Wajid's Bot Assistant.\n👇 *Please type a number from below:*\n\n*1️⃣* View Our Premium Services 🚀\n*2️⃣* View Portfolios & Demos 🌐\n*3️⃣* Talk to Wajid Ali (Human) 👨‍💻\n*4️⃣* زبان تبدیل کریں (Urdu) 🇵🇰`,
        voiceIntro: "Welcome to Wajid Ali Digital Agency. I am Wajid's bot assistant. Reply 1 for services, 2 for demos, and 3 to talk to Wajid Ali.", 
        servicesMenu: `🚀 *Our Digital Services*\n👇 *Type the number of the service:*\n\n*1️⃣* Website Development 🌐\n*2️⃣* App Development 📱\n*3️⃣* Graphics Designing 🎨\n*4️⃣* Facebook/Google Ads 📢\n*5️⃣* WhatsApp Bot 🤖\n\n_👉 Type 0 to go back._`,
        allDemos: `✨ *Live Demos*\n🔗 https://friendspharma.shop/\n🔗 https://kmartonline.store/\n\n_👉 Type 0 for Menu._`,
        demos: {
            web: `🌐 *Website Development*\nLive Demos:\n👉 https://friendspharma.shop/\n👉 https://kmartonline.store/\n\n✅ Type *YES* to place order.\n🔙 Type *0* to go back.`,
            app: `📱 *App Development*\nHigh-performance apps.\n✅ Type *YES* to place order.\n🔙 Type *0* to go back.`,
            graphics: `🎨 *Graphics Designing*\nLogos, UI/UX, Posts.\n✅ Type *YES* to place order.\n🔙 Type *0* to go back.`,
            ads: `📢 *Ads & Marketing*\nBoost your sales.\n✅ Type *YES* to place order.\n🔙 Type *0* to go back.`,
            bot: `🤖 *WhatsApp Bots*\nAutomate your business.\n✅ Type *YES* to place order.\n🔙 Type *0* to go back.`
        },
        askDetails: `🎉 Let's start! Send in one message:\n👤 *1. Name*\n📞 *2. Phone Number*\n📝 *3. Project Details*`,
        orderConfirmed: `✅ *Order Confirmed!*\nWajid Ali will contact you shortly. 🌟`,
        humanMute: `📞 *Request Forwarded!*\nI have sent your messages to Wajid Ali. He will reply to you soon. (Type 'bot wake up' to activate me again)`,
        humanMuteVoice: "I have forwarded your request to Wajid Ali. He will contact you shortly."
    },
    ur: {
        welcomeMenu: `🌟 *واجد علی کی ڈیجیٹل ایجنسی میں خوش آمدید!* 🌟\n\nمیں واجد کا بوٹ اسسٹنٹ ہوں۔\n👇 *براہ کرم نیچے دیا گیا کوئی نمبر ٹائپ کریں:*\n\n*1️⃣* ہماری پریمیم سروسز دیکھیں 🚀\n*2️⃣* ڈیموز اور پورٹ فولیو دیکھیں 🌐\n*3️⃣* واجد علی سے بات کریں 👨‍💻\n*4️⃣* Change to English 🇬🇧`,
        voiceIntro: "واجد علی ڈیجیٹل ایجنسی میں خوش آمدید۔ میں واجد کا اسسٹنٹ بوٹ ہوں۔ سروسز کے لیے ایک، ڈیموز کے لیے دو، اور واجد علی سے بات کرنے کے لیے تین دبائیں۔", 
        servicesMenu: `🚀 *ہماری پریمیم سروسز*\n👇 *نمبر ٹائپ کر کے سینڈ کریں:*\n\n*1️⃣* ویب سائٹ ڈیویلپمنٹ 🌐\n*2️⃣* ایپ ڈیویلپمنٹ 📱\n*3️⃣* گرافکس ڈیزائننگ 🎨\n*4️⃣* فیس بک / گوگل ایڈز 📢\n*5️⃣* واٹس ایپ بوٹ 🤖\n\n_👉 پیچھے جانے کے لیے 0 ٹائپ کریں۔_`,
        allDemos: `✨ *ہمارے لائیو ڈیموز*\n🔗 https://friendspharma.shop/\n🔗 https://kmartonline.store/\n\n_👉 مین مینو کے لیے 0 ٹائپ کریں۔_`,
        demos: {
            web: `🌐 *ویب سائٹ ڈیویلپمنٹ*\nڈیموز:\n👉 https://friendspharma.shop/\n👉 https://kmartonline.store/\n\n✅ آرڈر کے لیے *YES* سینڈ کریں۔\n🔙 پیچھے جانے کے لیے *0* ٹائپ کریں۔`,
            app: `📱 *ایپ ڈیویلپمنٹ*\nبہترین موبائل ایپس۔\n✅ آرڈر کے لیے *YES* سینڈ کریں۔\n🔙 پیچھے جانے کے لیے *0* ٹائپ کریں۔`,
            graphics: `🎨 *گرافکس ڈیزائننگ*\nپروفیشنل لوگوز اور ڈیزائن۔\n✅ آرڈر کے لیے *YES* سینڈ کریں۔\n🔙 پیچھے جانے کے لیے *0* ٹائپ کریں۔`,
            ads: `📢 *مارکیٹنگ اور ایڈز*\nاپنی سیلز بڑھائیں۔\n✅ آرڈر کے لیے *YES* سینڈ کریں۔\n🔙 پیچھے جانے کے لیے *0* ٹائپ کریں۔`,
            bot: `🤖 *واٹس ایپ بوٹ*\nبزنس آٹومیٹ کریں۔\n✅ آرڈر کے لیے *YES* سینڈ کریں۔\n🔙 پیچھے جانے کے لیے *0* ٹائپ کریں۔`
        },
        askDetails: `🎉 ایک ہی میسج میں تفصیلات بھیجیں:\n👤 *1. آپ کا نام*\n📞 *2. فون نمبر*\n📝 *3. پروجیکٹ کی تفصیل*`,
        orderConfirmed: `✅ *آرڈر کنفرم!* واجد علی جلد رابطہ کریں گے۔ 🌟`,
        humanMute: `📞 *میسج بھیج دیا گیا!*\nمیں نے آپ کا میسج واجد علی کو بھیج دیا ہے۔ وہ جلد آپ سے رابطہ کریں گے۔ (بوٹ آن کرنے کے لیے 'bot wake up' لکھیں)`,
        humanMuteVoice: "میں نے آپ کا میسج واجد علی کو بھیج دیا ہے۔ وہ جلد ہی آپ سے رابطہ کریں گے۔"
    }
};

// ==========================================
// 🎤 ELEVENLABS VOICE GENERATOR & SENDER
// ==========================================
async function sendElevenLabsVoiceNote(sock, sender, text, quotedMsg = null) {
    if (!ELEVENLABS_API_KEY) {
        console.log("⚠️ ElevenLabs API Key is missing!");
        return;
    }

    try {
        // Calling ElevenLabs API
        const response = await axios({
            method: 'post',
            url: `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`,
            headers: {
                'Accept': 'audio/mpeg',
                'xi-api-key': ELEVENLABS_API_KEY,
                'Content-Type': 'application/json'
            },
            data: {
                text: text,
                model_id: "eleven_multilingual_v2", // Multilingual Model Supports Urdu & English
                voice_settings: { stability: 0.5, similarity_boost: 0.75 }
            },
            responseType: 'arraybuffer' // Getting Audio Data
        });

        const audioBuffer = Buffer.from(response.data);

        // Sending to WhatsApp as Voice Note (audio/mpeg works best with Baileys buffer)
        await sock.sendMessage(sender, { 
            audio: audioBuffer, 
            mimetype: 'audio/mpeg', 
            ptt: true // Shows as Voice Note 🎤
        }, quotedMsg ? { quoted: quotedMsg } : undefined);

    } catch (e) { 
        console.error("ElevenLabs TTS Error:", e.message);
    }
}

// ==========================================
// 🚀 BOT START
// ==========================================
async function startBot() {
    await downloadSession();

    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Desktop'), 
        syncFullHistory: false
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('\n🔄 NEW QR CODE GENERATED\n');
        }
        if (connection === 'open') {
            console.log('✅ WAJID ALI AI IS ONLINE WITH ELEVENLABS!');
            debouncedUpload();
        }
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) startBot();
            else {
                if (fs.existsSync('session_data')) fs.rmSync('session_data', { recursive: true, force: true });
                startBot();
            }
        }
    });

    sock.ev.on('creds.update', async () => {
        await saveCreds();
        debouncedUpload();
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const msgType = Object.keys(msg.message)[0];
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase().trim();
        const rawText = msg.message.conversation || msg.message.extendedTextMessage?.text || ""; 

        // 1️⃣ ANY FIRST MESSAGE HANDLER
        if (!userStates[sender]) {
            userStates[sender] = { step: 'WELCOME_MENU', lang: 'ur', isMuted: false, invalidAttempts: 0 };
            const lang = userStates[sender].lang;
            const t = langText[lang];
            
            await sock.sendMessage(sender, { text: t.welcomeMenu });
            await sendElevenLabsVoiceNote(sock, sender, t.voiceIntro);
            return;
        }

        const userState = userStates[sender];
        const lang = userState.lang;
        const t = langText[lang];

        // 🔇 IF BOT IS MUTED
        if (userState.isMuted) {
            if (text === "bot wake up") {
                userState.isMuted = false;
                userState.step = 'WELCOME_MENU';
                userState.invalidAttempts = 0;
                await sock.sendMessage(sender, { text: t.welcomeMenu });
                await sendElevenLabsVoiceNote(sock, sender, t.voiceIntro);
            }
            return; 
        }

        // 🔙 GLOBAL BACK TO MENU
        if (text === '0' || text === 'menu') {
            userState.step = 'WELCOME_MENU';
            userState.invalidAttempts = 0;
            await sock.sendMessage(sender, { text: t.welcomeMenu });
            await sendElevenLabsVoiceNote(sock, sender, t.voiceIntro);
            return;
        }

        // 🎤 USER SENDS VOICE MESSAGE (Gemini writes reply, ElevenLabs speaks it)
        if (msgType === 'audioMessage') {
            await sock.sendPresenceUpdate('recording', sender);
            try {
                let mimeType = msg.message.audioMessage.mimetype.split(';')[0] || "audio/ogg";
                const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: AI_PROMPT });
                const result = await model.generateContent([
                    "Listen to the user's audio and reply naturally. KEEP IT UNDER 180 CHARACTERS.",
                    { inlineData: { data: buffer.toString("base64"), mimeType: mimeType } }
                ]);
                
                const aiResponse = result.response.text();
                // Send generated text as ElevenLabs Voice
                await sendElevenLabsVoiceNote(sock, sender, aiResponse, msg);
            } catch (e) {
                console.error("Audio Process Error:", e);
                await sock.sendMessage(sender, { text: "👉 مینو میں واپس جانے کے لیے 0 لکھیں" }, { quoted: msg });
            }
            return;
        }

        // ⌨️ MENU NAVIGATION
        if (userState.step === 'WELCOME_MENU') {
            if (text === '1') { 
                userState.invalidAttempts = 0;
                userState.step = 'SERVICES_MENU';
                await sock.sendMessage(sender, { text: t.servicesMenu });
            } else if (text === '2') { 
                userState.invalidAttempts = 0;
                await sock.sendMessage(sender, { text: t.allDemos });
            } else if (text === '3') { 
                userState.invalidAttempts = 0;
                userState.isMuted = true;
                await sock.sendMessage(sender, { text: t.humanMute });
                await sendElevenLabsVoiceNote(sock, sender, t.humanMuteVoice);
            } else if (text === '4') { 
                userState.invalidAttempts = 0;
                userState.lang = lang === 'en' ? 'ur' : 'en'; 
                const newLang = userState.lang;
                await sock.sendMessage(sender, { text: langText[newLang].welcomeMenu });
                await sendElevenLabsVoiceNote(sock, sender, langText[newLang].voiceIntro);
            } else {
                userState.invalidAttempts = (userState.invalidAttempts || 0) + 1;
                if (userState.invalidAttempts >= 3) {
                    userState.isMuted = true;
                    await sock.sendMessage(sender, { text: t.humanMute });
                    await sendElevenLabsVoiceNote(sock, sender, t.humanMuteVoice);
                } else {
                    await sock.sendMessage(sender, { text: t.welcomeMenu });
                    await sendElevenLabsVoiceNote(sock, sender, t.voiceIntro);
                }
            }
            return;
        }

        // SERVICES MENU
        if (userState.step === 'SERVICES_MENU') {
            const categories = {
                '1': { name: 'Website Development', demo: t.demos.web },
                '2': { name: 'App & Game Development', demo: t.demos.app },
                '3': { name: 'Graphics Designing', demo: t.demos.graphics },
                '4': { name: 'Advertisement & Marketing', demo: t.demos.ads },
                '5': { name: 'WhatsApp Bot Development', demo: t.demos.bot }
            };

            if (categories[text]) {
                userState.step = 'WAITING_FOR_ORDER_CONFIRM';
                userState.category = categories[text].name;
                await sock.sendMessage(sender, { text: categories[text].demo });
            } else {
                await sock.sendMessage(sender, { text: "👉 مینو میں واپس جانے کے لیے 0 لکھیں / Type 0 for Menu" });
            }
            return;
        }

        if (userState.step === 'WAITING_FOR_ORDER_CONFIRM') {
            if (text.includes('yes') || text.includes('y') || text.includes('ہاں') || text.includes('haan')) {
                userState.step = 'WAITING_FOR_DETAILS';
                await sock.sendMessage(sender, { text: t.askDetails });
            } else {
                await sock.sendMessage(sender, { text: "👉 مینو میں واپس جانے کے لیے 0 لکھیں / Type 0 for Menu" });
            }
            return;
        }

        if (userState.step === 'WAITING_FOR_DETAILS') {
            userState.step = 'WELCOME_MENU'; 
            await sock.sendMessage(sender, { text: t.orderConfirmed });
            return;
        }
    });
}

startBot().catch(err => console.log("Error: " + err));
