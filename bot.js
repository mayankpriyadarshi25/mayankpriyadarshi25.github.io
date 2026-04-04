// ==========================================
// 3D AI Assistant - Three.js + GSAP + AI
// ==========================================

let scene, camera, renderer, clock, mixer;
let botModel;
let actions = {};
let activeAction, previousAction;

// AI State
let isChatOpen = false;

// Dynamically choose API depending on where the site is running
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
const CHAT_API = isLocal ? 'http://localhost:3000/api/chat' : 'https://mayankpriyadarshi25-github-io.onrender.com/api/chat';

function initBot() {
    // 1. Setup Wrapper
    const wrapper = document.createElement('div');
    wrapper.id = 'ai-bot-wrapper';

    const uiHTML = `
        <div id="ai-chat-window" class="hidden">
            <div class="chat-header">
                <div>🤖 Mayank's Assistant</div>
                <button id="close-chat" style="background:none;border:none;color:white;cursor:pointer;font-weight:bold;">✕</button>
            </div>
            <div id="chat-messages">
                <div class="msg bot">Hi! I'm MetX! Drag me around or ask me anything!</div>
            </div>
            <div class="chat-input-area">
                <input type="text" id="chat-input" placeholder="Ask what's in your MIND..." />
                <button id="chat-send">Send</button>
            </div>
        </div>
        <div id="bot-container"></div>
    `;
    wrapper.innerHTML = uiHTML;
    document.body.appendChild(wrapper);

    // Styling logic 
    const style = document.createElement('style');
    style.innerHTML = `
        #ai-bot-wrapper {
            position: fixed;
            bottom: 30px;
            right: 30px;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 10px;
        }
        #bot-container {
            width: 190px;
            height: 230px;
            cursor: grab;
            filter: drop-shadow(0px 8px 12px rgba(0, 180, 255, 0.4));
            transition: transform 0.2s;
            position: relative;
        }
        #bot-container:active {
            cursor: grabbing;
        }
        #bot-container:hover {
            transform: scale(1.05);
        }
        #ai-chat-window {
            position: absolute;
            bottom: 0px; 
            right: 280px; /* Position it to the left of the bot */
            width: 280px;
            height: 350px;
            background: rgba(4, 7, 26, 0.85);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(0, 180, 255, 0.2);
            border-radius: 16px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            transition: opacity 0.3s, transform 0.3s;
            transform-origin: bottom right;
        }
        #ai-chat-window.hidden {
            opacity: 0;
            pointer-events: none;
            transform: scale(0.8);
        }
        .chat-header {
            padding: 12px 16px;
            background: rgba(0, 180, 255, 0.1);
            border-bottom: 1px solid rgba(0, 180, 255, 0.15);
            font-weight: 600;
            display: flex;
            justify-content: space-between;
            font-size: 0.95rem;
        }
        #chat-messages {
            flex: 1;
            padding: 16px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 12px;
            font-size: 0.85rem;
            line-height: 1.5;
        }
        .msg {
            max-width: 85%;
            padding: 10px 14px;
            border-radius: 12px;
        }
        .msg.bot {
            background: rgba(0, 180, 255, 0.12);
            color: #e8f0ff;
            align-self: flex-start;
            border-bottom-left-radius: 4px;
        }
        .msg.user {
            background: #00b4ff;
            color: #000;
            align-self: flex-end;
            border-bottom-right-radius: 4px;
            font-weight: 500;
        }
        .chat-input-area {
            display: flex;
            padding: 12px;
            border-top: 1px solid rgba(0, 180, 255, 0.1);
            gap: 8px;
        }
        #chat-input {
            flex: 1;
            background: rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(0, 180, 255, 0.2);
            color: white;
            border-radius: 8px;
            padding: 8px 12px;
            outline: none;
            font-family: inherit;
        }
        #chat-input:focus {
            border-color: #00b4ff;
        }
        #chat-send {
            background: #00b4ff;
            color: black;
            border: none;
            border-radius: 8px;
            padding: 8px 16px;
            font-weight: 600;
            cursor: pointer;
            transition: 0.2s;
        }
        #chat-send:hover {
            background: #00eeff;
        }
        /* ---- Welcome Popup Bubble ---- */
        /* ---- Welcome Popup (compact) ---- */
        #bot-welcome-popup {
            position: absolute;
            bottom: 240px;
            right: 0;
            background: rgba(4, 15, 40, 0.95);
            border: 1px solid rgba(0,180,255,0.35);
            border-radius: 12px 12px 4px 12px;
            padding: 9px 12px 8px;
            width: 170px;
            box-shadow: 0 4px 20px rgba(0,180,255,0.2);
            color: #e8f4ff;
            font-family: 'Outfit', 'Inter', sans-serif;
            font-size: 0.72rem;
            line-height: 1.45;
            z-index: 10001;
            animation: botPopIn 0.45s cubic-bezier(0.34,1.56,0.64,1) both;
            pointer-events: auto;
        }
        #bot-welcome-popup.hiding {
            animation: botPopOut 0.3s ease-in forwards;
        }
        @keyframes botPopIn {
            from { opacity: 0; transform: scale(0.75) translateY(12px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes botPopOut {
            from { opacity: 1; transform: scale(1) translateY(0); }
            to   { opacity: 0; transform: scale(0.8) translateY(10px); }
        }
        #bot-welcome-popup .popup-text {
            color: #c8e0ff;
            margin-bottom: 7px;
        }
        #bot-welcome-popup .popup-text strong {
            color: #00d4ff;
        }
        #bot-welcome-popup .popup-cta {
            display: block;
            width: 100%;
            background: linear-gradient(90deg, #00b4ff, #0055dd);
            color: #fff;
            border: none;
            border-radius: 6px;
            padding: 5px 0;
            font-size: 0.7rem;
            font-weight: 700;
            cursor: pointer;
            text-align: center;
            transition: opacity 0.2s;
        }
        #bot-welcome-popup .popup-cta:hover {
            opacity: 0.85;
        }
        #bot-welcome-popup .popup-close {
            position: absolute;
            top: 5px;
            right: 7px;
            background: none;
            border: none;
            color: rgba(150,195,255,0.55);
            font-size: 0.65rem;
            cursor: pointer;
            padding: 0;
            line-height: 1;
            transition: color 0.2s;
        }
        #bot-welcome-popup .popup-close:hover { color: #00d4ff; }
        #bot-welcome-popup .popup-bar {
            height: 2px;
            background: rgba(0,180,255,0.15);
            border-radius: 2px;
            margin-top: 7px;
            overflow: hidden;
        }
        #bot-welcome-popup .popup-bar-fill {
            height: 100%;
            width: 100%;
            background: linear-gradient(90deg,#00b4ff,#0044cc);
            animation: timerShrink 5s linear forwards;
        }
        @keyframes timerShrink {
            from { width: 100%; }
            to   { width: 0%; }
        }
    `;
    document.head.appendChild(style);

    // 2. Three.js Setup
    const container = document.getElementById('bot-container');
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.25, 100);
    camera.position.set(0, 0.8, 7.5); // Lowered and pulled back slightly to show full body

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(renderer.domElement);

    // Orbit Controls for 360 rotation
    if (typeof THREE.OrbitControls !== 'undefined') {
        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.enableZoom = false; // Keeps the bot size consistent
        controls.enablePan = false;
    } else {
        console.warn("THREE.OrbitControls is not defined. Make sure to include the script.");
    }

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff);
    dirLight.position.set(3, 10, 10);
    scene.add(dirLight);

    clock = new THREE.Clock();

    // Load Model
    const loader = new THREE.GLTFLoader();
    loader.load('a.glb', function (gltf) {
        botModel = gltf.scene;
        scene.add(botModel);

        // Center Model - positioned to show full body in smaller container
        botModel.position.set(0, -0.6, 0);
        botModel.scale.set(1.3, 1.3, 1.3);

        // Setup Animations
        if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(botModel);

            gltf.animations.forEach((clip) => {
                actions[clip.name] = mixer.clipAction(clip);
            });

            // Start Idle or fallback to first animation
            if (actions['Idle']) {
                activeAction = actions['Idle'];
            } else {
                activeAction = mixer.clipAction(gltf.animations[0]);
            }
            activeAction.play();
        }

        animate();
    }, undefined, function (e) {
        console.error('Error loading bot model:', e);
    });

    // 3. Floating Animation (GSAP)
    gsap.to(container, {
        y: -15,
        duration: 2,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut"
    });

    // 4. Interactivity - Single click toggles chat
    container.addEventListener('click', toggleChat);

    // Handle Window Resize
    window.addEventListener('resize', onWindowResize, false);

    // Chat Logic
    setupChat();

    // Welcome popup
    showWelcomePopup();
}

