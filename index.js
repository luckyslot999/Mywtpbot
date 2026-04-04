const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

// Firebase URL (Ensure it doesn't have a trailing slash)
let FIREBASE_URL = process.env.FIREBASE_URL || "";
if (FIREBASE_URL.endsWith('/')) FIREBASE_URL = FIREBASE_URL.slice(0, -1);

const userStates = {}; 

// ==========================================
// 🔥 FIREBASE SESSION MANAGEMENT (No More Repeated Scans)
// ==========================================

async function downloadSession() {
    if (!FIREBASE_URL) {
        console.log('⚠️ FIREBASE_URL is not set!');
        return;
    }
    try {
        console.log('⏳ Checking for existing session in Firebase...');
        const response = await fetch(`${FIREBASE_URL}/whatsapp_session.json`);
        const data = await response.json();
        
        if (data) {
            if (!fs.existsSync('session_data')) fs.mkdirSync('session_data');
            for (const file in data) {
                fs.writeFileSync(path.join('session_data', file), data[file]);
            }
            console.log('✅ Session restored successfully from Firebase!');
        } else {
            console.log('⚠️ No previous session found in Firebase. Get ready to scan QR Code.');
        }
    } catch (error) {
        console.log('❌ Error restoring session from Firebase:', error.message);
    }
}

