const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    next();
};

// Permission middleware
const requireAnalytics = (req, res, next) => {
    if (req.user.role === 'admin' || (req.user.can_access_analytics && req.user.can_access_analytics == 1)) {
        next();
    } else {
        return res.status(403).json({ error: 'Accesso non autorizzato.' });
    }
};

const requireWallet = (req, res, next) => {
    if (req.user.role === 'admin' || (req.user.can_access_wallet && req.user.can_access_wallet == 1)) {
        next();
    } else {
        return res.status(403).json({ error: 'Accesso non autorizzato.' });
    }
};

const requirePos = (req, res, next) => {
    if (req.user.role === 'admin' || (req.user.can_access_pos && req.user.can_access_pos == 1)) {
        next();
    } else {
        return res.status(403).json({ error: 'Accesso non autorizzato.' });
    }
};

module.exports = {
    authenticateToken,
    requireAdmin,
    requireAnalytics,
    requireWallet,
    requirePos
};