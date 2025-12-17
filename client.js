console.log("Client V3 Loaded 🚀"); // Debug Log
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
            link: null,
            description: null,
            ratings: {},
            votingComplete: false
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
        if (e.code === 'permission-denied' || e.message.includes('permission')) {
            alert("❌ Firebase Güvenlik Kuralları Hatası!\n\nFirebase Firestore güvenlik kurallarını güncellemeniz gerekiyor.\n\nLütfen Firebase Console'dan Firestore Database → Rules bölümüne gidin ve güvenlik kurallarını güncelleyin.");
        } else {
            alert("Oda oluşturulamadı: " + e.message);
        }
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
            link: null,
            description: null,
            ratings: {},
            votingComplete: false
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
        playersList.innerHTML = room.players.map(p => {
            const votingCompleteClass = (room.status === 'voting' && p.votingComplete) ? 'border-green-500 border-2' : 'border-white/5';
            const votingIndicator = (room.status === 'voting' && p.votingComplete) ? '<span class="ml-auto text-green-400">✅</span>' : '';

            return `
                <div class="flex items-center gap-2 p-2 rounded-lg bg-white/5 border ${votingCompleteClass} transition-all duration-300">
                    <img src="assets/${p.avatar}.png" class="w-8 h-8 rounded-full">
                    <span class="text-sm text-slate-300">${p.nickname}</span>
                    ${p.isHost ? '<span class="ml-auto text-xs">👑</span>' : votingIndicator}
                </div>
            `;
        }).join('');
    }

    // 2. Screen Switching based on Status
    if (room.status === 'lobby') {
        showScreen(submissionScreen);

        // Host Controls
        if (amIHost) {
            hostControls.classList.remove('hidden');
            // Admin should NOT see submission form
            document.getElementById('player-submission-form').classList.add('hidden');
            adminWaitMsg.classList.add('hidden');
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

        // Check if all non-host players completed voting
        const voters = room.players.filter(p => !p.isHost);
        const allComplete = voters.every(p => p.votingComplete);

        if (allComplete && voters.length > 0) {
            // All players finished voting - auto end
            if (amIHost) {
                console.log("✅ All players completed voting, auto-ending...");
                setTimeout(() => endVoting(), 2000);
            }
        }

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
    // Admin cannot submit links
    if (amIHost) {
        alert("⚠️ Yönetici link gönderemez!\n\nSadece oyuncular link gönderebilir.");
        return;
    }

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



// Local state for ratings
let myRatings = {};

function renderVotingCards(room) {
    cardsGrid.innerHTML = '';
    const candidates = room.players.filter(p => !p.isHost && p.link && p.id !== mySessionId);

    if (candidates.length === 0) {
        cardsGrid.innerHTML = '<div class="text-center text-slate-400 p-10">Henüz link gönderen oyuncu yok.</div>';
        return;
    }

    // Get my current ratings from database
    const me = room.players.find(p => p.id === mySessionId);
    if (me && me.ratings) {
        myRatings = { ...me.ratings };
    }

    candidates.forEach(p => {
        const currentRating = myRatings[p.id] || 5;
        const div = document.createElement('div');
        div.className = 'voting-card glass-card p-4 rounded-xl relative group hover:scale-105 transition duration-300';
        div.innerHTML = `
            <div class="h-40 bg-black/50 rounded-lg mb-3 overflow-hidden flex items-center justify-center relative">
                 <iframe src="${p.link}" class="w-full h-full pointer-events-none opacity-50 group-hover:opacity-100 transition"></iframe>
                 <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span class="text-xs text-slate-400 bg-black/60 px-2 py-1 rounded">Önizleme</span>
                 </div>
            </div>
            <div class="mb-3">
                 <h4 class="font-bold text-white truncate">${p.nickname}</h4>
                 <p class="text-xs text-slate-400 line-clamp-2">${p.description || 'Açıklama yok'}</p>
                 <a href="${p.link}" target="_blank" class="text-[10px] text-blue-400 hover:underline block mt-1 truncate">${p.link}</a>
            </div>
            <div class="rating-container bg-black/30 p-3 rounded-lg border border-white/10">
                <div class="flex justify-between items-center mb-2">
                    <label class="text-xs font-bold text-slate-300 uppercase">Puan</label>
                    <span class="rating-display text-2xl font-bold text-secondary">${currentRating}</span>
                </div>
                <input type="range" min="1" max="10" value="${currentRating}" 
                       class="rating-slider w-full accent-purple-500" 
                       data-player-id="${p.id}">
                <div class="flex justify-between text-[10px] text-slate-500 mt-1">
                    <span>1</span>
                    <span>10</span>
                </div>
            </div>
        `;
        cardsGrid.appendChild(div);
    });

    // Add slider listeners
    document.querySelectorAll('.rating-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const playerId = e.target.getAttribute('data-player-id');
            const value = parseInt(e.target.value);
            myRatings[playerId] = value;

            // Update display
            const display = e.target.closest('.voting-card').querySelector('.rating-display');
            display.textContent = value;

            updateRatingProgress(candidates.length);
        });
    });

    // Add submit button if not admin
    if (!amIHost) {
        const submitDiv = document.createElement('div');
        submitDiv.className = 'col-span-full mt-4';
        submitDiv.innerHTML = `
            <div class="glass-card p-6 text-center">
                <p class="text-sm text-slate-300 mb-3">
                    <span id="rated-count">${Object.keys(myRatings).length}</span> / 
                    <span id="total-count">${candidates.length}</span> kişi puanlandı
                </p>
                <button id="btn-submit-ratings" 
                        class="btn-neon py-3 px-8 rounded-xl text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        ${Object.keys(myRatings).length < candidates.length ? 'disabled' : ''}>
                    Puanları Gönder ✅
                </button>
            </div>
        `;
        cardsGrid.appendChild(submitDiv);

        // Add submit listener
        document.getElementById('btn-submit-ratings').addEventListener('click', submitRatings);
    }

    updateRatingProgress(candidates.length);
}

