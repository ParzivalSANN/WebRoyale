const express = require('express');
require('dotenv').config();
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for Vercel
        methods: ["GET", "POST"]
    },
    transports: ['polling', 'websocket']
});
const path = require('path');
const fs = require('fs');
const axios = require('axios');

app.use(express.static(path.join(__dirname, 'public')));

// Game State (Firebase Firestore)
const admin = require('firebase-admin');

// Firebase Initialization
// Expects env variables: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
try {
    const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    };

    if (!serviceAccount.privateKey) {
        console.warn("⚠️ Firebase credentials not found in env. Falling back to memory (Data will be lost on restart).");
    } else {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("✅ Firebase Admin Initialized");
    }
} catch (e) {
    console.error("❌ Firebase Init Error:", e);
}

const db = admin.apps.length ? admin.firestore() : null;

// --- AI Avatar Check ---
const ASSETS_DIR = path.join(__dirname, 'public/assets');

function checkAvatarsExist() {
    if (!fs.existsSync(ASSETS_DIR)) {
        fs.mkdirSync(ASSETS_DIR, { recursive: true });
        console.log("⚠️ Assets directory created. Please ensure avatars exist.");
    } else {
        console.log("✅ Assets directory found.");
    }
}

// Helper: Generate Room Code
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

// Helper: Shuffle Array
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Helper: Get Initial Avatar Pool
function getAvatarPool() {
    const pool = [];
    try {
        if (fs.existsSync(ASSETS_DIR)) {
            const files = fs.readdirSync(ASSETS_DIR);
            files.forEach(file => {
                const match = file.match(/^(\d+)\.png$/);
                if (match) {
                    pool.push(parseInt(match[1], 10));
                }
            });
        }
    } catch (err) { }
    if (pool.length === 0) {
        for (let i = 1; i <= 50; i++) pool.push(i);
    }
    return shuffle(pool);
}

// --- DB Helpers ---
async function getRoom(roomCode) {
    if (!db) return global.rooms ? global.rooms[roomCode] : null; // Fallback
    const doc = await db.collection('rooms').doc(roomCode).get();
    if (!doc.exists) return null;
    return doc.data();
}

async function saveRoom(room, roomCode) {
    if (!db) {
        if (!global.rooms) global.rooms = {};
        global.rooms[roomCode] = room;
        return;
    }
    // Firestore stores objects, avoid undefined
    await db.collection('rooms').doc(roomCode).set(JSON.parse(JSON.stringify(room)));
}

