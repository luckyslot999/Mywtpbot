require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ==========================================
// 🛡️ ANTI-CRASH MECHANISM (TO PREVENT SERVER REstarts)
// ==========================================
process.on('uncaughtException', (err) => {
    let errStr = String(err);
    if (errStr.includes('Unsupported state') || errStr.includes('authenticate data') || errStr.includes('bad mac')) {
        console.log('⚠️ [ANTI-CRASH] Ignored Baileys Crypto/State Error. Bot will continue running.');
    } else {
        console.error('⚠️ [ANTI-CRASH] Uncaught Exception:', err);
    }
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [ANTI-CRASH] Unhandled Rejection at:', promise, 'reason:', reason);
});

// ==========================================
// 🌐 RENDER 24/7 UPTIME SERVER
// ==========================================
const app = express();
app.get('/', (req, res) => res.send('🤖 Wajid Ali Digital Agency AI is Running 24/7 for Multiple Numbers!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

// ==========================================
// 🔑 CONFIGURATIONS (Firebase, Gemini)
// ==========================================
let FIREBASE_URL = process.env.FIREBASE_URL || "";
if (FIREBASE_URL.endsWith('/')) FIREBASE_URL = FIREBASE_URL.slice(0, -1);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const AI_PROMPT = `You are a highly conversational sales bot assistant for Wajid Ali's Digital Agency.
We offer: Website Dev, App Dev, Graphics, Ads, and WhatsApp Bots.
Rule 1: Answer naturally and politely. DO NOT mention you are an AI. Say you are Wajid's Bot Assistant.
Rule 2: Never give prices. Say Wajid Ali will quote the exact price.
Rule 3: Keep your response SHORT (under 180 characters).
Rule 4: Reply in the language the user speaks (English or Urdu).`;

const userStates = {}; 

// ==========================================
// 📱 TARGET WHATSAPP NUMBERS FOR PAIRING
// ==========================================
const TARGET_NUMBERS = [
    "923139071038",
    "923019022815",
    "923499085004"
];

// 🧹 پرانا مین سیشن فولڈر ڈیلیٹ کرنے کا فنکشن (تاکہ کوئی Conflict نہ ہو)
if (fs.existsSync('session_data')) {
    console.log("🧹 Cleaning up old legacy session data...");
    fs.rmSync('session_data', { recursive: true, force: true });
}

// ==========================================
// 🔥 FIREBASE SESSION MANAGEMENT
// ==========================================
async function downloadSession(phoneNumber) {
    if (!FIREBASE_URL) return;
    try {
        const response = await fetch(`${FIREBASE_URL}/sessions/${phoneNumber}.json`);
        const data = await response.json();
        const sessionFolder = `session_${phoneNumber}`;
        if (data && Object.keys(data).length > 0) {
            if (!fs.existsSync(sessionFolder)) fs.mkdirSync(sessionFolder, { recursive: true });
            for (const file in data) {
                let content = typeof data[file] === 'string' ? data[file] : JSON.stringify(data[file]);
                fs.writeFileSync(path.join(sessionFolder, file), content);
            }
        }
    } catch (error) {}
}

async function uploadSession(phoneNumber) {
    const sessionFolder = `session_${phoneNumber}`;
    if (!FIREBASE_URL || !fs.existsSync(sessionFolder)) return;
    try {
        const files = fs.readdirSync(sessionFolder);
        let sessionObj = {};
        for (const file of files) {
            if(file.endsWith('.json')) {
                try {
                    sessionObj[file] = fs.readFileSync(path.join(sessionFolder, file), 'utf-8');
                } catch(e) {} // Ignore read errors to prevent crash
            }
        }
        await fetch(`${FIREBASE_URL}/sessions/${phoneNumber}.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sessionObj) });
    } catch (error) {}
}

const syncTimeouts = {};
function debouncedUpload(phoneNumber) {
    if (syncTimeouts[phoneNumber]) clearTimeout(syncTimeouts[phoneNumber]);
    syncTimeouts[phoneNumber] = setTimeout(async () => { await uploadSession(phoneNumber); }, 5000);
}

// ==========================================
// 🌐 ENHANCED DICTIONARY
// ==========================================
const langText = {
    en: {
        welcomeMenu: `🌟 *Welcome to Wajid Ali Digital Agency!* 🌟\n\nI am Wajid's Smart Assistant. Taking your business to the next level in the digital world is our priority! 🚀\n\n👇 *Please type and send a number from the options below:*\n\n*1️⃣* Explore Our Premium Services 💼\n*2️⃣* View Live Portfolios & Demos 🌐\n*3️⃣* Talk Directly to Wajid Ali 👨‍💻\n\n*4️⃣* اردو زبان کے لیے (For Urdu) 🇵🇰`,
        servicesMenu: `🚀 *Our Premium Digital Services* 🚀\n\nWe turn your ideas into reality. Here is what we offer:\n👇 *Type and send the number of the service you are interested in:*\n\n*1️⃣* Professional Website Development 🌐\n*2️⃣* Mobile App Development 📱\n*3️⃣* Graphics Designing (Logos, Posts) 🎨\n*4️⃣* Digital Marketing (FB/Google Ads) 📢\n*5️⃣* WhatsApp Automation Bots 🤖\n\n_👉 Type *0* to go back to the Main Menu._`,
        allDemos: `✨ *Our Live Portfolios & Demos* ✨\n\nWe believe in showing, not just telling. Check out our recent successful projects:\n\n🔗 https://friendspharma.shop/\n🔗 https://kmartonline.store/\n\n_👉 Type *0* to go back to the Main Menu._`,
        demos: {
            web: `🌐 *Website Development*\n\nOur websites are fast, secure, and visually stunning.\n👇 *Check out our live client work:*\n🔗 https://friendspharma.shop/\n🔗 https://kmartonline.store/\n\n✨ *Do you want a website like this?*\n✅ Type and send *YES* to place your order now.\n🔙 Type *0* to go back.`,
            app: `📱 *Mobile App Development*\n\nWe build high-performance, user-friendly mobile apps that your customers will love.\n\n✨ *Ready to build your app?*\n✅ Type and send *YES* to place your order now.\n🔙 Type *0* to go back.`,
            graphics: `🎨 *Graphics Designing*\n\nFrom professional logos to engaging social media posts, we design it all beautifully.\n\n✨ *Need creative designs?*\n✅ Type and send *YES* to place your order now.\n🔙 Type *0* to go back.`,
            ads: `📢 *Digital Marketing & Ads*\n\nBoost your sales and reach millions of customers with our targeted Facebook & Google Ads campaigns.\n\n✨ *Want to multiply your sales?*\n✅ Type and send *YES* to place your order now.\n🔙 Type *0* to go back.`,
            bot: `🤖 *WhatsApp Automation Bots*\n\nAutomate your customer support and sales 24/7 with our smart AI WhatsApp bots.\n\n✨ *Ready to automate your business?*\n✅ Type and send *YES* to place your order now.\n🔙 Type *0* to go back.`
        },
        askDetails: `🎉 *Great Decision!* Your project is important to us.\n\nPlease send the following details in *ONE single message* so we can get started:\n\n👤 *1. Your Name*\n📞 *2. Phone Number*\n📝 *3. Complete Project Details*\n\n_(Once you send this, Wajid Ali will contact you directly)_`,
        orderConfirmed: `✅ *Order Received Successfully!*\n\nThank you for choosing us. Wajid Ali has received your details and will contact you very shortly. Have a great day! 🌟`,
        humanMute: `📞 *Connecting to Wajid Ali...*\n\nI have forwarded your request directly to Wajid Ali. Please wait, he will reply to you as soon as he is available. 👨‍💻\n\n_(Type 'bot wake up' anytime to activate me again)_`,
        invalidOption: `⚠️ *Invalid Selection!*\nPlease select a valid number from the menu options below.`,
        autoMuted: `🤖 I understand you want to talk directly to Wajid Ali.\n\n📞 *Redirecting...*\nI have forwarded your chat. Please wait, Wajid Ali will contact you as soon as he is online. 👨‍💻\n\n_(Type 'bot wake up' anytime to activate me again)_`,
        confirmPrompt: `⚠️ *Please confirm your order!*\nType *YES* to confirm and proceed, or type *0* to go back to the Main Menu.`
    },
    ur: {
        welcomeMenu: `🌟 *واجد علی ڈیجیٹل ایجنسی میں خوش آمدید!* 🌟\n\nمیں واجد کا سمارٹ اسسٹنٹ ہوں۔ آپ کے بزنس کو ڈیجیٹل دنیا میں کامیاب بنانا ہماری ذمہ داری ہے! 🚀\n\n👇 *براہ کرم اپنی ضرورت کے مطابق نیچے دیا گیا کوئی ایک نمبر ٹائپ کر کے سینڈ کریں:*\n\n*1️⃣* ہماری پریمیم ڈیجیٹل سروسز دیکھیں 💼\n*2️⃣* ہمارے کام کے لائیو ڈیموز دیکھیں 🌐\n*3️⃣* واجد علی سے براہ راست بات کریں 👨‍💻\n\n*4️⃣* انگریزی زبان کے لیے (For English) 🇬🇧`,
        servicesMenu: `🚀 *ہماری پریمیم ڈیجیٹل سروسز* 🚀\n\nہم آپ کے آئیڈیاز کو حقیقت میں بدلتے ہیں۔ ہم کیا آفر کرتے ہیں؟\n👇 *تفصیلات جاننے کے لیے اپنی پسندیدہ سروس کا نمبر لکھ کر سینڈ کریں:*\n\n*1️⃣* پروفیشنل ویب سائٹ ڈیویلپمنٹ 🌐\n*2️⃣* موبائل ایپ ڈیویلپمنٹ 📱\n*3️⃣* گرافکس ڈیزائننگ (لوگو، پوسٹس) 🎨\n*4️⃣* ڈیجیٹل مارکیٹنگ (فیس بک/گوگل ایڈز) 📢\n*5️⃣* واٹس ایپ آٹو ریپلائی بوٹ 🤖\n\n_👉 مین مینیو میں واپس جانے کے لیے *0* ٹائپ کریں۔_`,
        allDemos: `✨ *ہمارے لائیو ڈیموز اور پورٹ فولیو* ✨\n\nہم صرف باتیں نہیں کرتے، کام کر کے دکھاتے ہیں۔ ہمارے حالیہ کامیاب پروجیکٹس یہاں چیک کریں:\n\n🔗 https://friendspharma.shop/\n🔗 https://kmartonline.store/\n\n_👉 مین مینو میں واپس جانے کے لیے *0* ٹائپ کریں۔_`,
        demos: {
            web: `🌐 *ویب سائٹ ڈیویلپمنٹ*\n\nہماری بنائی گئی ویب سائٹس تیز، محفوظ اور خوبصورت ہوتی ہیں۔\n👇 *ہمارے کلائنٹس کا لائیو کام چیک کریں:*\n🔗 https://friendspharma.shop/\n🔗 https://kmartonline.store/\n\n✨ *کیا آپ بھی ایسی پروفیشنل ویب سائٹ بنوانا چاہتے ہیں؟*\n✅ آرڈر بک کرنے کے لیے ابھی *YES* لکھ کر سینڈ کریں۔\n🔙 پیچھے جانے کے لیے *0* ٹائپ کریں۔`,
            app: `📱 *موبائل ایپ ڈیویلپمنٹ*\n\nہم ایسی شاندار اور تیز ترین موبائل ایپس بناتے ہیں جو آپ کے کسٹمرز کو پسند آئیں گی۔\n\n✨ *کیا آپ اپنی ایپ بنوانا چاہتے ہیں؟*\n✅ آرڈر بک کرنے کے لیے ابھی *YES* لکھ کر سینڈ کریں۔\n🔙 پیچھے جانے کے لیے *0* ٹائپ کریں۔`,
            graphics: `🎨 *گرافکس ڈیزائننگ*\n\nپروفیشنل بزنس لوگو سے لے کر سوشل میڈیا پوسٹس تک، ہم ہر ڈیزائن کو دلکش بناتے ہیں۔\n\n✨ *کیا آپ کو بہترین ڈیزائنز چاہیے؟*\n✅ آرڈر بک کرنے کے لیے ابھی *YES* لکھ کر سینڈ کریں۔\n🔙 پیچھے جانے کے لیے *0* ٹائپ کریں۔`,
            ads: `📢 *ڈیجیٹل مارکیٹنگ اور ایڈز*\n\nفیس بک اور گوگل ایڈز کے ذریعے اپنی سیلز کو کئی گنا بڑھائیں اور لاکھوں کسٹمرز تک پہنچیں۔\n\n✨ *کیا آپ اپنی سیلز بڑھانا چاہتے ہیں؟*\n✅ آرڈر بک کرنے کے لیے ابھی *YES* لکھ کر سینڈ کریں۔\n🔙 پیچھے جانے کے لیے *0* ٹائپ کریں۔`,
            bot: `🤖 *واٹس ایپ آٹو ریپلائی بوٹ*\n\nہمارے سمارٹ AI بوٹس کے ذریعے اپنے کسٹمر سپورٹ اور سیلز کو 24 گھنٹے آٹومیٹ کریں۔\n\n✨ *کیا آپ اپنا واٹس ایپ بوٹ بنوانا چاہتے ہیں؟*\n✅ آرڈر بک کرنے کے لیے ابھی *YES* لکھ کر سینڈ کریں۔\n🔙 پیچھے جانے کے لیے *0* ٹائپ کریں۔`
        },
        askDetails: `🎉 *زبردست فیصلہ!* آپ کا پروجیکٹ ہمارے لیے بہت اہم ہے۔\n\nبراہ کرم ایک ہی میسج میں اپنی یہ تفصیلات لکھ کر بھیجیں تاکہ ہم کام شروع کر سکیں:\n\n👤 *1. آپ کا نام*\n📞 *2. آپ کا فون نمبر*\n📝 *3. پروجیکٹ کی مکمل تفصیل*\n\n_(جیسے ہی آپ تفصیلات بھیجیں گے، واجد علی خود آپ سے رابطہ کریں گے)_`,
        orderConfirmed: `✅ *آپ کا آرڈر موصول ہو گیا ہے!*\n\nہم پر اعتماد کرنے کا شکریہ۔ واجد علی کو آپ کی تفصیلات مل گئی ہیں اور وہ بہت جلد آپ سے رابطہ کریں گے۔ آپ کا دن خوشگوار گزرے! 🌟`,
        humanMute: `📞 *واجد علی سے رابطہ کیا جا رہا ہے...*\n\nمیں نے آپ کا میسج براہ راست واجد علی کو فارورڈ کر دیا ہے۔ براہ کرم انتظار کریں، وہ جیسے ہی فری ہوں گے آپ کو ریپلائی کریں گے۔ 👨‍💻\n\n_(بوٹ کو دوبارہ آن کرنے کے لیے کسی بھی وقت 'bot wake up' لکھیں)_`,
        invalidOption: `⚠️ *غلط انتخاب!*\nبراہ کرم دیے گئے مینیو میں سے کوئی درست نمبر (جیسے 1، 2، یا 3) ٹائپ کر کے سینڈ کریں۔`,
        autoMuted: `🤖 میں سمجھ گیا ہوں کہ آپ براہ راست واجد علی سے بات کرنا چاہتے ہیں۔\n\n📞 *ری ڈائریکٹ کیا جا رہا ہے...*\nمیں نے آپ کا نمبر واجد علی کو فارورڈ کر دیا ہے۔ جیسے ہی وہ آن لائن ہوں گے وہ خود آپ سے رابطہ کر لیں گے۔ 👨‍💻\n\n_(بوٹ کو دوبارہ آن کرنے کے لیے کسی بھی وقت 'bot wake up' لکھیں)_`,
        confirmPrompt: `⚠️ *براہ کرم آرڈر کنفرم کریں!*\nآگے بڑھنے کے لیے *YES* لکھیں، یا مین مینیو میں واپس جانے کے لیے *0* ٹائپ کریں۔`
    }
};

// ==========================================
// 🚀 BOT START (QR LINKS ONLY)
// ==========================================
function startBotForNumber(phoneNumber) {
    return new Promise(async (resolve) => {
        try {
            const sessionFolder = `session_${phoneNumber}`;
            await downloadSession(phoneNumber);

            const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
            const { version } = await fetchLatestBaileysVersion();

            const sock = makeWASocket({
                version,
                auth: state,
                printQRInTerminal: false, 
                logger: pino({ level: 'silent' }),
                browser: Browsers.ubuntu('Chrome'), 
                syncFullHistory: false
            });

            let isInitialized = false;

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;
                
                // ✅ GENERATE ONLY QR CODE LINK
                if (qr) {
                    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
                    console.log('\n===================================================');
                    console.log(`📱 QR CODE LINK READY FOR NUMBER: [${phoneNumber}]`);
                    console.log(`👉 LINK: ${qrImageUrl}`);
                    console.log('(Scan this code with your WhatsApp to connect)');
                    console.log('===================================================\n');

                    if (!isInitialized) {
                        isInitialized = true;
                        resolve();
                    }
                }
                
                if (connection === 'open') {
                    console.log(`\n✅ >>> SUCCESS: DEVICE IS CONNECTED AND BOT IS FULLY ONLINE FOR [${phoneNumber}] <<< \n`);
                    debouncedUpload(phoneNumber);
                    
                    if (!isInitialized) {
                        isInitialized = true;
                        resolve();
                    }
                }
                
                if (connection === 'close') {
                    const reason = lastDisconnect?.error?.output?.statusCode;
                    if (reason === DisconnectReason.loggedOut || reason === 401 || reason === 403) {
                        console.log(`⚠️ Session logged out for ${phoneNumber}. Cleaning up...`);
                        if (fs.existsSync(sessionFolder)) fs.rmSync(sessionFolder, { recursive: true, force: true });
                    } else {
                        console.log(`🔄 Connection dropped for ${phoneNumber}. Reconnecting automatically...`);
                    }
                    setTimeout(() => startBotForNumber(phoneNumber), 3000); // Auto-reconnect with short delay
                }
            });

            sock.ev.on('creds.update', async () => {
                try {
                    await saveCreds();
                    debouncedUpload(phoneNumber);
                } catch(err) {
                    // Ignore creds error to prevent crash
                }
            });

            sock.ev.on('messages.upsert', async (m) => {
                try {
                    const msg = m.messages[0];
                    if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.fromMe) return;

                    const sender = msg.key.remoteJid;
                    const msgType = Object.keys(msg.message)[0];
                    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase().trim();
                    const rawText = msg.message.conversation || msg.message.extendedTextMessage?.text || ""; 

                    if (!userStates[sender]) {
                        let detectedLang = 'ur'; 
                        if (/hi|hello|hey|english/i.test(text) && !/[\u0600-\u06FF]/.test(text) && !/salam|assalam/i.test(text)) {
                            detectedLang = 'en';
                        }

                        userStates[sender] = { step: 'WELCOME_MENU', lang: detectedLang, isMuted: false, invalidAttempts: 0 };
                        const t = langText[detectedLang];
                        
                        await sock.sendMessage(sender, { text: t.welcomeMenu });
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
                        }
                        return; 
                    }

                    if (text === '0' || text === 'menu') {
                        userState.step = 'WELCOME_MENU';
                        userState.invalidAttempts = 0;
                        await sock.sendMessage(sender, { text: t.welcomeMenu });
                        return;
                    }

                    if (msgType === 'audioMessage') {
                        await sock.sendPresenceUpdate('composing', sender);
                        try {
                            let mimeType = msg.message.audioMessage.mimetype.split(';')[0] || "audio/ogg";
                            const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                            
                            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: AI_PROMPT });
                            const result = await model.generateContent([
                                "Listen to the user's audio and reply naturally. Keep it under 180 characters.",
                                { inlineData: { data: buffer.toString("base64"), mimeType: mimeType } }
                            ]);
                            
                            const aiResponse = result.response.text();
                            await sock.sendMessage(sender, { text: aiResponse }, { quoted: msg });
                        } catch (e) {
                            console.error("Audio Process Error:", e);
                            await sock.sendMessage(sender, { text: "👉 مینو میں واپس جانے کے لیے 0 لکھیں" }, { quoted: msg });
                        }
                        return;
                    }

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
                        } else if (text === '4') { 
                            userState.invalidAttempts = 0;
                            userState.lang = lang === 'en' ? 'ur' : 'en'; 
                            const newLang = userState.lang;
                            await sock.sendMessage(sender, { text: langText[newLang].welcomeMenu });
                        } else {
                            userState.invalidAttempts = (userState.invalidAttempts || 0) + 1;
                            if (userState.invalidAttempts >= 3) {
                                userState.isMuted = true;
                                await sock.sendMessage(sender, { text: t.autoMuted });
                            } else {
                                await sock.sendMessage(sender, { text: `${t.invalidOption}\n\n${t.welcomeMenu}` });
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
                            userState.invalidAttempts = 0;
                            userState.step = 'WAITING_FOR_ORDER_CONFIRM';
                            userState.category = categories[text].name;
                            await sock.sendMessage(sender, { text: categories[text].demo });
                        } else {
                            await sock.sendMessage(sender, { text: `${t.invalidOption}\n\n${t.servicesMenu}` });
                        }
                        return;
                    }

                    if (userState.step === 'WAITING_FOR_ORDER_CONFIRM') {
                        if (text.includes('yes') || text.includes('y') || text.includes('ہاں') || text.includes('haan')) {
                            userState.step = 'WAITING_FOR_DETAILS';
                            await sock.sendMessage(sender, { text: t.askDetails });
                        } else {
                            await sock.sendMessage(sender, { text: t.confirmPrompt });
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
                } catch(error) {
                    console.log("⚠️ Error processing message:", error);
                }
            });
        } catch (error) {
            console.log("⚠️ Fatal error in startBotForNumber:", error);
            setTimeout(() => startBotForNumber(phoneNumber), 5000); // Re-attempt on critical failure
        }
    });
}