function updateRatingProgress(totalCandidates) {
    const ratedCount = document.getElementById('rated-count');
    const btn = document.getElementById('btn-submit-ratings');

    if (ratedCount) {
        ratedCount.textContent = Object.keys(myRatings).length;
    }

    if (btn) {
        btn.disabled = Object.keys(myRatings).length < totalCandidates;
    }
}

async function submitRatings() {
    try {
        // Admin check
        if (amIHost) {
            alert("⚠️ Yönetici puan veremez!");
            return;
        }

        const roomRef = doc(db, "rooms", myRoomCode);
        const roomSnap = await getDoc(roomRef);
        const players = roomSnap.data().players;

        // Validate all ratings are set
        const candidates = players.filter(p => !p.isHost && p.link && p.id !== mySessionId);
        if (Object.keys(myRatings).length < candidates.length) {
            alert("Lütfen tüm katılımcıları puanlayın!");
            return;
        }

        // Update player with ratings
        const updatedPlayers = players.map(p => {
            if (p.id === mySessionId) {
                return {
                    ...p,
                    ratings: myRatings,
                    votingComplete: true
                };
            }
            return p;
        });

        await updateDoc(roomRef, { players: updatedPlayers });

        // Visual feedback
        alert("✅ Puanlar gönderildi! Diğer oyuncular bekleniyor...");

    } catch (e) {
        console.error("Rating submission error:", e);
        alert("Hata: " + e.message);
    }
}