function fadeToAction(name, duration, returnToIdle = false) {
    if (!actions[name] || activeAction === actions[name]) return;

    previousAction = activeAction;
    activeAction = actions[name];

    if (previousAction) {
        previousAction.fadeOut(duration);
    }

    activeAction
        .reset()
        .setEffectiveTimeScale(1)
        .setEffectiveWeight(1)
        .fadeIn(duration)
        .play();

    if (returnToIdle) {
        mixer.addEventListener('finished', restoreIdle);
        activeAction.loop = THREE.LoopOnce;
        activeAction.clampWhenFinished = true;
    } else {
        activeAction.loop = THREE.LoopRepeat;
    }
}

function restoreIdle() {
    mixer.removeEventListener('finished', restoreIdle);
    fadeToAction('Idle', 0.5);
}

function onWindowResize() {
    const container = document.getElementById('bot-container');
    if (!container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    if (mixer) mixer.update(dt);
    if (botModel && !isChatOpen) {
        // Look at mouse softly
        // botModel.rotation.y = Math.sin(clock.elapsedTime) * 0.1;
    }
    renderer.render(scene, camera);
}

// ==========================
// CHAT LOGIC
// ==========================
function toggleChat() {
    isChatOpen = !isChatOpen;
    const cw = document.getElementById('ai-chat-window');
    if (isChatOpen) {
        cw.classList.remove('hidden');
        document.getElementById('chat-input').focus();
        fadeToAction('Sitting', 0.5);
    } else {
        cw.classList.add('hidden');
        fadeToAction('Idle', 0.5);
    }
}

function setupChat() {
    document.getElementById('close-chat').onclick = toggleChat;
    document.getElementById('chat-send').onclick = sendMsg;
    document.getElementById('chat-input').onkeypress = (e) => {
        if (e.key === 'Enter') sendMsg();
    }
}

async function sendMsg() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    input.value = '';
    addMessage(msg, 'user');

    // Bot Typing state
    const thinkingId = addMessage("Thinking...", 'bot');

    try {
        const res = await fetch(CHAT_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg })
        });
        const data = await res.json();

        document.getElementById(thinkingId).remove();
        addMessage(data.reply || "Sorry, I glitch sometimes!", 'bot');
        
        // Audio auto-reading has been disabled per user request
        
        // Happy animation
        fadeToAction('ThumbsUp', 0.2, true);

    } catch (e) {
        document.getElementById(thinkingId).remove();
        addMessage("Connection error with my AI brain!", 'bot');
    }
}

