// --- TAPLINKNFC SERVER ENTRY POINT ---

// Load environment variables

// Import modules
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Import custom modules
const { handleMotivationalRequest } = require('./services/motivational');

// Import route modules
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const redirectRoutes = require('./routes/redirects');

// Environment validation
if (!process.env.JWT_SECRET) {
    console.error('FATAL ERROR: JWT_SECRET is not defined in your .env file.');
    process.exit(1);
}

const PORT = process.env.PORT || 3001;

// Create Express app
const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Motivational domain middleware (must come before static files)
app.use(async (req, res, next) => {
    if (req.hostname === 'motivazional.taplinknfc.it' || req.hostname === 'www.motivazional.taplinknfc.it') {
        await handleMotivationalRequest(req, res);
    } else {
        next();
    }
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);

// Redirect routes
app.use('/', redirectRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is stable and running on port ${PORT}`);
});
