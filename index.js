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

const AI_PROMPT = `You are Sana, a highly conversational, persuasive, and polite female sales assistant for Wajid Ali's Digital Agency. 
We offer Premium Website Development, App/Game Dev, Graphics Designing, Digital Marketing (Ads), and WhatsApp Bot Development.
Rule 1: If the user talks to you via text or voice, answer politely and try to sell our services. Show them how our services will grow their business.
Rule 2: NEVER give exact prices. Always say "Our pricing is very affordable and depends on your exact project requirements. Wajid Ali will give you the best quote."
Rule 3: At the end of your replies, gently remind them: "You can reply with '0' anytime to see our Main Menu."
Rule 4: Reply in the language the user speaks (English or Roman Urdu/Urdu). Use professional emojis.`;

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
// 🌐 ENHANCED DICTIONARY: ENGLISH & URDU
// ==========================================
const langText = {
    en: {
        welcomeMenu: `🌟 *Welcome to Wajid Ali's Digital Agency!* 🌟\n\nI am Sana, your smart AI Assistant. How can we help you scale your business today?\n\n👇 *Please type a number from below and send:*\n\n*1️⃣* View Our Premium Services 🚀\n*2️⃣* View Website Demos & Portfolios 🌐\n*3️⃣* Talk to our AI Assistant (Text & Voice) 🎙️\n*4️⃣* Talk to Wajid Ali (Human) 👨‍💻\n*5️⃣* زبان تبدیل کریں (Change to Urdu) 🇵🇰`,
        servicesMenu: `🚀 *Our Premium Digital Services*\n\nWe provide top-notch solutions to grow your brand. 👇 *Type the number of the service you are interested in and send:*\n\n*1️⃣* Website Development (E-commerce, Business) 🌐\n*2️⃣* App & Game Development (Android/iOS) 📱\n*3️⃣* Graphics Designing (Logos, UI/UX, Posts) 🎨\n*4️⃣* Advertisement (Facebook/Google Ads) 📢\n*5️⃣* WhatsApp Bot Development (Automate your Business) 🤖\n\n_👉 Type *0* and send anytime to go back to the Main Menu._`,
        allDemos: `✨ *Our Live Portfolios & Demos*\n\nCheck out the premium quality of our recent E-Commerce Website projects:\n\n🔗 *Demo 1:* https://friendspharma.shop/\n🔗 *Demo 2:* https://kmartonline.store/\n\n_(For App, Graphics, or Bot demos, please select option 4 to talk to Wajid Ali)._\n\n_👉 Type *0* to return to the Main Menu._`,
        aiInfo: `🎙️ *AI Voice & Text Assistant*\n\nYou can chat with me naturally!\n\n👉 *Voice Chat:* Just record and send me a Voice Note, and I will reply to you in a female voice.\n👉 *Text Chat:* Just type your question about our services and send it.\n\n_👉 Type *0* anytime to go back to the Main Menu._`,
        demos: {
            web: `🌐 *Website Development*\n\nWe create ultra-fast, modern, and SEO-friendly websites. \n*Live Demos:*\n👉 https://friendspharma.shop/\n👉 https://kmartonline.store/\n\n*Ready to grow your business?*\n✅ Type *YES* to place your order.\n🔙 Type *0* to go back.`,
            app: `📱 *App & Game Development*\n\nGet a smooth, high-performance mobile app or game to engage your customers on Android and iOS.\n\n*Ready to grow your business?*\n✅ Type *YES* to place your order.\n🔙 Type *0* to go back.`,
            graphics: `🎨 *Graphics Designing*\n\nStand out with our eye-catching Logos, UI/UX designs, and engaging Social Media graphics.\n\n*Ready to elevate your brand?*\n✅ Type *YES* to place your order.\n🔙 Type *0* to go back.`,
            ads: `📢 *Advertisement & Marketing*\n\nMultiply your sales with highly targeted Facebook, Instagram, and Google Ads run by our experts.\n\n*Ready to boost your sales?*\n✅ Type *YES* to place your order.\n🔙 Type *0* to go back.`,
            bot: `🤖 *WhatsApp Bot Development*\n\nAutomate your customer support and sales 24/7 with a smart WhatsApp Bot just like me!\n\n*Ready to automate your business?*\n✅ Type *YES* to place your order.\n🔙 Type *0* to go back.`
        },
        askDetails: `🎉 *Excellent Choice!*\n\nLet's get your project started. Please type and send all the following details in a *single message*:\n\n👤 *1. Your Full Name*\n📞 *2. Your Phone Number*\n📝 *3. Short Details of what you want us to build*\n\n_(Waiting for your reply...)_`,
        orderConfirmed: `✅ *Thank You! Your Order Request is Confirmed!*\n\nI have securely forwarded your project details to our system. *Wajid Ali* will personally review them and contact you shortly to start the work.\n\nHave a fantastic day! 🌟`,
        humanMute: `📞 *Request Forwarded to Human!*\n\nI have notified Wajid Ali. He will read your messages and reply to you as soon as he is available. Thank you for your patience! 🌟\n\n_(To reactivate the AI Bot, just type 'bot wake up')_`
    },
    ur: {
        welcomeMenu: `🌟 *واجد علی کی ڈیجیٹل ایجنسی میں خوش آمدید!* 🌟\n\nمیں ثناء ہوں، آپ کی سمارٹ AI اسسٹنٹ۔ آج ہم آپ کے بزنس کو بڑھانے میں کیسے مدد کر سکتے ہیں؟\n\n👇 *براہ کرم نیچے دیا گیا کوئی نمبر ٹائپ کر کے سینڈ کریں:*\n\n*1️⃣* ہماری پریمیم ڈیجیٹل سروسز دیکھیں 🚀\n*2️⃣* ویب سائٹس کے ڈیموز اور پورٹ فولیو دیکھیں 🌐\n*3️⃣* ہماری AI اسسٹنٹ سے بات کریں (ٹیکسٹ یا وائس میں) 🎙️\n*4️⃣* واجد علی (ہیومن) سے بات کریں 👨‍💻\n*5️⃣* Change to English (زبان تبدیل کریں) 🇬🇧`,
        servicesMenu: `🚀 *ہماری پریمیم ڈیجیٹل سروسز*\n\nہم آپ کے برانڈ کو کامیاب بنانے کے لیے بہترین سروسز فراہم کرتے ہیں۔ 👇 *جس سروس کی تفصیل چاہیے، اس کا نمبر ٹائپ کر کے سینڈ کریں:*\n\n*1️⃣* ویب سائٹ ڈیویلپمنٹ (ای کامرس، بزنس ویب سائٹ) 🌐\n*2️⃣* ایپ اور گیم ڈیویلپمنٹ (اینڈرائیڈ / iOS) 📱\n*3️⃣* گرافکس ڈیزائننگ (لوگوز، UI/UX، پوسٹس) 🎨\n*4️⃣* ڈیجیٹل مارکیٹنگ (فیس بک / گوگل ایڈز) 📢\n*5️⃣* واٹس ایپ بوٹ ڈیویلپمنٹ (بزنس کو آٹومیٹ کریں) 🤖\n\n_👉 مین مینو میں واپس جانے کے لیے کسی بھی وقت *0* ٹائپ کر کے سینڈ کریں۔_`,
        allDemos: `✨ *ہمارے لائیو ڈیموز اور پروجیکٹس*\n\nہماری بنائی گئی بہترین ای کامرس ویب سائٹس کے لائیو ڈیموز چیک کریں:\n\n🔗 *ڈیمو 1:* https://friendspharma.shop/\n🔗 *ڈیمو 2:* https://kmartonline.store/\n\n_(ایپ، گرافکس، یا بوٹ کے ڈیموز کے لیے، براہ کرم آپشن 4 منتخب کر کے واجد علی سے بات کریں)۔_\n\n_👉 مین مینو میں واپس جانے کے لیے *0* ٹائپ کریں۔_`,
        aiInfo: `🎙️ *AI وائس اور ٹیکسٹ اسسٹنٹ*\n\nآپ مجھ سے بالکل انسانوں کی طرح بات کر سکتے ہیں!\n\n👉 *وائس چیٹ:* بس ایک وائس نوٹ ریکارڈ کر کے بھیجیں، اور میں آپ کو لڑکی کی آواز میں وائس نوٹ سے ہی جواب دوں گی۔\n👉 *ٹیکسٹ چیٹ:* ہماری سروسز کے حوالے سے کوئی بھی سوال لکھ کر سینڈ کریں۔\n\n_👉 مین مینو میں واپس جانے کے لیے کسی بھی وقت *0* ٹائپ کریں۔_`,
        demos: {
            web: `🌐 *ویب سائٹ ڈیویلپمنٹ*\n\nہم انتہائی فاسٹ، جدید اور پروفیشنل ویب سائٹس بناتے ہیں۔\n*ہمارے لائیو ڈیموز:*\n👉 https://friendspharma.shop/\n👉 https://kmartonline.store/\n\n*کیا آپ اپنا بزنس بڑھانے کے لیے تیار ہیں؟*\n✅ آرڈر کرنے کے لیے *YES* لکھ کر سینڈ کریں۔\n🔙 پیچھے جانے کے لیے *0* ٹائپ کریں۔`,
            app: `📱 *ایپ اور گیم ڈیویلپمنٹ*\n\nاینڈرائیڈ اور iOS کے لیے بہترین پرفارمنس والی موبائل ایپس اور گیمز بنوائیں۔\n\n*کیا آپ آرڈر کنفرم کرنا چاہتے ہیں؟*\n✅ آرڈر کرنے کے لیے *YES* لکھ کر سینڈ کریں۔\n🔙 پیچھے جانے کے لیے *0* ٹائپ کریں۔`,
            graphics: `🎨 *گرافکس ڈیزائننگ*\n\nخوبصورت لوگوز، UI/UX اور سوشل میڈیا گرافکس کے ذریعے اپنے برانڈ کی پہچان بنائیں۔\n\n*کیا آپ آرڈر کنفرم کرنا چاہتے ہیں؟*\n✅ آرڈر کرنے کے لیے *YES* لکھ کر سینڈ کریں۔\n🔙 پیچھے جانے کے لیے *0* ٹائپ کریں۔`,
            ads: `📢 *ایڈورٹائزمنٹ اور مارکیٹنگ*\n\nہمارے ایکسپرٹس سے فیس بک اور گوگل ایڈز چلوا کر اپنی سیلز کو کئی گنا بڑھائیں۔\n\n*کیا آپ سیلز بڑھانے کے لیے تیار ہیں؟*\n✅ آرڈر کرنے کے لیے *YES* لکھ کر سینڈ کریں۔\n🔙 پیچھے جانے کے لیے *0* ٹائپ کریں۔`,
            bot: `🤖 *واٹس ایپ بوٹ ڈیویلپمنٹ*\n\nمیرے جیسا ایک سمارٹ واٹس ایپ بوٹ بنوا کر اپنے بزنس اور کسٹمر سپورٹ کو 24 گھنٹے کے لیے آٹومیٹک بنائیں۔\n\n*کیا آپ آرڈر کنفرم کرنا چاہتے ہیں؟*\n✅ آرڈر کرنے کے لیے *YES* لکھ کر سینڈ کریں۔\n🔙 پیچھے جانے کے لیے *0* ٹائپ کریں۔`
        },
        askDetails: `🎉 *بہترین انتخاب!*\n\nآئیے آپ کا پروجیکٹ شروع کرتے ہیں۔ براہ کرم ایک ہی میسج میں درج ذیل تفصیلات لکھ کر سینڈ کریں:\n\n👤 *1. آپ کا مکمل نام*\n📞 *2. آپ کا فون نمبر*\n📝 *3. آپ کو کیسا پروجیکٹ چاہیے؟ (مختصر تفصیل)*\n\n_(آپ کے میسج کا انتظار ہے...)_`,
        orderConfirmed: `✅ *شکریہ! آپ کا آرڈر کنفرم ہو گیا ہے!*\n\nمیں نے آپ کے پروجیکٹ کی تفصیلات محفوظ کر لی ہیں۔ *واجد علی* بہت جلد انہیں چیک کر کے کام شروع کرنے کے لیے آپ سے رابطہ کریں گے۔\n\nآپ کا دن خوشگوار گزرے! 🌟`,
        humanMute: `📞 *درخواست واجد علی کو بھیج دی گئی ہے!*\n\nمیں نے واجد علی کو آپ کے میسج کا نوٹیفکیشن دے دیا ہے۔ وہ جیسے ہی آن لائن ہوں گے، آپ سے رابطہ کریں گے۔ آپ کے انتظار کا شکریہ! 🌟\n\n_(AI بوٹ کو دوبارہ آن کرنے کے لیے 'bot wake up' ٹائپ کریں)_`
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
        browser: Browsers.macOS('Desktop'), // ✅ FIXED FOR NORMAL & BUSINESS WHATSAPP
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
            console.log('✅ WAJID ALI AI-ASSISTANT IS ONLINE SUCCESSFULLY!');
            debouncedUpload();
        }
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                startBot();
            } else {
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
                await sock.sendMessage(sender, { text: t.welcomeMenu });
            }
            return; 
        }

        // ✅ Hi, Hello, Salam, 0 یا Menu پر مین مینو شو کرو
        const isGreeting = /^(0|menu|start|hi|hello|hey|salam|assalam.*|ہائے|ہیلو|سلام)$/i.test(text);
        
        if (isGreeting) {
            userState.step = 'WELCOME_MENU';
            await sock.sendMessage(sender, { text: t.welcomeMenu });
            return;
        }

        // 🎤 VOICE MESSAGE HANDLER (AI)
        if (msgType === 'audioMessage') {
            await sock.sendPresenceUpdate('recording', sender);
            try {
                const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: AI_PROMPT });
                const result = await model.generateContent([
                    "Listen to this audio from the user and reply nicely. Speak about our digital services if asked.",
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
                await sock.sendMessage(sender, { text: "⚠️ Sorry, my voice processor had a glitch. Please reply '0' for Menu." });
            }
            return;
        }

        // ⌨️ TEXT MENU HANDLER
        if (userState.step === 'WELCOME_MENU') {
            if (text === '1') { 
                userState.step = 'SERVICES_MENU';
                await sock.sendMessage(sender, { text: t.servicesMenu });
            } else if (text === '2') { 
                await sock.sendMessage(sender, { text: t.allDemos });
            } else if (text === '3') { 
                await sock.sendMessage(sender, { text: t.aiInfo });
            } else if (text === '4') { 
                userState.isMuted = true;
                await sock.sendMessage(sender, { text: t.humanMute });
            } else if (text === '5') { 
                userState.lang = lang === 'en' ? 'ur' : 'en'; 
                await sock.sendMessage(sender, { text: langText[userState.lang].welcomeMenu });
            } else {
                // اگر مینو کا نمبر نہیں ہے تو AI کو بات کرنے دو
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
            if (text.includes('yes') || text.includes('y') || text.includes('ہاں') || text.includes('haan')) {
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
