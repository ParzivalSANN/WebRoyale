const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');
const fs = require('fs');
const axios = require('axios');

app.use(express.static(path.join(__dirname, 'public')));

// Game State
const rooms = {};

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

// Helper: Shuffle Array (Fisher-Yates)
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Helper: Get Initial Avatar Pool (Dynamic from Assets)
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

    // Fallback if empty
    if (pool.length === 0) {
        console.log("⚠️ No avatars found! Using numbered fallback.");
        for (let i = 1; i <= 50; i++) pool.push(i);
    }

    return shuffle(pool);
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Check Taken Avatars
    socket.on('check_taken_avatars', (roomCode) => {
        const room = rooms[roomCode];
        if (room) {
            const taken = Object.values(room.players).map(p => p.avatar);
            socket.emit('taken_avatars_update', taken);
        } else {
            socket.emit('taken_avatars_update', []);
        }
    });

    // Create Room (Moderator)
    socket.on('create_room', ({ playerName }) => {
        const roomCode = generateRoomCode();
        const avatarPool = getAvatarPool();
        const avatar = avatarPool.shift(); // Host gets first avatar

        rooms[roomCode] = {
            hostId: socket.id,
            players: {}, // id -> player_object
            status: 'lobby', // lobby, voting, results
            availableAvatars: avatarPool,
            timer: null,
            timeRemaining: 0
        };

        rooms[roomCode].players[socket.id] = {
            id: socket.id,
            nickname: playerName || 'Host',
            avatar: avatar,
            link: null,
            description: null,
            votesReceived: 0,
            hasVoted: false
        };

        socket.join(roomCode);
        socket.emit('room_created', { roomCode });
        socket.emit('joined', {
            ...rooms[roomCode].players[socket.id],
            roomCode,
            isHost: true
        });
        io.to(roomCode).emit('update_players', Object.values(rooms[roomCode].players));
    });

    // Join Room (Player)
    socket.on('join_room', ({ roomCode, playerName, avatar: requestedAvatar }) => {
        const room = rooms[roomCode];
        if (room && room.status === 'lobby') {

            // Assign unique avatar (Strict Check)
            let avatar = parseInt(requestedAvatar);

            if (avatar && room.availableAvatars.includes(avatar)) {
                // Avatar is available
                const index = room.availableAvatars.indexOf(avatar);
                if (index > -1) room.availableAvatars.splice(index, 1);
            } else {
                // Avatar is taken or invalid -> REJECT
                socket.emit('error', 'Bu karakter bu odada zaten alınmış! 😢\nLütfen başka bir karakter seç.');
                return;
            }

            room.players[socket.id] = {
                id: socket.id,
                nickname: playerName || `Player ${socket.id.substr(0, 4)}`,
                avatar: avatar,
                link: null,
                description: null,
                votesReceived: 0,
                hasVoted: false
            };

            socket.join(roomCode);
            socket.emit('joined', {
                ...room.players[socket.id],
                roomCode,
                isHost: socket.id === room.hostId
            });
            io.to(roomCode).emit('update_players', Object.values(room.players));
        } else {
            socket.emit('error', 'Oda bulunamadı veya oyun başladı!');
        }
    });

    socket.on('submit_link', ({ roomCode, link, description }) => {
        const room = rooms[roomCode];
        // Host cannot submit logic
        if (room && room.players[socket.id] && socket.id !== room.hostId) {
            room.players[socket.id].link = link;
            room.players[socket.id].description = description;

            // Notify lobby that a player submitted (optional visual update)
            io.to(roomCode).emit('update_players', Object.values(room.players));
        }
    });

    socket.on('start_voting', ({ roomCode, duration }) => {
        const room = rooms[roomCode];
        if (room && socket.id === room.hostId) {

            // Collect submissions (Exclude Host) and check Count
            const submissions = Object.values(room.players)
                .filter(p => p.link && p.id !== room.hostId)
                .map(p => ({
                    id: p.id,
                    link: p.link,
                    description: p.description
                }));

            if (submissions.length < 2) {
                socket.emit('error', `Yeterli katılım yok! (En az 2 link gerekli, şu an: ${submissions.length})`);
                return;
            }

            room.status = 'voting';
            room.timeRemaining = parseInt(duration) || 60;

            io.to(roomCode).emit('voting_started', { submissions, duration: room.timeRemaining });

            // Start Timer
            clearInterval(room.timer);
            room.timer = setInterval(() => {
                room.timeRemaining--;
                io.to(roomCode).emit('timer_update', room.timeRemaining);

                if (room.timeRemaining <= 0) {
                    clearInterval(room.timer);
                    endGame(roomCode);
                }
            }, 1000);
        }
    });

    socket.on('vote', ({ roomCode, targetId }) => {
        const room = rooms[roomCode];
        if (room && room.status === 'voting' && room.players[socket.id] && !room.players[socket.id].hasVoted) {
            if (targetId === socket.id) return; // Self-vote check

            if (room.players[targetId]) {
                room.players[targetId].votesReceived++;
                room.players[socket.id].hasVoted = true;
                socket.emit('vote_confirmed');
            }
        }
    });

    socket.on('force_end_voting', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (room && socket.id === room.hostId) {
            clearInterval(room.timer);
            endGame(roomCode);
        }
    });

    function endGame(roomCode) {
        const room = rooms[roomCode];
        if (!room) return;

        room.status = 'results';
        // Filter out host from results
        const results = Object.values(room.players)
            .filter(p => p.id !== room.hostId && p.link)
            .sort((a, b) => b.votesReceived - a.votesReceived)
            .map(p => ({
                nickname: p.nickname,
                avatar: p.avatar,
                votes: p.votesReceived,
                link: p.link,
                description: p.description
            }));

        io.to(roomCode).emit('game_ended', results);
    }

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Find which room they were in
        for (const code in rooms) {
            const room = rooms[code];
            if (room.players[socket.id]) {
                const avatarToRecycle = room.players[socket.id].avatar;

                // Always return avatar to pool (it came from the pool)
                room.availableAvatars.push(avatarToRecycle);

                delete room.players[socket.id];

                io.to(code).emit('update_players', Object.values(room.players));

                // If room empty or host leaves? (Simple cleanup)
                if (Object.keys(room.players).length === 0) {
                    clearInterval(room.timer);
                    delete rooms[code];
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;

// Start Server
checkAvatarsExist();
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
