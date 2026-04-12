require('dotenv').config();
// Browsers کو امپورٹ کیا گیا ہے تاکہ واٹس ایپ کنکشن بلاک نہ کرے
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
app.get('/', (req, res) => res.send('🤖 W-Assistant is Running 24/7!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Server running on port ${PORT}`));

// ==========================================
// 🔑 CONFIGURATIONS (FIREBASE & AI)
// ==========================================
let FIREBASE_URL = process.env.FIREBASE_URL || "";
if (FIREBASE_URL.endsWith('/')) FIREBASE_URL = FIREBASE_URL.slice(0, -1);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const AI_PROMPT = `You are Sana, a polite female sales assistant for Wajid Ali's Digital Agency. 
We offer Website Development, App/Game Dev, Graphics Designing, Ads, and WhatsApp Bots.
Rule 1: If user asks questions, answer nicely. 
Rule 2: Do NOT give prices. Say "Pricing depends on requirements, Wajid Ali will quote you."
Rule 3: Always tell the user at the end of your reply: "To view our automated Service Menu, please reply with '0'."
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
            console.log('✅ Session restored successfully from Firebase!');
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
        welcomeMenu: `🤖 *Hello! I am Wajid Ali's Virtual Assistant.*\n\nHow can I help you today? *Please reply by typing a number from below:*\n\n1️⃣ View Our Digital Services 🚀\n2️⃣ Talk to Wajid Ali 👨‍💻\n3️⃣ زبان تبدیل کریں (Change to Urdu) 🇵🇰`,
        servicesMenu: `🚀 *Our Premium Services*\n\n*Please type the number of the service you want to explore:*\n\n1️⃣ Website Development 🌐\n2️⃣ App & Game Development 📱\n3️⃣ Graphics Designing 🎨\n4️⃣ Advertisement & Digital Marketing 📢\n5️⃣ WhatsApp Bot Development 🤖\n\n_👉 Reply with 0 anytime to go back._`,
        demos: {
            web: `🌐 *Website Development*\n\nHere are some of our successful E-Commerce projects:\n👉 https://friendspharma.shop/\n👉 https://kmartonline.store/\n\n*Would you like to place an order?*\n👉 Reply *YES* to confirm\n👉 Reply *0* to go back to Menu.`,
            app: `📱 *App & Game Development*\n\nWe build high-performance Android & iOS Apps and engaging Mobile Games.\n\n*Would you like to place an order?*\n👉 Reply *YES* to confirm\n👉 Reply *0* to go back to Menu.`,
            graphics: `🎨 *Graphics Designing*\n\nWe design professional Logos, UI/UX, Banners, and Social Media Posts.\n\n*Would you like to place an order?*\n👉 Reply *YES* to confirm\n👉 Reply *0* to go back to Menu.`,
            ads: `📢 *Advertisement & Marketing*\n\nScale your business with our expert Facebook Ads, Google Ads, and SEO strategies.\n\n*Would you like to place an order?*\n👉 Reply *YES* to confirm\n👉 Reply *0* to go back to Menu.`,
            bot: `🤖 *WhatsApp Bot Development*\n\nAutomate your business 24/7 with a smart AI WhatsApp Assistant (just like me!).\n\n*Would you like to place an order?*\n👉 Reply *YES* to confirm\n👉 Reply *0* to go back to Menu.`
        },
        askDetails: `Awesome! 🎉 Let's confirm your order.\n\nPlease reply with your:\n1. *Full Name*\n2. *Phone Number*\n3. *Short Details of your requirement*\n\n_(Please type all information in a single message and send)_`,
        orderConfirmed: `✅ *Your Order is Confirmed!*\n\nThank you! I have securely saved your request. *Wajid Ali* will review your details and contact you shortly to start the work.\n\nHave a great day! 🌟`,
        humanMute: `📞 *Request Forwarded!*\n\nI have notified Wajid Ali. He will review your message and reply to you shortly. Please wait for his response. Thank you! 🌟`
    },
    ur: {
        welcomeMenu: `🤖 *ہیلو! میں واجد علی کا ورچوئل اسسٹنٹ ہوں۔*\n\nمیں آپ کی کیا مدد کر سکتا ہوں؟ *براہ کرم مینو میں دیا گیا نمبر ٹائپ کر کے سینڈ کریں:*\n\n1️⃣ ہماری ڈیجیٹل سروسز دیکھیں 🚀\n2️⃣ واجد علی سے بات کریں 👨‍💻\n3️⃣ Change to English (زبان تبدیل کریں) 🇬🇧`,
        servicesMenu: `🚀 *ہماری پروفیشنل سروسز*\n\n*تفصیلات دیکھنے کے لیے متعلقہ نمبر ٹائپ کر کے سینڈ کریں:*\n\n1️⃣ ویب سائٹ ڈیویلپمنٹ 🌐\n2️⃣ ایپ اور گیم ڈیویلپمنٹ 📱\n3️⃣ گرافکس ڈیزائننگ 🎨\n4️⃣ ایڈورٹائزمنٹ / ڈیجیٹل مارکیٹنگ 📢\n5️⃣ واٹس ایپ بوٹ ڈیویلپمنٹ 🤖\n\n_👉 پیچھے جانے کے لیے کسی بھی وقت 0 بھیجیں۔_`,
        demos: {
            web: `🌐 *ویب سائٹ ڈیویلپمنٹ*\n\nیہ ہمارے کچھ کامیاب ای کامرس پراجیکٹس ہیں:\n👉 https://friendspharma.shop/\n👉 https://kmartonline.store/\n\n*کیا آپ اپنا آرڈر کنفرم کرنا چاہتے ہیں؟*\n👉 آرڈر کے لیے *YES* لکھ کر بھیجیں۔\n👉 پیچھے جانے کے لیے *0* بھیجیں۔`,
            app: `📱 *ایپ اور گیم ڈیویلپمنٹ*\n\nہم بہترین کوالٹی کی اینڈرائیڈ/iOS ایپس اور موبائل گیمز بناتے ہیں۔\n\n*کیا آپ اپنا آرڈر کنفرم کرنا چاہتے ہیں؟*\n👉 آرڈر کے لیے *YES* لکھ کر بھیجیں۔\n👉 پیچھے جانے کے لیے *0* بھیجیں۔`,
            graphics: `🎨 *گرافکس ڈیزائننگ*\n\nہم پروفیشنل لوگوز، UI/UX اور سوشل میڈیا پوسٹس ڈیزائن کرتے ہیں۔\n\n*کیا آپ اپنا آرڈر کنفرم کرنا چاہتے ہیں؟*\n👉 آرڈر کے لیے *YES* لکھ کر بھیجیں۔\n👉 پیچھے جانے کے لیے *0* بھیجیں۔`,
            ads: `📢 *ایڈورٹائزمنٹ اور مارکیٹنگ*\n\nفیس بک ایڈز، گوگل ایڈز اور SEO کے ذریعے اپنی سیلز بڑھائیں۔\n\n*کیا آپ اپنا آرڈر کنفرم کرنا چاہتے ہیں؟*\n👉 آرڈر کے لیے *YES* لکھ کر بھیجیں۔\n👉 پیچھے جانے کے لیے *0* بھیجیں۔`,
            bot: `🤖 *واٹس ایپ بوٹ ڈیویلپمنٹ*\n\nاپنے بزنس کے لیے ایک آٹومیٹک واٹس ایپ بوٹ بنوائیں جو 24 گھنٹے کام کرے۔\n\n*کیا آپ اپنا آرڈر کنفرم کرنا چاہتے ہیں؟*\n👉 آرڈر کے لیے *YES* لکھ کر بھیجیں۔\n👉 پیچھے جانے کے لیے *0* بھیجیں۔`
        },
        askDetails: `بہت خوب! 🎉 آئیے آپ کا آرڈر کنفرم کرتے ہیں۔\n\nبراہ کرم ایک ہی میسج میں یہ تفصیلات ٹائپ کر کے بھیجیں:\n1. *آپ کا نام*\n2. *فون نمبر*\n3. *آپ کو کیسا پروجیکٹ چاہیے؟ (مختصر تفصیل)*`,
        orderConfirmed: `✅ *آپ کا آرڈر کنفرم ہو گیا ہے!*\n\nشکریہ! میں نے آپ کی ریکوائرمنٹ محفوظ کر لی ہے۔ *واجد علی* بہت جلد آپ کی تفصیلات چیک کر کے آپ سے رابطہ کریں گے۔ 🌟`,
        humanMute: `📞 *درخواست موصول ہو گئی!*\n\nمیں نے واجد علی کو اطلاع دے دی ہے۔ وہ جلد ہی آپ کا میسج چیک کر کے آپ سے رابطہ کریں گے۔ براہ کرم ان کے جواب کا انتظار کریں۔ شکریہ! 🌟`
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
        return "🤖 *Network Error. Please reply with 0 for Main Menu.*";
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
        printQRInTerminal: true, // ✅ اب QR کوڈ ٹرمینل میں پرنٹ ہوگا، سکیننگ آسان ہوگی
        logger: pino({ level: 'silent' }),
        // ✅ FIXED: براؤزر کا نام سٹینڈرڈ کر دیا گیا ہے تاکہ WhatsApp کنیکٹ ہونے سے نہ روکے
        browser: Browsers.ubuntu('Chrome'), 
        syncFullHistory: false,
        generateHighQualityLinkPreview: true
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'open') {
            console.log('✅ W-ASSISTANT IS ONLINE SUCCESSFULLY!');
            debouncedUpload();
        }
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log('❌ Connection Closed. Reason Code:', reason);
            if (reason !== DisconnectReason.loggedOut) {
                startBot(); // Auto reconnect
            } else {
                console.log('⚠️ LOGGED OUT! Deleting session and restarting...');
                if (fs.existsSync('session_data')) fs.rmSync('session_data', { recursive: true, force: true });
                startBot(); // Restart for fresh QR
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

        if (msgType === 'audioMessage') {
            await sock.sendPresenceUpdate('recording', sender);
            try {
                const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: AI_PROMPT });
                const result = await model.generateContent([
                    "Listen to this audio and reply. Always end by saying: 'For main menu, reply with 0'.",
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
            } else {
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
