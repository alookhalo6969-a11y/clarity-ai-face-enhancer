const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
let createClient;
try {
    const supabaseJs = require('@supabase/supabase-js');
    createClient = supabaseJs.createClient;
} catch (e) {
    console.warn('Supabase JS module not found, using local mock.');
    createClient = require('./supabase-mock').createClient;
}


const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 5001;
const FASTAPI_URL = 'http://127.0.0.1:8001';
const FASTAPI_WS_URL = 'ws://127.0.0.1:8001/ws/enhance';

// Supabase Configuration
const SUPABASE_URL = 'https://bddtrsuxwddyybbajwxb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cgIh8ZbimpUOE_fDRIWCow_uMVnAscV'; // Replace with your actual key
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// File upload configuration
const upload = multer({ dest: path.join(__dirname, '../uploads/') });

// --- AUTH ENDPOINTS ---

app.post('/auth/signup', async (req, res) => {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, user: data.user });
});

app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, user: data.user, session: data.session });
});

app.post('/auth/logout', async (req, res) => {
    const { error } = await supabase.auth.signOut();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
});

// Auth Middleware
const authenticateUser = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });

    req.user = user;
    next();
};

app.get('/user-history', authenticateUser, async (req, res) => {
    const { data, error } = await supabase
        .from('enhanced_images')
        .select('*')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, history: data });
});

// API Route for uploading images and processing
app.post('/upload-images', authenticateUser, upload.array('images', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No images uploaded' });
        }

        const results = [];

        const fidelityWeight = req.body.fidelity_weight || '0.5';

        // Process sequentially or in parallel depending on hardware capability
        for (const file of req.files) {
            const formData = new FormData();
            formData.append('file', fs.createReadStream(file.path));
            formData.append('fidelity_weight', fidelityWeight);

            try {
                // Forward to Python AI microservice
                const response = await axios.post(`${FASTAPI_URL}/enhance`, formData, {
                    headers: {
                        ...formData.getHeaders(),
                    },
                    responseType: 'arraybuffer'
                });

                // Sanitize filename to prevent URL breaking characters like '#' or spaces
                const safeName = path.parse(file.originalname).name.replace(/[^a-zA-Z0-9]/g, '_');

                // Save result
                const resultFilename = `enhanced_${Date.now()}_${safeName}.jpg`;
                const resultPath = path.join(__dirname, '../results/', resultFilename);
                fs.writeFileSync(resultPath, response.data);

                const enhanced_url = `/results/${resultFilename}`;

                // Save metadata to Supabase
                const { error: dbError } = await supabase
                    .from('enhanced_images')
                    .insert([
                        {
                            user_id: req.user.id,
                            original_name: file.originalname,
                            enhanced_url: enhanced_url
                        }
                    ]);

                if (dbError) console.error('Supabase DB Error:', dbError.message);

                results.push({
                    original: file.originalname,
                    enhanced_url: enhanced_url
                });
            } catch (fastApiError) {
                console.error('Error contacting FastAPI:', fastApiError.message);
                results.push({
                    original: file.originalname,
                    error: 'Enhancement failed'
                });
            }
        }

        res.json({ success: true, results });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Serve the results directory statically
app.use('/results', express.static(path.join(__dirname, '../results')));

// WebSocket Relay for Real-time streaming
wss.on('connection', (clientWs) => {
    console.log('Client connected to Node.js WebSocket');

    let fastApiReady = false;
    let messageQueue = [];

    // Connect to FastAPI WebSocket
    let fastApiWs;
    try {
        fastApiWs = new WebSocket(FASTAPI_WS_URL);
    } catch (err) {
        console.error('Failed to create FastAPI WebSocket:', err.message);
        clientWs.send(JSON.stringify({ error: 'AI service unavailable' }));
        clientWs.close();
        return;
    }

    fastApiWs.on('open', () => {
        console.log('Connected to FastAPI WebSocket');
        fastApiReady = true;
        // Flush any queued messages
        while (messageQueue.length > 0) {
            const msg = messageQueue.shift();
            fastApiWs.send(msg);
        }
    });

    fastApiWs.on('message', (message) => {
        // Relay enhanced frame back to client
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(message.toString());
        }
    });

    clientWs.on('message', (message) => {
        // Relay camera frame to FastAPI
        if (fastApiReady && fastApiWs.readyState === WebSocket.OPEN) {
            fastApiWs.send(message.toString());
        } else if (!fastApiReady) {
            // Buffer the latest frame only (drop older ones to avoid lag)
            messageQueue = [message.toString()];
        }
    });

    clientWs.on('close', () => {
        console.log('Client disconnected');
        if (fastApiWs && fastApiWs.readyState === WebSocket.OPEN) {
            fastApiWs.close();
        }
    });

    fastApiWs.on('close', () => {
        console.log('FastAPI WebSocket closed');
        fastApiReady = false;
    });

    fastApiWs.on('error', (err) => {
        console.error('FastAPI WebSocket Error:', err.message);
        fastApiReady = false;
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ error: 'AI service connection failed. Make sure the Python server is running on port 8001.' }));
        }
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`Node.js backend running on http://127.0.0.1:${PORT}`);
});
