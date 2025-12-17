const socket = io({
    transports: ['polling', 'websocket'],
    reconnectionAttempts: 5,
    timeout: 10000
});

// --- Global State ---
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
            if (u === 'berkay-34ist@hotmail.com' && p === '1234') {
                socket.emit('create_room', { playerName: 'Yönetici' });
            } else {
                alert("Hatalı kullanıcı adı veya şifre!");
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
