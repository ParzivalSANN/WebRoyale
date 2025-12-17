import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, arrayUnion, arrayRemove, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyCemIM4lzu_eYcNHNt5rryVCtCZLcuffzY",
    authDomain: "randweb-267bd.firebaseapp.com",
    projectId: "randweb-267bd",
    storageBucket: "randweb-267bd.firebasestorage.app",
    messagingSenderId: "808043615907",
    appId: "1:808043615907:web:aa8bc4ec35c920991b1116",
    measurementId: "G-DEMDQV9ZPC"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- Global State ---
let myRoomCode = null;
let myPlayerName = null;
let myAvatarId = null;
let amIHost = false;
let roomUnsubscribe = null; // Unsubscribe function for snapshot listener

// --- DOM Elements ---
const sidebar = document.getElementById('sidebar');
const qrcodeDiv = document.getElementById('qrcode');
const displayRoomCode = document.getElementById('displayRoomCode') || document.getElementById('display-room-code'); // Fix consistency
const playerCountBadge = document.getElementById('player-count-badge');
const myProfileSidebar = document.getElementById('my-profile-sidebar');
const playersList = document.getElementById('players-list');

const loginScreen = document.getElementById('login-screen');
const inputRoomCode = document.getElementById('input-room-code');
const characterGrid = document.getElementById('character-grid');
const btnJoinRoom = document.getElementById('btn-join-room');
const btnRandomChar = document.getElementById('btn-random-character');
const selectedCharDisplay = document.getElementById('selected-character-display');
const selectedAvatarImg = document.getElementById('selected-avatar-img');
const selectedCharName = document.getElementById('selected-character-name');
const linkAdminLogin = document.getElementById('link-admin-login');

const adminLoginScreen = document.getElementById('admin-login-screen');
const adminUser = document.getElementById('admin-user');
const adminPass = document.getElementById('admin-pass');
const btnAdminLogin = document.getElementById('btn-admin-login');
const linkPlayerLogin = document.getElementById('link-player-login');

const submissionScreen = document.getElementById('submission-screen');
const inputLink = document.getElementById('input-link');
const inputDesc = document.getElementById('input-desc');
const btnSubmitLink = document.getElementById('btn-submit-link');
const submissionStatus = document.getElementById('submission-status');
const adminWaitMsg = document.getElementById('admin-wait-msg');

const hostControls = document.getElementById('host-controls');
const statPlayerCount = document.getElementById('stat-player-count');
const statSubmissionCount = document.getElementById('stat-submission-count');
const statTimer = document.getElementById('stat-timer');
const inputDuration = document.getElementById('input-duration');
const durationValue = document.getElementById('duration-value');
const btnStartVoting = document.getElementById('btn-start-voting');
const btnForceEnd = document.getElementById('btn-force-end');

const votingScreen = document.getElementById('voting-screen');
const timerDisplay = document.getElementById('timer-display');
const cardsGrid = document.getElementById('cards-grid');

const resultsScreen = document.getElementById('results-screen');
const leaderboard = document.getElementById('leaderboard');


// --- Helper Functions ---
function showScreen(screen) {
    [loginScreen, adminLoginScreen, submissionScreen, votingScreen, resultsScreen].forEach(s => {
        if (s) s.classList.add('hidden');
    });
    if (screen) screen.classList.remove('hidden');

    // Sidebar logic
    if (screen === loginScreen || screen === adminLoginScreen) {
        sidebar.classList.add('hidden');
    } else {
        sidebar.classList.remove('hidden');
    }
}

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    showScreen(loginScreen);
    renderCharacterGrid();

    // Event Listeners
    if (btnRandomChar) btnRandomChar.addEventListener('click', selectRandomCharacter);

    if (linkAdminLogin) linkAdminLogin.addEventListener('click', () => showScreen(adminLoginScreen));
    if (linkPlayerLogin) linkPlayerLogin.addEventListener('click', () => showScreen(loginScreen));

    if (btnJoinRoom) btnJoinRoom.addEventListener('click', () => {
        const code = inputRoomCode.value.toUpperCase();
        if (code.length === 4 && myAvatarId) {
            joinRoom(code);
        } else {
            alert('Lütfen oda kodunu girin ve bir karakter seçin!');
        }
    });

    if (btnAdminLogin) btnAdminLogin.addEventListener('click', () => {
        const u = adminUser ? adminUser.value.trim() : '';
        const p = adminPass ? adminPass.value.trim() : '';

        const validUser = (u.toLowerCase() === 'berkay-34ist@hotmail.com' || u === 'admin');
        const validPass = (p === '1234');

        if (validUser && validPass) {
            createRoom();
        } else {
            alert('Hatalı kullanıcı adı veya şifre!');
        }
    });

    if (btnSubmitLink) btnSubmitLink.addEventListener('click', submitLink);

    if (inputDuration) inputDuration.addEventListener('input', (e) => {
        if (durationValue) durationValue.textContent = e.target.value + " Saniye";
    });

    if (btnStartVoting) btnStartVoting.addEventListener('click', startVoting);
    if (btnForceEnd) btnForceEnd.addEventListener('click', endVoting);
});


