const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

// 🌟 SECURE FIREBASE URL FROM GITHUB SECRETS 🌟
const FIREBASE_URL = process.env.FIREBASE_URL;

// State management for user conversation flow
const userStates = {}; 

// --- 🌐 DYNAMIC DATA FETCHING FROM FIREBASE ---
// Fetches services dynamically from specific Firebase endpoints
async function getServiceData(endpoint) {
    try {
        const response = await fetch(`${FIREBASE_URL}/services/${endpoint}.json`);
        const data = await response.json();
        if (!data) return [];
        
        // Convert Firebase object into an array
        return Object.keys(data).map(key => ({
            id: key,
            name: data[key].name || "Unnamed Service",
            price: data[key].price || "",
            demoUrl: data[key].demoUrl || "",
            imageUrl: data[key].imageUrl || "",
            description: data[key].description || "",
            category: data[key].category || ""
        }));
    } catch (error) {
        console.error(`❌ Failed to fetch ${endpoint}:`, error);
        return [];
    }
}

// Utility to delay messages slightly to avoid WhatsApp spam bans and maintain order
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startBot() {
    if (!FIREBASE_URL) {
        console.log("❌ ERROR: FIREBASE_URL is missing in environment variables/secrets!");
        process.exit(1);
    }

    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["W-Assistant", "Digital", "1.0"] 
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.clear(); 
            console.log('\n==================================================');
            console.log('📱 SCAN THE QR CODE BELOW TO LINK W-ASSISTANT 📱');
            console.log('==================================================\n');
            qrcode.generate(qr, { small: true }); 
        }

        if (connection === 'open') console.log('✅ W-ASSISTANT IS ONLINE AND READY!');
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                console.log('🔄 Connection closed, reconnecting...');
                startBot();
            } else {
                console.log('❌ Logged out from WhatsApp. Please delete "session_data" and rescan QR.');
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
        if (msg.key.fromMe) return; // Loop Protection

        const sender = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase().trim();
        const rawText = msg.message.conversation || msg.message.extendedTextMessage?.text || ""; // Preserve original casing for lead capture

        console.log(`📩 Incoming from ${sender.split('@')[0]}: ${text}`);

        // ==========================================
        // 🛑 STEP 3: CAPTURE LEAD DETAILS
        // ==========================================
        if (userStates[sender]?.step === 'WAITING_FOR_LEAD_DETAILS') {
            const customerWaNumber = sender.split('@')[0];
            const selectedCategory = userStates[sender].category;

            // Build Lead Object matching requirements
            const newLead = {
                name: "Provided in details", // Name is extracted from raw requirements text
                phone: customerWaNumber,
                service: selectedCategory,
                selectedItem: "General Interest", 
                requirement: rawText, // Stores Name, Phone, and Requirement provided by user
                timestamp: new Date().toISOString()
            };

            // Save lead securely via REST API to Firebase
            try {
                await fetch(`${FIREBASE_URL}/leads.json`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newLead)
                });
            } catch (error) {
                console.log("❌ Firebase Lead Save Error: ", error);
            }

            await sock.sendMessage(sender, { 
                text: `✅ *Request Received Successfully!*\n\nThank you for reaching out. Our team has received your requirement for *${selectedCategory}* and will contact you shortly.\n\nHave a great day! 🌟` 
            });
            
            delete userStates[sender]; // Clear state
            return;
        }

        // ==========================================
        // 🛑 STEP 2: CONFIRM INTEREST
        // ==========================================
        if (userStates[sender]?.step === 'WAITING_FOR_INTEREST') {
            if (text === 'yes' || text === 'y' || text.includes('yes')) {
                userStates[sender].step = 'WAITING_FOR_LEAD_DETAILS';
                await sock.sendMessage(sender, { 
                    text: `Awesome! 🎉\n\nPlease reply with your *Full Name*, an *Alternate Phone Number* (if any), and a *brief description of your requirement* in a single message.` 
                });
            } else {
                delete userStates[sender];
                await sock.sendMessage(sender, { 
                    text: `No worries! Let us know if you change your mind.\n\nType *services* anytime to explore our other offerings. 🚀` 
                });
            }
            return;
        }

        // ==========================================
        // 🛑 STEP 1: MAIN MENU & SERVICE SELECTION
        // ==========================================

        // --- SHOW SERVICES ---
        if (text === "services" || text === "menu" || text === "service") {
            const serviceMenu = `🚀 *Welcome to W-Assistant Services!* 🚀\n\nWe offer premium digital solutions to scale your business. Please choose a category:\n\n1️⃣ 🌐 *Website Development*\n2️⃣ 🎨 *Graphics Designing*\n3️⃣ 📢 *Advertisement / Marketing*\n\n_Reply with the service name (e.g., 'website', 'graphics', or 'ads') to explore our demos and packages!_`;
            await sock.sendMessage(sender, { text: serviceMenu });
            return;
        }

        // --- SHOW DEMOS: WEBSITE DEVELOPMENT ---
        else if (text.includes("website") || text.includes("web development") || text === "1") {
            await sock.sendMessage(sender, { text: "⏳ Fetching our best Website Development portfolios..." });
            const websites = await getServiceData('websites');

            if (websites.length === 0) {
                await sock.sendMessage(sender, { text: "📂 We are currently updating our website portfolio. Please check back later!" });
                return;
            }

            for (const item of websites) {
                let caption = `🌐 *${item.name}*\n\n`;
                if (item.price) caption += `💰 *Price:* ${item.price}\n`;
                if (item.demoUrl) caption += `🔗 *Demo:* ${item.demoUrl}\n`;
                if (item.description) caption += `\n📝 ${item.description}`;

                if (item.imageUrl) {
                    await sock.sendMessage(sender, { image: { url: item.imageUrl }, caption });
                } else {
                    await sock.sendMessage(sender, { text: caption });
                }
                await delay(600); // Prevent WhatsApp rate-limiting
            }

            userStates[sender] = { step: 'WAITING_FOR_INTEREST', category: 'Website Development' };
            await delay(1000);
            await sock.sendMessage(sender, { text: `❓ *Are you interested in our Website Development services?*\n\nReply *YES* to continue and connect with our team.` });
            return;
        }

        // --- SHOW DEMOS: GRAPHICS DESIGNING ---
        else if (text.includes("graphic") || text.includes("design") || text === "2") {
            await sock.sendMessage(sender, { text: "⏳ Fetching our creative Graphics & Design samples..." });
            const graphics = await getServiceData('graphics');

            if (graphics.length === 0) {
                await sock.sendMessage(sender, { text: "📂 We are currently updating our design portfolio. Please check back later!" });
                return;
            }

            for (const item of graphics) {
                let caption = `🎨 *${item.name}*\n\n`;
                if (item.category) caption += `📂 *Category:* ${item.category}\n`;
                if (item.price) caption += `💰 *Price Range:* ${item.price}\n`;
                if (item.description) caption += `\n📝 ${item.description}`;

                if (item.imageUrl) {
                    await sock.sendMessage(sender, { image: { url: item.imageUrl }, caption });
                } else {
                    await sock.sendMessage(sender, { text: caption });
                }
                await delay(600);
            }

            userStates[sender] = { step: 'WAITING_FOR_INTEREST', category: 'Graphics Designing' };
            await delay(1000);
            await sock.sendMessage(sender, { text: `❓ *Are you interested in our Graphics Designing services?*\n\nReply *YES* to continue and connect with our team.` });
            return;
        }

        // --- SHOW DEMOS: ADVERTISEMENT / MARKETING ---
        else if (text.includes("ad") || text.includes("marketing") || text.includes("seo") || text === "3") {
            await sock.sendMessage(sender, { text: "⏳ Fetching our Marketing & Advertisement packages..." });
            const ads = await getServiceData('ads');

            if (ads.length === 0) {
                await sock.sendMessage(sender, { text: "📂 We are currently updating our marketing packages. Please check back later!" });
                return;
            }

            for (const item of ads) {
                let caption = `📢 *${item.name}*\n\n`;
                if (item.price) caption += `💰 *Package Price:* ${item.price}\n`;
                if (item.description) caption += `\n📝 ${item.description}`;

                if (item.imageUrl) {
                    await sock.sendMessage(sender, { image: { url: item.imageUrl }, caption });
                } else {
                    await sock.sendMessage(sender, { text: caption });
                }
                await delay(600);
            }

            userStates[sender] = { step: 'WAITING_FOR_INTEREST', category: 'Advertisement / Marketing' };
            await delay(1000);
            await sock.sendMessage(sender, { text: `❓ *Are you interested in our Marketing & Ads services?*\n\nReply *YES* to continue and connect with our team.` });
            return;
        }

        // --- GREETINGS & DEFAULT HANDLER ---
        else if (text.includes("hi") || text.includes("hello") || text.includes("hey") || text === "start") {
            const welcomeMsg = `Welcome to *W-Assistant*! 👋\nYour 24/7 Digital Agency Partner.\n\nWe provide professional digital solutions to help you grow your business.\n\nType *services* to see our offerings!`;
            await sock.sendMessage(sender, { text: welcomeMsg });
        }
        else {
            // Unrecognized input fallback
            await sock.sendMessage(sender, { 
                text: `🤔 I didn't quite catch that.\n\nType *services* to explore our Digital Services, or reply to an active prompt if you were exploring a demo!` 
            });
        }
    });
}

startBot().catch(err => console.log("Critical Error: " + err));
