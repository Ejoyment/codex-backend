const jwt = require('jsonwebtoken');

// Middleware to check authentication
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, message: 'Invalid or expired token' });
        }
        
        // Normalize user ID access across all routes
        // Support both legacy and new token payloads: { id } or { userId }
        const userId = user.userId || user.id || user._id;
        
        req.userId = userId;
        req.user = {
            ...user,
            id: userId,
            userId: userId,
            _id: userId
        };
        next();
    });
};

module.exports = { authenticateToken };