// ==========================================
// 🚀 RUN BOT FOR ALL NUMBERS WITH 3 SEC DELAY
// ==========================================
async function startAllBots() {
    console.log(`\n🚀 Starting setup for ${TARGET_NUMBERS.length} numbers...\n`);
    
    for (let i = 0; i < TARGET_NUMBERS.length; i++) {
        const number = TARGET_NUMBERS[i];
        console.log(`⏳ Initializing Bot for Number: [${number}]...`);
        
        // یہ فنکشن تب تک انتظار کرے گا جب تک QR لنک لاگز میں پرنٹ نہ ہو جائے
        await startBotForNumber(number);
        
        // اگر یہ آخری نمبر نہیں ہے تو 3 سیکنڈ کا کاؤنٹ ڈاؤن شروع کرو
        if (i < TARGET_NUMBERS.length - 1) {
            console.log(`\n⏳ اگلا QR سکینر لنک 3 سیکنڈ میں آئے گا...`);
            for (let c = 3; c > 0; c--) {
                console.log(`⏱️ ${c}...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            console.log(`\n`);
        }
    }
    
    console.log(`\n🎉 تمام ڈیوائسز کے لنکس تیار ہیں۔ اگر آپ نے کوئی نمبر کنیکٹ نہیں کیا تو اوپر دیے گئے لنکس سے کر لیں۔`);
}

startAllBots().catch(err => console.log("Critical Error: " + err));