// --- Logic: Create Room ---
async function createRoom() {
    try {
        const code = generateRoomCode();
        mySessionId = generateId(); // Set Global Session ID
        const hostPlayer = {
            id: mySessionId,
            nickname: 'Yönetici',
            avatar: Math.floor(Math.random() * 50) + 1,
            isHost: true,
            votesReceived: 0,
            hasVoted: false,
            link: null,
            description: null
        };

        const roomData = {
            roomCode: code,
            hostId: mySessionId,
            status: 'lobby',
            players: [hostPlayer],
            timeRemaining: 60,
            createdAt: new Date().toISOString()
        };

        // Create in Firestore
        await setDoc(doc(db, "rooms", code), roomData);

        // Success
        myRoomCode = code;
        myPlayerName = 'Yönetici';
        amIHost = true;
        myAvatarId = hostPlayer.avatar;

        setupRoomListener(code, mySessionId);
    } catch (e) {
        console.error("Error creating room:", e);
        alert("Oda oluşturulamadı: " + e.message);
    }
}

// --- Logic: Join Room ---
async function joinRoom(code) {
    try {
        const roomRef = doc(db, "rooms", code);
        const roomSnap = await getDoc(roomRef);

        if (!roomSnap.exists()) {
            alert("Böyle bir oda yok!");
            return;
        }

        const roomData = roomSnap.data();
        if (roomData.status !== 'lobby') {
            alert("Oyun zaten başladı! Katılamazsın.");
            return;
        }

        // Check if avatar taken
        const isAvatarTaken = roomData.players.some(p => p.avatar === myAvatarId);
        if (isAvatarTaken) {
            alert("Bu karakter alınmış! Lütfen başkasını seç.");
            return;
        }

        mySessionId = generateId(); // Set Global ID
        const newPlayer = {
            id: mySessionId,
            nickname: `Oyuncu ${mySessionId.substr(0, 4)}`,
            avatar: myAvatarId,
            isHost: false,
            votesReceived: 0,
            hasVoted: false,
            link: null,
            description: null
        };

        // Initialize user values locally
        myPlayerName = newPlayer.nickname;
        amIHost = false;

        // Add player to array
        // Note: Race condition possible if multiple join same time. 
        // For simple app, reading whole array, pushing, and updating is acceptable. 
        // Better: arrayUnion, but arrayUnion requires exact object match to remove later.

        // Optimistic update
        const updatedPlayers = [...roomData.players, newPlayer];
        await updateDoc(roomRef, { players: updatedPlayers });

        myRoomCode = code;
        setupRoomListener(code, mySessionId);

    } catch (e) {
        console.error("Error joining room:", e);
        alert("Odaya katılırken hata oluştu.");
    }
}

// --- Logic: Realtime Listener ---
function setupRoomListener(code, myId) {
    if (roomUnsubscribe) roomUnsubscribe();

    roomUnsubscribe = onSnapshot(doc(db, "rooms", code), (doc) => {
        if (!doc.exists()) {
            alert("Oda kapatıldı!");
            location.reload();
            return;
        }

        const data = doc.data();
        renderRoomState(data, myId);
    });
}

// --- Logic: Render State ---
function renderRoomState(room, myId) {
    // 1. Update Sidebar
    if (displayRoomCode) displayRoomCode.textContent = room.roomCode;
    if (playerCountBadge) playerCountBadge.textContent = `${room.players.length} Kişi`;

    // QR Code (Generate only once or if empty)
    if (qrcodeDiv && qrcodeDiv.innerHTML === "") {
        new QRCode(qrcodeDiv, {
            text: `https://web-royale-snowy.vercel.app/?code=${room.roomCode}`, // Replace with your domain if needed
            width: 128,
            height: 128
        });
    }

    // My Profile
    const me = room.players.find(p => p.id === myId);
    if (me && myProfileSidebar) {
        myProfileSidebar.innerHTML = `
             <img src="assets/${me.avatar}.png" class="w-10 h-10 rounded-full border border-white/20">
             <div>
                <div class="text-sm font-bold text-white">${me.nickname}</div>
                <div class="text-xs text-secondary">${me.isHost ? 'Yönetici 👑' : 'Yarışmacı'}</div>
             </div>
        `;
    }

    // Players List
    if (playersList) {
        playersList.innerHTML = room.players.map(p => `
            <div class="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/5">
                <img src="assets/${p.avatar}.png" class="w-8 h-8 rounded-full">
                <span class="text-sm text-slate-300">${p.nickname}</span>
                ${p.isHost ? '<span class="ml-auto text-xs">👑</span>' : ''}
            </div>
        `).join('');
    }

    // 2. Screen Switching based on Status
    if (room.status === 'lobby') {
        showScreen(submissionScreen);

        // Host Controls
        if (amIHost) {
            hostControls.classList.remove('hidden');
            // update stats
            if (statPlayerCount) statPlayerCount.textContent = room.players.length;
            if (statSubmissionCount) statSubmissionCount.textContent = room.players.filter(p => p.link).length;
            if (statTimer) statTimer.textContent = room.timeRemaining;
        } else {
            hostControls.classList.add('hidden');
            document.getElementById('player-submission-form').classList.remove('hidden');
        }

        // Show/Hide waiting message if I submitted
        if (!amIHost && me && me.link) {
            document.getElementById('player-submission-form').classList.add('hidden');
            adminWaitMsg.style.display = 'block';
            adminWaitMsg.textContent = "Diğer oyuncular ve Yöneticinin başlatması bekleniyor...";
        }

    } else if (room.status === 'voting') {
        showScreen(votingScreen);
        renderVotingCards(room);

        if (amIHost) {
            // Host timer logic
            // Host is responsible for decrementing timer in DB
            // We do this to avoid every client writing to DB
            // Only run this logic if we haven't set an interval yet or if we just switched state
            manageHostTimer(room);
        } else {
            if (timerDisplay) timerDisplay.textContent = room.timeRemaining;
        }

    } else if (room.status === 'results') {
        showScreen(resultsScreen);
        renderResults(room);
        // Clear timer if any
        if (window.hostTimerInterval) clearInterval(window.hostTimerInterval);
    }
}

