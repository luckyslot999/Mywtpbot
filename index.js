 const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');

const FIREBASE_URL = process.env.FIREBASE_URL;

// State management for users
// { step, lang, category, isMuted }
const userStates = {}; 

// --- DYNAMIC DATA FETCHING ---
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

// --- BILINGUAL TEXT DICTIONARY ---
const langText = {
    en: {
        mainMenu: `🤖 *Hello! I am Wajid Ali's Virtual Assistant.*\n\nHere are our Professional Digital Services. Reply with a number to explore:\n\n1️⃣ Website Development 🌐\n2️⃣ Graphics Designing 🎨\n3️⃣ Advertisement / Marketing 📢\n4️⃣ Talk to Wajid Ali (Human) 👨‍💻`,
        webDemos: `🌐 *Website Development Demos*\n\nHere are some of our successful E-Commerce projects:\n👉 https://friendspharma.shop/\n👉 https://kmartonline.store/\n\n*Are you interested?*\nReply *YES* to place an order, or reply *0* to go back to the Main Menu.`,
        graphicsDemos: `🎨 *Graphics Designing*\n\nWe design high-quality Logos, Social Media Posts, and Banners.\n\n*Are you interested?*\nReply *YES* to place an order, or reply *0* to go back to the Main Menu.`,
        adsDemos: `📢 *Advertisement & Marketing*\n\nGrow your business with our Facebook, Google Ads, and SEO services.\n\n*Are you interested?*\nReply *YES* to place an order, or reply *0* to go back to the Main Menu.`,
        askDetails: `Awesome! 🎉\n\nTo proceed, please reply with your:\n1. *Full Name*\n2. *Phone Number*\n3. *Requirement Details*\n_(Please send all info in a single message. No physical address is required.)_`,
        successMsg: `✅ *Request Received!*\n\nThank you! I have forwarded your details to Wajid Ali. He will review your requirement and contact you shortly. Have a great day! 🌟`,
        humanMute: `📞 *Request Forwarded!*\n\nI have notified Wajid Ali. He will check your message and reply to you himself shortly. I (the bot) will stop responding to you now so you can talk to him.`,
        invalidInput: `🤔 Invalid choice.\n\nPlease reply with the correct number, or type *0* to see the Main Menu again.`
    },
    ur: {
        mainMenu: `🤖 *ہیلو! میں واجد علی کا ورچوئل اسسٹنٹ ہوں۔*\n\nیہ ہماری ڈیجیٹل سروسز ہیں۔ تفصیلات کے لیے متعلقہ نمبر کا ریپلائی کریں:\n\n1️⃣ ویب سائٹ ڈیویلپمنٹ 🌐\n2️⃣ گرافکس ڈیزائننگ 🎨\n3️⃣ ایڈورٹائزمنٹ / مارکیٹنگ 📢\n4️⃣ واجد علی سے بات کریں (انسان) 👨‍💻`,
        webDemos: `🌐 *ویب سائٹ ڈیویلپمنٹ ڈیموز*\n\nیہ ہمارے کچھ کامیاب ای کامرس پراجیکٹس ہیں:\n👉 https://friendspharma.shop/\n👉 https://kmartonline.store/\n\n*کیا آپ آرڈر دینا چاہتے ہیں؟*\nآگے بڑھنے کے لیے *YES* یا *ہاں* لکھ کر بھیجیں، یا مین مینو میں جانے کے لیے *0* بھیجیں۔`,
        graphicsDemos: `🎨 *گرافکس ڈیزائننگ*\n\nہم بہترین کوالٹی کے لوگوز، سوشل میڈیا پوسٹس، اور بینرز ڈیزائن کرتے ہیں۔\n\n*کیا آپ آرڈر دینا چاہتے ہیں؟*\nآگے بڑھنے کے لیے *YES* لکھ کر بھیجیں، یا مین مینو میں جانے کے لیے *0* بھیجیں۔`,
        adsDemos: `📢 *ایڈورٹائزمنٹ / مارکیٹنگ*\n\nفیس بک ایڈز، گوگل ایڈز اور SEO کے ذریعے اپنے بزنس کو بڑھائیں۔\n\n*کیا آپ آرڈر دینا چاہتے ہیں؟*\nآگے بڑھنے کے لیے *YES* لکھ کر بھیجیں، یا مین مینو میں جانے کے لیے *0* بھیجیں۔`,
        askDetails: `بہت خوب! 🎉\n\nآرڈر مکمل کرنے کے لیے براہ کرم ایک ہی میسج میں یہ تفصیلات لکھ کر بھیجیں:\n1. *مکمل نام*\n2. *فون نمبر*\n3. *اپنی ضرورت (Requirement)*\n_(کسی فزیکل ایڈریس کی ضرورت نہیں ہے۔)_`,
        successMsg: `✅ *درخواست موصول ہو گئی ہے!*\n\nشکریہ! میں نے آپ کی تفصیلات واجد علی کو بھیج دی ہیں۔ وہ جلد ہی آپ کی ریکوائرمنٹ چیک کر کے آپ سے رابطہ کریں گے۔ 🌟`,
        humanMute: `📞 *درخواست موصول ہو گئی!*\n\nمیں نے واجد علی کو میسج کر دیا ہے۔ وہ تھوڑی دیر میں آپ کو خود ریپلائی کریں گے۔ اب میں (بوٹ) آپ کو میسج نہیں کروں گا تاکہ آپ ان سے سکون سے بات کر سکیں۔`,
        invalidInput: `🤔 آپ کا جواب درست نہیں۔\n\nبراہ کرم صحیح آپشن منتخب کریں، یا مین مینو میں جانے کے لیے *0* ٹائپ کریں۔`
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
            console.log('\n\n=============================================================');
            console.log('🔗 CLICK THE LINK BELOW TO VIEW & SCAN THE QR CODE 🔗');
            console.log('👉 ' + qrImageUrl);
            console.log('⚠️ Note: Click fast! The QR code refreshes every 20 seconds.');
            console.log('=============================================================\n\n');
        }

        if (connection === 'open') console.log('✅ W-ASSISTANT IS ONLINE AND READY!');
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                console.log('🔄 Reconnecting...');
                startBot();
            } else {
                console.log('❌ Logged out. Delete "session_data" and rescan.');
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

        // Initialize user state if not exists
        if (!userStates[sender]) {
            userStates[sender] = { step: 'CHOOSE_LANGUAGE', lang: 'en', isMuted: false };
        }

        // IF USER IS MUTED (Talking to Human), DO NOT RESPOND.
        if (userStates[sender].isMuted) {
            // Secret command to un-mute bot
            if (text === "bot wake up") {
                userStates[sender].isMuted = false;
                userStates[sender].step = 'CHOOSE_LANGUAGE';
                await sock.sendMessage(sender, { text: "🤖 Bot has been reactivated for you." });
            }
            return; 
        }

        const userState = userStates[sender];
        const lang = userState.lang;

        // GLOBAL: RETURN TO MAIN MENU
        if (text === '0' || text === 'menu') {
            userState.step = 'MAIN_MENU';
            await sock.sendMessage(sender, { text: langText[lang].mainMenu });
            return;
        }

        // 🛑 STEP 1: CHOOSE LANGUAGE
        if (userState.step === 'CHOOSE_LANGUAGE') {
            if (text === '1') {
                userState.lang = 'en';
                userState.step = 'MAIN_MENU';
                await sock.sendMessage(sender, { text: langText['en'].mainMenu });
            } else if (text === '2') {
                userState.lang = 'ur';
                userState.step = 'MAIN_MENU';
                await sock.sendMessage(sender, { text: langText['ur'].mainMenu });
            } else {
                const langPrompt = `🤖 *Welcome! I am Wajid Ali's Virtual Assistant.*\n\nPlease select your preferred language / براہ کرم اپنی زبان منتخب کریں:\n\nReply *1* for English 🇬🇧\nReply *2* for Urdu 🇵🇰 (اردو)`;
                await sock.sendMessage(sender, { text: langPrompt });
            }
            return;
        }

        // 🛑 STEP 2: MAIN MENU SELECTION
        if (userState.step === 'MAIN_MENU') {
            if (text === '1') { // Website
                userState.step = 'WAITING_FOR_INTEREST';
                userState.category = 'Website Development';
                await sock.sendMessage(sender, { text: langText[lang].webDemos });
                
                // Fetch dynamic data silently if available
                const fbData = await getServiceData('websites');
                for (const item of fbData) {
                    if (item.imageUrl) {
                        await delay(600);
                        await sock.sendMessage(sender, { image: { url: item.imageUrl }, caption: `${item.name}\n${item.description}` });
                    }
                }
            } 
            else if (text === '2') { // Graphics
                userState.step = 'WAITING_FOR_INTEREST';
                userState.category = 'Graphics Designing';
                await sock.sendMessage(sender, { text: langText[lang].graphicsDemos });
            } 
            else if (text === '3') { // Ads
                userState.step = 'WAITING_FOR_INTEREST';
                userState.category = 'Advertisement';
                await sock.sendMessage(sender, { text: langText[lang].adsDemos });
            } 
            else if (text === '4') { // Human
                userState.isMuted = true; // Mutes the bot for this user
                await sock.sendMessage(sender, { text: langText[lang].humanMute });
            } 
            else {
                await sock.sendMessage(sender, { text: langText[lang].invalidInput });
            }
            return;
        }

        // 🛑 STEP 3: ASK FOR DETAILS (INTEREST CONFIRMED)
        if (userState.step === 'WAITING_FOR_INTEREST') {
            if (text.includes('yes') || text.includes('y') || text.includes('ہاں')) {
                userState.step = 'WAITING_FOR_LEAD_DETAILS';
                await sock.sendMessage(sender, { text: langText[lang].askDetails });
            } else {
                await sock.sendMessage(sender, { text: langText[lang].invalidInput });
            }
            return;
        }

        // 🛑 STEP 4: SAVE LEAD TO FIREBASE
        if (userState.step === 'WAITING_FOR_LEAD_DETAILS') {
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

            userState.step = 'CHOOSE_LANGUAGE'; // Reset state after success
            await sock.sendMessage(sender, { text: langText[lang].successMsg });
            return;
        }
    });
}

startBot().catch(err => console.log("Error: " + err));
