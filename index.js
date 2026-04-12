const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const https = require('https');

// ==========================================
// 🔧 ENVIRONMENT CONFIGURATION
// ==========================================
let FIREBASE_URL = process.env.FIREBASE_URL || "";
if (FIREBASE_URL.endsWith('/')) FIREBASE_URL = FIREBASE_URL.slice(0, -1);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const OWNER_NUMBER = process.env.OWNER_NUMBER || ""; // e.g. 923001234567

// ==========================================
// 🧠 USER STATE MANAGEMENT
// ==========================================
const userStates = {};
const aiConversations = {}; // AI chat history per user
const voiceConversations = {}; // Voice AI history per user

// ==========================================
// 🔥 FIREBASE SESSION MANAGEMENT
// ==========================================

async function downloadSession() {
    if (!FIREBASE_URL) {
        console.log('⚠️  FIREBASE_URL not set. Skipping session download.');
        return;
    }
    try {
        console.log('⏳ Restoring session from Firebase...');
        const response = await fetch(`${FIREBASE_URL}/whatsapp_session.json`);
        const data = await response.json();

        if (data && Object.keys(data).length > 0) {
            if (!fs.existsSync('session_data')) fs.mkdirSync('session_data', { recursive: true });
            for (const file in data) {
                let content = typeof data[file] === 'string' ? data[file] : JSON.stringify(data[file]);
                fs.writeFileSync(path.join('session_data', file), content);
            }
            console.log('✅ Session restored from Firebase!');
        } else {
            console.log('ℹ️  No previous session found. Please scan QR Code.');
        }
    } catch (error) {
        console.log('❌ Session restore error:', error.message);
    }
}