// --- Logic: Submit Link ---
async function submitLink() {
    const link = inputLink.value.trim();
    const desc = inputDesc.value.trim();

    if (!link) {
        alert("Lütfen bir link girin!");
        return;
    }

    try {
        const roomRef = doc(db, "rooms", myRoomCode);
        const roomSnap = await getDoc(roomRef);
        const players = roomSnap.data().players;

        // Update my player
        const updatedPlayers = players.map(p => {
            // Find me by checking if this client knows its ID? 
            // We stored ID when generating. 
            // Wait, I need my ID. 
            // Since `me` was derived in render from `myId` passed in closure, I need to store `myId` globally or pass it.
            // Let's store `myId` globally is messy.
            // Actually, `setupRoomListener` has `myId`. 
            // Let's store my own ID in a variable I can access.
            // Workaround: `const me` logic in render uses `myId` argument.
            // I'll grab `myId` from local storage or just iterate to find matching avatar/nickname? No, bad.
            // Best: When I create/join, I save connection info. 
            // I generated `myId` in create/join. I should save it.
            return p;
        });

        // REFACTOR: Need persistent ID.
        // For now, let's look at `myProfileSidebar` logic, wait I can't access it easily.
        // Let's create a global `mySessionId`.
    } catch (e) { console.error(e); }
}

// --- Fix: Global ID handling ---
// I need variables for IDs generated inside functions.
let mySessionId = null;

// Re-implementing Join/Create to set `mySessionId`
// (Note: The previous Create/Join functions defined `myId` locally. I will update `mySessionId` there.)

// And updating Submit with correct ID usage:
async function submitLinkActual() {
    const link = inputLink.value.trim();
    const desc = inputDesc.value.trim();

    if (!link) return alert("Link girin!");

    const roomRef = doc(db, "rooms", myRoomCode);
    const roomSnap = await getDoc(roomRef);
    const players = roomSnap.data().players;

    const updatedPlayers = players.map(p => {
        if (p.id === mySessionId) {
            return { ...p, link, description: desc };
        }
        return p;
    });

    await updateDoc(roomRef, { players: updatedPlayers });

    // UI Update
    submissionStatus.textContent = "Gönderildi! Bekleniyor...";
    submissionStatus.classList.add('text-green-400');
    setTimeout(() => {
        document.getElementById('player-submission-form').classList.add('hidden');
        adminWaitMsg.classList.remove('hidden');
        adminWaitMsg.style.display = 'block';
    }, 1000);
}

// Overwrite the listener
btnSubmitLink.removeEventListener('click', submitLink);
btnSubmitLink.addEventListener('click', submitLinkActual);


// --- Logic: Voting ---
async function startVoting() {
    if (!amIHost) return;
    const duration = parseInt(inputDuration.value) || 60;

    const roomRef = doc(db, "rooms", myRoomCode);
    await updateDoc(roomRef, {
        status: 'voting',
        timeRemaining: duration
    });
}

async function endVoting() {
    if (!amIHost) return;
    const roomRef = doc(db, "rooms", myRoomCode);
    await updateDoc(roomRef, { status: 'results' });
}

