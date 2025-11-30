require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/grialo';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname))); // Serve static files from current dir

// In-memory fallback
let localLeaderboard = [];
let isMongoConnected = false;

// MongoDB Connection
mongoose.connect(MONGODB_URI, {
    retryWrites: true,
    w: 'majority',
    appName: 'gRialoRunner'
})
    .then(() => {
        console.log('✅ Connected to MongoDB');
        isMongoConnected = true;
    })
    .catch(err => {
        console.warn('⚠️ MongoDB connection failed. Running in IN-MEMORY mode.');
        console.warn('Scores will NOT be saved to database.');
        console.error('Error details:', err.message);
        console.error('Connection string (masked):', MONGODB_URI.replace(/:[^:@]+@/, ':****@'));
    });

// Schema
const scoreSchema = new mongoose.Schema({
    handle: { type: String, required: true },
    score: { type: Number, required: true },
    date: { type: Date, default: Date.now }
});

const Score = mongoose.model('Score', scoreSchema);

// API Routes

// GET /api/leaderboard - Get top 10 scores
app.get('/api/leaderboard', async (req, res) => {
    if (isMongoConnected) {
        try {
            const scores = await Score.find()
                .sort({ score: -1 })
                .limit(10)
                .select('handle score -_id');
            res.json(scores);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch leaderboard' });
        }
    } else {
        // Fallback
        res.json(localLeaderboard.slice(0, 10));
    }
});

// POST /api/score - Save or update a score
app.post('/api/score', async (req, res) => {
    try {
        const { handle, score } = req.body;
        if (!handle || score === undefined) {
            return res.status(400).json({ error: 'Handle and score are required' });
        }

        if (isMongoConnected) {
            // Update existing score or create new one (only if new score is higher)
            const existingScore = await Score.findOne({ handle });

            if (existingScore) {
                // Only update if new score is higher
                if (score > existingScore.score) {
                    existingScore.score = score;
                    existingScore.date = Date.now();
                    await existingScore.save();
                }
            } else {
                // Create new entry
                const newScore = new Score({ handle, score });
                await newScore.save();
            }
        } else {
            // Fallback - update or add
            const existingIndex = localLeaderboard.findIndex(entry => entry.handle === handle);

            if (existingIndex !== -1) {
                // Update only if new score is higher
                if (score > localLeaderboard[existingIndex].score) {
                    localLeaderboard[existingIndex].score = score;
                }
            } else {
                // Add new entry
                localLeaderboard.push({ handle, score });
            }

            localLeaderboard.sort((a, b) => b.score - a.score);
            if (localLeaderboard.length > 10) localLeaderboard.length = 10;
        }

        res.status(201).json({ message: 'Score saved successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save score' });
    }
});

// Serve index.html for root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
