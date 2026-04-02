const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');

const FIREBASE_URL = process.env.FIREBASE_URL;

// یوزرز کا ڈیٹا سنبھالنے کے لیے
const userStates = {}; 

async function getServiceData(endpoint) {
    try {
        if (!FIREBASE_URL) return [];
        const response = await fetch(`${FIREBASE_URL}/services/${endpoint}.json`);
        const data = await response.json();
        if (!data) return [];
        return Object.keys(data).map(key => ({
            name: data[key].name || "",
            price: data[key].price || "",
            description: data[key].description || "",
            imageUrl: data[key].imageUrl || ""
        }));
    } catch (error) {
        return [];
    }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ==========================================
// 🌐 DICTIONARY: ENGLISH & URDU MESSAGES
// ==========================================
const langText = {
    en: {
        welcomeMenu: `🤖 *Hello! I am Wajid Ali's Virtual Assistant.*\n\nHow can I help you today? Please reply with a number:\n\n1️⃣ View Our Digital Services 🚀\n2️⃣ Talk to Wajid Ali 👨‍💻\n3️⃣ زبان تبدیل کریں (Change to Urdu) 🇵🇰`,
        
        servicesMenu: `🚀 *Our Premium Services*\n\nPlease select a service to view details and demos:\n\n1️⃣ Website Development 🌐\n2️⃣ App & Game Development 📱\n3️⃣ Graphics Designing 🎨\n4️⃣ Advertisement & Digital Marketing 📢\n5️⃣ WhatsApp Bot Development 🤖\n\n_Reply with 0 anytime to go back._`,
        
        demos: {
            web: `🌐 *Website Development*\n\nHere are some of our successful E-Commerce projects:\n👉 https://friendspharma.shop/\n👉 https://kmartonline.store/\n\n*Would you like to place an order?*\nReply *YES* to confirm, or *0* to go back.`,
            app: `📱 *App & Game Development*\n\nWe build high-performance Android & iOS Apps and engaging Mobile Games.\n\n*Would you like to place an order?*\nReply *YES* to confirm, or *0* to go back.`,
            graphics: `🎨 *Graphics Designing*\n\nWe design professional Logos, UI/UX, Banners, and Social Media Posts.\n\n*Would you like to place an order?*\nReply *YES* to confirm, or *0* to go back.`,
            ads: `📢 *Advertisement & Marketing*\n\nScale your business with our expert Facebook Ads, Google Ads, and SEO strategies.\n\n*Would you like to place an order?*\nReply *YES* to confirm, or *0* to go back.`,
            bot: `🤖 *WhatsApp Bot Development*\n\nAutomate your business 24/7 with a smart AI WhatsApp Assistant (just like me!).\n\n*Would you like to place an order?*\nReply *YES* to confirm, or *0* to go back.`
        },

        askDetails: `Awesome! 🎉 Let's confirm your order.\n\nPlease reply with your:\n1. *Full Name*\n2. *Phone Number*\n3. *Short Details of your requirement*\n_(Please send all info in a single message)_`,
        
        orderConfirmed: `✅ *Your Order is Confirmed!*\n\nThank you! I have securely saved your request. *Wajid Ali* will review your details and contact you shortly to start the work.\n\nHave a great day! 🌟`,
        
        humanMute: `📞 *Request Forwarded!*\n\nI have notified Wajid Ali. He will review your message and reply to you shortly. Please wait for his response. Thank you! 🌟`,
        
        invalidInput: `🤔 Invalid choice.\n\nPlease reply with the correct number, or type *0* to see the Main Menu.`
    },
    ur: {
        welcomeMenu: `🤖 *ہیلو! میں واجد علی کا ورچوئل اسسٹنٹ ہوں۔*\n\nمیں آپ کی کیا مدد کر سکتا ہوں؟ براہ کرم ایک نمبر بھیجیں:\n\n1️⃣ ہماری ڈیجیٹل سروسز دیکھیں 🚀\n2️⃣ واجد علی سے بات کریں 👨‍💻\n3️⃣ Change to English (زبان تبدیل کریں) 🇬🇧`,
        
        servicesMenu: `🚀 *ہماری پروفیشنل سروسز*\n\nتفصیلات اور ڈیموز دیکھنے کے لیے ایک نمبر منتخب کریں:\n\n1️⃣ ویب سائٹ ڈیویلپمنٹ 🌐\n2️⃣ ایپ اور گیم ڈیویلپمنٹ 📱\n3️⃣ گرافکس ڈیزائننگ 🎨\n4️⃣ ایڈورٹائزمنٹ / ڈیجیٹل مارکیٹنگ 📢\n5️⃣ واٹس ایپ بوٹ ڈیویلپمنٹ 🤖\n\n_پیچھے جانے کے لیے کسی بھی وقت 0 بھیجیں۔_`,
        
        demos: {
            web: `🌐 *ویب سائٹ ڈیویلپمنٹ*\n\nیہ ہمارے کچھ کامیاب ای کامرس پراجیکٹس ہیں:\n👉 https://friendspharma.shop/\n👉 https://kmartonline.store/\n\n*کیا آپ اپنا آرڈر کنفرم کرنا چاہتے ہیں؟*\nآرڈر کے لیے *YES* لکھیں، یا پیچھے جانے کے لیے *0* بھیجیں۔`,
            app: `📱 *ایپ اور گیم ڈیویلپمنٹ*\n\nہم بہترین کوالٹی کی اینڈرائیڈ/iOS ایپس اور موبائل گیمز بناتے ہیں۔\n\n*کیا آپ اپنا آرڈر کنفرم کرنا چاہتے ہیں؟*\nآرڈر کے لیے *YES* لکھیں، یا پیچھے جانے کے لیے *0* بھیجیں۔`,
            graphics: `🎨 *گرافکس ڈیزائننگ*\n\nہم پروفیشنل لوگوز، UI/UX اور سوشل میڈیا پوسٹس ڈیزائن کرتے ہیں۔\n\n*کیا آپ اپنا آرڈر کنفرم کرنا چاہتے ہیں؟*\nآرڈر کے لیے *YES* لکھیں، یا پیچھے جانے کے لیے *0* بھیجیں۔`,
            ads: `📢 *ایڈورٹائزمنٹ اور مارکیٹنگ*\n\nفیس بک ایڈز، گوگل ایڈز اور SEO کے ذریعے اپنی سیلز بڑھائیں۔\n\n*کیا آپ اپنا آرڈر کنفرم کرنا چاہتے ہیں؟*\nآرڈر کے لیے *YES* لکھیں، یا پیچھے جانے کے لیے *0* بھیجیں۔`,
            bot: `🤖 *واٹس ایپ بوٹ ڈیویلپمنٹ*\n\nاپنے بزنس کے لیے ایک آٹومیٹک واٹس ایپ بوٹ بنوائیں جو 24 گھنٹے کام کرے۔\n\n*کیا آپ اپنا آرڈر کنفرم کرنا چاہتے ہیں؟*\nآرڈر کے لیے *YES* لکھیں، یا پیچھے جانے کے لیے *0* بھیجیں۔`
        },

        askDetails: `بہت خوب! 🎉 آئیے آپ کا آرڈر کنفرم کرتے ہیں۔\n\nبراہ کرم ایک ہی میسج میں یہ تفصیلات بھیجیں:\n1. *آپ کا نام*\n2. *فون نمبر*\n3. *آپ کو کیسا پروجیکٹ چاہیے؟ (مختصر تفصیل)*`,
        
        orderConfirmed: `✅ *آپ کا آرڈر کنفرم ہو گیا ہے!*\n\nشکریہ! میں نے آپ کی ریکوائرمنٹ محفوظ کر لی ہے۔ *واجد علی* بہت جلد آپ کی تفصیلات چیک کر کے آپ سے رابطہ کریں گے۔ 🌟`,
        
        humanMute: `📞 *درخواست موصول ہو گئی!*\n\nمیں نے واجد علی کو اطلاع دے دی ہے۔ وہ جلد ہی آپ کا میسج چیک کر کے آپ سے رابطہ کریں گے۔ براہ کرم ان کے جواب کا انتظار کریں۔ شکریہ! 🌟`,
        
        invalidInput: `🤔 آپ کا جواب درست نہیں۔\n\nبراہ کرم صحیح نمبر منتخب کریں، یا مین مینو میں جانے کے لیے *0* ٹائپ کریں۔`
    }
};

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false, 
        logger: pino({ level: 'silent' }),
        browser: ["W-Assistant", "Chrome", "1.0"] 
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
            console.log('\n=============================================================');
            console.log('🔄 NEW QR CODE GENERATED! (WhatsApp refreshes it every 30s)');
            console.log('🔗 CLICK FAST TO SCAN: 👉 ' + qrImageUrl);
            console.log('=============================================================\n');
        }

        if (connection === 'open') console.log('✅ W-ASSISTANT IS ONLINE AND READY!');
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                console.log('🔄 Reconnecting...');
                startBot();
            } else {
                console.log('❌ Logged out. Delete "session_data" folder and rescan.');
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
        if (msg.key.fromMe) return; 

        const sender = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase().trim();
        const rawText = msg.message.conversation || msg.message.extendedTextMessage?.text || ""; 

        // Initialize default user state
        if (!userStates[sender]) {
            userStates[sender] = { step: 'WELCOME_MENU', lang: 'en', isMuted: false };
            await sock.sendMessage(sender, { text: langText['en'].welcomeMenu });
            return;
        }

        // Muted logic - Wait for Wajid Ali to reply
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

        if (text === '0' || text === 'menu') {
            userState.step = 'WELCOME_MENU';
            await sock.sendMessage(sender, { text: t.welcomeMenu });
            return;
        }

        // 🛑 STEP 1: WELCOME MENU HANDLING
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

        // 🛑 STEP 2: SERVICES MENU HANDLING
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
                
                const fbData = await getServiceData('websites'); 
                for (const item of fbData) {
                    if (item.imageUrl) {
                        await delay(600);
                        await sock.sendMessage(sender, { image: { url: item.imageUrl }, caption: `${item.name}` });
                    }
                }
            } else {
                await sock.sendMessage(sender, { text: t.invalidInput });
            }
            return;
        }

        // 🛑 STEP 3: ORDER CONFIRMATION
        if (userState.step === 'WAITING_FOR_ORDER_CONFIRM') {
            if (text.includes('yes') || text.includes('y') || text.includes('ہاں')) {
                userState.step = 'WAITING_FOR_DETAILS';
                await sock.sendMessage(sender, { text: t.askDetails });
            } else {
                await sock.sendMessage(sender, { text: t.invalidInput });
            }
            return;
        }

        // 🛑 STEP 4: COLLECT DETAILS
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

        if (!['1','2','3','4','5','0'].includes(text)) {
            userState.step = 'WELCOME_MENU';
            await sock.sendMessage(sender, { text: t.welcomeMenu });
        }
    });
}

startBot().catch(err => console.log("Error: " + err));