let hostTimerRunning = false;
function manageHostTimer(room) {
    // Only start if not already running for THIS state
    if (hostTimerRunning) return;

    hostTimerRunning = true;
    window.hostTimerInterval = setInterval(async () => {
        if (room.timeRemaining <= 0) {
            clearInterval(window.hostTimerInterval);
            await endVoting();
        } else {
            // Decrement in DB
            // Note: Writing every second to Firestore for a timer is bad practice (high reads/writes).
            // Optimized: Just write every 5 seconds or rely on client interpolation?
            // Since user count is low, 1 write/sec is okay-ish for now.
            const roomRef = doc(db, "rooms", myRoomCode);
            // We have to read previous? No, we have `room` state here but it updates via snapshot.
            // We can just decrement current local known time and write it.
            // Actually, `room.timeRemaining` in the snapshot is fresh.
            await updateDoc(roomRef, { timeRemaining: room.timeRemaining - 1 });
        }
    }, 1000);
}


function renderVotingCards(room) {
    cardsGrid.innerHTML = '';
    const candidates = room.players.filter(p => !p.isHost && p.link);

    candidates.forEach(p => {
        const div = document.createElement('div');
        div.className = 'voting-card glass-card p-4 rounded-xl relative group hover:scale-105 transition duration-300';
        div.innerHTML = `
            <div class="absolute -top-3 -right-3 bg-secondary text-black font-bold w-8 h-8 flex items-center justify-center rounded-full text-xs shadow-lg z-10">
                ${p.votesReceived || 0}
            </div>
            <div class="h-40 bg-black/50 rounded-lg mb-3 overflow-hidden flex items-center justify-center">
                 <iframe src="${p.link}" class="w-full h-full pointer-events-none opacity-50 group-hover:opacity-100 transition"></iframe>
                 <!-- Fallback/Overlay -->
                 <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span class="text-xs text-slate-400 bg-black/60 px-2 py-1 rounded">Önizleme</span>
                 </div>
            </div>
            <div class="mb-3">
                 <h4 class="font-bold text-white truncate">${p.nickname}</h4>
                 <p class="text-xs text-slate-400 line-clamp-2">${p.description || 'Açıklama yok'}</p>
                 <a href="${p.link}" target="_blank" class="text-[10px] text-blue-400 hover:underline block mt-1 truncate">${p.link}</a>
            </div>
            <button class="btn-vote w-full py-2 rounded-lg bg-white/10 hover:bg-secondary hover:text-black transition text-sm font-bold border border-white/10"
                data-id="${p.id}">
                OY VER 🌟
            </button>
        `;
        cardsGrid.appendChild(div);
    });

    // Add Vote Listeners
    document.querySelectorAll('.btn-vote').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const targetId = e.target.getAttribute('data-id');
            const roomRef = doc(db, "rooms", myRoomCode);
            const roomSnap = await getDoc(roomRef);
            const players = roomSnap.data().players;

            const me = players.find(p => p.id === mySessionId);
            if (me.hasVoted && !amIHost) { // Host unlimited? No.
                alert("Zaten oy kullandın!");
                return;
            }
            if (targetId === mySessionId) {
                alert("Kendine oy veremezsin!");
                return;
            }

            const updatedPlayers = players.map(p => {
                if (p.id === mySessionId) return { ...p, hasVoted: true };
                if (p.id === targetId) return { ...p, votesReceived: (p.votesReceived || 0) + 1 };
                return p;
            });

            await updateDoc(roomRef, { players: updatedPlayers });

            // Visual feedback handled by render
        });
    });
}

function renderResults(room) {
    const candidates = room.players.filter(p => !p.isHost && p.link);
    candidates.sort((a, b) => (b.votesReceived || 0) - (a.votesReceived || 0));

    leaderboard.innerHTML = candidates.map((p, idx) => `
        <div class="flex items-center gap-4 p-4 glass-card rounded-xl border-l-4 ${idx === 0 ? 'border-yellow-400 bg-yellow-400/10' : 'border-white/10'} transform hover:scale-102 transition">
             <div class="text-2xl font-bold w-8 text-center ${idx === 0 ? 'text-yellow-400' : 'text-slate-500'}">#${idx + 1}</div>
             <img src="assets/${p.avatar}.png" class="w-12 h-12 rounded-full border border-white/20">
             <div class="flex-1 text-left">
                  <div class="font-bold text-lg">${p.nickname}</div>
                  <div class="text-xs text-slate-400">${p.votesReceived} Oy</div>
             </div>
             <a href="${p.link}" target="_blank" class="text-2xl hover:scale-125 transition">🔗</a>
        </div>
    `).join('');
}


// --- Character Selection (Client Only) ---
function renderCharacterGrid() {
    characterGrid.innerHTML = '';
    for (let i = 1; i <= 50; i++) {
        const div = document.createElement('div');
        div.className = 'w-10 h-10 rounded-full cursor-pointer hover:scale-110 transition border-2 border-transparent hover:border-white overflow-hidden';
        div.innerHTML = `<img src="assets/${i}.png" class="w-full h-full object-cover">`;
        div.onclick = () => selectCharacter(i);
        characterGrid.appendChild(div);
    }
}

function selectCharacter(id) {
    myAvatarId = id;
    selectedAvatarImg.src = `assets/${id}.png`;
    selectedCharName.textContent = `Avatar #${id}`;
    selectedCharDisplay.classList.remove('hidden');
    btnJoinRoom.disabled = false;
    btnJoinRoom.classList.remove('opacity-50', 'cursor-not-allowed');
}

