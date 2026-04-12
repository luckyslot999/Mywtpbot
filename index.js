require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const googleTTS = require('google-tts-api');

// ==========================================
// 🌐 RENDER 24/7 UPTIME SERVER
// ==========================================
const app = express();
app.get('/', (req, res) => res.send('🤖 Wajid Ali Digital Agency AI is Running 24/7!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

// ==========================================
// 🔑 CONFIGURATIONS (FIREBASE & AI)
// ==========================================
let FIREBASE_URL = process.env.FIREBASE_URL || "";
if (FIREBASE_URL.endsWith('/')) FIREBASE_URL = FIREBASE_URL.slice(0, -1);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ✅ AI PROMPT UPDATED: AI Persona changed to Wajid's Bot Assistant
const AI_PROMPT = `You are a highly conversational sales bot assistant for Wajid Ali's Digital Agency.
We offer: Website Dev, App Dev, Graphics, Ads, and WhatsApp Bots.
Rule 1: Answer naturally and politely to the user's text or voice. DO NOT mention you are an AI. Say you are Wajid's Bot Assistant.
Rule 2: Never give prices. Say Wajid Ali will quote the exact price.
Rule 3: IMPORTANT: Keep your response SHORT (under 180 characters) so it can be easily converted into a Voice Note. Be concise and sweet.
Rule 4: Reply in the language the user speaks (English or Roman Urdu/Urdu).`;

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
// 🌐 ENHANCED DICTIONARY (Text + Synchronized Voice Guidance)
// ==========================================
const langText = {
    en: {
        welcomeMenu: `🌟 *Welcome to Wajid Ali's Digital Agency!* 🌟\n\nI am Wajid's Bot Assistant.\n👇 *Please type a number from below:*\n\n*1️⃣* View Our Premium Services 🚀\n*2️⃣* View Portfolios & Demos 🌐\n*3️⃣* Talk to Wajid Ali (Human) 👨‍💻\n*4️⃣* زبان تبدیل کریں (Urdu) 🇵🇰`,
        voiceIntro: "Welcome to Wajid Ali Digital Agency. I am Wajid's bot assistant. Reply 1 for services, 2 for demos, and 3 to talk to Wajid Ali.", // Shortened to fit TTS limits & exact menu match
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
        humanMuteVoice: "I have forwarded your request to Wajid Ali. He will contact you shortly.",
        invalidInput: "⚠️ Invalid option. Please type a valid number from the menu, or type 0 to see the menu again."
    },
    ur: {
        welcomeMenu: `🌟 *واجد علی کی ڈیجیٹل ایجنسی میں خوش آمدید!* 🌟\n\nمیں واجد کا بوٹ اسسٹنٹ ہوں۔\n👇 *براہ کرم نیچے دیا گیا کوئی نمبر ٹائپ کریں:*\n\n*1️⃣* ہماری پریمیم سروسز دیکھیں 🚀\n*2️⃣* ڈیموز اور پورٹ فولیو دیکھیں 🌐\n*3️⃣* واجد علی سے بات کریں 👨‍💻\n*4️⃣* Change to English 🇬🇧`,
        voiceIntro: "واجد علی ڈیجیٹل ایجنسی میں خوش آمدید۔ میں واجد کا اسسٹنٹ بوٹ ہوں۔ سروسز کے لیے ایک، ڈیموز کے لیے دو، اور واجد علی سے بات کرنے کے لیے تین دبائیں۔", // اردو وائس گائیڈ (چھوٹی رکھی گئی ہے تاکہ کریش نہ ہو)
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
        humanMuteVoice: "میں نے آپ کا میسج واجد علی کو بھیج دیا ہے۔ وہ جلد ہی آپ سے رابطہ کریں گے۔",
        invalidInput: "⚠️ آپ نے غلط آپشن منتخب کیا ہے۔ براہ کرم مینو میں سے درست نمبر ٹائپ کریں، یا دوبارہ مینو دیکھنے کے لیے 0 لکھیں۔"
    }
};

// ==========================================
// 🎤 SECURE AI VOICE & TEXT GENERATOR (FIXED AUDIO BUG)
// ==========================================
async function getAIResponse(sender, textMessage) {
    if (!GEMINI_API_KEY) return null;
    try {
        if (!chatSessions[sender]) {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: AI_PROMPT });
            chatSessions[sender] = model.startChat({ history: [] });
        }
        const result = await chatSessions[sender].sendMessage(textMessage);
        return result.response.text();
    } catch (e) { return null; }
}

