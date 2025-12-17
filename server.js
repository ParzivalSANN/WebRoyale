const express = require('express');
const app = express();
const http = require('http');
const path = require('path');

const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Serve Static Files
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html for SPA-like behavior
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

server.listen(PORT, () => {
    console.log(`🚀 Static Server running on port ${PORT}`);
});
