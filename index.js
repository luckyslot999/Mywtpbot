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
app.get('/', (req, res) => res.send('🤖 W-Assistant AI is Running 24/7!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Server running on port ${PORT}`));

// ==========================================
// 🔑 CONFIGURATIONS (FIREBASE & AI)
// ==========================================
let FIREBASE_URL = process.env.FIREBASE_URL || "";
if (FIREBASE_URL.endsWith('/')) FIREBASE_URL = FIREBASE_URL.slice(0, -1);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const AI_PROMPT = `You are Sana, a highly conversational, friendly female sales assistant for Wajid Ali's Digital Agency. 
Rule 1: If the user chats with you (text or voice), chat back naturally and nicely. 
Rule 2: We offer Website Dev, App Dev, Graphics, Ads, and WhatsApp Bots.
Rule 3: Do NOT give prices. Say "Pricing depends on requirements, Wajid Ali will quote you."
Rule 4: End your replies nicely and occasionally remind them: "Reply 0 for our Service Menu".
Rule 5: Reply in the language the user speaks (English or Roman Urdu/Urdu).`;

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
            console.log('✅ Session restored from Firebase!');
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
        await fetch(`${FIREBASE_URL}/whatsapp_session.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sessionObj)
        });
    } catch (error) {}
}

let syncTimeout = null;
function debouncedUpload() {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => { await uploadSession(); }, 5000);
}

// ==========================================
// 🌐 DICTIONARY: ENGLISH & URDU MESSAGES 
// ==========================================
const langText = {
    en: {
        welcomeMenu: `🤖 *Hello! I am Wajid Ali's AI Assistant.*\n\nHow can I help you today? *Please reply by typing a number from below:*\n\n1️⃣ View Our Digital Services 🚀\n2️⃣ Talk to Wajid Ali 👨‍💻\n3️⃣ زبان تبدیل کریں (Change to Urdu) 🇵🇰\n4️⃣ *View Portfolios / Demos* 🌐`,
        servicesMenu: `🚀 *Our Premium Services*\n\n*Please type the number of the service you want to explore:*\n\n1️⃣ Website Development 🌐\n2️⃣ App & Game Development 📱\n3️⃣ Graphics Designing 🎨\n4️⃣ Advertisement & Digital Marketing 📢\n5️⃣ WhatsApp Bot Development 🤖\n\n_👉 Reply with 0 anytime to go back._`,
        allDemos: `✨ *Our Work Portfolios & Demos*\n\nHere are some of our live E-Commerce Website projects:\n👉 https://friendspharma.shop/\n👉 https://kmartonline.store/\n\nFor Graphics, App, or Bot demos, please chat with me or contact Wajid Ali.\n\n_👉 Reply with 0 anytime to go back to the Main Menu._`,
        demos: {
            web: `🌐 *Website Development*\n\nDemos:\n👉 https://friendspharma.shop/\n👉 https://kmartonline.store/\n\n*Would you like to place an order?*\n👉 Reply *YES* to confirm\n👉 Reply *0* to go back.`,
            app: `📱 *App & Game Development*\n\nWe build high-performance Android & iOS Apps.\n\n*Would you like to place an order?*\n👉 Reply *YES* to confirm\n👉 Reply *0* to go back.`,
            graphics: `🎨 *Graphics Designing*\n\nWe design professional Logos, UI/UX, and Social Media Posts.\n\n*Would you like to place an order?*\n👉 Reply *YES* to confirm\n👉 Reply *0* to go back.`,
            ads: `📢 *Advertisement & Marketing*\n\nScale your business with expert Facebook & Google Ads.\n\n*Would you like to place an order?*\n👉 Reply *YES* to confirm\n👉 Reply *0* to go back.`,
            bot: `🤖 *WhatsApp Bot Development*\n\nAutomate your business 24/7 with a smart AI WhatsApp Assistant.\n\n*Would you like to place an order?*\n👉 Reply *YES* to confirm\n👉 Reply *0* to go back.`
        },
        askDetails: `Awesome! 🎉 Let's confirm your order.\n\nPlease reply with your:\n1. *Full Name*\n2. *Phone Number*\n3. *Short Details of your requirement*\n\n_(Please type all information in a single message)_`,
        orderConfirmed: `✅ *Your Order is Confirmed!*\n\nThank you! I have securely saved your request. *Wajid Ali* will contact you shortly.\n\nHave a great day! 🌟`,
        humanMute: `📞 *Request Forwarded!*\n\nI have notified Wajid Ali. He will reply to you shortly. Thank you! 🌟`
    },
    ur: {
        welcomeMenu: `🤖 *ہیلو! میں واجد علی کا AI اسسٹنٹ ہوں۔*\n\nمیں آپ کی کیا مدد کر سکتا ہوں؟ *براہ کرم مینو میں دیا گیا نمبر ٹائپ کر کے سینڈ کریں:*\n\n1️⃣ ہماری ڈیجیٹل سروسز دیکھیں 🚀\n2️⃣ واجد علی سے بات کریں 👨‍💻\n3️⃣ Change to English (زبان تبدیل کریں) 🇬🇧\n4️⃣ *ہمارے ڈیموز / پورٹ فولیو دیکھیں* 🌐`,
        servicesMenu: `🚀 *ہماری پروفیشنل سروسز*\n\n*تفصیلات دیکھنے کے لیے متعلقہ نمبر ٹائپ کر کے سینڈ کریں:*\n\n1️⃣ ویب سائٹ ڈیویلپمنٹ 🌐\n2️⃣ ایپ اور گیم ڈیویلپمنٹ 📱\n3️⃣ گرافکس ڈیزائننگ 🎨\n4️⃣ ایڈورٹائزمنٹ / ڈیجیٹل مارکیٹنگ 📢\n5️⃣ واٹس ایپ بوٹ ڈیویلپمنٹ 🤖\n\n_👉 پیچھے جانے کے لیے کسی بھی وقت 0 بھیجیں۔_`,
        allDemos: `✨ *ہمارے لائیو ڈیموز اور پروجیکٹس*\n\nیہ ہماری لائیو ای کامرس ویب سائٹس ہیں:\n👉 https://friendspharma.shop/\n👉 https://kmartonline.store/\n\nگرافکس، ایپس یا بوٹ کے ڈیمو کے لیے آپ مجھ سے بات کر سکتے ہیں یا واجد علی سے رابطہ کر سکتے ہیں۔\n\n_👉 مین مینو میں واپس جانے کے لیے 0 ٹائپ کریں۔_`,
        demos: {
            web: `🌐 *ویب سائٹ ڈیویلپمنٹ*\n\nڈیموز:\n👉 https://friendspharma.shop/\n👉 https://kmartonline.store/\n\n*کیا آپ اپنا آرڈر کنفرم کرنا چاہتے ہیں؟*\n👉 آرڈر کے لیے *YES* لکھ کر بھیجیں۔\n👉 پیچھے جانے کے لیے *0* بھیجیں۔`,
            app: `📱 *ایپ اور گیم ڈیویلپمنٹ*\n\nہم بہترین کوالٹی کی اینڈرائیڈ/iOS ایپس بناتے ہیں۔\n\n*کیا آپ اپنا آرڈر کنفرم کرنا چاہتے ہیں؟*\n👉 آرڈر کے لیے *YES* لکھ کر بھیجیں۔\n👉 پیچھے جانے کے لیے *0* بھیجیں۔`,
            graphics: `🎨 *گرافکس ڈیزائننگ*\n\nہم پروفیشنل لوگوز، اور سوشل میڈیا پوسٹس ڈیزائن کرتے ہیں۔\n\n*کیا آپ اپنا آرڈر کنفرم کرنا چاہتے ہیں؟*\n👉 آرڈر کے لیے *YES* لکھ کر بھیجیں۔\n👉 پیچھے جانے کے لیے *0* بھیجیں۔`,
            ads: `📢 *ایڈورٹائزمنٹ اور مارکیٹنگ*\n\nفیس بک اور گوگل ایڈز کے ذریعے اپنی سیلز بڑھائیں۔\n\n*کیا آپ اپنا آرڈر کنفرم کرنا چاہتے ہیں؟*\n👉 آرڈر کے لیے *YES* لکھ کر بھیجیں۔\n👉 پیچھے جانے کے لیے *0* بھیجیں۔`,
            bot: `🤖 *واٹس ایپ بوٹ ڈیویلپمنٹ*\n\nاپنے بزنس کے لیے ایک آٹومیٹک واٹس ایپ بوٹ بنوائیں۔\n\n*کیا آپ اپنا آرڈر کنفرم کرنا چاہتے ہیں؟*\n👉 آرڈر کے لیے *YES* لکھ کر بھیجیں۔\n👉 پیچھے جانے کے لیے *0* بھیجیں۔`
        },
        askDetails: `بہت خوب! 🎉 آئیے آپ کا آرڈر کنفرم کرتے ہیں۔\n\nبراہ کرم ایک ہی میسج میں یہ تفصیلات ٹائپ کر کے بھیجیں:\n1. *آپ کا نام*\n2. *فون نمبر*\n3. *آپ کو کیسا پروجیکٹ چاہیے؟ (مختصر تفصیل)*`,
        orderConfirmed: `✅ *آپ کا آرڈر کنفرم ہو گیا ہے!*\n\nشکریہ! میں نے آپ کی ریکوائرمنٹ محفوظ کر لی ہے۔ *واجد علی* بہت جلد آپ سے رابطہ کریں گے۔ 🌟`,
        humanMute: `📞 *درخواست موصول ہو گئی!*\n\nمیں نے واجد علی کو اطلاع دے دی ہے۔ وہ جلد ہی آپ سے رابطہ کریں گے۔ شکریہ! 🌟`
    }
};

// ==========================================
// 🎤 AI VOICE & TEXT HANDLERS
// ==========================================
async function getAIResponse(sender, textMessage) {
    if (!GEMINI_API_KEY) return "🤖 *Sorry, my AI is currently offline. Please reply with 0 to view the Main Menu.*";
    try {
        if (!chatSessions[sender]) {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: AI_PROMPT });
            chatSessions[sender] = model.startChat({ history: [] });
        }
        const result = await chatSessions[sender].sendMessage(textMessage);
        return result.response.text();
    } catch (e) {
        console.error("AI Error:", e);
        return "🤖 *Sorry, I didn't catch that. Please reply with 0 for Main Menu.*";
    }
}