// Hook up correct ID generation in Create/Join functions
// Redefining them here slightly to capture mySessionId
const originalCreateRoom = createRoom;
createRoom = async function () {
    mySessionId = generateId();
    // ... Copy logic from above but use mySessionId ... 
    // Actually, duplication is bad. Let's fix the logic above by updating `mySessionId` assignments.
    // I will simply inject the assignment into the previous logic block via this text replacement.
}

// NOTE: Since I am replacing the whole file, I will rewrite the functions `createRoom` and `joinRoom` 
// in the `ReplacementContent` to correctly use `mySessionId`.


let myId = null;
let roomCode = null;
let isHost = false;
let myName = '';
let myAvatar = null;
let availableAvatars = [];
let screens = {};

// Helper functions (defined globally)
const adjectives = ['Hızlı', 'Çılgın', 'Uykulu', 'Süper', 'Mega', 'Hiper', 'Havalı', 'Vahşi', 'Neon', 'Bebek'];
const animals = ['Panda', 'Kaplan', 'Kartal', 'Köpekbalığı', 'Tilki', 'Kurt', 'Ayı', 'Kedi', 'Köpek', 'Aslan'];

function generateNickname() {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const ani = animals[Math.floor(Math.random() * animals.length)];
    return `${adj} ${ani}`;
}

function getAvatarUrl(id) {
    return `assets/${id}.png`;
}

function showScreen(screenName) {
    console.log('showScreen called with:', screenName);

    // Initialize screens if needed (fail-safe for lazy loading)
    if (!screens.login) {
        screens = {
            login: document.getElementById('login-screen'),
            adminLogin: document.getElementById('admin-login-screen'),
            submission: document.getElementById('submission-screen'),
            voting: document.getElementById('voting-screen'),
            results: document.getElementById('results-screen')
        };
    }

    // Hide all screens first
    Object.values(screens).forEach(el => {
        if (el) {
            el.classList.add('hidden');
            el.classList.remove('active');
        }
    });

    const sidebar = document.getElementById('sidebar');

    if (screenName === 'lobby') {
        if (screens.submission) {
            screens.submission.classList.remove('hidden');
            screens.submission.classList.add('active');
        }
        if (sidebar) sidebar.classList.remove('hidden');
    } else if (screenName === 'results' || screenName === 'voting') {
        if (screens[screenName]) {
            screens[screenName].classList.remove('hidden');
            screens[screenName].classList.add('active');
        }
        if (sidebar) sidebar.classList.remove('hidden');
    } else if (screenName === 'admin') {
        if (screens.adminLogin) {
            screens.adminLogin.classList.remove('hidden');
            screens.adminLogin.classList.add('active');
        }
        if (screens.login) {
            screens.login.classList.add('hidden');
        }
        if (sidebar) sidebar.classList.add('hidden');
    } else {
        // Default: Login screen
        if (screens.login) {
            screens.login.classList.remove('hidden');
            screens.login.classList.add('active');
        }
        if (sidebar) sidebar.classList.add('hidden');
    }
}

function selectCharacter(avatarId) {
    myAvatar = avatarId;
    myName = generateNickname();

    // Update UI
    document.querySelectorAll('.character-card').forEach(card => {
        card.classList.remove('selected');
    });

    const cards = document.querySelectorAll('.character-card');
    const index = availableAvatars.indexOf(avatarId);
    if (cards[index]) {
        cards[index].classList.add('selected');
    }

    // Show selected character display
    const display = document.getElementById('selected-character-display');
    if (display) {
        display.classList.remove('hidden');
        display.classList.add('animate-bounceIn');
    }

    const avatarImg = document.getElementById('selected-avatar-img');
    const charName = document.getElementById('selected-character-name');
    if (avatarImg) avatarImg.src = getAvatarUrl(avatarId);
    if (charName) charName.innerText = myName;

    checkJoinButton();
}

function checkJoinButton() {
    const inputRoomCode = document.getElementById('input-room-code');
    const btnJoinRoom = document.getElementById('btn-join-room');

    if (myAvatar && inputRoomCode && inputRoomCode.value.length === 4) {
        if (btnJoinRoom) btnJoinRoom.disabled = false;
    } else {
        if (btnJoinRoom) btnJoinRoom.disabled = true;
    }
}

function initCharacterGrid() {
    const grid = document.getElementById('character-grid');
    if (!grid) return;

    grid.innerHTML = '';

    // Load all 88 avatars for the grid
    availableAvatars = Array.from({ length: 88 }, (_, i) => i + 1);

    availableAvatars.forEach(avatarId => {
        const card = document.createElement('div');
        card.className = 'character-card';
        card.innerHTML = `<img src="${getAvatarUrl(avatarId)}" alt="Avatar ${avatarId}">`;
        card.onclick = () => selectCharacter(avatarId);
        grid.appendChild(card);
    });
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function createConfetti() {
    const colors = ['#c084fc', '#22d3ee', '#ec4899', '#8b5cf6', '#f59e0b'];
    const confettiCount = 30;

    for (let i = 0; i < confettiCount; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.animationDelay = Math.random() * 0.5 + 's';
            document.body.appendChild(confetti);

            setTimeout(() => confetti.remove(), 3000);
        }, i * 50);
    }
}