async function sendVoiceNote(sock, sender, text, lang, quotedMsg = null) {
    try {
        // ✅ Limit characters to avoid TTS API limits
        let safeText = text.substring(0, 195); 
        
        // ✅ Using Base64 method to completely avoid "Corrupted Audio File" bug
        const base64Audio = await googleTTS.getAudioBase64(safeText, { lang: lang, slow: false, host: 'https://translate.google.com' });
        const audioBuffer = Buffer.from(base64Audio, 'base64');

        // ✅ Using 'audio/mpeg' ensures compatibility and plays perfectly in latest WhatsApp
        await sock.sendMessage(sender, { 
            audio: audioBuffer, 
            mimetype: 'audio/mpeg', 
            ptt: true // Set to true to show as Voice Note, will play seamlessly now
        }, quotedMsg ? { quoted: quotedMsg } : undefined);

    } catch (e) { 
        console.error("TTS Error:", e);
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
            const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
            console.log('\n🔄 NEW QR CODE: 👉 ' + qrImageUrl + '\n');
        }
        if (connection === 'open') {
            console.log('✅ WAJID ALI AI IS ONLINE!');
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

        // 1️⃣ ANY FIRST MESSAGE HANDLER (Stickers, Images, Hi, Hello)
        if (!userStates[sender]) {
            userStates[sender] = { step: 'WELCOME_MENU', lang: 'ur', isMuted: false, invalidAttempts: 0 };
            const lang = userStates[sender].lang;
            const t = langText[lang];
            
            await sock.sendMessage(sender, { text: t.welcomeMenu });
            await sendVoiceNote(sock, sender, t.voiceIntro, lang);
            return;
        }

        const userState = userStates[sender];
        const lang = userState.lang;
        const t = langText[lang];

        if (userState.isMuted) {
            if (text === "bot wake up") {
                userState.isMuted = false;
                userState.step = 'WELCOME_MENU';
                userState.invalidAttempts = 0;
                await sock.sendMessage(sender, { text: t.welcomeMenu });
                await sendVoiceNote(sock, sender, t.voiceIntro, lang);
            }
            return; 
        }

        // Global Back to Menu command
        if (text === '0' || text === 'menu') {
            userState.step = 'WELCOME_MENU';
            userState.invalidAttempts = 0;
            await sock.sendMessage(sender, { text: t.welcomeMenu });
            await sendVoiceNote(sock, sender, t.voiceIntro, lang);
            return;
        }

        // 🎤 VOICE MESSAGE HANDLER
        if (msgType === 'audioMessage') {
            await sock.sendPresenceUpdate('recording', sender);
            try {
                let mimeType = msg.message.audioMessage.mimetype.split(';')[0] || "audio/ogg";
                const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: AI_PROMPT });
                const result = await model.generateContent([
                    "Listen to the user's audio and reply naturally. KEEP IT UNDER 180 CHARACTERS. Act as Wajid's Bot Assistant.",
                    { inlineData: { data: buffer.toString("base64"), mimeType: mimeType } }
                ]);
                
                const aiResponse = result.response.text();
                const isUrdu = aiResponse.match(/[\u0600-\u06FF]/);
                
                await sendVoiceNote(sock, sender, aiResponse, isUrdu ? 'ur' : 'en', msg);
            } catch (e) {
                console.error("Audio Process Error:", e);
                await sock.sendMessage(sender, { text: "⚠️ Voice processing issue. Please reply '0' for Menu." }, { quoted: msg });
            }
            return;
        }

        // ⌨️ TEXT MENU HANDLER
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
                await sendVoiceNote(sock, sender, t.humanMuteVoice, lang);
            } else if (text === '4') { 
                userState.invalidAttempts = 0;
                userState.lang = lang === 'en' ? 'ur' : 'en'; 
                const newLang = userState.lang;
                await sock.sendMessage(sender, { text: langText[newLang].welcomeMenu });
                await sendVoiceNote(sock, sender, langText[newLang].voiceIntro, newLang);
            } else {
                // 🛡️ AUTO HANDOFF LOGIC (If user sends random messages 3 times)
                userState.invalidAttempts++;
                if (userState.invalidAttempts >= 3) {
                    userState.isMuted = true;
                    await sock.sendMessage(sender, { text: t.humanMute });
                    await sendVoiceNote(sock, sender, t.humanMuteVoice, lang);
                    return;
                }
                
                await sock.sendPresenceUpdate('composing', sender);
                const aiReply = await getAIResponse(sender, rawText);
                if (aiReply) {
                    await sock.sendMessage(sender, { text: aiReply });
                } else {
                    await sock.sendMessage(sender, { text: t.invalidInput });
                }
            }
            return;
        }

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
                await sock.sendPresenceUpdate('composing', sender);
                const aiReply = await getAIResponse(sender, rawText);
                await sock.sendMessage(sender, { text: aiReply || "Please reply 0 for Menu." });
            }
            return;
        }

        if (userState.step === 'WAITING_FOR_ORDER_CONFIRM') {
            if (text.includes('yes') || text.includes('y') || text.includes('ہاں') || text.includes('haan')) {
                userState.step = 'WAITING_FOR_DETAILS';
                await sock.sendMessage(sender, { text: t.askDetails });
            } else {
                await sock.sendPresenceUpdate('composing', sender);
                const aiReply = await getAIResponse(sender, rawText);
                await sock.sendMessage(sender, { text: aiReply || "Please reply 0 for Menu." });
            }
            return;
        }

        if (userState.step === 'WAITING_FOR_DETAILS') {
            const newLead = { phone: sender.split('@')[0], service: userState.category, requirement: rawText, timestamp: new Date().toISOString() };
            if (FIREBASE_URL) {
                try {
                    await fetch(`${FIREBASE_URL}/leads.json`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newLead) });
                } catch (error) {}
            }
            userState.step = 'WELCOME_MENU'; 
            await sock.sendMessage(sender, { text: t.orderConfirmed });
            return;
        }
    });
}

startBot().catch(err => console.log("Error: " + err));