function addMessage(text, sender) {
    const box = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `msg ${sender}`;
    div.innerText = text;
    div.id = 'msg-' + Date.now();
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return div.id;
}


// ==========================
// WELCOME POPUP
// ==========================
function showWelcomePopup() {
    // Only show once per session
    if (sessionStorage.getItem('botWelcomed')) return;
    sessionStorage.setItem('botWelcomed', '1');

    const wrapper = document.getElementById('ai-bot-wrapper');
    const popup = document.createElement('div');
    popup.id = 'bot-welcome-popup';
    popup.innerHTML = `
        <button class="popup-close" id="popup-dismiss" title="Dismiss">✕</button>
        <div class="popup-text">🤖 I'm <strong>MetX</strong> — a <strong>smart AI chatbot</strong>! Ask me anything about Mayank.</div>
        <button class="popup-cta" id="popup-open-chat">💬 Chat with me!</button>
        <div class="popup-bar"><div class="popup-bar-fill"></div></div>
    `;
    wrapper.appendChild(popup);

    const dismiss = () => {
        popup.classList.add('hiding');
        setTimeout(() => popup.remove(), 350);
    };

    document.getElementById('popup-dismiss').onclick = dismiss;
    document.getElementById('popup-open-chat').onclick = () => {
        dismiss();
        setTimeout(() => {
            if (!isChatOpen) toggleChat();
        }, 200);
    };

    // Auto-dismiss after 5s
    setTimeout(dismiss, 5000);
}

// Execute when DOM ready
document.addEventListener('DOMContentLoaded', initBot);