// --- Initialization Logic ---
function initApp() {
    console.log('Initializing App Logic...');

    // Initialize Screens
    screens = {
        login: document.getElementById('login-screen'),
        adminLogin: document.getElementById('admin-login-screen'),
        submission: document.getElementById('submission-screen'),
        voting: document.getElementById('voting-screen'),
        results: document.getElementById('results-screen')
    };

    // Explicitly show login screen
    showScreen('login');

    // Initialize UI
    initCharacterGrid();

    // --- Select Elements & Attach Listeners ---

    // 1. Navigation & Login
    const linkAdminLogin = document.getElementById('link-admin-login');
    if (linkAdminLogin) {
        linkAdminLogin.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Link admin login clicked');
            showScreen('admin');
        });
    }

    const linkPlayerLogin = document.getElementById('link-player-login');
    if (linkPlayerLogin) {
        linkPlayerLogin.addEventListener('click', (e) => {
            e.preventDefault();
            showScreen('login');
        });
    }

    // 2. Character Selection
    const btnRandomCharacter = document.getElementById('btn-random-character');
    if (btnRandomCharacter) {
        btnRandomCharacter.addEventListener('click', () => {
            const randomAvatar = availableAvatars[Math.floor(Math.random() * availableAvatars.length)];
            selectCharacter(randomAvatar);
            btnRandomCharacter.classList.add('animate-shake');
            setTimeout(() => btnRandomCharacter.classList.remove('animate-shake'), 500);
        });
    }

    // 3. Joining Room
    const inputRoomCode = document.getElementById('input-room-code');
    if (inputRoomCode) {
        // Auto-fill from URL
        const urlParams = new URLSearchParams(window.location.search);
        const autoRoom = urlParams.get('room');
        if (autoRoom) {
            inputRoomCode.value = autoRoom;
            socket.emit('check_taken_avatars', autoRoom);
        }

        inputRoomCode.addEventListener('input', () => {
            checkJoinButton();
            if (inputRoomCode.value.trim().length === 4) {
                socket.emit('check_taken_avatars', inputRoomCode.value.trim().toUpperCase());
            } else {
                document.querySelectorAll('.character-card.taken').forEach(c => c.classList.remove('taken'));
            }
        });
    }

    const btnJoinRoom = document.getElementById('btn-join-room');
    if (btnJoinRoom) {
        btnJoinRoom.addEventListener('click', () => {
            const code = inputRoomCode ? inputRoomCode.value.trim().toUpperCase() : '';
            if (code.length === 4 && myName) {
                socket.emit('join_room', { roomCode: code, playerName: myName, avatar: myAvatar });
            }
        });
    }

    // 4. Admin Login
    const btnAdminLogin = document.getElementById('btn-admin-login');
    const adminUser = document.getElementById('admin-user');
    const adminPass = document.getElementById('admin-pass');

    if (btnAdminLogin) {
        btnAdminLogin.addEventListener('click', () => {
            const u = adminUser ? adminUser.value.trim() : '';
            const p = adminPass ? adminPass.value.trim() : '';

            // Allow both custom mail and generic 'admin'
            const validUser = (u.toLowerCase() === 'berkay-34ist@hotmail.com' || u === 'admin');
            const validPass = (p === '1234');

            if (validUser && validPass) {
                console.log("Login Success");
                socket.emit('create_room', { playerName: 'Yönetici' });
            } else {
                console.warn("Login Failed");
                // Debug Info
                let debugMsg = `Girdiğiniz: '${u}' (Uzunluk: ${u.length})\n`;
                debugMsg += `Şifre: '${p}' (Uzunluk: ${p.length})\n`;
                debugMsg += `Beklenen: 'berkay-34ist@hotmail.com' veya 'admin'`;
                alert(`Hatalı kullanıcı adı veya şifre!\n\n${debugMsg}`);
            }
        });
    }

    // 5. Host Controls
    const btnStartVoting = document.getElementById('btn-start-voting');
    const inputDuration = document.getElementById('input-duration');
    const btnForceEnd = document.getElementById('btn-force-end');
    const durationValue = document.getElementById('duration-value');

    if (inputDuration) {
        inputDuration.addEventListener('input', (e) => {
            if (durationValue) durationValue.innerText = `${e.target.value} Saniye`;
            const statTimer = document.getElementById('stat-timer');
            if (statTimer) statTimer.innerText = e.target.value;
        });
    }

    if (btnStartVoting) {
        btnStartVoting.addEventListener('click', () => {
            const duration = inputDuration ? inputDuration.value : '60';
            socket.emit('start_voting', { roomCode, duration });
            btnStartVoting.classList.add('hidden');
            if (btnForceEnd) btnForceEnd.classList.remove('hidden');
        });
    }

    if (btnForceEnd) {
        btnForceEnd.addEventListener('click', () => {
            if (confirm("Oylamayı şimdi bitirmek istiyor musun?")) {
                socket.emit('force_end_voting', { roomCode });
            }
        });
    }

    // 6. Player Actions (Submit Link)
    const btnSubmitLink = document.getElementById('btn-submit-link');
    const inputLink = document.getElementById('input-link');
    const inputDesc = document.getElementById('input-desc');

    if (btnSubmitLink) {
        btnSubmitLink.addEventListener('click', () => {
            const link = inputLink ? inputLink.value.trim() : '';
            const desc = inputDesc ? inputDesc.value.trim() : '';
            const submissionStatus = document.getElementById('submission-status');

            if (link) {
                socket.emit('submit_link', { roomCode, link, description: desc || 'Açıklama yok' });
                if (submissionStatus) submissionStatus.innerHTML = "<span style='color:#10b981'>✅ Gönderildi! Oylama bekleniyor...</span>";

                if (inputLink) inputLink.disabled = true;
                if (inputDesc) inputDesc.disabled = true;
                btnSubmitLink.disabled = true;
                btnSubmitLink.classList.add('opacity-50', 'cursor-not-allowed');
                btnSubmitLink.innerText = "Gönderildi";
            } else {
                alert("Lütfen en azından bir link girin.");
            }
        });
    }
}