async function generateVoice(text, lang = 'ur') {
    try {
        const url = googleTTS.getAudioUrl(text, { lang: lang, slow: false, host: 'https://translate.google.com' });
        const res = await fetch(url);
        const buffer = await res.arrayBuffer();
        return Buffer.from(buffer);
    } catch (e) { return null; }
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
        // ✅ 100% FIXED FOR NORMAL & BUSINESS WHATSAPP
        browser: Browsers.macOS('Desktop'), 
        syncFullHistory: false
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
            console.log('\n========================================================');
            console.log('🔄 NEW QR CODE GENERATED! Click the link below to scan:');
            console.log('👉 ' + qrImageUrl);
            console.log('========================================================\n');
        }

        if (connection === 'open') {
            console.log('✅ W-ASSISTANT IS ONLINE SUCCESSFULLY!');
            debouncedUpload();
        }
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log('❌ Connection Closed. Reason Code:', reason);
            if (reason !== DisconnectReason.loggedOut) {
                startBot();
            } else {
                console.log('⚠️ LOGGED OUT! Deleting session and restarting...');
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

        if (!userStates[sender]) userStates[sender] = { step: 'WELCOME_MENU', lang: 'ur', isMuted: false };
        const userState = userStates[sender];
        const lang = userState.lang;
        const t = langText[lang];

        if (userState.isMuted) {
            if (text === "bot wake up") {
                userState.isMuted = false;
                userState.step = 'WELCOME_MENU';
                await sock.sendMessage(sender, { text: "🤖 " + t.welcomeMenu });
            }
            return; 
        }

        const greetings = ['0', 'menu', 'start'];
        if (greetings.includes(text)) {
            userState.step = 'WELCOME_MENU';
            await sock.sendMessage(sender, { text: t.welcomeMenu });
            return;
        }

        // 🎤 VOICE MESSAGE HANDLER
        if (msgType === 'audioMessage') {
            await sock.sendPresenceUpdate('recording', sender);
            try {
                const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: AI_PROMPT });
                const result = await model.generateContent([
                    "Listen to this audio and reply nicely in a conversational tone.",
                    { inlineData: { data: buffer.toString("base64"), mimeType: "audio/ogg" } }
                ]);
                const aiResponse = result.response.text();
                const isUrdu = aiResponse.match(/[\u0600-\u06FF]/);
                const voiceBuffer = await generateVoice(aiResponse, isUrdu ? 'ur' : 'en');

                if (voiceBuffer) {
                    await sock.sendMessage(sender, { audio: voiceBuffer, mimetype: 'audio/mp4', ptt: true }, { quoted: msg });
                } else {
                    await sock.sendMessage(sender, { text: aiResponse }, { quoted: msg });
                }
            } catch (e) {
                await sock.sendMessage(sender, { text: "⚠️ Voice processing failed. Reply '0' for Menu." });
            }
            return;
        }

        // ⌨️ TEXT MENU HANDLER
        if (userState.step === 'WELCOME_MENU') {
            if (text === '1') { 
                userState.step = 'SERVICES_MENU';
                await sock.sendMessage(sender, { text: t.servicesMenu });
            } else if (text === '2') { 
                userState.isMuted = true;
                await sock.sendMessage(sender, { text: t.humanMute });
            } else if (text === '3') { 
                userState.lang = lang === 'en' ? 'ur' : 'en'; 
                await sock.sendMessage(sender, { text: langText[userState.lang].welcomeMenu });
            } else if (text === '4') { 
                // ✅ نیا فیچر: ڈیمو بٹن
                await sock.sendMessage(sender, { text: t.allDemos });
            } else {
                // اگر 1,2,3,4 نہیں ہے تو AI کو بات کرنے دو
                await sock.sendPresenceUpdate('composing', sender);
                const aiReply = await getAIResponse(sender, rawText);
                await sock.sendMessage(sender, { text: aiReply });
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
                await sock.sendMessage(sender, { text: aiReply });
            }
            return;
        }

        if (userState.step === 'WAITING_FOR_ORDER_CONFIRM') {
            if (text.includes('yes') || text.includes('y') || text.includes('ہاں')) {
                userState.step = 'WAITING_FOR_DETAILS';
                await sock.sendMessage(sender, { text: t.askDetails });
            } else {
                await sock.sendPresenceUpdate('composing', sender);
                const aiReply = await getAIResponse(sender, rawText);
                await sock.sendMessage(sender, { text: aiReply });
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