async function uploadSession() {
    if (!FIREBASE_URL || !fs.existsSync('session_data')) return;
    try {
        const files = fs.readdirSync('session_data');
        let sessionObj = {};
        for (const file of files) {
            sessionObj[file] = fs.readFileSync(path.join('session_data', file), 'utf-8');
        }
        
        await fetch(`${FIREBASE_URL}/whatsapp_session.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sessionObj)
        });
    } catch (error) {
        console.log('❌ Error syncing session to Firebase:', error.message);
    }
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
        humanMute: `📞 *Request Forwarded!*\n\nI have notified Wajid Ali. He will review your message and reply to you shortly. Please wait for his response. Thank you! 🌟`,
        invalidInput: `🤔 *I didn't understand that.*\n\nPlease reply with one of the following numbers:\n\n👉 Type *1* to view our Services.\n👉 Type *2* to talk to Wajid Ali.\n👉 Type *3* to change language.\n\nReply with *0* anytime to see the Main Menu again.`
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
        humanMute: `📞 *درخواست موصول ہو گئی!*\n\nمیں نے واجد علی کو اطلاع دے دی ہے۔ وہ جلد ہی آپ کا میسج چیک کر کے آپ سے رابطہ کریں گے۔ براہ کرم ان کے جواب کا انتظار کریں۔ شکریہ! 🌟`,
        invalidInput: `🤔 *مجھے آپ کی بات سمجھ نہیں آئی۔*\n\nبراہ کرم نیچے دیے گئے آپشنز میں سے کوئی ایک نمبر ٹائپ کر کے سینڈ کریں:\n\n👉 سروسز دیکھنے کے لیے *1* لکھیں۔\n👉 واجد علی سے بات کرنے کے لیے *2* لکھیں۔\n👉 زبان تبدیل کرنے کے لیے *3* لکھیں۔\n\nمین مینو میں واپس جانے کے لیے کسی بھی وقت *0* بھیجیں۔`
    }
};

async function startBot() {
    
    // 1️⃣ سب سے پہلے فائر بیس سے پچھلا سیشن ڈاؤنلوڈ کرے گا (اگر موجود ہوا)
    await downloadSession();

    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false, 
        logger: pino({ level: 'silent' }),
        browser: ["W-Assistant", "Chrome", "1.0"] 
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
            console.log('\n=============================================================');
            console.log('🔄 NEW QR CODE GENERATED!');
            console.log('🔗 CLICK FAST TO SCAN: 👉 ' + qrImageUrl);
            console.log('=============================================================\n');
        }

        if (connection === 'open') {
            console.log('✅ W-ASSISTANT IS ONLINE AND READY!');
            // 2️⃣ کنیکٹ ہونے کے بعد سیشن فائر بیس پر سیو کر دے گا
            await uploadSession();
        }
        
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                console.log('🔄 Reconnecting...');
                startBot();
            } else {
                console.log('❌ Logged out from WhatsApp. Please delete "whatsapp_session" node from Firebase and rescan.');
            }
        }
    });

    // 3️⃣ جب بھی واٹس ایپ کیز (Keys) اپڈیٹ کرے، انہیں فائر بیس پر اپلوڈ کر دے
    sock.ev.on('creds.update', async () => {
        await saveCreds();
        await uploadSession();
    });

    // ==========================================
    // 📩 MESSAGES HANDLING SYSTEM
    // ==========================================
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
        if (msg.key.fromMe) return; 

        const sender = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase().trim();
        const rawText = msg.message.conversation || msg.message.extendedTextMessage?.text || ""; 

        const greetings = ['hi', 'hello', 'hey', 'salam', 'assalam', 'assalamualaikum', '0', 'menu', 'start'];
        
        if (greetings.some(word => text === word || text.includes(word))) {
            const currentLang = userStates[sender]?.lang || 'ur'; 
            userStates[sender] = { step: 'WELCOME_MENU', lang: currentLang, isMuted: false };
            await sock.sendMessage(sender, { text: langText[currentLang].welcomeMenu });
            return;
        }

        if (!userStates[sender]) {
            userStates[sender] = { step: 'WELCOME_MENU', lang: 'ur', isMuted: false };
            await sock.sendMessage(sender, { text: langText['ur'].welcomeMenu });
            return;
        }

        if (userStates[sender].isMuted) {
            if (text === "bot wake up") {
                userStates[sender].isMuted = false;
                userStates[sender].step = 'WELCOME_MENU';
                await sock.sendMessage(sender, { text: "🤖 Service Reactivated!\n\n" + langText[userStates[sender].lang].welcomeMenu });
            }
            return; 
        }

        const userState = userStates[sender];
        const lang = userState.lang;
        const t = langText[lang];

        if (userState.step === 'WELCOME_MENU') {
            if (text === '1') { 
                userState.step = 'SERVICES_MENU';
                await sock.sendMessage(sender, { text: t.servicesMenu });
            } 
            else if (text === '2') { 
                userState.isMuted = true;
                await sock.sendMessage(sender, { text: t.humanMute });
            } 
            else if (text === '3') { 
                userState.lang = lang === 'en' ? 'ur' : 'en'; 
                await sock.sendMessage(sender, { text: langText[userState.lang].welcomeMenu });
            } 
            else {
                await sock.sendMessage(sender, { text: t.invalidInput });
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
                await sock.sendMessage(sender, { text: t.invalidInput });
            }
            return;
        }

        if (userState.step === 'WAITING_FOR_ORDER_CONFIRM') {
            if (text.includes('yes') || text.includes('y') || text.includes('ہاں')) {
                userState.step = 'WAITING_FOR_DETAILS';
                await sock.sendMessage(sender, { text: t.askDetails });
            } else {
                await sock.sendMessage(sender, { text: `🤔 *Please reply with YES to confirm your order.*\n\nOr reply with *0* to go back to the Main Menu.` });
            }
            return;
        }

        if (userState.step === 'WAITING_FOR_DETAILS') {
            const newLead = {
                phone: sender.split('@')[0],
                service: userState.category,
                requirement: rawText, 
                timestamp: new Date().toISOString()
            };

            if (FIREBASE_URL) {
                try {
                    await fetch(`${FIREBASE_URL}/leads.json`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newLead)
                    });
                } catch (error) {
                    console.log("❌ Firebase Save Error", error);
                }
            }

            userState.step = 'WELCOME_MENU'; 
            await sock.sendMessage(sender, { text: t.orderConfirmed });
            return;
        }

    });
}

startBot().catch(err => console.log("Error: " + err));