async function uploadSession() {
    if (!FIREBASE_URL || !fs.existsSync('session_data')) return;
    try {
        const files = fs.readdirSync('session_data');
        let sessionObj = {};
        for (const file of files) {
            if (file.endsWith('.json')) {
                sessionObj[file] = fs.readFileSync(path.join('session_data', file), 'utf-8');
            }
        }
        await fetch(`${FIREBASE_URL}/whatsapp_session.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sessionObj)
        });
        console.log('☁️  Session synced to Firebase!');
    } catch (error) {
        console.log('❌ Session sync error:', error.message);
    }
}

let syncTimeout = null;
function debouncedUpload() {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => { await uploadSession(); }, 5000);
}

// ==========================================
// 🤖 ANTHROPIC AI CHAT ENGINE
// ==========================================

const AI_SYSTEM_PROMPT = `You are "Aria" — a smart, friendly, and professional sales assistant for Wajid Ali's digital services agency.

Your personality:
- Warm, enthusiastic, and helpful
- Professional but conversational
- You speak both English and Urdu fluently (detect user language and respond in same language)
- You genuinely care about helping users find the right service for their needs

Our Services:
1. 🌐 Website Development — E-Commerce, Business, Portfolio, Landing Pages
   - Live Examples: https://friendspharma.shop/ | https://kmartonline.store/
   - Price Range: Starting from PKR 15,000 (depends on complexity)
   - Delivery: 3-10 business days

2. 📱 App & Game Development — Android, iOS, Web Apps, Mobile Games (Unity/HTML5)
   - Price Range: Starting from PKR 25,000
   - Delivery: 1-3 weeks

3. 🎨 Graphics Designing — Logos, Banners, UI/UX Design, Social Media Posts, Branding
   - Price Range: Starting from PKR 2,000 per design
   - Delivery: 24-48 hours

4. 📢 Advertisement & Digital Marketing — Facebook Ads, Google Ads, SEO, Social Media Management
   - Price Range: Starting from PKR 5,000/month
   - Delivery: Campaign live in 24 hours

5. 🤖 WhatsApp Bot Development — AI-powered bots for business automation (just like me!)
   - Price Range: Starting from PKR 10,000
   - Delivery: 2-5 business days

Contact: WhatsApp +92-XXX-XXXXXXX | Available 24/7

Guidelines:
- NEVER make up prices outside the range above
- If user wants to place an order, encourage them and collect: Name, Phone, Service needed, Requirements
- Keep responses concise (max 3-4 sentences for WhatsApp)
- Use emojis naturally but not excessively
- If user asks something outside your knowledge, say you'll connect them to Wajid Ali
- When collecting order details, confirm them clearly before saying order is placed
- ALWAYS respond in the SAME LANGUAGE the user writes in`;

async function getAIResponse(userMessage, userId, lang) {
    if (!ANTHROPIC_API_KEY) {
        return lang === 'ur'
            ? "معذرت، AI سروس ابھی دستیاب نہیں ہے۔ براہ کرم مینو کا استعمال کریں۔"
            : "Sorry, AI service is currently unavailable. Please use the menu.";
    }

    try {
        // Initialize conversation history
        if (!aiConversations[userId]) aiConversations[userId] = [];

        // Add user message to history
        aiConversations[userId].push({ role: "user", content: userMessage });

        // Keep only last 10 messages to avoid token limits
        if (aiConversations[userId].length > 20) {
            aiConversations[userId] = aiConversations[userId].slice(-20);
        }

        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01"
            },
            body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 500,
                system: AI_SYSTEM_PROMPT,
                messages: aiConversations[userId]
            })
        });

        if (!response.ok) {
            const err = await response.text();
            console.log("❌ Anthropic API error:", err);
            throw new Error("API_ERROR");
        }

        const data = await response.json();
        const assistantReply = data.content[0].text;

        // Add AI reply to history
        aiConversations[userId].push({ role: "assistant", content: assistantReply });

        return assistantReply;

    } catch (error) {
        console.log("❌ AI chat error:", error.message);
        return lang === 'ur'
            ? "معذرت، جواب دینے میں مسئلہ ہوا۔ دوبارہ کوشش کریں یا *0* بھیج کر مینو دیکھیں۔"
            : "Sorry, I encountered an issue. Please try again or send *0* for the main menu.";
    }
}

// ==========================================
// 🎙️ GEMINI VOICE CHAT ENGINE
// ==========================================

const VOICE_SYSTEM_PROMPT = `You are Aria, a warm and professional female voice assistant for Wajid Ali's digital agency.
Respond in SHORT, natural spoken sentences (as if talking, not writing).
Max 2-3 sentences per response. No bullet points, no emojis, no markdown.
Detect if user speaks Urdu or English and respond in same language.
You help users learn about: Website Development, App Development, Graphics Designing, Digital Marketing, and WhatsApp Bot Development.
Be enthusiastic, helpful, and always offer to connect them with Wajid Ali for orders.`;

async function generateVoiceMessage(userText, userId, lang, sock, sender) {
    if (!GEMINI_API_KEY) {
        const errMsg = lang === 'ur'
            ? "معذرت، وائس سروس ابھی دستیاب نہیں ہے۔"
            : "Sorry, voice service is currently unavailable.";
        await sock.sendMessage(sender, { text: errMsg });
        return;
    }

    try {
        // Step 1: Get text response from Gemini
        if (!voiceConversations[userId]) voiceConversations[userId] = [];
        voiceConversations[userId].push({ role: "user", parts: [{ text: userText }] });
        if (voiceConversations[userId].length > 10) {
            voiceConversations[userId] = voiceConversations[userId].slice(-10);
        }

        const textRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: VOICE_SYSTEM_PROMPT }] },
                    contents: voiceConversations[userId]
                })
            }
        );

        if (!textRes.ok) throw new Error("Gemini text API failed");
        const textData = await textRes.json();
        const replyText = textData.candidates?.[0]?.content?.parts?.[0]?.text || "I'm here to help!";

        voiceConversations[userId].push({ role: "model", parts: [{ text: replyText }] });

        // Step 2: Convert text to speech using Gemini TTS
        const ttsRes = await fetch(
            `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    input: { text: replyText },
                    voice: {
                        languageCode: lang === 'ur' ? "ur-PK" : "en-US",
                        name: lang === 'ur' ? "ur-PK-Standard-A" : "en-US-Journey-F", // Female voice
                        ssmlGender: "FEMALE"
                    },
                    audioConfig: {
                        audioEncoding: "OGG_OPUS",
                        speakingRate: 1.0,
                        pitch: 1.0
                    }
                })
            }
        );

        if (!ttsRes.ok) {
            // TTS failed — send text response as fallback
            console.log("⚠️ TTS failed, sending text response as fallback");
            await sock.sendMessage(sender, { text: `🎙️ *[Voice Response]*\n\n${replyText}` });
            return;
        }

        const ttsData = await ttsRes.json();
        const audioBase64 = ttsData.audioContent;

        if (!audioBase64) throw new Error("No audio content received");

        // Step 3: Save audio and send as voice note
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        const audioPath = path.join('session_data', `voice_${Date.now()}.ogg`);
        fs.writeFileSync(audioPath, audioBuffer);

        await sock.sendMessage(sender, {
            audio: fs.readFileSync(audioPath),
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true // Send as voice note (push-to-talk)
        });

        // Cleanup temp file
        setTimeout(() => { try { fs.unlinkSync(audioPath); } catch(e) {} }, 10000);

        // Also send text so user can read if they can't play audio
        await sock.sendMessage(sender, { text: `📝 _"${replyText}"_` });

    } catch (error) {
        console.log("❌ Voice error:", error.message);
        const errMsg = lang === 'ur'
            ? "وائس میسج بھیجنے میں مسئلہ ہوا۔ دوبارہ کوشش کریں۔"
            : "Error sending voice message. Please try again.";
        await sock.sendMessage(sender, { text: errMsg });
    }
}

