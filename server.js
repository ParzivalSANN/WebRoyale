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

// Game State (Now using MongoDB)
const Room = require('./models/Room');

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/webroyale"; // Fallback for local dev
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

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
    } catch (err) {
        console.error("Error reading assets for pool:", err);
    }
    if (pool.length === 0) {
        for (let i = 1; i <= 50; i++) pool.push(i);
    }
    return shuffle(pool);
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Check Taken Avatars
    socket.on('check_taken_avatars', async (roomCode) => {
        try {
            const room = await Room.findOne({ roomCode });
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

            // Delete old rooms if any exist with this code (rare collision)
            await Room.deleteOne({ roomCode });

            const newRoom = new Room({
                roomCode,
                hostId: socket.id,
                status: 'lobby',
                availableAvatars: avatarPool,
                players: [{
                    id: socket.id,
                    nickname: playerName || 'Host',
                    avatar: avatar,
                    isHost: true
                }]
            });

            await newRoom.save();

            socket.join(roomCode);
            socket.emit('room_created', { roomCode });
            socket.emit('joined', {
                ...newRoom.players[0].toObject(),
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
            const room = await Room.findOne({ roomCode });

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
                    isHost: socket.id === room.hostId
                };

                room.players.push(newPlayer);
                await room.save();

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
        } catch (err) {
            console.error("Join Room Error:", err);
        }
    });

    socket.on('submit_link', async ({ roomCode, link, description }) => {
        try {
            const room = await Room.findOne({ roomCode });
            if (room) {
                const playerIdx = room.players.findIndex(p => p.id === socket.id);
                if (playerIdx > -1 && !room.players[playerIdx].isHost) {
                    room.players[playerIdx].link = link;
                    room.players[playerIdx].description = description;
                    await room.save();
                    io.to(roomCode).emit('update_players', room.players);
                }
            }
        } catch (err) { console.error(err); }
    });

    socket.on('start_voting', async ({ roomCode, duration }) => {
        try {
            const room = await Room.findOne({ roomCode });
            // Strict check: Only Host can start
            // Note: socket.id check against DB hostId might fail on reconnect if not updated.
            // For now, assume id persists or we trust the session for this simple game.
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
                await room.save();

                io.to(roomCode).emit('voting_started', { submissions, duration: room.timeRemaining });

                // Timer Logic (Server-side interval, but state saved occasionally?)
                // Since Vercel might freeze, we rely on client timers mostly, but force end eventually.
                // We'll run a simple interval here. If instance dies, timer dies (Limitation).
                let interval = setInterval(async () => {
                    room.timeRemaining--;
                    // Optimization: Do NOT save every second to DB (too slow).
                    // Just emit.
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
            const room = await Room.findOne({ roomCode });
            if (room && room.status === 'voting') {
                const voter = room.players.find(p => p.id === socket.id);
                const target = room.players.find(p => p.id === targetId);

                if (voter && !voter.hasVoted && target && target.id !== socket.id) {
                    target.votesReceived = (target.votesReceived || 0) + 1;
                    voter.hasVoted = true;
                    // Mongoose array subdoc update
                    await room.save();
                    socket.emit('vote_confirmed');
                }
            }
        } catch (err) { console.error(err); }
    });

    socket.on('force_end_voting', async ({ roomCode }) => {
        await endGame(roomCode);
    });

    async function endGame(roomCode) {
        try {
            const room = await Room.findOne({ roomCode });
            if (!room) return;

            room.status = 'results';
            await room.save();

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
        console.log('User disconnected:', socket.id);
        // Optional: Remove player from DB? 
        // For persistence/reconnect, we might WANT to keep them.
        // But for now, if they leave lobby, we free avatar.
        try {
            // Find room where this socket is a player
            const room = await Room.findOne({ "players.id": socket.id });
            if (room) {
                // If in lobby, remove them logic
                if (room.status === 'lobby') {
                    const player = room.players.find(p => p.id === socket.id);
                    if (player) {
                        room.availableAvatars.push(player.avatar);
                        room.players = room.players.filter(p => p.id !== socket.id);
                        await room.save();
                        io.to(room.roomCode).emit('update_players', room.players);
                    }
                    if (room.players.length === 0) {
                        await Room.deleteOne({ _id: room._id });
                    }
                }
            }
        } catch (e) { console.error(e); }
    });
});

const PORT = process.env.PORT || 3000;

// Start Server
checkAvatarsExist();
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