// Check if DOM is already ready (e.g., if script is deferred or loaded late)
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initApp();
} else {
    window.addEventListener('DOMContentLoaded', initApp);
}


// --- Socket Events ---
socket.on('taken_avatars_update', (takenIds) => {
    console.log('Taken avatars:', takenIds);
    document.querySelectorAll('.character-card').forEach((card, index) => {
        // availableAvatars is [1..88], so index matches if sorted. 
        // But better to use image src/alt to be sure? 
        // Since we generated it with 1..88 in order, index+1 is safe.
        const avatarId = index + 1;

        if (takenIds.includes(avatarId)) {
            card.classList.add('taken');
            // Check if my selected avatar is now taken
            if (myAvatar === avatarId) {
                myAvatar = null;
                card.classList.remove('selected');
                const display = document.getElementById('selected-character-display');
                if (display) display.classList.add('hidden');
                checkJoinButton();
                showToast('⚠️ Seçtiğin karakter bu odada dolu!', 'warning');
            }
        } else {
            card.classList.remove('taken');
        }
    });
});

socket.on('room_created', (data) => {
    roomCode = data.roomCode;
});

socket.on('joined', (user) => {
    roomCode = user.roomCode;
    myId = socket.id;
    isHost = user.isHost;

    const displayRoomCode = document.getElementById('display-room-code');
    if (displayRoomCode) displayRoomCode.innerText = roomCode;

    const qrContainer = document.getElementById('qrcode');
    if (qrContainer) {
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, {
            text: `${window.location.origin}/?room=${roomCode}`,
            width: 100,
            height: 100
        });
    }

    const myProfileSidebar = document.getElementById('my-profile-sidebar');
    if (myProfileSidebar) {
        myProfileSidebar.innerHTML = `
            <img src="${getAvatarUrl(user.avatar)}" class="w-10 h-10 rounded-full bg-black border-2 border-slate-500">
            <div class="text-left">
                <div class="font-bold text-sm text-purple-400">${user.nickname}</div>
                <div class="text-xs text-slate-400">${isHost ? '👑 Oda Sahibi' : 'Oyuncu'}</div>
            </div>
        `;
    }

    const hostControls = document.getElementById('host-controls');
    const playerSubmission = document.getElementById('player-submission-form');
    const adminWait = document.getElementById('admin-wait-msg');

    if (isHost) {
        if (hostControls) hostControls.classList.remove('hidden');
        if (playerSubmission) playerSubmission.classList.add('hidden');
        if (adminWait) adminWait.classList.remove('hidden');
    } else {
        if (hostControls) hostControls.classList.add('hidden');
        if (playerSubmission) playerSubmission.classList.remove('hidden');
        if (adminWait) adminWait.classList.add('hidden');
    }

    showScreen('lobby');
});