function renderResults(room) {
    const candidates = room.players.filter(p => !p.isHost && p.link);

    // Calculate total points for each candidate
    const results = candidates.map(candidate => {
        let totalPoints = 0;

        // Sum all ratings received from other players
        room.players.forEach(player => {
            if (player.ratings && player.ratings[candidate.id]) {
                totalPoints += player.ratings[candidate.id];
            }
        });

        return {
            ...candidate,
            totalPoints
        };
    });

    // Sort by total points (highest first)
    results.sort((a, b) => b.totalPoints - a.totalPoints);

    // Clear leaderboard
    leaderboard.innerHTML = '';

    if (results.length === 0) {
        leaderboard.innerHTML = '<div class="text-center text-slate-400 p-10">Hiç yarışmacı yok.</div>';
        return;
    }

    // Top 3 Podium
    const top3 = results.slice(0, 3);
    if (top3.length > 0) {
        const podiumDiv = document.createElement('div');
        podiumDiv.className = 'podium-container mb-8';

        // Podium order: 2nd, 1st, 3rd (left, center, right)
        const podiumOrder = top3.length >= 2 ? [top3[1], top3[0], top3[2]].filter(Boolean) : [top3[0]];
        const podiumHeights = ['h-48', 'h-64', 'h-40']; // 2nd, 1st, 3rd heights
        const podiumColors = ['from-slate-400 to-slate-500', 'from-yellow-400 to-yellow-500', 'from-orange-400 to-orange-500'];
        const badgeColors = ['bg-slate-400', 'bg-yellow-400', 'bg-orange-400'];
        const ranks = top3.length >= 2 ? [2, 1, 3] : [1];

        podiumDiv.innerHTML = `
            <div class="flex items-end justify-center gap-4 mb-2">
                ${podiumOrder.map((player, idx) => {
            if (!player) return '';
            const actualRank = ranks[idx];
            const rankIdx = actualRank === 1 ? 0 : actualRank === 2 ? 0 : 1;

            return `
                        <div class="podium-stand flex flex-col items-center" style="flex: 0 0 auto;">
                            <div class="mb-2 relative">
                                <img src="assets/${player.avatar}.png" 
                                     class="w-20 h-20 md:w-24 md:h-24 rounded-full border-4 ${actualRank === 1 ? 'border-yellow-400' : actualRank === 2 ? 'border-slate-400' : 'border-orange-400'} shadow-lg transform hover:scale-110 transition">
                                <div class="absolute -top-2 -right-2 ${badgeColors[actualRank === 1 ? 1 : actualRank === 2 ? 0 : 2]} text-white font-bold w-10 h-10 rounded-full flex items-center justify-center text-xl shadow-lg">
                                    ${actualRank}
                                </div>
                            </div>
                            <div class="text-center mb-2">
                                <div class="font-bold text-white text-sm md:text-base">${player.nickname}</div>
                                <div class="text-xs md:text-sm ${actualRank === 1 ? 'text-yellow-400' : actualRank === 2 ? 'text-slate-300' : 'text-orange-400'} font-bold">
                                    ${player.totalPoints} puan
                                </div>
                            </div>
                            <div class="${podiumHeights[idx]} w-24 md:w-32 bg-gradient-to-b ${podiumColors[actualRank === 1 ? 1 : actualRank === 2 ? 0 : 2]} rounded-t-xl shadow-lg flex items-center justify-center">
                                <span class="text-white text-4xl md:text-6xl font-bold opacity-30">${actualRank}</span>
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
        leaderboard.appendChild(podiumDiv);
    }

    // Remaining players (4th and below)
    const remaining = results.slice(3);
    if (remaining.length > 0) {
        const remainingDiv = document.createElement('div');
        remainingDiv.className = 'remaining-players';
        remainingDiv.innerHTML = `
            <h3 class="text-xl font-bold text-slate-300 mb-4 text-center">Diğer Yarışmacılar</h3>
            <div class="space-y-2 max-h-64 overflow-y-auto pr-2 scrollbar-custom">
                ${remaining.map((p, idx) => `
                    <div class="flex items-center gap-4 p-3 glass-card rounded-lg border border-white/10 hover:border-white/20 transition">
                        <div class="text-lg font-bold text-slate-400 w-8 text-center">#${idx + 4}</div>
                        <img src="assets/${p.avatar}.png" class="w-10 h-10 rounded-full border border-white/20">
                        <div class="flex-1">
                            <div class="font-bold text-white text-sm">${p.nickname}</div>
                            <div class="text-xs text-slate-400">${p.totalPoints} puan</div>
                        </div>
                        <a href="${p.link}" target="_blank" class="text-xl hover:scale-125 transition">🔗</a>
                    </div>
                `).join('')}
            </div>
        `;
        leaderboard.appendChild(remainingDiv);
    }
}


// --- Character Selection (Client Only) ---
function renderCharacterGrid() {
    console.log("🎭 Rendering character grid...");
    characterGrid.innerHTML = '';
    for (let i = 1; i <= 50; i++) {
        const div = document.createElement('div');
        div.className = 'w-10 h-10 rounded-full cursor-pointer hover:scale-110 transition border-2 border-transparent hover:border-white overflow-hidden';
        div.innerHTML = `<img src="assets/${i}.png" class="w-full h-full object-cover" onerror="console.error('Failed to load avatar:', ${i})">`;
        div.onclick = () => selectCharacter(i);
        characterGrid.appendChild(div);
    }
    console.log("✅ Character grid rendered (50 avatars)");
}

function selectCharacter(id) {
    myAvatarId = id;
    selectedAvatarImg.src = `assets/${id}.png`;
    selectedCharName.textContent = `Avatar #${id}`;
    selectedCharDisplay.classList.remove('hidden');
    btnJoinRoom.disabled = false;
    btnJoinRoom.classList.remove('opacity-50', 'cursor-not-allowed');
}

function selectRandomCharacter() {
    const r = Math.floor(Math.random() * 50) + 1;
    selectCharacter(r);
}
