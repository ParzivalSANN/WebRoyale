const mongoose = require('mongoose');

const PlayerSchema = new mongoose.Schema({
    id: String, // Socket ID (will change on reconnect, need to handle)
    nickname: String,
    avatar: Number,
    link: String,
    description: String,
    votesReceived: { type: Number, default: 0 },
    hasVoted: { type: Boolean, default: false },
    isHost: { type: Boolean, default: false }
});

const RoomSchema = new mongoose.Schema({
    roomCode: { type: String, unique: true, required: true },
    hostId: String,
    status: { type: String, default: 'lobby' }, // lobby, voting, results
    players: [PlayerSchema],
    availableAvatars: [Number],
    timeRemaining: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now, expires: 3600 } // Auto-delete after 1 hour (TTL)
});

module.exports = mongoose.model('Room', RoomSchema);