socket.on('update_players', (players) => {
    const playerCountBadge = document.getElementById('player-count-badge');
    if (playerCountBadge) playerCountBadge.innerText = `${players.length} Kişi`;

    const statPlayerCount = document.getElementById('stat-player-count');
    if (statPlayerCount) {
        statPlayerCount.innerText = players.length;
        statPlayerCount.classList.add('animate-pulse');
        setTimeout(() => statPlayerCount.classList.remove('animate-pulse'), 1000);
    }

    const submissionCount = players.filter(p => p.link && p.id !== socket.id).length;
    const statSubmissionCount = document.getElementById('stat-submission-count');
    if (statSubmissionCount) {
        statSubmissionCount.innerText = submissionCount;
    }

    const playersList = document.getElementById('players-list');
    if (playersList) {
        playersList.innerHTML = '';
        players.forEach(p => {
            if (p.id === myId) return;

            const div = document.createElement('div');
            div.className = 'flex items-center gap-3 bg-slate-800 p-3 rounded-lg border border-slate-700/50';

            let statusBadge = '<span class="text-xs text-slate-500">Bekleniyor...</span>';
            if (p.link && !p.hasVoted) statusBadge = '<span class="text-xs text-green-400 font-bold">✅ Hazır (Link)</span>';
            if (p.hasVoted) statusBadge = '<span class="text-xs text-green-400 font-bold drop-shadow">🗳️ Oy Verdi</span>';

            div.innerHTML = `
                <img src="${getAvatarUrl(p.avatar)}" class="w-8 h-8 rounded-full bg-black">
                <div class="flex flex-col items-start">
                    <span class="text-sm font-bold text-slate-200">${p.nickname}</span>
                    ${statusBadge}
                </div>
            `;
            playersList.appendChild(div);
        });
    }
});

socket.on('voting_started', ({ submissions, duration }) => {
    showScreen('voting');
    const timerDisplay = document.getElementById('timer-display');
    if (timerDisplay) timerDisplay.innerText = duration;

    const cardsGrid = document.getElementById('cards-grid');
    if (cardsGrid) {
        cardsGrid.innerHTML = '';
        const shuffled = submissions.sort(() => 0.5 - Math.random());

        shuffled.forEach(sub => {
            const card = document.createElement('div');
            card.className = 'voting-card glass-card p-6 cursor-pointer hover:border-purple-400 transition relative overflow-hidden group';

            card.onclick = () => {
                if (sub.id === myId) {
                    alert("Kendine oy veremezsin! 😅");
                    return;
                }
                document.querySelectorAll('#cards-grid > div').forEach(c => {
                    c.classList.remove('ring-4', 'ring-purple-500', 'bg-white/10');
                });
                card.classList.add('ring-4', 'ring-purple-500', 'bg-white/10');
                socket.emit('vote', { roomCode, targetId: sub.id });
            };

            let displayLink = sub.link;
            try { displayLink = new URL(sub.link).hostname; } catch (e) { }

            card.innerHTML = `
                <div class="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition text-2xl">🗳️</div>
                <h3 class="font-bold text-lg mb-2 text-white drop-shadow-md">${sub.description || 'Açıklama yok'}</h3>
                <a href="${sub.link}" target="_blank" onclick="event.stopPropagation()" class="text-secondary hover:text-white transition text-sm break-all font-mono">🔗 ${displayLink}</a>
                <p class="text-xs text-slate-300 mt-4 opacity-50 group-hover:opacity-100 transition">Oy vermek için tıkla</p>
            `;
            cardsGrid.appendChild(card);
        });
    }
});

socket.on('vote_confirmed', () => {
    console.log("Oy kaydedildi");
    showToast('✅ Oyunuz kaydedildi!', 'success');
    createConfetti();
});

socket.on('timer_update', (time) => {
    const timerDisplay = document.getElementById('timer-display');
    if (timerDisplay) {
        timerDisplay.innerText = time;
        if (time <= 10) timerDisplay.classList.add('text-red-500');
    }
});

socket.on('game_ended', (results) => {
    showScreen('results');
    const leaderboard = document.getElementById('leaderboard');
    if (leaderboard) {
        leaderboard.innerHTML = '';
        results.forEach((p, index) => {
            const item = document.createElement('div');
            item.className = 'w-full glass-card p-4 flex items-center gap-4 hover:bg-white/5 transition';

            let rankEmoji = `#${index + 1}`;
            if (index === 0) {
                rankEmoji = '🥇';
                item.classList.add('bg-yellow-500/10', 'border-yellow-400');
            } else if (index === 1) {
                rankEmoji = '🥈';
                item.classList.add('bg-slate-500/10', 'border-slate-400');
            } else if (index === 2) {
                rankEmoji = '🥉';
                item.classList.add('bg-orange-600/10', 'border-orange-600');
            }

            item.innerHTML = `
                <div class="text-3xl font-bold w-12 text-center drop-shadow-md">${rankEmoji}</div>
                <img src="${getAvatarUrl(p.avatar)}" class="w-14 h-14 rounded-full border-2 border-white/20 shadow-lg">
                <div class="flex-grow text-left">
                    <h3 class="font-bold text-xl m-0 leading-tight text-white">${p.nickname}</h3>
                    <small class="text-slate-300 text-xs font-mono">${p.description || '...'}</small>
                </div>
                <div class="font-bold text-2xl text-secondary whitespace-nowrap drop-shadow-neon">${p.votes} Oy</div>
            `;
            leaderboard.appendChild(item);
        });
    }
});

socket.on('error', (msg) => {
    showToast('❌ ' + msg, 'error');
});
