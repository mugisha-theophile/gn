require('dotenv').config();
const express = require('express');
const path = require('path');
const apiHandler = require('./api/index');

const app = express();
const port = process.env.PORT || 5001;

// 0. Logging Middleware
app.use((req, res, next) => {
    console.log(`[SERVER] Request: ${req.method} ${req.url}`);
    next();
});

// 1. Serve Static Files (Frontend)
app.use(express.static(__dirname));

// 2. Diagnostics
app.get('/ping', (req, res) => {
    console.log('[SERVER] Responding to /ping');
    res.send('PONG');
});

// 3. Mount API
app.use('/', apiHandler);

// 4. Fallback for SPA (Single Page Application)
// If no API route matched, serve index.html
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running locally on http://localhost:${port}`);
    console.log(`Test URL: http://localhost:${port}/ping`);
});