// ==========================================
// 📚 DICTIONARY: ENGLISH & URDU MESSAGES
// ==========================================
const langText = {
    en: {
        welcomeMenu: `╔════════════════════════╗
🤖 *ARIA — Digital Assistant*
╚════════════════════════╝

Hello! 👋 I'm *Aria*, your personal assistant for Wajid Ali's Digital Agency.

We specialize in creating stunning digital products that *grow your business* 🚀

*How can I help you today?*

━━━━━━━━━━━━━━━━━━━━━━━━
1️⃣  🛍️ Explore Our Services
2️⃣  🤖 Chat with AI Assistant
3️⃣  🎙️ Voice Chat with Aria
4️⃣  📞 Talk to Wajid Ali
5️⃣  🇵🇰 Switch to Urdu
━━━━━━━━━━━━━━━━━━━━━━━━
_Reply with a number to continue_`,

        servicesMenu: `╔════════════════════════╗
🚀 *OUR PREMIUM SERVICES*
╚════════════════════════╝

We turn your ideas into *digital reality!* ✨

━━━━━━━━━━━━━━━━━━━━━━━━
1️⃣  🌐 Website Development
2️⃣  📱 App & Game Development
3️⃣  🎨 Graphics Designing
4️⃣  📢 Advertisement & Marketing
5️⃣  🤖 WhatsApp Bot Development
━━━━━━━━━━━━━━━━━━━━━━━━
👉 Type *0* anytime to go back`,

        aiChatIntro: `🤖 *AI Chat Mode — Activated!*

Hi! I'm *Aria*, your AI-powered assistant. 

I can answer all your questions about our services, pricing, timelines, and help you place an order! 

💬 *Just type your message naturally...*

_Send *MENU* anytime to return to the main menu_`,

        voiceChatIntro: `🎙️ *Voice Chat Mode — Activated!*

I'm listening! 🎧

Send me a *voice message* and I'll reply with my voice too! 

Or type your question and I'll respond in *Aria's voice* 🎵

_Send *MENU* anytime to return to the main menu_`,

        demos: {
            web: `╔═══════════════════════╗
🌐 *Website Development*
╚═══════════════════════╝

We build *stunning, high-performance* websites that convert visitors into customers! 💼

🏆 *Our Live Projects:*
👉 https://friendspharma.shop/
👉 https://kmartonline.store/

✅ E-Commerce Stores
✅ Business Websites  
✅ Portfolio Sites
✅ Landing Pages

💰 *Starting from PKR 15,000*
⏱️ *Delivery: 3-10 days*

━━━━━━━━━━━━━━━━━━━━━━━━
Ready to build your dream website?
👉 Type *YES* to place your order
👉 Type *0* to go back`,

            app: `╔═══════════════════════╗
📱 *App & Game Development*
╚═══════════════════════╝

From *powerful apps* to *engaging mobile games* — we build it all! 🎮

✅ Android & iOS Apps
✅ Web Applications
✅ HTML5 Browser Games
✅ Unity Mobile Games

💰 *Starting from PKR 25,000*
⏱️ *Delivery: 1-3 weeks*

━━━━━━━━━━━━━━━━━━━━━━━━
Ready to launch your app?
👉 Type *YES* to place your order
👉 Type *0* to go back`,

            graphics: `╔═══════════════════════╗
🎨 *Graphics Designing*
╚═══════════════════════╝

Make your brand *stand out* with professional designs! ✨

✅ Logo Design & Branding
✅ Social Media Posts
✅ UI/UX Design
✅ Banners & Posters
✅ Complete Brand Identity

💰 *Starting from PKR 2,000*
⏱️ *Delivery: 24-48 hours*

━━━━━━━━━━━━━━━━━━━━━━━━
Want stunning designs?
👉 Type *YES* to place your order
👉 Type *0* to go back`,

            ads: `╔═══════════════════════╗
📢 *Advertisement & Marketing*
╚═══════════════════════╝

*Scale your sales* with expert digital marketing! 📈

✅ Facebook & Instagram Ads
✅ Google Ads Campaigns
✅ SEO & Website Ranking
✅ Social Media Management
✅ Content Strategy

💰 *Starting from PKR 5,000/month*
⏱️ *Campaign Live in 24 hours*

━━━━━━━━━━━━━━━━━━━━━━━━
Ready to grow your business?
👉 Type *YES* to place your order
👉 Type *0* to go back`,

            bot: `╔═══════════════════════╗
🤖 *WhatsApp Bot Development*
╚═══════════════════════╝

Automate your business *24/7* just like this bot! 🚀

✅ AI-Powered Conversations
✅ Auto Lead Collection
✅ Menu-Based Navigation
✅ Firebase/Database Storage
✅ Multi-language Support
✅ Render/Cloud Deployment

💰 *Starting from PKR 10,000*
⏱️ *Delivery: 2-5 business days*

━━━━━━━━━━━━━━━━━━━━━━━━
Want your own bot?
👉 Type *YES* to place your order
👉 Type *0* to go back`
        },

        askDetails: `📋 *Order Details Required*

Almost there! 🎉 Please send your details in *one message:*

━━━━━━━━━━━━━━━━━━━━━━━━
1️⃣  *Full Name*
2️⃣  *Phone Number*
3️⃣  *Your Requirements* (brief description)
━━━━━━━━━━━━━━━━━━━━━━━━

_Example:_
_Ahmad Ali, 03001234567, I need an e-commerce website for selling clothes online_`,

        orderConfirmed: `╔════════════════════════╗
✅ *ORDER CONFIRMED!*
╚════════════════════════╝

🎊 Thank you! Your order has been successfully received.

*Wajid Ali* will personally review your requirements and contact you within *24 hours* to begin your project.

🌟 *What happens next?*
✔️ Requirements review
✔️ Price quotation sent
✔️ Project begins!

We look forward to working with you! 🚀`,

        humanMute: `╔════════════════════════╗
📞 *Connecting to Wajid Ali...*
╚════════════════════════╝

✅ Your request has been forwarded!

*Wajid Ali* has been notified and will reply to you shortly.

⏰ *Response time:* Usually within 1-2 hours during business hours.

Thank you for your patience! 🙏

_Send *bot wake up* to reactivate the assistant_`,

        invalidInput: `🤔 *Didn't catch that!*

Please choose from the menu:
━━━━━━━━━━━━━━━━━━━━━━━━
1️⃣  Services
2️⃣  AI Chat
3️⃣  Voice Chat
4️⃣  Talk to Wajid Ali
5️⃣  Change Language
━━━━━━━━━━━━━━━━━━━━━━━━
Or send *0* for Main Menu`
    },

    ur: {
        welcomeMenu: `╔════════════════════════╗
🤖 *ایریا — ڈیجیٹل اسسٹنٹ*
╚════════════════════════╝

السلام علیکم! 👋 میں *ایریا* ہوں، واجد علی ڈیجیٹل ایجنسی کی آپ کی ذاتی اسسٹنٹ۔

ہم آپ کے بزنس کو *ڈیجیٹل دنیا میں کامیاب* بناتے ہیں 🚀

*آج میں آپ کی کیا مدد کر سکتی ہوں؟*

━━━━━━━━━━━━━━━━━━━━━━━━
1️⃣  🛍️ ہماری سروسز دیکھیں
2️⃣  🤖 AI سے چیٹ کریں
3️⃣  🎙️ آواز میں بات کریں
4️⃣  📞 واجد علی سے ملیں
5️⃣  🇬🇧 انگلش میں جائیں
━━━━━━━━━━━━━━━━━━━━━━━━
_جاری رکھنے کے لیے نمبر بھیجیں_`,

        servicesMenu: `╔════════════════════════╗
🚀 *ہماری پریمیم سروسز*
╚════════════════════════╝

ہم آپ کے خوابوں کو *حقیقت میں بدلتے ہیں!* ✨

━━━━━━━━━━━━━━━━━━━━━━━━
1️⃣  🌐 ویب سائٹ ڈیویلپمنٹ
2️⃣  📱 ایپ اور گیم ڈیویلپمنٹ
3️⃣  🎨 گرافکس ڈیزائننگ
4️⃣  📢 ایڈورٹائزمنٹ / مارکیٹنگ
5️⃣  🤖 واٹس ایپ بوٹ ڈیویلپمنٹ
━━━━━━━━━━━━━━━━━━━━━━━━
👉 پیچھے جانے کے لیے *0* بھیجیں`,

        aiChatIntro: `🤖 *AI چیٹ موڈ — چالو ہو گیا!*

ہیلو! میں *ایریا* ہوں، آپ کی AI اسسٹنٹ۔

سروسز، قیمتیں، یا آرڈر کے بارے میں جو بھی پوچھنا ہو، بے جھجھک پوچھیں! 😊

💬 *بس اپنا سوال لکھ کر بھیجیں...*

_مینو پر واپس جانے کے لیے *MENU* بھیجیں_`,

        voiceChatIntro: `🎙️ *وائس چیٹ موڈ — چالو ہو گیا!*

میں سن رہی ہوں! 🎧

مجھے *وائس میسج* بھیجیں اور میں بھی آواز میں جواب دوں گی!

یا لکھ کر بھیجیں، میں *ایریا کی آواز* میں جواب دوں گی 🎵

_مینو پر واپس جانے کے لیے *MENU* بھیجیں_`,

        demos: {
            web: `╔═══════════════════════╗
🌐 *ویب سائٹ ڈیویلپمنٹ*
╚═══════════════════════╝

ہم *شاندار اور تیز رفتار* ویب سائٹس بناتے ہیں جو گاہک بڑھاتی ہیں! 💼

🏆 *ہمارے لائیو پراجیکٹس:*
👉 https://friendspharma.shop/
👉 https://kmartonline.store/

✅ ای کامرس اسٹور
✅ بزنس ویب سائٹ
✅ پورٹ فولیو سائٹ
✅ لینڈنگ پیج

💰 *قیمت: PKR 15,000 سے شروع*
⏱️ *ڈیلیوری: 3-10 دن*

━━━━━━━━━━━━━━━━━━━━━━━━
اپنی ویب سائٹ بنوانی ہے؟
👉 آرڈر کے لیے *YES* بھیجیں
👉 پیچھے جانے کے لیے *0* بھیجیں`,

            app: `╔═══════════════════════╗
📱 *ایپ اور گیم ڈیویلپمنٹ*
╚═══════════════════════╝

*طاقتور ایپس* سے لے کر *دلچسپ گیمز* تک — سب ہم بناتے ہیں! 🎮

✅ اینڈرائیڈ اور iOS ایپس
✅ ویب ایپلیکیشنز
✅ HTML5 براؤزر گیمز
✅ Unity موبائل گیمز

💰 *قیمت: PKR 25,000 سے شروع*
⏱️ *ڈیلیوری: 1-3 ہفتے*

━━━━━━━━━━━━━━━━━━━━━━━━
اپنی ایپ لانچ کرنی ہے؟
👉 آرڈر کے لیے *YES* بھیجیں
👉 پیچھے جانے کے لیے *0* بھیجیں`,

            graphics: `╔═══════════════════════╗
🎨 *گرافکس ڈیزائننگ*
╚═══════════════════════╝

اپنے برانڈ کو *نمایاں* بنائیں! ✨

✅ لوگو ڈیزائن اور برانڈنگ
✅ سوشل میڈیا پوسٹس
✅ UI/UX ڈیزائن
✅ بینرز اور پوسٹرز
✅ مکمل برانڈ آئیڈنٹٹی

💰 *قیمت: PKR 2,000 فی ڈیزائن*
⏱️ *ڈیلیوری: 24-48 گھنٹے*

━━━━━━━━━━━━━━━━━━━━━━━━
شاندار ڈیزائن چاہیے؟
👉 آرڈر کے لیے *YES* بھیجیں
👉 پیچھے جانے کے لیے *0* بھیجیں`,

            ads: `╔═══════════════════════╗
📢 *ایڈورٹائزمنٹ اور مارکیٹنگ*
╚═══════════════════════╝

*سیلز بڑھائیں* ڈیجیٹل مارکیٹنگ سے! 📈

✅ فیس بک اور انسٹاگرام ایڈز
✅ گوگل ایڈز کیمپین
✅ SEO اور ویب سائٹ رینکنگ
✅ سوشل میڈیا منیجمنٹ
✅ کنٹینٹ اسٹریٹیجی

💰 *قیمت: PKR 5,000/مہینہ سے شروع*
⏱️ *کیمپین 24 گھنٹوں میں لائیو*

━━━━━━━━━━━━━━━━━━━━━━━━
بزنس بڑھانا چاہتے ہیں؟
👉 آرڈر کے لیے *YES* بھیجیں
👉 پیچھے جانے کے لیے *0* بھیجیں`,

            bot: `╔═══════════════════════╗
🤖 *واٹس ایپ بوٹ ڈیویلپمنٹ*
╚═══════════════════════╝

بالکل اسی بوٹ کی طرح *24/7 آٹومیٹک* بزنس کریں! 🚀

✅ AI پاورڈ گفتگو
✅ خودکار لیڈ کلیکشن
✅ مینو بیسڈ نیویگیشن
✅ Firebase ڈیٹا بیس
✅ اردو/انگلش سپورٹ
✅ Render/Cloud ڈیپلوئمنٹ

💰 *قیمت: PKR 10,000 سے شروع*
⏱️ *ڈیلیوری: 2-5 دن*

━━━━━━━━━━━━━━━━━━━━━━━━
اپنا بوٹ چاہیے؟
👉 آرڈر کے لیے *YES* بھیجیں
👉 پیچھے جانے کے لیے *0* بھیجیں`
        },

        askDetails: `📋 *آرڈر کی تفصیل درکار ہے*

بہت خوب! 🎉 براہ کرم *ایک میسج* میں یہ معلومات بھیجیں:

━━━━━━━━━━━━━━━━━━━━━━━━
1️⃣  *آپ کا پورا نام*
2️⃣  *فون نمبر*
3️⃣  *پراجیکٹ کی مختصر تفصیل*
━━━━━━━━━━━━━━━━━━━━━━━━

_مثال:_
_احمد علی، 03001234567، کپڑے بیچنے کے لیے ای کامرس ویب سائٹ_`,

        orderConfirmed: `╔════════════════════════╗
✅ *آرڈر کنفرم ہو گیا!*
╚════════════════════════╝

🎊 شکریہ! آپ کا آرڈر کامیابی سے موصول ہو گیا ہے۔

*واجد علی* ذاتی طور پر آپ کی ضروریات دیکھیں گے اور *24 گھنٹوں* کے اندر رابطہ کریں گے۔

🌟 *آگے کیا ہو گا؟*
✔️ ضروریات کا جائزہ
✔️ قیمت کا اندازہ
✔️ کام شروع!

ہم آپ کے ساتھ کام کرنے کے منتظر ہیں! 🚀`,

        humanMute: `╔════════════════════════╗
📞 *واجد علی سے جوڑ رہے ہیں...*
╚════════════════════════╝

✅ آپ کی درخواست موصول ہو گئی!

*واجد علی* کو اطلاع دے دی گئی ہے، وہ جلد آپ کو جواب دیں گے۔

⏰ *جواب کا وقت:* عام طور پر 1-2 گھنٹے میں

آپ کے صبر کا شکریہ! 🙏

_اسسٹنٹ دوبارہ چالو کرنے کے لیے *bot wake up* بھیجیں_`,

        invalidInput: `🤔 *سمجھ نہیں آیا!*

براہ کرم مینو میں سے انتخاب کریں:
━━━━━━━━━━━━━━━━━━━━━━━━
1️⃣  سروسز
2️⃣  AI چیٹ
3️⃣  وائس چیٹ
4️⃣  واجد علی سے بات
5️⃣  زبان تبدیل کریں
━━━━━━━━━━━━━━━━━━━━━━━━
یا مینو کے لیے *0* بھیجیں`
    }
};