async function deleteRoom(roomCode) {
    if (!db) {
        if (global.rooms) delete global.rooms[roomCode];
        return;
    }
    await db.collection('rooms').doc(roomCode).delete();
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Check Taken Avatars
    socket.on('check_taken_avatars', async (roomCode) => {
        try {
            const room = await getRoom(roomCode);
            if (room) {
                const taken = room.players.map(p => p.avatar);
                socket.emit('taken_avatars_update', taken);
            } else {
                socket.emit('taken_avatars_update', []);
            }
        } catch (e) { console.error(e); }
    });

    // Create Room (Moderator)
    socket.on('create_room', async ({ playerName }) => {
        try {
            const roomCode = generateRoomCode();
            const avatarPool = getAvatarPool();
            const avatar = avatarPool.shift();

            // Delete old rooms if any exist (cleanup logic mostly serverside)
            await deleteRoom(roomCode);

            const newRoom = {
                roomCode,
                hostId: socket.id,
                status: 'lobby',
                availableAvatars: avatarPool, // Store array in Firestore
                players: [{
                    id: socket.id,
                    nickname: playerName || 'Host',
                    avatar: avatar,
                    isHost: true,
                    votesReceived: 0,
                    hasVoted: false,
                    link: null,
                    description: null
                }],
                timeRemaining: 0,
                createdAt: admin.firestore.FieldValue.serverTimestamp() // TTL if enabled in Firestore
            };

            await saveRoom(newRoom, roomCode);

            socket.join(roomCode);
            socket.emit('room_created', { roomCode });
            socket.emit('joined', {
                ...newRoom.players[0],
                roomCode,
                isHost: true
            });
            io.to(roomCode).emit('update_players', newRoom.players);
        } catch (err) {
            console.error("Create Room Error:", err);
            socket.emit('error', 'Oda oluşturulurken hata oluştu.');
        }
    });

    // Join Room (Player)
    socket.on('join_room', async ({ roomCode, playerName, avatar: requestedAvatar }) => {
        try {
            const room = await getRoom(roomCode);

            if (room && room.status === 'lobby') {
                let avatar = parseInt(requestedAvatar);

                if (avatar && room.availableAvatars.includes(avatar)) {
                    room.availableAvatars = room.availableAvatars.filter(a => a !== avatar);
                } else {
                    socket.emit('error', 'Bu karakter alınmış veya geçersiz!');
                    return;
                }

                const newPlayer = {
                    id: socket.id,
                    nickname: playerName || `Player ${socket.id.substr(0, 4)}`,
                    avatar: avatar,
                    isHost: socket.id === room.hostId, // Note: This checks against INITIAL host only
                    votesReceived: 0,
                    hasVoted: false,
                    link: null,
                    description: null
                };

                room.players.push(newPlayer);
                await saveRoom(room, roomCode);

                socket.join(roomCode);
                socket.emit('joined', {
                    ...newPlayer,
                    roomCode,
                    isHost: newPlayer.isHost
                });
                io.to(roomCode).emit('update_players', room.players);
            } else {
                socket.emit('error', 'Oda bulunamadı veya oyun başladı!');
            }
        } catch (err) { console.error("Join Room Error:", err); }
    });

    socket.on('submit_link', async ({ roomCode, link, description }) => {
        try {
            const room = await getRoom(roomCode);
            if (room) {
                const playerIdx = room.players.findIndex(p => p.id === socket.id);
                // Note: With Firebase, we must find by ID or similar token. 
                // Socket ID changes on reconnect!
                // For this quick port, assuming stable session or no refresh.
                if (playerIdx > -1 && !room.players[playerIdx].isHost) {
                    room.players[playerIdx].link = link;
                    room.players[playerIdx].description = description;
                    await saveRoom(room, roomCode);
                    io.to(roomCode).emit('update_players', room.players);
                }
            }
        } catch (err) { console.error(err); }
    });

    socket.on('start_voting', async ({ roomCode, duration }) => {
        try {
            const room = await getRoom(roomCode);
            // Weak security: relying on socket id match for host
            if (room && room.hostId === socket.id) {

                const submissions = room.players
                    .filter(p => p.link && !p.isHost)
                    .map(p => ({
                        id: p.id,
                        link: p.link,
                        description: p.description
                    }));

                if (submissions.length < 2) {
                    socket.emit('error', `Yeterli katılım yok! (En az 2 link gerekli)`);
                    return;
                }

                room.status = 'voting';
                room.timeRemaining = parseInt(duration) || 60;
                await saveRoom(room, roomCode);

                io.to(roomCode).emit('voting_started', { submissions, duration: room.timeRemaining });

                // Timer Logic
                let interval = setInterval(async () => {
                    room.timeRemaining--;
                    io.to(roomCode).emit('timer_update', room.timeRemaining);

                    if (room.timeRemaining <= 0) {
                        clearInterval(interval);
                        await endGame(roomCode);
                    }
                }, 1000);
            }
        } catch (err) { console.error(err); }
    });

    socket.on('vote', async ({ roomCode, targetId }) => {
        try {
            const room = await getRoom(roomCode);
            if (room && room.status === 'voting') {
                const voterIdx = room.players.findIndex(p => p.id === socket.id);
                const targetIdx = room.players.findIndex(p => p.id === targetId);

                if (voterIdx > -1 && targetIdx > -1) {
                    const voter = room.players[voterIdx];
                    const target = room.players[targetIdx];

                    if (!voter.hasVoted && target.id !== socket.id) {
                        target.votesReceived = (target.votesReceived || 0) + 1;
                        voter.hasVoted = true;

                        // Update in array
                        room.players[targetIdx] = target;
                        room.players[voterIdx] = voter;

                        await saveRoom(room, roomCode);
                        socket.emit('vote_confirmed');
                    }
                }
            }
        } catch (err) { console.error(err); }
    });

    socket.on('force_end_voting', async ({ roomCode }) => {
        await endGame(roomCode);
    });

    async function endGame(roomCode) {
        try {
            const room = await getRoom(roomCode);
            if (!room) return;

            room.status = 'results';
            await saveRoom(room, roomCode);

            const results = room.players
                .filter(p => !p.isHost && p.link)
                .sort((a, b) => b.votesReceived - a.votesReceived)
                .map(p => ({
                    nickname: p.nickname,
                    avatar: p.avatar,
                    votes: p.votesReceived,
                    link: p.link,
                    description: p.description
                }));

            io.to(roomCode).emit('game_ended', results);
        } catch (e) { console.error(e); }
    }

    socket.on('disconnect', async () => {
        // Optional: Remove from DB? Usually keep for reconnect.
        // For now, doing nothing to allow 'refresh' to potentially find data if we used session tokens.
        // But since we key by socket.id, refresh = new user. 
        // Logic remains similar to before: if host leaves, maybe clean up?
        // Let's just leave data for now.
        console.log("Disconnected:", socket.id);
    });
});


const PORT = process.env.PORT || 3000;

// Start Server
checkAvatarsExist();
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