// ==========================================
// 🔔 NOTIFY OWNER FUNCTION
// ==========================================
async function notifyOwner(sock, leadData) {
    if (!OWNER_NUMBER) return;
    const ownerJid = `${OWNER_NUMBER}@s.whatsapp.net`;
    const notif = `🔔 *NEW LEAD RECEIVED!*\n\n📱 *Phone:* ${leadData.phone}\n🛍️ *Service:* ${leadData.service}\n📝 *Requirements:* ${leadData.requirement}\n⏰ *Time:* ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}\n\n_Reply to this customer directly on WhatsApp._`;
    try {
        await sock.sendMessage(ownerJid, { text: notif });
    } catch(e) {
        console.log("⚠️ Could not notify owner:", e.message);
    }
}

// ==========================================
// 🚀 MAIN BOT FUNCTION
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
        browser: ["W-Assistant Pro", "Chrome", "2.0"],
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        getMessage: async () => { return { conversation: '' }; }
    });

    // ── Connection Update Handler ──
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
            console.log('\n╔══════════════════════════════════════════════════════════╗');
            console.log('║          🔄 W-ASSISTANT PRO — QR CODE GENERATED!          ║');
            console.log('╠══════════════════════════════════════════════════════════╣');
            console.log('║  SCAN QR 👉 ' + qrImageUrl);
            console.log('╚══════════════════════════════════════════════════════════╝\n');
        }

        if (connection === 'open') {
            console.log('\n╔══════════════════════════════════════════════════════════╗');
            console.log('║       ✅ W-ASSISTANT PRO IS ONLINE — READY TO SERVE!      ║');
            console.log('║    🤖 AI Chat: Active  |  🎙️ Voice Chat: Active           ║');
            console.log('╚══════════════════════════════════════════════════════════╝\n');
            debouncedUpload();
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                const delay = 3000;
                console.log(`🔄 Connection lost. Reconnecting in ${delay/1000}s...`);
                setTimeout(() => startBot(), delay);
            } else {
                console.log('❌ Logged out from WhatsApp.');
                console.log('   ➜ Delete "whatsapp_session" in Firebase and rescan QR.');
                if (fs.existsSync('session_data')) {
                    fs.rmSync('session_data', { recursive: true, force: true });
                }
            }
        }
    });

    // ── Credentials Update ──
    sock.ev.on('creds.update', async () => {
        await saveCreds();
        debouncedUpload();
    });

    // ==========================================
    // 📩 MESSAGE HANDLING SYSTEM
    // ==========================================
    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg.message) return;
            if (msg.key.remoteJid === 'status@broadcast') return;
            if (msg.key.fromMe) return;

            const sender = msg.key.remoteJid;

            // Handle voice/audio messages in voice mode
            const isAudioMessage = !!(msg.message.audioMessage || msg.message.pttMessage);

            // Extract text
            const rawText = msg.message.conversation
                || msg.message.extendedTextMessage?.text
                || "";
            const text = rawText.toLowerCase().trim();

            // ── MUTED STATE ──
            if (userStates[sender]?.isMuted) {
                if (text === "bot wake up") {
                    userStates[sender].isMuted = false;
                    userStates[sender].step = 'WELCOME_MENU';
                    const lang = userStates[sender].lang || 'ur';
                    await sock.sendMessage(sender, {
                        text: `🤖 *Assistant Reactivated!*\n\n` + langText[lang].welcomeMenu
                    });
                }
                return;
            }

            // ── INITIALIZE USER ──
            if (!userStates[sender]) {
                userStates[sender] = { step: 'WELCOME_MENU', lang: 'ur', isMuted: false };
            }
            const userState = userStates[sender];
            const lang = userState.lang;
            const t = langText[lang];

            // ── VOICE CHAT MODE ──
            if (userState.step === 'VOICE_CHAT') {
                if (text === 'menu' || text === 'مینو' || text === '0') {
                    userState.step = 'WELCOME_MENU';
                    delete voiceConversations[sender];
                    await sock.sendMessage(sender, { text: t.welcomeMenu });
                    return;
                }
                // For audio messages, send a transcription prompt (Gemini audio transcription would need Gemini API multimodal)
                if (isAudioMessage) {
                    const listenMsg = lang === 'ur'
                        ? "🎙️ آواز موصول ہوئی! ابھی ٹیکسٹ میں لکھ کر بھیجیں، وائس ریپلائی آ رہا ہے..."
                        : "🎙️ Voice received! Processing... (Please also type your message for best results)";
                    await sock.sendMessage(sender, { text: listenMsg });
                    return;
                }
                if (rawText) {
                    const typingIndicator = lang === 'ur' ? "🎙️ _ایریا جواب دے رہی ہے..._" : "🎙️ _Aria is responding..._";
                    await sock.sendMessage(sender, { text: typingIndicator });
                    await generateVoiceMessage(rawText, sender, lang, sock, sender);
                }
                return;
            }

            // ── AI CHAT MODE ──
            if (userState.step === 'AI_CHAT') {
                if (text === 'menu' || text === 'مینو' || text === '0') {
                    userState.step = 'WELCOME_MENU';
                    delete aiConversations[sender];
                    await sock.sendMessage(sender, { text: t.welcomeMenu });
                    return;
                }
                if (rawText) {
                    const thinkingMsg = lang === 'ur' ? "🤖 _ایریا سوچ رہی ہے..._" : "🤖 _Aria is thinking..._";
                    await sock.sendMessage(sender, { text: thinkingMsg });
                    const aiReply = await getAIResponse(rawText, sender, lang);
                    await sock.sendMessage(sender, { text: aiReply });
                }
                return;
            }

            // ── GREETINGS ──
            const greetings = ['hi', 'hello', 'hey', 'salam', 'assalam', 'assalamualaikum',
                               'السلام', 'ہیلو', '0', 'menu', 'مینو', 'start'];
            if (greetings.some(word => text === word || text.startsWith(word))) {
                userStates[sender] = { step: 'WELCOME_MENU', lang: lang, isMuted: false };
                await sock.sendMessage(sender, { text: t.welcomeMenu });
                return;
            }

            // ── WELCOME MENU ──
            if (userState.step === 'WELCOME_MENU') {
                if (text === '1') {
                    userState.step = 'SERVICES_MENU';
                    await sock.sendMessage(sender, { text: t.servicesMenu });
                }
                else if (text === '2') {
                    userState.step = 'AI_CHAT';
                    await sock.sendMessage(sender, { text: t.aiChatIntro });
                }
                else if (text === '3') {
                    userState.step = 'VOICE_CHAT';
                    await sock.sendMessage(sender, { text: t.voiceChatIntro });
                }
                else if (text === '4') {
                    userState.isMuted = true;
                    await sock.sendMessage(sender, { text: t.humanMute });
                }
                else if (text === '5') {
                    userState.lang = lang === 'en' ? 'ur' : 'en';
                    const newT = langText[userState.lang];
                    await sock.sendMessage(sender, { text: newT.welcomeMenu });
                }
                else {
                    await sock.sendMessage(sender, { text: t.invalidInput });
                }
                return;
            }

            // ── SERVICES MENU ──
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
                } else if (text === '0') {
                    userState.step = 'WELCOME_MENU';
                    await sock.sendMessage(sender, { text: t.welcomeMenu });
                } else {
                    await sock.sendMessage(sender, { text: t.invalidInput });
                }
                return;
            }

            // ── ORDER CONFIRM ──
            if (userState.step === 'WAITING_FOR_ORDER_CONFIRM') {
                if (text.includes('yes') || text.includes('ہاں') || text.includes('han') || text === 'y') {
                    userState.step = 'WAITING_FOR_DETAILS';
                    await sock.sendMessage(sender, { text: t.askDetails });
                } else if (text === '0') {
                    userState.step = 'SERVICES_MENU';
                    await sock.sendMessage(sender, { text: t.servicesMenu });
                } else {
                    const confirmMsg = lang === 'ur'
                        ? `🤔 *آرڈر کنفرم کریں۔*\n\n👉 آرڈر کے لیے *YES* بھیجیں\n👉 واپس جانے کے لیے *0* بھیجیں`
                        : `🤔 *Please confirm your order.*\n\n👉 Reply *YES* to confirm\n👉 Reply *0* to go back`;
                    await sock.sendMessage(sender, { text: confirmMsg });
                }
                return;
            }

            // ── COLLECT ORDER DETAILS ──
            if (userState.step === 'WAITING_FOR_DETAILS') {
                const newLead = {
                    phone: sender.split('@')[0],
                    service: userState.category || 'General Inquiry',
                    requirement: rawText,
                    language: lang,
                    timestamp: new Date().toISOString(),
                    localTime: new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })
                };

                // Save to Firebase
                if (FIREBASE_URL) {
                    try {
                        await fetch(`${FIREBASE_URL}/leads.json`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(newLead)
                        });
                        console.log(`✅ Lead saved: ${newLead.phone} - ${newLead.service}`);
                    } catch (error) {
                        console.log("❌ Firebase lead save error:", error.message);
                    }
                }

                // Notify owner
                await notifyOwner(sock, newLead);

                userState.step = 'WELCOME_MENU';
                await sock.sendMessage(sender, { text: t.orderConfirmed });
                return;
            }

            // ── FALLBACK ──
            await sock.sendMessage(sender, { text: t.invalidInput });

        } catch (err) {
            console.log("❌ Message handler error:", err.message);
        }
    });
}

// ==========================================
// 🔁 HEALTH CHECK PING (for Render 24/7)
// ==========================================
const PORT = process.env.PORT || 3000;
const http = require('http');
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'online',
        bot: 'W-Assistant Pro',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()) + 's'
    }));
});
server.listen(PORT, () => {
    console.log(`🌐 Health check server running on port ${PORT}`);
});

// ==========================================
// 🛡️ GLOBAL ERROR HANDLERS (24/7 Stability)
// ==========================================
process.on('uncaughtException', (err) => {
    console.error('⚠️  Uncaught Exception:', err.message);
    // Don't exit — keep the bot alive
});

process.on('unhandledRejection', (reason) => {
    console.error('⚠️  Unhandled Rejection:', reason);
    // Don't exit — keep the bot alive
});

// ==========================================
// 🚀 START THE BOT
// ==========================================
console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║          🤖 W-ASSISTANT PRO — STARTING UP...              ║');
console.log('║    AI Chat ✅  |  Voice Chat ✅  |  Firebase ✅           ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

startBot().catch(err => {
    console.error("❌ Fatal startup error:", err);
    setTimeout(() => startBot(), 5000); // Auto-retry on crash
});
